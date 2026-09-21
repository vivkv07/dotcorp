import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCandidates,
  buildPairQuestions,
  buildRiskQuestions,
  chunkQuestions,
  pairMatrix,
  bradleyTerry,
  rank,
} from "../src/rank.js";

test("normalizeCandidates trims, dedupes, drops blanks", () => {
  const out = normalizeCandidates([" A  b ", "", "a b", "C\n", null]);
  assert.deepEqual(out, ["A b", "C"]);
});

test("buildPairQuestions asks every pair in both orders", () => {
  const q = buildPairQuestions(["x", "y", "z"], { audience: "devs", goal: "click", format: "headline" });
  assert.equal(Object.keys(q).length, 6);
  assert.deepEqual(q.p_0_1.criteria, { A: "x", B: "y" });
  assert.deepEqual(q.p_1_0.criteria, { A: "y", B: "x" });
  assert.equal(q.p_0_1.type, "choice");
  assert.match(q.p_0_1.instructions, /Audience: devs/);
});

test("buildRiskQuestions makes one noul per candidate", () => {
  const q = buildRiskQuestions(["x", "y"], { format: "subject" });
  assert.equal(Object.keys(q).length, 2);
  assert.equal(q.risk_1.type, "noul");
  assert.match(q.risk_1.instructions, /"y"/);
});

test("chunkQuestions splits into bounded chunks", () => {
  const q = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`k${i}`, i]));
  const chunks = chunkQuestions(q, 3);
  assert.equal(chunks.length, 3);
  assert.deepEqual(Object.keys(chunks[2]), ["k6"]);
});

test("pairMatrix averages both orders and is antisymmetric", () => {
  const answers = {
    p_0_1: { type: "choice", choice: "A", probabilities: { A: 0.9, B: 0.1 } },
    p_1_0: { type: "choice", choice: "B", probabilities: { A: 0.3, B: 0.7 } },
  };
  const m = pairMatrix(2, answers);
  assert.equal(m[0][1], 0.8);
  assert.ok(Math.abs(m[1][0] - 0.2) < 1e-9);
});

test("bradleyTerry recovers a clear ordering", () => {
  const m = [
    [0.5, 0.8, 0.9],
    [0.2, 0.5, 0.7],
    [0.1, 0.3, 0.5],
  ];
  const s = bradleyTerry(m);
  assert.ok(s[0] > s[1] && s[1] > s[2]);
  assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("rank orders rows and reports margin and risk", () => {
  const answers = {
    p_0_1: { choice: "B", probabilities: { A: 0.2, B: 0.8 } },
    p_1_0: { choice: "A", probabilities: { A: 0.8, B: 0.2 } },
    p_0_2: { choice: "A", probabilities: { A: 0.6, B: 0.4 } },
    p_2_0: { choice: "B", probabilities: { A: 0.4, B: 0.6 } },
    p_1_2: { choice: "A", probabilities: { A: 0.9, B: 0.1 } },
    p_2_1: { choice: "B", probabilities: { A: 0.1, B: 0.9 } },
    risk_0: { noul: 0.1 },
    risk_1: { noul: 0.7 },
    risk_2: { noul: 0.2 },
  };
  const { rows, margin, matrix } = rank(["one", "two", "three"], answers);
  assert.deepEqual(rows.map((r) => r.text), ["two", "one", "three"]);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].clickbaitRisk, 0.7);
  assert.equal(margin, 0.8);
  assert.equal(matrix.length, 3);
});
