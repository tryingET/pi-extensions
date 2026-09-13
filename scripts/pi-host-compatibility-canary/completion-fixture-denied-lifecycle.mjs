// Synthetic copies of host-lifecycle/recovery bind here, never to process.mjs.
// An attempted effect is always an error, independent of executable spelling.
// Only the synchronous bounded intent append occurs; no sandbox, spawn, callback,
// package manager, recovery, or cleanup is performed by this executor.
import { closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPath } from "./completion-fixture-closure.mjs";
import { intentHeader } from "./completion-fixture-cases.mjs";
export const DENIAL_CODE = "COMPLETION_FIXTURE_LIFECYCLE_DENIED";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const logPath = path.join(path.dirname(root), "denied-intents.jsonl");
const MAX_BYTES = 16384;
function appendIntent(command, args, options) {
  canonicalPath(logPath);
  const fd = openSync(logPath, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW);
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile() || stats.nlink !== 1 || stats.uid !== process.geteuid() ||
      (stats.mode & 0o077) !== 0 || stats.size <= 0 || stats.size > MAX_BYTES) throw Error("invalid intent file");
    const text = readFileSync(fd, "utf8");
    if (!text.endsWith("\n")) throw Error("incomplete intent evidence");
    const lines = text.trimEnd().split("\n");
    if (lines[0] !== JSON.stringify(intentHeader(root, process.argv[2])) || lines.length > 8) {
      throw Error("intent header/count invalid");
    }
    // Always record an attempt, even malformed/oversized arguments. Bounded
    // representations differ from all approved intents, so caught errors fail the
    // independent parent check rather than masquerading as zero attempts.
    const bounded = value => typeof value === "string" ? value.slice(0, 256) : `<${typeof value}>`;
    const malformed = typeof command !== "string" || command.length > 256 || !Array.isArray(args) ||
      args.length > 16 || args.some(arg => typeof arg !== "string" || arg.length > 256) ||
      typeof options?.cwd !== "string" || options.cwd.length > 256;
    let record = JSON.stringify({ kind: "denied-lifecycle-intent", sequence: lines.length,
      command: bounded(command), args: Array.isArray(args) ? args.slice(0, 16).map(bounded) : ["<invalid-argv>"],
      cwd: bounded(options?.cwd), ...(malformed ? { malformed: true } : {}) }) + "\n";
    if (Buffer.byteLength(record) > 8192) record = JSON.stringify({ kind: "denied-lifecycle-intent",
      sequence: lines.length, malformed: true, reason: "oversized-intent" }) + "\n";
    const bytes = Buffer.from(record);
    if (stats.size + bytes.length > MAX_BYTES) throw Error("intent log capacity exceeded");
    if (writeSync(fd, bytes) !== bytes.length) throw Error("short intent append");
    fsyncSync(fd);
  } finally { closeSync(fd); }
}
export async function spawnWithNeutralNpmEnv(command, args, options) {
  let cause;
  try { appendIntent(command, args, options); } catch (error) { cause = error; }
  throw Object.assign(new Error(`completion fixture lifecycle executor denied${cause ? ": intent evidence failed" : ""}`,
    cause ? { cause } : undefined), { code: DENIAL_CODE });
}
