// Cloudflare Worker: serves the static app (via the assets binding) and the
// /api/rank endpoint that runs a Jev pairwise tournament.

import {
  LIMITS,
  normalizeCandidates,
  buildPairQuestions,
  buildRiskQuestions,
  buildState,
  chunkQuestions,
  rank,
} from "./rank.js";

const PRICE_PER_MILLION_INPUT = 0.042; // USD, Jev list price; output tokens are free
const FREE_RANKINGS_PER_DAY = 3;
const PRO_RANKINGS_PER_DAY = 300;
const LICENSE_CACHE_SECONDS = 24 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    try {
      if (url.pathname === "/api/health") return json({ ok: true, provider: providerName(env) });
      if (url.pathname === "/api/rank" && request.method === "POST") return cors(await handleRank(request, env));
      if (url.pathname === "/api/license" && request.method === "POST") return cors(await handleLicense(request, env));
    } catch (err) {
      return cors(json({ error: err.message ?? "Unexpected error" }, err.status ?? 500));
    }
    return json({ error: "Not found" }, 404);
  },
};

async function handleRank(request, env) {
  const body = await request.json().catch(() => ({}));
  const candidates = normalizeCandidates(Array.isArray(body.candidates) ? body.candidates : []);
  const audience = String(body.audience ?? "").trim().slice(0, LIMITS.maxAudienceChars) || "general readers";
  const goal = String(body.goal ?? "click");
  const format = String(body.format ?? "headline");

  const tier = await resolveTier(request, env);
  const maxCandidates = tier.pro ? LIMITS.proMaxCandidates : LIMITS.freeMaxCandidates;
  if (candidates.length < LIMITS.minCandidates) throw httpError(400, `Add at least ${LIMITS.minCandidates} distinct candidates.`);
  if (candidates.length > maxCandidates) {
    throw httpError(tier.pro ? 400 : 402, tier.pro
      ? `Max ${maxCandidates} candidates per ranking.`
      : `Free tier ranks up to ${maxCandidates} candidates. Pro ranks up to ${LIMITS.proMaxCandidates}.`);
  }
  await enforceQuota(request, env, tier);

  const opts = { audience, goal, format };
  const questions = { ...buildPairQuestions(candidates, opts), ...buildRiskQuestions(candidates, opts) };
  const state = buildState(opts);

  const started = Date.now();
  const chunks = chunkQuestions(questions);
  const results = await Promise.all(chunks.map((q) => callJev(env, state, q)));
  const answers = Object.assign({}, ...results.map((r) => r.answers));
  const inputTokens = results.reduce((a, r) => a + (r.usage?.input_tokens ?? 0), 0);
  const ms = Date.now() - started;

  const ranked = rank(candidates, answers);
  return json({
    ...ranked,
    meta: {
      candidates: candidates.length,
      judgments: Object.keys(questions).length,
      requests: chunks.length,
      inputTokens,
      costUsd: round6((inputTokens / 1e6) * PRICE_PER_MILLION_INPUT),
      ms,
      model: results[0]?.model ?? null,
      tier: tier.pro ? "pro" : "free",
      remainingToday: tier.remaining,
    },
  });
}

// ---------- Jev providers ----------
// Direct TypeSafe needs a waitlist key. OpenRouter and Cloudflare Workers AI
// both expose Jev with no waitlist, so pick whichever key you have.

function providerName(env) {
  if (env.JEV_PROVIDER) return env.JEV_PROVIDER;
  if (env.TYPESAFE_API_KEY) return "typesafe";
  if (env.OPENROUTER_API_KEY) return "openrouter";
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) return "cloudflare";
  return "none";
}

async function callJev(env, state, questions) {
  const provider = providerName(env);
  let url, headers, body, unwrap;
  switch (provider) {
    case "typesafe":
      url = `${env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai"}/v1/systemone`;
      headers = { Authorization: `Bearer ${env.TYPESAFE_API_KEY}` };
      body = { model: env.JEV_MODEL ?? "jev-latest", state, questions };
      unwrap = (r) => r;
      break;
    case "openrouter":
      url = "https://openrouter.ai/api/alpha/decisions";
      headers = {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": env.APP_URL ?? "https://hookarena.app",
        "X-Title": "Hook Arena",
      };
      body = { model: env.JEV_MODEL ?? "typesafe/jev-1.13", state, questions };
      unwrap = (r) => r;
      break;
    case "cloudflare":
      url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${env.JEV_MODEL ?? "typesafe/jev"}`;
      headers = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` };
      body = { state, questions };
      unwrap = (r) => r.result?.result ?? r.result ?? r;
      break;
    default:
      throw httpError(503, "No Jev provider configured. Set TYPESAFE_API_KEY, OPENROUTER_API_KEY, or Cloudflare credentials.");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw httpError(502, `Jev provider ${provider} returned ${res.status}: ${text.slice(0, 300)}`);
  const parsed = unwrap(JSON.parse(text));
  if (!parsed?.answers) throw httpError(502, `Jev provider ${provider} returned no answers.`);
  return parsed;
}

// ---------- Tiers, quotas, licenses ----------

async function resolveTier(request, env) {
  const key = (request.headers.get("x-license-key") ?? "").trim();
  if (!key) return { pro: false, key: null };
  const valid = await validateLicense(env, key);
  return { pro: valid, key: valid ? key : null };
}

async function handleLicense(request, env) {
  const body = await request.json().catch(() => ({}));
  const key = String(body.key ?? "").trim();
  if (!key) throw httpError(400, "Missing license key.");
  const valid = await validateLicense(env, key, { fresh: true });
  return json({ valid });
}

// Lemon Squeezy license keys. The validate endpoint needs no API key, so the
// Worker never holds a store secret. Cached in KV for a day per key.
async function validateLicense(env, key, { fresh = false } = {}) {
  const cacheKey = `lic:${await sha256(key)}`;
  if (!fresh && env.ARENA_KV) {
    const cached = await env.ARENA_KV.get(cacheKey);
    if (cached === "1") return true;
    if (cached === "0") return false;
  }
  let valid = false;
  try {
    const res = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ license_key: key }),
    });
    const data = await res.json();
    const storeOk = !env.LEMONSQUEEZY_STORE_ID || String(data?.meta?.store_id) === String(env.LEMONSQUEEZY_STORE_ID);
    const status = data?.license_key?.status;
    valid = Boolean(data?.valid) && storeOk && status === "active";
  } catch {
    valid = false;
  }
  if (env.ARENA_KV) await env.ARENA_KV.put(cacheKey, valid ? "1" : "0", { expirationTtl: LICENSE_CACHE_SECONDS });
  return valid;
}

async function enforceQuota(request, env, tier) {
  if (!env.ARENA_KV) {
    tier.remaining = null; // no KV bound: quotas off (local dev)
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const who = tier.pro ? `key:${await sha256(tier.key)}` : `ip:${request.headers.get("cf-connecting-ip") ?? "unknown"}`;
  const quotaKey = `q:${day}:${who}`;
  const limit = tier.pro ? PRO_RANKINGS_PER_DAY : FREE_RANKINGS_PER_DAY;
  const used = Number((await env.ARENA_KV.get(quotaKey)) ?? 0);
  if (used >= limit) {
    throw httpError(tier.pro ? 429 : 402, tier.pro
      ? `Daily limit of ${limit} rankings reached.`
      : `You have used today's ${limit} free rankings. Upgrade to Pro for ${PRO_RANKINGS_PER_DAY}/day and up to ${LIMITS.proMaxCandidates} candidates.`);
  }
  await env.ARENA_KV.put(quotaKey, String(used + 1), { expirationTtl: 2 * 24 * 60 * 60 });
  tier.remaining = limit - used - 1;
}

// ---------- helpers ----------

function json(data, status = 200) {
  return cors(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
}

function cors(res) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-License-Key");
  return res;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
