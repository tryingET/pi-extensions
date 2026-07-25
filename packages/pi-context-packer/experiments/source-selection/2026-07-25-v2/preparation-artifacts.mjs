import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  EXPERIMENT_DIR,
  GZIP_PATH,
  PRE_RUN_ALLOWED_PATHS,
  TAR_PATH,
  TRACE_BUNDLE,
  WORK_ROOT,
} from "./experiment-config.mjs";
import { capture, fail, rawDigest, sha256Hex, stableJson } from "./experiment-runtime.mjs";
import { byteAndTokenCost } from "./trace-evidence.mjs";

export function formatPreparationReceipt({ gzipSha256, inputSha256, traceSha256 }) {
  return stableJson({
    status: "prepared",
    repositories: 4,
    cases: 40,
    sciReceiptsAvailableAndComplete: 40,
    eligibleSourceListRepositories: 3,
    preparedInputGzipSha256: `sha256:${gzipSha256}`,
    preparedInputUncompressedSha256: `sha256:${inputSha256}`,
    traceBundleSha256: traceSha256,
    rankingExecuted: false,
    resultAbsent: true,
  });
}

export function writePreparationReceipt(gzipSha256, inputSha256, traceSha256) {
  process.stdout.write(formatPreparationReceipt({ gzipSha256, inputSha256, traceSha256 }));
}

export async function createTraceBundle(traceRecords, artifacts) {
  if (traceRecords.length !== 40) fail("trace bundle requires exactly 40 case records");
  const traceRoot = join(WORK_ROOT, "traces");
  const manifestValue = {
    schema: "pi-context-packer.sci_file_access_trace_bundle.v1",
    characterization: "bounded-file-access-corroboration-not-authentication",
    instrumentation: {
      executable: artifacts.strace,
      traceExpression: "trace=%file",
      followsForks: true,
      stringLimitBytes: 4096,
    },
    knownSciIndexAndStatePolicy:
      "Fail on any traced .ontology, .semantic-graph, .sci, .semantic-code-ignore, .semantic-code-intelligence-config.yaml, index.scip, or *.scip path. Git .git/index is classified separately as Git plumbing.",
    traces: traceRecords,
  };
  const manifestJson = stableJson(manifestValue);
  const manifestPath = join(traceRoot, "manifest.json");
  await writeFile(manifestPath, manifestJson, { flag: "wx", mode: 0o644 });
  const tarPath = join(WORK_ROOT, "sci-file-access-traces.tar");
  const tarArgv = [
    TAR_PATH,
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "--mode=u+rwX,go+rX",
    "--format=ustar",
    "--create",
    "--file",
    tarPath,
    "--directory",
    traceRoot,
    "manifest.json",
    "raw",
  ];
  const tarResult = await capture(tarArgv[0], tarArgv.slice(1));
  if (
    tarResult.code !== 0 ||
    tarResult.signal !== null ||
    tarResult.stdout.length !== 0 ||
    tarResult.stderr.length !== 0
  ) {
    fail("deterministic trace tar command failed or emitted output");
  }
  const tarBytes = await readFile(tarPath);
  const gzipArgv = [GZIP_PATH, "--no-name", "--best", "--stdout", tarPath];
  const gzipResult = await capture(gzipArgv[0], gzipArgv.slice(1), { maxBytes: 256 * 1024 * 1024 });
  if (gzipResult.code !== 0 || gzipResult.signal !== null || gzipResult.stderr.length !== 0) {
    fail("deterministic trace gzip command failed or wrote stderr");
  }
  const bundleTemp = join(WORK_ROOT, basename(TRACE_BUNDLE));
  await writeFile(bundleTemp, gzipResult.stdout, { flag: "wx", mode: 0o644 });
  return {
    bundleTemp,
    summary: {
      path: basename(TRACE_BUNDLE),
      gzipSha256: rawDigest(gzipResult.stdout),
      gzipCost: byteAndTokenCost(gzipResult.stdout),
      uncompressedTarSha256: rawDigest(tarBytes),
      uncompressedTarCost: byteAndTokenCost(tarBytes),
      manifestSha256: rawDigest(manifestJson),
      manifestCost: byteAndTokenCost(manifestJson),
      deterministicTarArgv: tarArgv,
      deterministicGzipArgv: gzipArgv,
      traces: traceRecords.length,
      prohibitedSciIndexOrStateAccessCount: 0,
      characterization: "bounded-file-access-corroboration-not-authentication",
    },
  };
}

export async function createPreRunChecksumManifest(generatedBytes) {
  const allowed = new Set(PRE_RUN_ALLOWED_PATHS);
  if (allowed.size !== PRE_RUN_ALLOWED_PATHS.length)
    fail("approved pre-run allowlist has duplicates");
  for (const key of generatedBytes.keys()) {
    if (!allowed.has(key)) fail(`generated checksum entry is unexpected: ${key}`);
  }
  const rows = [];
  for (const relativePath of PRE_RUN_ALLOWED_PATHS) {
    const bytes = generatedBytes.has(relativePath)
      ? generatedBytes.get(relativePath)
      : await readFile(resolve(EXPERIMENT_DIR, relativePath));
    rows.push([sha256Hex(bytes), relativePath]);
  }
  rows.sort((left, right) => left[1].localeCompare(right[1]));
  return `${rows.map(([hash, relativePath]) => `${hash}  ${relativePath}`).join("\n")}\n`;
}
