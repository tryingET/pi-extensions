import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  CASES_RELATIVE_PATH,
  CHECKSUMS,
  EXPECTED_CASES_SHA256,
  EXPECTED_PREREGISTRATION_SHA256,
  EXPERIMENT_DIR,
  PRE_RUN_ALLOWED_PATHS,
  PRE_RUN_REVIEW,
  PREPARED_GZIP,
  PREREGISTRATION_RELATIVE_PATH,
  RESULT,
  SUMMARY,
  WORK_ROOT,
} from "./experiment-config.mjs";
import { capture, exists, fail, sha256Hex } from "./experiment-runtime.mjs";

export async function verifyManifest(manifestPath, allowedPaths) {
  const manifest = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(manifestPath));
  if (!manifest.endsWith("\n") || manifest.includes("\r") || manifest.includes("\0")) {
    fail("checksum manifest must be canonical newline-terminated UTF-8");
  }
  const expected = new Set(allowedPaths);
  if (expected.size !== allowedPaths.length) fail("checksum allowlist has duplicates");
  const entries = new Map();
  for (const line of manifest.slice(0, -1).split("\n")) {
    const match = /^([a-f0-9]{64}) {2}([^\t\n\r\0]+)$/u.exec(line);
    if (!match) fail(`malformed checksum entry: ${JSON.stringify(line)}`);
    const [, hash, relativePath] = match;
    if (!expected.has(relativePath) || entries.has(relativePath)) {
      fail(`unexpected or duplicate checksum entry: ${relativePath}`);
    }
    entries.set(relativePath, hash);
  }
  for (const relativePath of expected) {
    if (!entries.has(relativePath)) fail(`missing checksum entry: ${relativePath}`);
  }
  if (entries.size !== expected.size) fail("checksum entry count differs from allowlist");
  for (const [relativePath, hash] of entries) {
    const path = resolve(EXPERIMENT_DIR, relativePath);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`unsafe checksum artifact: ${relativePath}`);
    if (sha256Hex(await readFile(path)) !== hash) fail(`checksum mismatch: ${relativePath}`);
  }
  return entries;
}

export async function runRanking(args) {
  if (args.length !== 1 || args[0] !== "--execute-ranking") {
    fail("run mode requires exactly --execute-ranking");
  }
  if (await exists(RESULT)) fail(`refusing existing ranking result: ${RESULT}`);
  if (!(await exists(CHECKSUMS))) fail(`missing final checksum manifest: ${CHECKSUMS}`);
  const entries = await verifyManifest(CHECKSUMS, PRE_RUN_ALLOWED_PATHS);
  if (entries.get(PREREGISTRATION_RELATIVE_PATH) !== EXPECTED_PREREGISTRATION_SHA256) {
    fail("final manifest preregistration pin mismatch");
  }
  if (entries.get(CASES_RELATIVE_PATH) !== EXPECTED_CASES_SHA256) {
    fail("final manifest case-source pin mismatch");
  }
  const review = await readFile(PRE_RUN_REVIEW, "utf8");
  if (!review.includes("Decision: **ACCEPT**") || !review.includes("rankingExecuted: false")) {
    fail("independent pre-run review does not explicitly ACCEPT the first ranking run");
  }
  const summary = JSON.parse(await readFile(SUMMARY, "utf8"));
  if (summary.ranking?.executed !== false || summary.ranking?.resultAbsent !== true) {
    fail("preparation summary is not pre-ranking");
  }
  const gzipBytes = await readFile(PREPARED_GZIP);
  const expectedGzip = String(summary.preparedInput?.gzipSha256 ?? "").replace(/^sha256:/u, "");
  const expectedInput = String(summary.preparedInput?.uncompressedSha256 ?? "").replace(
    /^sha256:/u,
    "",
  );
  if (
    entries.get("source-selection-refinement-input.json.gz") !== expectedGzip ||
    sha256Hex(gzipBytes) !== expectedGzip
  ) {
    fail("prepared gzip hash mismatch");
  }
  await mkdir(dirname(WORK_ROOT), { recursive: true });
  const temporaryRoot = await mkdtemp(join(dirname(WORK_ROOT), "pi-context-packer-v3-ranking-"));
  const temporaryInput = join(temporaryRoot, "prepared-source-selection-refinement-v3.json");
  try {
    const inputBytes = gunzipSync(gzipBytes);
    if (sha256Hex(inputBytes) !== expectedInput) fail("prepared input hash mismatch");
    await writeFile(temporaryInput, inputBytes, { flag: "wx", mode: 0o600 });
    if (await exists(RESULT)) fail(`refusing existing ranking result: ${RESULT}`);
    const result = await capture(
      process.execPath,
      [
        join(EXPERIMENT_DIR, "run-v3-ranking.mjs"),
        "--input",
        temporaryInput,
        "--input-sha256",
        expectedInput,
        "--output",
        RESULT,
      ],
      { cwd: EXPERIMENT_DIR, maxBytes: 16 * 1024 * 1024 },
    );
    if (result.code !== 0 || result.signal !== null || result.stderr.length !== 0) {
      fail(`v3 ranking runner failed: ${result.stderr.toString("utf8").slice(0, 2000)}`);
    }
    process.stdout.write(result.stdout);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
