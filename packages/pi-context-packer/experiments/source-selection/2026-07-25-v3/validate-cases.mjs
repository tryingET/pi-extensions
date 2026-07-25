/**
 * summary: "Validate fresh v3 cases against exact Git commits without computing rankings."
 * read_when:
 *   - "Authoring or reviewing v3 questions and truth sets before preparation."
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_PATH = join(HERE, "canonical-case-source.generated.json");
const V2_CASES_PATH = join(HERE, "../2026-07-25-v2/canonical-case-source.generated.json");
const GIT = "/usr/bin/git";
const EXPECTED_FIELDS = ["id", "question", "truth", "maxItems", "language", "pattern", "paths"];
const SUPPORTED_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".go",
  ".h",
  ".hh",
  ".hpp",
  ".hxx",
  ".java",
  ".js",
  ".jsx",
  ".lua",
  ".mjs",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".ts",
  ".tsx",
]);

const REPOSITORIES = Object.freeze({
  "agent-scripts": {
    root: "/home/tryinget/ai-society/core/agent-scripts",
    commit: "36792de9195c86e6e8ae521efb5c952492278088",
  },
  "engineering-core": {
    root: "/home/tryinget/ai-society/core/engineering-core",
    commit: "f084fcc4981339893c302e13c8266313233a0e2b",
  },
  dspx: {
    root: "/home/tryinget/ai-society/softwareco/owned/dspx",
    commit: "326b2a555aac9f24ff54afcfd4adc87293b5218f",
  },
  "pi-extensions": {
    root: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
    commit: "61ef4d2874e8ed3807667ae9edbc2e8c262575d5",
  },
  "agent-kernel": {
    root: "/home/tryinget/ai-society/softwareco/owned/agent-kernel",
    commit: "8b9264a4032a79ff2194b6413de62f9ca410385c",
  },
});

function fail(message) {
  throw new Error(message);
}

function normalizedQuestion(value) {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function truthIdentity(value) {
  return [...value].sort().join("\0");
}

function gitObjectType(repository, spec) {
  const result = spawnSync(GIT, ["-C", repository.root, "cat-file", "-t", spec], {
    encoding: "utf8",
    env: {
      HOME: process.env.HOME ?? "/home/tryinget",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
  if (result.status !== 0 || result.signal !== null) return null;
  return result.stdout.trim();
}

function extension(path) {
  const index = path.lastIndexOf(".");
  return index < 0 ? "" : path.slice(index).toLowerCase();
}

function assertSafePath(path, label) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(`${label} must be a safe repository-relative POSIX path`);
  }
}

async function main() {
  const cases = JSON.parse(await readFile(CASES_PATH, "utf8"));
  const v2Cases = JSON.parse(await readFile(V2_CASES_PATH, "utf8"));
  if (
    JSON.stringify(Object.keys(cases).sort()) !== JSON.stringify(Object.keys(REPOSITORIES).sort())
  ) {
    fail("case repository keys differ from the frozen population");
  }

  const ids = new Set();
  const questions = new Set();
  const truths = new Set();
  let total = 0;
  for (const [repositoryId, repository] of Object.entries(REPOSITORIES)) {
    if (gitObjectType(repository, `${repository.commit}^{commit}`) !== "commit") {
      fail(`${repositoryId} frozen commit is unavailable`);
    }
    const rows = cases[repositoryId];
    if (!Array.isArray(rows) || rows.length !== 10) fail(`${repositoryId} must define 10 cases`);
    const oldQuestions = new Set(
      (v2Cases[repositoryId] ?? []).map((row) => normalizedQuestion(row.question)),
    );
    const oldTruths = new Set((v2Cases[repositoryId] ?? []).map((row) => truthIdentity(row.truth)));
    for (const [index, row] of rows.entries()) {
      const label = `${repositoryId}[${index}]`;
      if (!row || typeof row !== "object" || Array.isArray(row)) fail(`${label} must be an object`);
      if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...EXPECTED_FIELDS].sort())) {
        fail(`${label} fields differ from the closed case contract`);
      }
      if (!/^[a-z0-9][a-z0-9-]{2,127}$/u.test(row.id) || ids.has(row.id)) {
        fail(`${label} id is invalid or duplicate`);
      }
      ids.add(row.id);
      if (typeof row.question !== "string" || row.question.trim().length < 24) {
        fail(`${label} question is too short`);
      }
      const question = normalizedQuestion(row.question);
      if (questions.has(question) || oldQuestions.has(question))
        fail(`${label} question is reused`);
      questions.add(question);
      if (!Array.isArray(row.truth) || row.truth.length < 1 || row.truth.length > 4) {
        fail(`${label} truth must contain 1-4 paths`);
      }
      if (new Set(row.truth).size !== row.truth.length) fail(`${label} truth paths must be unique`);
      const truth = truthIdentity(row.truth);
      if (truths.has(truth) || oldTruths.has(truth)) fail(`${label} truth set is reused`);
      truths.add(truth);
      if (row.maxItems !== 4) fail(`${label} maxItems must equal 4`);
      if (!/^(js|ts|python|rust)$/u.test(row.language)) fail(`${label} language is unsupported`);
      if (typeof row.pattern !== "string" || row.pattern.trim().length < 8) {
        fail(`${label} pattern is missing`);
      }
      if (!Array.isArray(row.paths) || row.paths.length < 1 || row.paths.length > 4) {
        fail(`${label} paths must contain 1-4 entries`);
      }
      for (const path of row.truth) {
        assertSafePath(path, `${label} truth path`);
        if (!SUPPORTED_EXTENSIONS.has(extension(path)))
          fail(`${label} truth extension is unsupported`);
        if (gitObjectType(repository, `${repository.commit}:${path}`) !== "blob") {
          fail(`${label} truth path is not a blob at the frozen commit: ${path}`);
        }
      }
      for (const path of row.paths) {
        assertSafePath(path, `${label} search path`);
        if (!gitObjectType(repository, `${repository.commit}:${path}`)) {
          fail(`${label} search path is absent at the frozen commit: ${path}`);
        }
      }
      total += 1;
    }
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, repositoryCount: Object.keys(REPOSITORIES).length, total, uniqueIds: ids.size, uniqueQuestions: questions.size, uniqueTruthSets: truths.size })}\n`,
  );
}

await main();
