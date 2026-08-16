// ---
// summary: "Provides bounded hashing, durable-file, process, and path primitives for immutable extension generations."
// read_when:
//   - "Changing generation provenance, durability, subprocess, or containment behavior."
// ---
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  stat,
} from "node:fs/promises";
import path from "node:path";

export const PLAN_SCHEMA = "pi-extension-generation-plan.v1";
export const PROVENANCE_SCHEMA = "pi-extension-generation-provenance.v1";
export const VERIFICATION_SCHEMA = "pi-extension-generation-verification.v1";
export const GENERATION_SCHEMA = "pi-extension-generation.v1";
export const AGENT_SCHEMA = "pi-extension-generations-private-agent.v1";
export const JOURNAL_SCHEMA = "pi-extension-generations-activation-journal.v1";
export const SUPPORTED_PACKAGE_ROOT = "packages/pi-agent-interaction-canary";
export const SUPPORTED_PACKAGE_NAME = "@tryinget/pi-agent-interaction-canary";
export const INSTALL_ARGS = ["ci", "--omit=dev", "--ignore-scripts", "--legacy-peer-deps"];

export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function fail(message, code = "PI_GENERATION_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

export function assertAbsolute(input, label) {
  if (typeof input !== "string" || !path.isAbsolute(input) || path.resolve(input) !== input) {
    fail(`${label} must be an absolute normalized path`);
  }
  return input;
}

export function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertWithin(root, target, label) {
  if (!isWithin(root, target) || root === target) fail(`${label} must be beneath ${root}`);
}

export async function lstatMaybe(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function assertRegularFile(target, label) {
  const info = await lstatMaybe(target);
  if (!info || !info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  return info;
}

export async function assertDirectory(target, label) {
  const info = await lstatMaybe(target);
  if (!info || !info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a non-symlink directory`);
  return info;
}

export async function readJsonFile(target, label) {
  await assertRegularFile(target, label);
  let value;
  try {
    value = JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return value;
}

export async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

export async function writeExclusive(target, bytes, mode = 0o600) {
  let handle;
  try {
    handle = await open(target, "wx", mode);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle?.close();
  }
  await syncDirectory(path.dirname(target));
}

export async function atomicReplace(target, bytes, mode = 0o600) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  await writeExclusive(temporary, bytes, mode);
  await rename(temporary, target);
  await chmod(target, mode);
  await syncDirectory(path.dirname(target));
}

export async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  let outputBytes = 0;
  const maxOutputBytes = options.maxOutputBytes ?? 8 * 1024 * 1024;
  const collect = (chunks) => (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > maxOutputBytes) child.kill("SIGKILL");
    else chunks.push(chunk);
  };
  child.stdout.on("data", collect(stdout));
  child.stderr.on("data", collect(stderr));
  if (options.input !== undefined) {
    child.stdin.end(options.input);
  }
  const result = await new Promise((resolveResult, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolveResult({ code, signal }));
  });
  const out = Buffer.concat(stdout);
  const err = Buffer.concat(stderr);
  if (outputBytes > maxOutputBytes) fail(`${command} output exceeded ${maxOutputBytes} bytes`, "PI_GENERATION_PROCESS_OUTPUT");
  if (result.code !== 0 && !options.allowFailure) {
    fail(`${command} ${args.join(" ")} failed (${result.code ?? result.signal}): ${err.toString("utf8").trim()}`, "PI_GENERATION_PROCESS_FAILED");
  }
  return { ...result, stdout: out, stderr: err };
}

export async function commandVersion(command) {
  const result = await run(command, ["--version"]);
  return result.stdout.toString("utf8").trim();
}

export async function ensurePrivateDirectory(target, label) {
  const info = await assertDirectory(target, label);
  if ((info.mode & 0o077) !== 0) fail(`${label} must not grant group or other permissions`);
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) fail(`${label} must be owned by the current user`);
  const canonicalPath = await realpath(target);
  if (canonicalPath !== target) fail(`${label} must use its canonical path`);
  return info;
}

export async function mkdirPrivate(target) {
  await mkdir(target, { mode: 0o700 });
  await chmod(target, 0o700);
  await syncDirectory(path.dirname(target));
}

export async function walk(root, options = {}) {
  const output = [];
  async function visit(directory, relativeDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (options.skip?.(relative, entry)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, relative);
      else output.push({ absolute, relative, entry });
    }
  }
  await visit(root, "");
  return output;
}

export async function makeTreeReadOnly(root) {
  const entries = await walk(root);
  for (const item of entries) {
    if (item.entry.isSymbolicLink()) continue;
    const info = await stat(item.absolute);
    await chmod(item.absolute, info.mode & 0o111 ? 0o555 : 0o444);
  }
  async function lockDirectories(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) if (entry.isDirectory()) await lockDirectories(path.join(directory, entry.name));
    await chmod(directory, 0o555);
  }
  await lockDirectories(root);
}
