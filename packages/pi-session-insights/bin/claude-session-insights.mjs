#!/usr/bin/env node
// Explicit Claude adapter: Node handles budgets/custody only; jq parses JSONL.
import { isUtf8 } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function fail(code, message, status = 2) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } })}\n`);
  process.exit(status);
}
function integer(value, name, maximum) {
  if (!/^[1-9][0-9]*$/.test(value ?? "") || Number(value) > maximum) {
    fail("INVALID_ARGUMENT", `${name} requires an integer in 1..${maximum}`);
  }
  return Number(value);
}
function identity(stat) {
  if (!stat.isFile()) fail("NOT_REGULAR_FILE", "input must be a regular file");
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    size: String(stat.size),
    mtime_ns: String(stat.mtimeNs),
    ctime_ns: String(stat.ctimeNs),
  };
}
function snapshot(file, maximum) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const before = identity(fstatSync(fd, { bigint: true }));
    if (BigInt(before.size) > BigInt(maximum))
      fail("INPUT_BUDGET_EXCEEDED", "file exceeds input budget");
    const chunks = [];
    let size = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65_536, maximum - size + 1));
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      size += count;
      if (size > maximum) fail("INPUT_BUDGET_EXCEEDED", "input grew beyond requested budget", 3);
      chunks.push(buffer.subarray(0, count));
    }
    const after = identity(fstatSync(fd, { bigint: true }));
    if (JSON.stringify(before) !== JSON.stringify(after))
      fail("SOURCE_CHANGED", "source changed during snapshot", 3);
    const bytes = Buffer.concat(chunks, size);
    if (!isUtf8(bytes)) fail("INVALID_UTF8", "source contains invalid UTF-8 bytes", 3);
    return { bytes, before, sha: createHash("sha256").update(bytes).digest("hex") };
  } finally {
    closeSync(fd);
  }
}
function privateOutput(file, contents) {
  const parent = statSync(dirname(file));
  if (
    !parent.isDirectory() ||
    (parent.mode & 0o077) !== 0 ||
    (process.getuid && parent.uid !== process.getuid())
  ) {
    fail(
      "PRIVATE_OUTPUT_REQUIRED",
      "output parent must be a private directory owned by this user",
      3,
    );
  }
  const fd = openSync(
    file,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(fd, contents);
  } finally {
    closeSync(fd);
  }
}
function sidecarPresence(candidate, root, sessionFile) {
  if (!root) return "not_inspected";
  // No implicit home expansion, symlink escape, child recursion, or body reads.
  const path = isAbsolute(candidate) ? candidate : resolve(dirname(sessionFile), candidate);
  const inside = (target) => {
    const rel = relative(root, target);
    return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
  };
  if (!inside(path)) return "outside_allowed_root";
  try {
    if (!inside(realpathSync(path))) return "outside_allowed_root";
    return lstatSync(path).isFile() ? "present_unread" : "not_regular_file";
  } catch (error) {
    return error.code === "ENOENT" ? "missing" : "unavailable";
  }
}

const options = {
  page: 1,
  pageSize: 50,
  maxText: 2_000,
  maxChain: 512,
  maxBytes: 67_108_864,
  view: "records",
  leaf: "",
  includeText: false,
  includePaths: false,
  pretty: false,
  jq: process.env.PI_SESSION_INSIGHTS_JQ || "jq",
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  const take = () => {
    const value = argv[++i];
    if (!value || value.startsWith("--")) fail("INVALID_ARGUMENT", `${arg} requires a value`);
    return value;
  };
  switch (arg) {
    case "--help":
    case "-h":
      console.log(`Usage: pi-session-insights --format claude [options] <session.jsonl>
Explicit physical-history adapter; effective context is unsupported. Metadata is NOT sanitized.
Use --private-output for a fixed numeric/digest receipt; full artifacts must stay private.
--view records|leaves|chain|references|compactions|errors (default records)
--leaf <uuid>           Required for chain; never inferred from last appended record
--page <n>              1-based page (default 1), repeat until next_page is null
--page-size <n>         1..100 (default 50)
--max-chain <n>         1..4096 (default 512); incomplete chain is explicit
--private-output <f>   Exclusive 0600 artifact in owned 0700 directory; safe receipt on stdout
--include-paths        Exact sidecar paths only inside --private-output artifact
--include-text         Bounded user/assistant text only inside --private-output artifact
--max-text-chars <n>    1..2000 (default 2000), excludes tools/thinking
--max-input-bytes <n>   1..67108864 (default 64 MiB); no silent partial scan
--sidecar-root <dir>    Explicit allowed root for existence checks only (no reads)
--pretty               Pretty JSON
--jq-bin <path>        Explicit jq executable`);
      process.exit(0);
      break;
    case "--page":
      options.page = integer(take(), arg, 1_000_000);
      break;
    case "--page-size":
      options.pageSize = integer(take(), arg, 100);
      break;
    case "--max-chain":
      options.maxChain = integer(take(), arg, 4096);
      break;
    case "--max-text-chars":
      options.maxText = integer(take(), arg, 2000);
      break;
    case "--max-input-bytes":
      options.maxBytes = integer(take(), arg, 67_108_864);
      break;
    case "--view":
      options.view = take();
      break;
    case "--leaf":
      options.leaf = take();
      break;
    case "--jq-bin":
      options.jq = take();
      break;
    case "--sidecar-root":
      options.sidecarRoot = take();
      break;
    case "--private-output":
      options.privateOutput = resolve(take());
      break;
    case "--include-paths":
      options.includePaths = true;
      break;
    case "--include-text":
      options.includeText = true;
      break;
    case "--pretty":
      options.pretty = true;
      break;
    default:
      if (arg.startsWith("-") || options.file)
        fail("INVALID_ARGUMENT", "expected options and one file");
      options.file = resolve(arg);
  }
}
if (!options.file) fail("INVALID_ARGUMENT", "one explicit JSONL file is required");
if (!["records", "leaves", "chain", "references", "compactions", "errors"].includes(options.view)) {
  fail("INVALID_ARGUMENT", "unsupported view");
}
if (options.view === "chain" && (!options.leaf || options.leaf.length > 256)) {
  fail("INVALID_ARGUMENT", "chain requires an exact leaf UUID of at most 256 characters");
}
if ((options.includePaths || options.includeText) && !options.privateOutput) {
  fail(
    "PRIVATE_OUTPUT_REQUIRED",
    "text or exact paths require an explicit private output artifact",
  );
}
try {
  if (options.sidecarRoot) options.sidecarRoot = realpathSync(options.sidecarRoot);
  const { bytes, before, sha } = snapshot(options.file, options.maxBytes);
  const args = [
    "-Rnc",
    "--from-file",
    fileURLToPath(new URL("../lib/claude-session-insights.jq", import.meta.url)),
  ];
  for (const [key, value] of Object.entries({
    session_file: options.file,
    view: options.view,
    leaf: options.leaf,
  })) {
    args.push("--arg", key, value);
  }
  for (const [key, value] of Object.entries({
    page: options.page,
    page_size: options.pageSize,
    max_text_chars: options.maxText,
    max_chain: options.maxChain,
    max_line_chars: 8_388_608,
    include_text: options.includeText,
  }))
    args.push("--argjson", key, String(value));
  // jq sees exactly the immutable bounded bytes that were hashed, never a reopened path.
  const result = spawnSync(options.jq, args, {
    input: bytes,
    encoding: "utf8",
    maxBuffer: 2_097_152,
  });
  const after = identity(statSync(options.file, { bigint: true }));
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    fail("SOURCE_CHANGED", "source changed during extraction; output withheld", 3);
  }
  if (result.error) fail("JQ_EXECUTION_FAILED", "jq unavailable or output budget exceeded", 3);
  if (result.status !== 0) fail("JQ_EXTRACTION_FAILED", "jq failed; raw diagnostic suppressed", 3);
  // This is bounded extractor output, NOT source JSONL parsing.
  const output = JSON.parse(result.stdout);
  output.custody = {
    sha256: sha,
    stat: before,
    stable_pre_post: true,
    read_binding: "single_descriptor_bounded_snapshot_hashed_and_supplied_to_jq",
    limitation: "pre/post equality is not a source freeze or backup; use an owner-frozen copy",
  };
  for (const record of output.records) {
    for (const [ordinal, sidecar] of (record.sidecars ?? []).entries()) {
      sidecar.status = sidecarPresence(sidecar.path, options.sidecarRoot, options.file);
      sidecar.path_sha256 = createHash("sha256").update(sidecar.path).digest("hex");
      sidecar.source_ref = { line: record.source.line, ordinal };
      sidecar.path_omitted = !options.includePaths;
      if (!options.includePaths) sidecar.path = null;
    }
  }
  output.limits.max_input_bytes = options.maxBytes;
  output.limits.max_output_bytes = 2_097_152;
  output.limits.paths_included = options.includePaths;
  output.privacy = {
    classification: "unredacted_metadata_not_model_safe",
    model_exposure: "private_receipt_or_allowlisted_projection_only",
    paths_withheld: !options.includePaths,
  };
  const encoded = JSON.stringify(output, null, options.pretty ? 2 : undefined);
  if (Buffer.byteLength(encoded) > 2_097_152) fail("OUTPUT_BUDGET_EXCEEDED", "reduce page size", 3);
  if (options.privateOutput) {
    const contents = `${encoded}\n`;
    privateOutput(options.privateOutput, contents);
    process.stdout.write(
      `${JSON.stringify({
        schema: "agent.session-recovery.private-receipt.v1",
        ok: true,
        private_output_written: true,
        artifact_sha256: createHash("sha256").update(contents).digest("hex"),
        source_sha256: sha,
        physical_lines: output.coverage.physical_lines,
        parsed_objects: output.coverage.parsed_objects,
        parse_errors: output.coverage.parse_errors,
        page: output.pagination.page,
        returned: output.pagination.returned,
        total: output.pagination.total,
        next_page: output.pagination.next_page,
      })}\n`,
    );
  } else process.stdout.write(`${encoded}\n`);
} catch {
  fail("INPUT_OR_EXTRACTION_UNAVAILABLE", "file, sidecar root or extractor output unavailable", 3);
}
