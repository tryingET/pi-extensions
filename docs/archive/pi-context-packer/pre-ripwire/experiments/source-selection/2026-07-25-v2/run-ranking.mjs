import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  CHECKSUMS,
  EXPECTED_CASES_SHA256,
  EXPECTED_PREREGISTRATION_SHA256,
  EXPERIMENT_DIR,
  PACKAGE_DIR,
  PRE_RUN_ALLOWED_PATHS,
  PREPARED_GZIP,
  PREREGISTRATION_RELATIVE_PATH,
  RESULT,
  RUNNER,
  SUMMARY,
} from "./experiment-config.mjs";
import { capture, exists, fail, sha256Hex } from "./experiment-runtime.mjs";

async function verifyApprovedPreRunManifest() {
  const manifestBytes = await readFile(CHECKSUMS);
  const manifest = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
  if (!manifest.endsWith("\n") || manifest.includes("\r") || manifest.includes("\0")) {
    fail("SHA256SUMS must be newline-terminated canonical UTF-8 without CR or NUL");
  }
  const expected = new Set(PRE_RUN_ALLOWED_PATHS);
  if (expected.size !== PRE_RUN_ALLOWED_PATHS.length)
    fail("approved pre-run allowlist has duplicates");
  const entries = new Map();
  const lines = manifest.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0))
    fail("SHA256SUMS contains an empty or malformed entry");
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}([^\t\n\r\0]+)$/u.exec(line);
    if (!match) fail(`SHA256SUMS contains a malformed entry: ${JSON.stringify(line)}`);
    const [, hash, relativePath] = match;
    if (entries.has(relativePath)) fail(`SHA256SUMS contains duplicate entry: ${relativePath}`);
    if (!expected.has(relativePath)) fail(`SHA256SUMS contains unexpected entry: ${relativePath}`);
    entries.set(relativePath, hash);
  }
  for (const relativePath of expected) {
    if (!entries.has(relativePath)) fail(`SHA256SUMS is missing approved entry: ${relativePath}`);
  }
  if (entries.size !== expected.size)
    fail("SHA256SUMS entry count differs from approved allowlist");
  for (const [relativePath, expectedHash] of entries) {
    const artifactPath = resolve(EXPERIMENT_DIR, relativePath);
    const artifactStat = await lstat(artifactPath);
    if (!artifactStat.isFile() || artifactStat.isSymbolicLink()) {
      fail(`SHA256SUMS artifact must be a regular non-symlink file: ${relativePath}`);
    }
    const actualHash = sha256Hex(await readFile(artifactPath));
    if (actualHash !== expectedHash) fail(`SHA256SUMS hash mismatch: ${relativePath}`);
  }
  if (entries.get(PREREGISTRATION_RELATIVE_PATH) !== EXPECTED_PREREGISTRATION_SHA256) {
    fail("SHA256SUMS preregistration pin differs from the approved raw SHA-256");
  }
  if (entries.get("canonical-case-source.generated.json") !== EXPECTED_CASES_SHA256) {
    fail("SHA256SUMS canonical case-source pin differs from the approved raw SHA-256");
  }
  return entries;
}

async function runRanking(args) {
  if (args.length !== 1 || args[0] !== "--execute-ranking") {
    fail("run mode requires exactly --execute-ranking");
  }
  if (await exists(RESULT)) fail(`refusing existing ranking output: ${RESULT}`);
  if (!(await exists(CHECKSUMS))) fail(`missing required artifact: ${CHECKSUMS}`);
  const verifiedManifest = await verifyApprovedPreRunManifest();
  const summary = JSON.parse(await readFile(SUMMARY, "utf8"));
  if (summary.ranking?.executed !== false || summary.ranking?.resultAbsent !== true) {
    fail("preparation summary does not authorize a first ranking run");
  }
  if (
    summary.preregistration?.relativePath !== PREREGISTRATION_RELATIVE_PATH ||
    summary.preregistration?.rawSha256 !==
      `sha256:${verifiedManifest.get(PREREGISTRATION_RELATIVE_PATH)}`
  )
    fail("preparation summary preregistration binding mismatch");
  const gzipBytes = await readFile(PREPARED_GZIP);
  const expectedGzip = String(summary.preparedInput?.gzipSha256 ?? "").replace(/^sha256:/, "");
  const expectedInput = String(summary.preparedInput?.uncompressedSha256 ?? "").replace(
    /^sha256:/,
    "",
  );
  if (verifiedManifest.get("source-selection-ablation-input.json.gz") !== expectedGzip) {
    fail("summary gzip hash differs from verified pre-run manifest");
  }
  if (!/^[a-f0-9]{64}$/.test(expectedGzip) || sha256Hex(gzipBytes) !== expectedGzip) {
    fail("prepared gzip SHA-256 mismatch");
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-context-packer-ranking-"));
  const temporaryInput = join(temporaryRoot, "prepared-source-selection-ablation-v2.json");
  try {
    const inputBytes = gunzipSync(gzipBytes);
    await writeFile(temporaryInput, inputBytes, { flag: "wx", mode: 0o600 });
    if (!/^[a-f0-9]{64}$/.test(expectedInput) || sha256Hex(inputBytes) !== expectedInput) {
      fail("decompressed prepared input SHA-256 mismatch");
    }
    if (await exists(RESULT)) fail(`refusing existing ranking output: ${RESULT}`);
    const result = await capture(
      process.execPath,
      [RUNNER, "--input", temporaryInput, "--input-sha256", expectedInput, "--output", RESULT],
      { cwd: PACKAGE_DIR },
    );
    if (result.code !== 0 || result.signal !== null) {
      fail(`prepared-file runner failed: ${result.stderr.toString("utf8").slice(0, 2000)}`);
    }
    process.stdout.write(result.stdout);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export { runRanking, verifyApprovedPreRunManifest };
