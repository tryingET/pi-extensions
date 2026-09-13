/**
summary: "Validate a frozen retrieval study and report complete failures without implying agent-task success."
read_when:
  - "Changing ripwire study identities, retrieval metrics, or adoption evidence boundaries."
*/
import assert from "node:assert/strict";
import { hasControlCharacter } from "./context-intake-safety.js";
import { digest, safeRelative } from "./ripwire-corpus.js";

export const STUDY_SCHEMA = "pi.ripwire-retrieval-study.v1";
export const STUDY_RESULT_SCHEMA = "pi.ripwire-retrieval-results.v1";
const hex = /^[a-f0-9]{64}$/u;
const id = /^[a-z][a-z0-9-]{0,79}$/u;
const exact = (value, keys) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "object required");
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), "unexpected study fields");
};
export function validateStudy(input) {
  exact(input, ["schema", "repositories", "cases"]);
  assert.equal(input.schema, STUDY_SCHEMA);
  assert.ok(
    Array.isArray(input.repositories) &&
      input.repositories.length >= 3 &&
      input.repositories.length <= 20,
  );
  const repos = new Map();
  for (const repo of input.repositories) {
    exact(repo, ["id", "revision"]);
    assert.ok(id.test(repo.id) && /^[a-f0-9]{40}$/u.test(repo.revision) && !repos.has(repo.id));
    repos.set(repo.id, { intents: new Set(), gold: new Set() });
  }
  assert.ok(Array.isArray(input.cases) && input.cases.length >= 30 && input.cases.length <= 1000);
  const ids = new Set();
  for (const item of input.cases) {
    exact(item, ["id", "repository", "question", "gold"]);
    assert.ok(id.test(item.id) && !ids.has(item.id) && repos.has(item.repository));
    ids.add(item.id);
    assert.ok(
      typeof item.question === "string" &&
        item.question.length > 10 &&
        item.question.length <= 4000,
    );
    assert.ok(!hasControlCharacter(item.question));
    const repo = repos.get(item.repository);
    const intent = item.question
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .trim();
    assert.ok(!repo.intents.has(intent), "duplicate question intent");
    repo.intents.add(intent);
    assert.ok(Array.isArray(item.gold) && item.gold.length && item.gold.length <= 100);
    const paths = new Set();
    for (const target of item.gold) {
      exact(target, ["path", "sha256"]);
      assert.ok(safeRelative(target.path) && hex.test(target.sha256) && !paths.has(target.path));
      paths.add(target.path);
    }
    const basis = [...paths].sort().join("\n");
    assert.ok(!repo.gold.has(basis), "duplicate gold target basis");
    repo.gold.add(basis);
  }
  for (const repo of repos.values())
    assert.ok(repo.intents.size >= 10, "ten distinct cases per repository required");
  return input;
}

export function retrievalMetrics(paths, gold, limit = 10) {
  assert.ok(Number.isSafeInteger(limit) && limit > 0 && limit <= 100);
  const top = [...new Set(paths)].slice(0, limit);
  const truth = new Set(gold);
  assert.ok(truth.size > 0);
  const matches = top.filter((path) => truth.has(path));
  const first = top.findIndex((path) => truth.has(path));
  return {
    strict: matches.length === truth.size,
    any: matches.length > 0,
    recall: matches.length / truth.size,
    reciprocalRank: first < 0 ? 0 : 1 / (first + 1),
  };
}

export function summarizeStudy(study, records) {
  validateStudy(study);
  assert.equal(records.length, study.cases.length, "missing cases cannot be excluded");
  const expected = new Map(study.cases.map((item) => [item.id, item]));
  const seen = new Set();
  const sums = Object.fromEntries(
    ["literal_reference", "ripwire"].map((arm) => [
      arm,
      { strict: 0, any: 0, recall: 0, errors: 0, durations: [] },
    ]),
  );
  for (const record of records) {
    assert.ok(expected.has(record.id) && !seen.has(record.id), "unexpected or duplicate execution");
    seen.add(record.id);
    for (const arm of Object.keys(sums)) {
      const result = record[arm];
      assert.ok(result && typeof result.ok === "boolean" && Array.isArray(result.paths));
      assert.ok(result.paths.length <= 100 && result.paths.every(safeRelative));
      assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0);
      const metric = retrievalMetrics(
        result.ok ? result.paths : [],
        expected.get(record.id).gold.map((g) => g.path),
      );
      sums[arm].strict += Number(metric.strict);
      sums[arm].any += Number(metric.any);
      sums[arm].recall += metric.recall;
      sums[arm].errors += Number(!result.ok);
      sums[arm].durations.push(result.durationMs);
    }
  }
  const aggregate = {};
  for (const [arm, sum] of Object.entries(sums)) {
    const sorted = sum.durations.sort((a, b) => a - b);
    aggregate[arm] = {
      strictAt10: sum.strict / records.length,
      anyAt10: sum.any / records.length,
      meanRecallAt10: sum.recall / records.length,
      executionErrors: sum.errors,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    };
  }
  return {
    schema: STUDY_RESULT_SCHEMA,
    experimentValid: true,
    adoptionEligible: false,
    cases: records.length,
    repositories: study.repositories.length,
    aggregate,
    modelPilot: { status: "BLOCKED", reason: "no_paired_model_task_execution_in_this_instrument" },
    limitations: [
      "Developer-authored source-inspected questions; not independent labeling or a public benchmark.",
      "Literal reference is a deterministic search proxy, not a Pi agent or Aider repo-map run.",
      "Cold isolated retrieval and full packet bytes are measured; no actual model tokens, task completion, fallback cost or warm SLO is inferred.",
      "Missing gold outside the approved corpus remains a miss; all execution failures remain in the denominator.",
    ],
    caseResultsSha256: digest(JSON.stringify(records)),
  };
}

export function literalReference(files, question, limit = 10) {
  const stop = new Set([
    "where",
    "which",
    "what",
    "does",
    "are",
    "the",
    "and",
    "into",
    "from",
    "with",
    "for",
    "when",
    "their",
    "using",
    "that",
    "can",
    "how",
    "too",
    "its",
  ]);
  const words = [...new Set(question.toLowerCase().match(/[a-z0-9_]{3,}/gu) ?? [])].filter(
    (word) => !stop.has(word),
  );
  return files
    .map(({ path, content }) => ({
      path,
      score: words.reduce(
        (score, word) => score + Number(`${path}\n${content}`.toLowerCase().includes(word)),
        0,
      ),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : 1))
    .slice(0, limit)
    .map((row) => row.path);
}
