#!/usr/bin/env node
import { open, readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import {
  ATTEMPT_SENTINEL,
  CHECKSUMS,
  EXPERIMENT_DIR,
  PRE_RUN_ALLOWED_PATHS,
  PRE_RUN_REVIEW,
  PREPARED_GZIP,
  RESULT,
  SUMMARY,
} from "./experiment-config.mjs";
import { exists, fail, rawDigest, sha256Hex, stableJson } from "./experiment-process.mjs";
import { verifyChecksumManifest } from "./preparation-artifacts.mjs";
import { evaluateV4Experiment } from "./v4-experiment.mjs";

async function durableExclusiveWrite(path, bytes) {
  const handle = await open(path, "wx", 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await open(EXPERIMENT_DIR, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

if (process.argv.length !== 3 || process.argv[2] !== "--execute-ranking") {
  fail("usage: node execute-v4-ranking.mjs --execute-ranking");
}
if (await exists(ATTEMPT_SENTINEL)) fail(`ranking attempt already exists: ${ATTEMPT_SENTINEL}`);
if (await exists(RESULT)) fail(`ranking result already exists: ${RESULT}`);
const entries = await verifyChecksumManifest(CHECKSUMS, PRE_RUN_ALLOWED_PATHS);
const review = await readFile(PRE_RUN_REVIEW, "utf8");
if (!review.includes("Decision: **ACCEPT**") || !review.includes("rankingExecuted: false")) {
  fail("independent pre-run review does not authorize the first v4 ranking");
}
const summary = JSON.parse(await readFile(SUMMARY, "utf8"));
if (summary.ranking?.executed !== false || summary.ranking?.resultAbsent !== true) {
  fail("preparation summary is not pre-ranking");
}
const gzipBytes = await readFile(PREPARED_GZIP);
const gzipSha256 = String(summary.preparedInput?.gzipSha256 ?? "").replace(/^sha256:/u, "");
const inputSha256 = String(summary.preparedInput?.uncompressedSha256 ?? "").replace(
  /^sha256:/u,
  "",
);
if (
  entries.get("source-selection-quality-input.json.gz") !== gzipSha256 ||
  sha256Hex(gzipBytes) !== gzipSha256 ||
  !/^[a-f0-9]{64}$/u.test(inputSha256)
) {
  fail("prepared v4 input binding mismatch");
}
const sentinel = stableJson({
  schema: "pi-context-packer.ranking_attempt.v1",
  experiment: "2026-07-26-v4",
  manifestSha256: rawDigest(await readFile(CHECKSUMS)),
  preparedInputGzipSha256: `sha256:${gzipSha256}`,
  preparedInputUncompressedSha256: `sha256:${inputSha256}`,
  state: "attempted-before-decompression-and-evaluation",
  retryAuthorized: false,
});
// This crash-durable exclusive sentinel is the point of no return. It is never removed.
await durableExclusiveWrite(ATTEMPT_SENTINEL, sentinel);
const inputBytes = gunzipSync(gzipBytes);
if (sha256Hex(inputBytes) !== inputSha256) fail("decompressed v4 input hash mismatch");
const result = evaluateV4Experiment(JSON.parse(inputBytes.toString("utf8")));
const output = stableJson({ inputSha256, result });
await durableExclusiveWrite(RESULT, output);
process.stdout.write(`${rawDigest(output)}  ${RESULT}\n`);
