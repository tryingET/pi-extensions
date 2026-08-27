#!/usr/bin/env node
// ---
// summary: "pi-context-corpus CLI: builds corpus/index.json + index.html over strata.json artifacts and runs named jq projections."
// read_when:
//   - "Changing the CLI surface (index/project subcommands) or fail-closed argument handling."
// ---
// Usage:
//   node bin/corpus.mjs index <corpusDir> [--sessions <glob>] [--replay-script <path>] [--children <glob>]
//   node bin/corpus.mjs project <name> [file]   # file defaults to corpus/index.json

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expandSessionGlob, runBatch } from "../lib/batch.mjs";
import { renderIndexHtml } from "../lib/corpus-html.mjs";
import { buildIndex } from "../lib/corpus-index.mjs";

export const PROJECTION_NAMES = [
  "occupancy",
  "faults",
  "spend",
  "ghosts",
  "runway",
  "sessions",
  "topfiles",
  "compaction",
];

const JQ_FILE = fileURLToPath(new URL("../projections/corpus.jq", import.meta.url));

const fail = (message) => {
  console.error(`corpus: ${message}`);
  process.exit(1);
};

const argOf = (argv, name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

function writeCorpus(corpusDir, index) {
  const outDir = resolve(corpusDir, "corpus");
  mkdirSync(outDir, { recursive: true });
  const indexPath = resolve(outDir, "index.json");
  const htmlPath = resolve(outDir, "index.html");
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(htmlPath, renderIndexHtml(index));
  return { indexPath, htmlPath };
}

/**
 * Carry forward previously recorded session provenance from an existing index so
 * incremental batch runs never lose measured provenance. This run's own batch
 * results (if any) win over the prior index.
 */
function priorSessionSources(corpusDir) {
  const prior = resolve(corpusDir, "corpus", "index.json");
  if (!existsSync(prior)) return {};
  try {
    const parsed = JSON.parse(readFileSync(prior, "utf8"));
    if (!Array.isArray(parsed?.sessions)) return {};
    return Object.fromEntries(
      parsed.sessions
        .filter((s) => typeof s?.sourceSession === "string")
        .map((s) => [s.id, s.sourceSession]),
    );
  } catch {
    return {}; // unreadable prior index: rebuild provenance from this run only
  }
}

function cmdIndex(argv) {
  const corpusDir = argv[0];
  if (!corpusDir || corpusDir.startsWith("--")) {
    fail(
      "usage: node bin/corpus.mjs index <corpusDir> [--sessions <glob>] [--replay-script <path>]",
    );
  }
  const resolved = resolve(corpusDir);
  if (!existsSync(resolved)) fail(`corpus dir not found: ${corpusDir}`);

  const sessionsGlob = argOf(argv, "--sessions");
  const replayScript = argOf(argv, "--replay-script");
  const childrenGlob = argOf(argv, "--children");
  const failedSessions = [];
  const sessionSources = {};

  if (sessionsGlob !== null) {
    if (replayScript === null) {
      fail("--sessions requires --replay-script <path to context-strata-replay.mjs>");
    }
    if (childrenGlob !== null && replayScript === null) {
      fail("--children requires --replay-script (fork attribution is produced by the replay)");
    }
    const sessions = expandSessionGlob(sessionsGlob);
    if (sessions.length === 0) fail(`--sessions glob matched no .jsonl files: ${sessionsGlob}`);
    for (const result of runBatch({ sessions, replayScript, corpusDir: resolved, childrenGlob })) {
      sessionSources[result.id] = result.sourceSession;
      if (!result.ok) {
        failedSessions.push({
          id: result.id,
          source: null,
          sourceSession: result.sourceSession,
          error: result.error,
        });
      }
    }
  } else if (replayScript !== null || childrenGlob !== null) {
    fail("--replay-script has no effect without --sessions");
  }

  const index = buildIndex(resolved, {
    failedSessions,
    sessionSources: { ...priorSessionSources(resolved), ...sessionSources },
  });
  const { indexPath, htmlPath } = writeCorpus(resolved, index);
  const counts = { ok: 0, empty: 0, failed: 0, unsupported: 0 };
  for (const session of index.sessions) counts[session.replayStatus] += 1;
  console.log(
    `corpus: ${index.sessions.length} sessions (ok=${counts.ok} empty=${counts.empty} failed=${counts.failed} unsupported=${counts.unsupported ?? 0})`,
  );
  console.log(`index: ${indexPath}`);
  console.log(`html: ${htmlPath}`);
}

function cmdProject(argv) {
  const name = argv[0];
  if (!name || name.startsWith("--")) {
    console.error("usage: node bin/corpus.mjs project <name> [file]");
    console.error(`available projections: ${PROJECTION_NAMES.join(", ")}`);
    process.exit(1);
  }
  if (!PROJECTION_NAMES.includes(name)) {
    fail(`unknown projection '${name}'; available: ${PROJECTION_NAMES.join(", ")}`);
  }
  const file = argv[1] && !argv[1].startsWith("--") ? argv[1] : null;
  const input = resolve(file ?? "corpus/index.json");
  if (!existsSync(input)) fail(`input file not found: ${input} (default is corpus/index.json)`);

  const result = spawnSync("jq", ["-f", JQ_FILE, "--arg", "p", name, input], {
    stdio: "inherit",
  });
  if (result.error) fail(`jq is required for projections: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

const argv = process.argv.slice(2);
const command = argv[0];
if (command === "index") cmdIndex(argv.slice(1));
else if (command === "project") cmdProject(argv.slice(1));
else {
  console.error("usage: node bin/corpus.mjs <index|project> ...");
  console.error("  index <corpusDir> [--sessions <glob>] [--replay-script <path>]");
  console.error(`  project <name> [file]   # name one of: ${PROJECTION_NAMES.join(", ")}`);
  process.exit(1);
}
