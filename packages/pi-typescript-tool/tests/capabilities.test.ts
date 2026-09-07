import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { createCapabilities, MAX_FS_CALLS, MAX_READ_BYTES } from "../src/capabilities.ts";

async function fixture(t: TestContext) {
  const parent = await mkdtemp(join(tmpdir(), "pi-typescript-fs-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "root");
  await mkdir(root);
  await writeFile(join(root, "a.txt"), "hello world");
  await writeFile(join(parent, "secret"), "outside");
  const lease = await createCapabilities(root);
  t.after(() => lease.close());
  return { parent, root, ...lease, fs: lease.capabilities.fs };
}

test("read-only helpers list sorted entries and bound regular-file reads", async (t) => {
  const { fs, root } = await fixture(t);
  await mkdir(join(root, "dir"));
  assert.deepEqual(await fs.list(), [
    { name: "a.txt", kind: "file", size: 11 },
    { name: "dir", kind: "directory", size: null },
  ]);
  assert.equal(await fs.read("@a.txt", 5), "hello\n… truncated");
  assert.equal(await fs.read("a.txt", 11), "hello world");
  assert.equal("write" in fs, false);
  await assert.rejects(fs.read("dir"), /regular files/);
  await assert.rejects(fs.read("missing"), /ENOENT/);
});

test("canonical guard rejects lexical and file/directory symlink escapes", async (t) => {
  const { fs, root, parent } = await fixture(t);
  await symlink(join(parent, "secret"), join(root, "file-link"));
  await symlink(parent, join(root, "dir-link"));
  for (const path of ["../secret", join(parent, "secret"), "file-link", "dir-link/secret"]) {
    await assert.rejects(fs.read(path), /escapes the workspace root/, path);
  }
  await assert.rejects(fs.list("dir-link"), /escapes the workspace root/);
  const listed = await fs.list();
  assert.deepEqual(
    listed.find((e) => e.name === "file-link"),
    { name: "file-link", kind: "other", size: null },
  );
});

test("in-root symlinks, symlinked cwd and ..prefixed names work", async (t) => {
  const { fs, root, parent } = await fixture(t);
  await writeFile(join(root, "..note"), "valid");
  await symlink("a.txt", join(root, "alias"));
  assert.equal(await fs.read("..note"), "valid");
  assert.equal(await fs.read("alias"), "hello world");
  await symlink(root, join(parent, "cwd-alias"));
  const lease = await createCapabilities(join(parent, "cwd-alias"));
  t.after(() => lease.close());
  assert.equal(await lease.capabilities.fs.read("a.txt"), "hello world");
});

test("maxBytes is finite, integral and capped; UTF-8 prefixes never split characters", async (t) => {
  const { fs, root } = await fixture(t);
  for (const size of [NaN, Infinity, -1, 0, 0.5, MAX_READ_BYTES + 1])
    await assert.rejects(fs.read("a.txt", size), /maxBytes/);
  await writeFile(join(root, "unicode"), "ééé");
  assert.equal(await fs.read("unicode", 3), "é\n… truncated");
  assert.equal(await fs.read("unicode", 6), "ééé");
  await writeFile(join(root, "big"), Buffer.alloc(MAX_READ_BYTES * 4, "x"));
  assert.equal(await fs.read("big", 2), "xx\n… truncated");
});

test("directory limit is explicit, not silently truncated", async (t) => {
  const { fs, root } = await fixture(t);
  await mkdir(join(root, "many"));
  await Promise.all(
    Array.from({ length: 501 }, (_, i) => writeFile(join(root, "many", String(i)), "")),
  );
  await assert.rejects(fs.list("many"), /exceeds 500 entries/);
});

test("per-call read reservations bound concurrent and aggregate work", async (t) => {
  const { fs } = await fixture(t);
  const reads = Array.from({ length: 17 }, () => fs.read("a.txt", MAX_READ_BYTES));
  const results = await Promise.allSettled(reads);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 16);
  assert.equal(results.filter((x) => x.status === "rejected").length, 1);
});

test("filesystem call budget caps repeated listing", async (t) => {
  const { fs } = await fixture(t);
  for (let i = 0; i < MAX_FS_CALLS; i++) await fs.list();
  await assert.rejects(fs.list(), /call limit/);
});

test("pre-abort, later abort and closed leases prevent capability use", async (t) => {
  const { root, fs, close } = await fixture(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(createCapabilities(root, controller.signal), /aborted/);
  close();
  await assert.rejects(fs.read("a.txt"), /closed/);
  await assert.rejects(fs.list(), /closed/);
  const running = new AbortController();
  const lease = await createCapabilities(root, running.signal);
  t.after(() => lease.close());
  running.abort();
  await assert.rejects(lease.capabilities.fs.read("a.txt"), /aborted/);
});

test("special files cannot hang reads and invalid paths fail", async (t) => {
  const { fs, root } = await fixture(t);
  for (const path of ["a\0b", "x".repeat(4097)]) await assert.rejects(fs.read(path), /Path must/);
  if (process.platform !== "win32") {
    execFileSync("mkfifo", [join(root, "pipe")]);
    await assert.rejects(fs.read("pipe"), /regular files/);
  }
});

test("an in-flight read checks abort before returning data", async (t) => {
  const { root } = await fixture(t);
  const controller = new AbortController();
  const lease = await createCapabilities(root, controller.signal);
  t.after(() => lease.close());
  const pending = lease.capabilities.fs.read("a.txt");
  controller.abort();
  await assert.rejects(pending, /aborted/);
});

test("lease closure revokes in-flight and future reads", async (t) => {
  const { fs, close } = await fixture(t);
  const pending = fs.read("a.txt");
  close();
  await assert.rejects(pending, /closed/);
  await assert.rejects(fs.read("a.txt"), /closed/);
});
