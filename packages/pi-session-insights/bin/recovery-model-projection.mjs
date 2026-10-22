#!/usr/bin/env node
// Model-facing boundary for bounded extractor artifacts, never source JSONL.
// No raw input paths, parser diagnostics, stderr or source strings are forwarded.
import { isUtf8 } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function fail(code, status = 3) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code } })}\n`);
  process.exit(status);
}
function identity(stat) {
  if (!stat.isFile()) fail("PROJECTION_INPUT_UNAVAILABLE");
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
}
function snapshot(file) {
  const maximum = 2_097_153; // extractor maximum plus its final newline
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd, { bigint: true });
    const before = identity(stat);
    if (stat.size > BigInt(maximum)) fail("PROJECTION_INPUT_BUDGET_EXCEEDED");
    const chunks = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(65_536, maximum - size + 1));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      size += count;
      if (size > maximum) fail("PROJECTION_INPUT_BUDGET_EXCEEDED");
      chunks.push(chunk.subarray(0, count));
    }
    if (identity(fstatSync(fd, { bigint: true })) !== before) fail("PROJECTION_SOURCE_CHANGED");
    return { before, bytes: Buffer.concat(chunks, size) };
  } finally {
    closeSync(fd);
  }
}

const options = { jq: process.env.PI_SESSION_INSIGHTS_JQ || "jq" };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--help" || arg === "-h") {
    console.log(`Usage: node recovery-model-projection.mjs [options] <private-extractor-artifact.json>
Only fixed projected fields, computed digests and fixed errors reach stdout; stderr is withheld.
--artifact-sha256 <hex>  Required for Claude: match its successful private-output receipt
--jq-bin <path>         Trusted jq executable (default PI_SESSION_INSIGHTS_JQ or jq)
Pi has no native receipt: omitted expected hash is reported as unverified, never implied verified.`);
    process.exit(0);
  }
  if (arg === "--artifact-sha256" || arg === "--jq-bin") {
    const value = argv[++i];
    if (!value || value.startsWith("--")) fail("INVALID_PROJECTION_ARGUMENT", 2);
    if (arg === "--artifact-sha256") {
      if (!/^[a-f0-9]{64}$/.test(value)) fail("INVALID_PROJECTION_ARGUMENT", 2);
      options.expected = value;
    } else options.jq = value;
  } else {
    if (arg.startsWith("-") || options.file) fail("INVALID_PROJECTION_ARGUMENT", 2);
    options.file = resolve(arg);
  }
}
if (!options.file) fail("INVALID_PROJECTION_ARGUMENT", 2);
try {
  const { bytes, before } = snapshot(options.file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (options.expected && options.expected !== sha) fail("ARTIFACT_HASH_MISMATCH");
  if (!isUtf8(bytes)) fail("PROJECTION_INVALID_UTF8");
  // The private pathname is never an argument to jq. Every diagnostic stays captured.
  const result = spawnSync(
    options.jq,
    ["-c", "-f", fileURLToPath(new URL("../lib/recovery-model-projection.jq", import.meta.url))],
    {
      input: bytes,
      encoding: "utf8",
      maxBuffer: 1_048_576,
    },
  );
  if (identity(statSync(options.file, { bigint: true })) !== before)
    fail("PROJECTION_SOURCE_CHANGED");
  if (result.error || result.status !== 0) fail("PROJECTION_FAILED");
  // This is bounded fixed-filter output, not source JSONL or the private artifact.
  const projected = JSON.parse(result.stdout);
  if (projected?.schema !== "agent.session-recovery.model-projection.v1") fail("PROJECTION_FAILED");
  if (projected.harness === "claude" && !options.expected) fail("ARTIFACT_HASH_REQUIRED", 2);
  projected.artifact_sha256 = sha;
  projected.expected_artifact_hash_verified = options.expected !== undefined;
  process.stdout.write(`${JSON.stringify(projected)}\n`);
} catch {
  fail("PROJECTION_INPUT_OR_OUTPUT_UNAVAILABLE");
}
