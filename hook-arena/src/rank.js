// Pure tournament logic: builds Jev questions for a round-robin pairwise
// tournament and turns the calibrated probabilities into a ranking.
// No I/O here so it can be unit-tested without a network.

export const LIMITS = {
  minCandidates: 3,
  freeMaxCandidates: 8,
  proMaxCandidates: 20,
  maxCandidateChars: 200,
  maxAudienceChars: 300,
  questionsPerRequest: 60,
};

export const GOALS = {
  click: "click through to read the full piece",
  open: "open the email",
  reply: "reply or comment",
  buy: "click the buy or sign-up button",
  remember: "remember the name a week later",
};

export const FORMATS = {
  headline: "article headline",
  subject: "email subject line",
  hook: "social post opening line",
  name: "product or feature name",
  tagline: "one-line tagline",
};

export function normalizeCandidates(raw) {
  const seen = new Set();
  const out = [];
  for (const line of raw) {
    const text = String(line ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.slice(0, LIMITS.maxCandidateChars));
  }
  return out;
}

// Every unordered pair, asked in both orders so position bias cancels out.
export function buildPairQuestions(candidates, { audience, goal, format }) {
  const goalText = GOALS[goal] ?? GOALS.click;
  const formatText = FORMATS[format] ?? FORMATS.headline;
  const questions = {};
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      questions[`p_${i}_${j}`] = pairQuestion(candidates[i], candidates[j], goalText, formatText, audience);
      questions[`p_${j}_${i}`] = pairQuestion(candidates[j], candidates[i], goalText, formatText, audience);
    }
  }
  return questions;
}

function pairQuestion(a, b, goalText, formatText, audience) {
  return {
    type: "choice",
    instructions:
      `Two ${formatText}s are competing for the same reader. ` +
      `Which one is more likely to make the reader ${goalText}? ` +
      `Judge only the text as written. Audience: ${audience}.`,
    criteria: { A: a, B: b },
  };
}

// One Noul per candidate: does it overpromise relative to what it can deliver?
export function buildRiskQuestions(candidates, { format }) {
  const formatText = FORMATS[format] ?? FORMATS.headline;
  const questions = {};
  candidates.forEach((text, i) => {
    questions[`risk_${i}`] = {
      type: "noul",
      instructions:
        `Is this ${formatText} clickbait: does it overpromise, mislead, or withhold ` +
        `the point purely to force a click? Candidate: "${text}"`,
      criteria: {
        true: "Overpromises, misleads, or uses a curiosity gap the content cannot plausibly pay off.",
        false: "Makes a specific, honest promise that the content can plausibly deliver.",
      },
    };
  });
  return questions;
}

export function buildState({ audience, goal, format }) {
  return {
    audience,
    reader_goal: GOALS[goal] ?? GOALS.click,
    format: FORMATS[format] ?? FORMATS.headline,
  };
}

// Split a questions object into chunks small enough for one request.
export function chunkQuestions(questions, size = LIMITS.questionsPerRequest) {
  const entries = Object.entries(questions);
  const chunks = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(Object.fromEntries(entries.slice(i, i + size)));
  }
  return chunks;
}

// P(i beats j) averaged over both presentation orders.
export function pairMatrix(n, answers) {
  const m = Array.from({ length: n }, () => Array(n).fill(0.5));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const fwd = answers[`p_${i}_${j}`];
      const rev = answers[`p_${j}_${i}`];
      const pFwd = fwd?.probabilities?.A ?? (fwd?.choice === "A" ? 1 : 0);
      const pRev = rev?.probabilities?.B ?? (rev?.choice === "B" ? 1 : 0);
      const p = (pFwd + pRev) / 2;
      m[i][j] = p;
      m[j][i] = 1 - p;
    }
  }
  return m;
}

// Bradley-Terry strengths via the MM algorithm on fractional wins.
export function bradleyTerry(matrix, iterations = 200) {
  const n = matrix.length;
  let pi = Array(n).fill(1);
  for (let it = 0; it < iterations; it++) {
    const next = pi.map((_, i) => {
      let wins = 0;
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        wins += matrix[i][j];
        denom += 1 / (pi[i] + pi[j]);
      }
      return denom === 0 ? pi[i] : wins / denom;
    });
    const mean = next.reduce((a, b) => a + b, 0) / n;
    pi = next.map((v) => v / mean);
  }
  const total = pi.reduce((a, b) => a + b, 0);
  return pi.map((v) => v / total);
}

export function rank(candidates, answers) {
  const n = candidates.length;
  const matrix = pairMatrix(n, answers);
  const strength = bradleyTerry(matrix);
  const rows = candidates.map((text, i) => {
    const others = matrix[i].filter((_, j) => j !== i);
    const winRate = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length);
    const risk = answers[`risk_${i}`]?.noul;
    return {
      index: i,
      text,
      strength: round(strength[i]),
      winRate: round(winRate),
      clickbaitRisk: typeof risk === "number" ? round(risk) : null,
    };
  });
  rows.sort((a, b) => b.strength - a.strength || b.winRate - a.winRate);
  rows.forEach((r, pos) => (r.rank = pos + 1));
  const top = rows[0];
  const runnerUp = rows[1];
  const margin = runnerUp ? round(matrix[top.index][runnerUp.index]) : null;
  return { rows, matrix: matrix.map((r) => r.map(round)), margin };
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}
