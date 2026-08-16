// ---
// summary: "Provides ownership-aware private locks with fail-closed live-owner checks and stale-lock retention."
// read_when:
//   - "Changing activation or materialization crash recovery and lock ownership semantics."
// ---
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { link, lstat, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import {
  assertObject,
  canonical,
  fail,
  sha256,
  stableJson,
  syncDirectory,
  writeExclusive,
} from "./common.mjs";

async function bootId() {
  try { return (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim(); }
  catch { fail("cannot establish lock ownership without Linux boot identity"); }
}

async function processStart(pid) {
  let text;
  try { text = await readFile(`/proc/${pid}/stat`, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    fail(`cannot inspect lock owner process ${pid}`);
  }
  const close = text.lastIndexOf(")");
  if (close < 0) fail(`cannot parse lock owner process ${pid}`);
  const fields = text.slice(close + 2).trim().split(/\s+/u);
  const startTime = fields[19];
  if (!/^\d+$/u.test(startTime ?? "")) fail(`cannot parse lock owner start time ${pid}`);
  return startTime;
}

async function currentOwner() {
  return {
    pid: process.pid,
    startTime: await processStart(process.pid),
    bootId: await bootId(),
    nonce: randomUUID(),
  };
}

function validateRecord(value, schema, binding) {
  const record = assertObject(value, "lock record");
  const owner = assertObject(record.owner, "lock owner");
  if (record.schema !== schema || canonical(record.binding) !== canonical(binding)) fail("existing lock has an unknown root binding");
  if (!Number.isInteger(owner.pid) || owner.pid < 1 || !/^\d+$/u.test(owner.startTime ?? "") || typeof owner.bootId !== "string" || !owner.bootId || typeof owner.nonce !== "string" || !owner.nonce) {
    fail("existing lock owner identity is unknown");
  }
  return record;
}

async function readExisting(lockPath, schema, binding) {
  const info = await lstat(lockPath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail("existing lock state is unsafe");
  if (await realpath(lockPath) !== lockPath) fail("existing lock path is non-canonical");
  const bytes = await readFile(lockPath);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("existing lock record is invalid JSON"); }
  return { bytes, record: validateRecord(value, schema, binding) };
}

async function ownerState(owner) {
  if (owner.bootId !== await bootId()) return "stale";
  const start = await processStart(owner.pid);
  if (start === null || start !== owner.startTime) return "stale";
  return "live";
}

async function withCoordination(lockPath, operation) {
  const gatePath = `${lockPath}.coordination`;
  try { await writeExclusive(gatePath, "pi-extension-generations coordination gate\n", 0o600); }
  catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const info = await lstat(gatePath);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || await realpath(gatePath) !== gatePath) fail("lock coordination gate is unsafe");
  }
  const holder = spawn("flock", ["-w", "5", "-E", "75", gatePath, process.execPath, "-e", "process.stdout.write('ready\\n'); process.stdin.resume();"], { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let errorOutput = "";
  holder.stdout.setEncoding("utf8");
  holder.stderr.setEncoding("utf8");
  holder.stdout.on("data", (chunk) => { output += chunk; });
  holder.stderr.on("data", (chunk) => { errorOutput += chunk; });
  const closed = new Promise((resolve, reject) => {
    holder.on("error", reject);
    holder.on("close", (code, signal) => resolve({ code, signal }));
  });
  const deadline = Date.now() + 6000;
  while (!output.includes("ready\n")) {
    const early = await Promise.race([closed, new Promise((resolve) => setTimeout(() => resolve(null), 10))]);
    if (early) {
      if (early.code === 75) fail("lock coordination gate is held by another process", "PI_GENERATION_LOCKED");
      fail(`lock coordination holder failed (${early.code ?? early.signal}): ${errorOutput.trim()}`);
    }
    if (Date.now() >= deadline) { holder.kill("SIGKILL"); fail("lock coordination gate acquisition timed out"); }
  }
  try { return await operation(); }
  finally {
    holder.stdin.end();
    const result = await closed;
    if (result.code !== 0) fail(`lock coordination holder exited ${result.code ?? result.signal}`);
  }
}

async function retainOrphanTemporaries(lockPath, historyDir) {
  const directory = path.dirname(lockPath);
  const prefix = `.${path.basename(lockPath)}.`;
  const names = (await readdir(directory)).filter((name) => name.startsWith(prefix) && name.endsWith(".record.tmp"));
  for (const name of names) {
    await rename(path.join(directory, name), path.join(historyDir, `${name}.${randomUUID()}.orphan-lock-record`));
  }
  if (names.length > 0) { await syncDirectory(directory); await syncDirectory(historyDir); }
}

async function publishLockRecord(lockPath, bytes, hooks) {
  const directory = path.dirname(lockPath);
  const temporary = path.join(directory, `.${path.basename(lockPath)}.${process.pid}.${randomUUID()}.record.tmp`);
  await writeExclusive(temporary, bytes, 0o600);
  await hooks.afterLockRecordTemporary?.({ temporary, lockPath });
  let linked = false;
  try {
    await link(temporary, lockPath);
    linked = true;
    await hooks.afterLockRecordLinked?.({ temporary, lockPath });
    await syncDirectory(directory);
  } catch (error) {
    if (linked) await unlink(lockPath).catch(() => {});
    await unlink(temporary).catch(() => {});
    await syncDirectory(directory).catch(() => {});
    if (error?.code === "EEXIST") fail("lock record appeared during coordinated publication", "PI_GENERATION_LOCKED");
    throw error;
  }
  await unlink(temporary);
  await syncDirectory(directory);
}

async function retainStale(lockPath, historyDir, existing) {
  const owner = existing.record.owner;
  const target = path.join(historyDir, `${path.basename(lockPath)}.${owner.pid}.${owner.startTime}.${owner.nonce}.stale.json`);
  try {
    await rename(lockPath, target);
    await syncDirectory(path.dirname(lockPath));
    await syncDirectory(historyDir);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    if (error?.code === "EEXIST") fail("stale-lock history collision");
    throw error;
  }
}

export async function acquireOwnedLock({ lockPath, historyDir, schema, binding, hooks = {} }) {
  return withCoordination(lockPath, async () => {
    await retainOrphanTemporaries(lockPath, historyDir);
    const existing = await readExisting(lockPath, schema, binding);
    if (existing) {
      if (await ownerState(existing.record.owner) === "live") {
        fail(`lock is owned by live process ${existing.record.owner.pid}`, "PI_GENERATION_LOCKED");
      }
      if (!await retainStale(lockPath, historyDir, existing)) fail("stale lock disappeared during coordinated recovery");
    }
    const owner = await currentOwner();
    const record = { schema, binding, owner, createdAt: new Date().toISOString() };
    const bytes = Buffer.from(stableJson(record));
    await publishLockRecord(lockPath, bytes, hooks);
    const digest = sha256(bytes);
    return {
      record,
      async release() {
        await withCoordination(lockPath, async () => {
          const current = await readExisting(lockPath, schema, binding);
          if (!current || sha256(current.bytes) !== digest) fail("lock ownership changed before release");
          await unlink(lockPath);
          await syncDirectory(path.dirname(lockPath));
        });
      },
    };
  });
}
