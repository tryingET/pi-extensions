/**
summary: "Execute only a digest-verified copy of the pinned ripwire CLI with bounded resources."
read_when:
  - "Changing executable trust, subprocess arguments, or runtime provisioning."
*/
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { CODE_QUERY_MAX_CHARS } from "./code-request.js";
import { digest, stableRead } from "./ripwire-corpus.js";

export const RIPWIRE_SOURCE = "93c8edaafdb5499e89939cc2cebd0429e278e86f";
export const RIPWIRE_LINUX_X64_SHA256 =
  "57641cad14b916bb887d9386ef55fb2e76a8171dcc9c80a05400e4dfd1ad8734";
const exec = promisify(execFile);

export async function prepareRipwire(scratch, options = {}) {
  options.signal?.throwIfAborted();
  const original = options.binaryPath ?? process.env.PI_CONTEXT_PACKER_RIPWIRE_BIN;
  const expected =
    options.binarySha256 ??
    process.env.PI_CONTEXT_PACKER_RIPWIRE_SHA256 ??
    (process.platform === "linux" && process.arch === "x64" ? RIPWIRE_LINUX_X64_SHA256 : "");
  if (!original || !isAbsolute(original)) throw new Error("ripwire_not_configured");
  if (!/^[a-f0-9]{64}$/u.test(expected)) throw new Error("ripwire_digest_required");
  const data = await stableRead(original, 128 * 1024 * 1024);
  if (digest(data) !== expected) throw new Error("ripwire_digest_mismatch");
  // Run the verified bytes, not a path that can be replaced after verification.
  const binary = join(scratch, "ripwire-verified");
  await writeFile(binary, data, { flag: "wx", mode: 0o500 });
  const run = async (args) => {
    options.signal?.throwIfAborted();
    options.onExecution?.({ operation: args[0] === "--version" ? "version" : "discovery" });
    const { stdout } = await (options.execFile ?? exec)(binary, args, {
      cwd: scratch,
      env: { PATH: "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch, LANG: "C.UTF-8" },
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      signal: options.signal,
      encoding: "utf8",
    });
    return stdout;
  };
  const version = (await run(["--version"])).trim();
  if (!/^ripwire 0\.3\.8 \([^\n]{1,150}built_from=93c8edaaf\)$/u.test(version))
    throw new Error("ripwire_version_unsupported");
  return {
    run,
    version,
    binarySha256: expected,
    sourceRevision: RIPWIRE_SOURCE,
    sourceProvenance:
      expected === RIPWIRE_LINUX_X64_SHA256 ? "known_build_digest" : "operator_declared_build",
  };
}

export function discoveryArguments(root, objective, limit = 20) {
  if (
    typeof objective !== "string" ||
    !objective.trim() ||
    objective.length > CODE_QUERY_MAX_CHARS ||
    objective.includes("\0")
  )
    throw new Error("invalid_objective");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("invalid_limit");
  // Never accept model-supplied flags. The objective remains one --for value.
  return [
    root,
    `--for=${objective}`,
    "--format=candidates",
    `--top-k=${limit}`,
    "--no-cache",
    "--max-file-size=512k",
  ];
}
