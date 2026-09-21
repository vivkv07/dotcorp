import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

// Fake Jev: candidate with the lower index always wins with p=0.8,
// candidate 1 is flagged as clickbait.
function fakeJev(body) {
  const answers = {};
  for (const [name, q] of Object.entries(body.questions)) {
    if (q.type === "choice") {
      const [, i, j] = name.split("_").map(Number);
      const aWins = i < j;
      answers[name] = { type: "choice", choice: aWins ? "A" : "B", confidence: 0.8,
        probabilities: { A: aWins ? 0.8 : 0.2, B: aWins ? 0.2 : 0.8 } };
    } else {
      const [, i] = name.split("_").map(Number);
      answers[name] = { type: "noul", noul: i === 1 ? 0.9 : 0.1 };
    }
  }
  return { model: "jev-fake", answers, usage: { input_tokens: 100 * Object.keys(answers).length, output_tokens: 0 } };
}

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  if (String(url).includes("lemonsqueezy")) {
    const { license_key } = JSON.parse(init.body);
    const ok = license_key === "GOOD-KEY";
    return new Response(JSON.stringify({ valid: ok, license_key: { status: ok ? "active" : "inactive" }, meta: { store_id: 42 } }));
  }
  const body = JSON.parse(init.body);
  return new Response(JSON.stringify(fakeJev(body)), { status: 200 });
};

function kv() {
  const store = new Map();
  return {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => { store.set(k, v); },
    _store: store,
  };
}

const post = (path, body, headers = {}) =>
  new Request(`https://arena.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });

test("ranks candidates end to end through the OpenRouter provider", async () => {
  calls.length = 0;
  const env = { OPENROUTER_API_KEY: "or-key" };
  const res = await worker.fetch(post("/api/rank", { candidates: ["a", "b", "c", "d"], audience: "devs" }), env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.rows.map((r) => r.text), ["a", "b", "c", "d"]);
  assert.equal(data.rows[1].clickbaitRisk, 0.9);
  assert.equal(data.meta.judgments, 12 + 4);
  assert.equal(data.meta.tier, "free");
  assert.ok(data.meta.costUsd > 0);
  assert.ok(String(calls[0].url).includes("openrouter.ai/api/alpha/decisions"));
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.model, "typesafe/jev-1.13");
  assert.equal(sent.state.audience, "devs");
});

test("direct TypeSafe provider sends the systemone request", async () => {
  calls.length = 0;
  const env = { TYPESAFE_API_KEY: "ts-key" };
  const res = await worker.fetch(post("/api/rank", { candidates: ["a", "b", "c"] }), env);
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(calls[0].init.headers.Authorization, "Bearer ts-key");
  assert.equal(JSON.parse(calls[0].init.body).model, "jev-latest");
});

test("cloudflare provider unwraps the nested envelope", async () => {
  calls.length = 0;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const inner = fakeJev(JSON.parse(init.body));
    return new Response(JSON.stringify({ success: true, result: { result: inner } }));
  };
  try {
    const env = { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "tok" };
    const res = await worker.fetch(post("/api/rank", { candidates: ["a", "b", "c"] }), env);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).meta.model, "jev-fake");
  } finally {
    globalThis.fetch = real;
  }
});

test("rejects fewer than three candidates", async () => {
  const res = await worker.fetch(post("/api/rank", { candidates: ["a", "a", "b"] }), { OPENROUTER_API_KEY: "k" });
  assert.equal(res.status, 400);
});

test("free tier caps candidates and daily rankings; pro lifts them", async () => {
  const env = { OPENROUTER_API_KEY: "k", ARENA_KV: kv() };
  const nine = Array.from({ length: 9 }, (_, i) => `c${i}`);
  let res = await worker.fetch(post("/api/rank", { candidates: nine }), env);
  assert.equal(res.status, 402);

  for (let i = 0; i < 3; i++) {
    res = await worker.fetch(post("/api/rank", { candidates: ["a", "b", "c"] }), env);
    assert.equal(res.status, 200);
  }
  res = await worker.fetch(post("/api/rank", { candidates: ["a", "b", "c"] }), env);
  assert.equal(res.status, 402);

  res = await worker.fetch(post("/api/rank", { candidates: nine }, { "X-License-Key": "GOOD-KEY" }), env);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).meta.tier, "pro");

  res = await worker.fetch(post("/api/rank", { candidates: ["a", "b", "c"] }, { "X-License-Key": "BAD-KEY" }), env);
  assert.equal(res.status, 402);
});

test("license endpoint validates and respects store id", async () => {
  let res = await worker.fetch(post("/api/license", { key: "GOOD-KEY" }), { LEMONSQUEEZY_STORE_ID: "42" });
  assert.deepEqual(await res.json(), { valid: true });
  res = await worker.fetch(post("/api/license", { key: "GOOD-KEY" }), { LEMONSQUEEZY_STORE_ID: "99" });
  assert.deepEqual(await res.json(), { valid: false });
});

test("reports missing provider clearly", async () => {
  const res = await worker.fetch(post("/api/rank", { candidates: ["a", "b", "c"] }), {});
  assert.equal(res.status, 503);
});

test("splits large tournaments into multiple requests", async () => {
  calls.length = 0;
  const twenty = Array.from({ length: 20 }, (_, i) => `h${i}`);
  const res = await worker.fetch(post("/api/rank", { candidates: twenty }, { "X-License-Key": "GOOD-KEY" }), { OPENROUTER_API_KEY: "k" });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.meta.judgments, 380 + 20);
  assert.equal(data.meta.requests, 7);
});
