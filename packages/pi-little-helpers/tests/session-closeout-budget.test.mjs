// summary: byte-compatible streaming, finite caps and same-status races for host reader profiles.
import assert from "node:assert/strict";
import { lstat, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { digest } from "../src/sessionCloseout.ts";
import { gitSnapshot } from "../src/sessionCloseoutReadback.ts";

const MiB = 1024 * 1024;
const head = "a".repeat(40);
async function fixture(t) {
  const repo = await mkdtemp(join(tmpdir(), "closeout-budget-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  return repo;
}
function reader(names, beforeCapture = async () => {}) {
  let captures = 0;
  return async (_cmd, args) => {
    if (args[0] === "rev-parse") return head;
    if (args[0] === "status") return names.map((name) => `?? ${name}\0`).join("");
    if (args[0] === "diff") return "";
    if (args[0] === "ls-files" && args.includes("--stage")) {
      await beforeCapture(++captures);
      return "";
    }
    if (args[0] === "ls-files") return `${names.join("\0")}\0`;
    throw new Error("Unexpected test command");
  };
}
async function sparse(repo, name, size) {
  const path = join(repo, name);
  await writeFile(path, "");
  await truncate(path, size);
}

test("streaming hashes equal legacy JSON-base64 hashes byte-for-byte across carry boundaries; symlinks unchanged", async (t) => {
  const repo = await fixture(t);
  const names = [];
  const untracked = [];
  for (const size of [0, 1, 2, 3, 4, 65535, 65536, 65537, 65538, 2 * MiB + 1]) {
    const name = `bytes-${size}`;
    const bytes = Buffer.alloc(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;
    await writeFile(join(repo, name), bytes);
    names.push(name);
    untracked.push([name, (await lstat(join(repo, name))).mode, digest(bytes.toString("base64"))]);
  }
  const target = 'missing-"target\n';
  await symlink(target, join(repo, "link"));
  names.push("link");
  untracked.push(["link", (await lstat(join(repo, "link"))).mode, digest(target)]);
  untracked.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const run = reader(names);
  const snapshot = await gitSnapshot(repo, run, "large-assets");
  assert.equal(
    snapshot.digest,
    digest({
      head,
      status: await run("git", ["status"]),
      diff: "",
      index: "",
      untracked,
    }),
  );
  await assert.rejects(gitSnapshot(repo, run), /byte budget/);
});

test("profile cannot change Git digest for identical admitted bytes", async (t) => {
  const repo = await fixture(t);
  await writeFile(join(repo, "asset"), Buffer.from([0, 255, 17, 18]));
  assert.equal(
    (await gitSnapshot(repo, reader(["asset"]))).digest,
    (await gitSnapshot(repo, reader(["asset"]), "large-assets")).digest,
  );
});

test("selected profile detects same-size untracked mutation between content captures", async (t) => {
  const repo = await fixture(t);
  const size = 2 * MiB + 1;
  await writeFile(join(repo, "asset"), Buffer.alloc(size, 1));
  const run = reader(["asset"], async (capture) => {
    if (capture === 2) await writeFile(join(repo, "asset"), Buffer.alloc(size, 2));
  });
  await assert.rejects(gitSnapshot(repo, run, "large-assets"), /content changed/);
});

test("64MiB file cap is inclusive, >64MiB refuses with actionable content-free usage", async (t) => {
  const repo = await fixture(t);
  await sparse(repo, "private-name", 64 * MiB);
  await gitSnapshot(repo, reader(["private-name"]), "large-assets");
  await truncate(join(repo, "private-name"), 64 * MiB + 1);
  await assert.rejects(gitSnapshot(repo, reader(["private-name"]), "large-assets"), (error) => {
    assert.ok(error.message.includes(repo));
    assert.match(error.message, /file=67108865 bytes, total=67108865 bytes/);
    assert.match(
      error.message,
      /profile=large-assets, limits=67108864 bytes\/file, 536870912 bytes total, 1000 files/,
    );
    assert.match(error.message, /session-closeout budget large-assets/);
    assert.ok(!error.message.includes("private-name"));
    return true;
  });
});

test("large-assets total is capped at 512MiB; file-count cap remains 1000; unknown profiles refuse", async (t) => {
  const repo = await fixture(t);
  const names = [];
  for (let i = 0; i < 9; i++) {
    const name = `asset-${i}`;
    names.push(name);
    await sparse(repo, name, i === 8 ? 1 : 64 * MiB);
  }
  await assert.rejects(gitSnapshot(repo, reader(names), "large-assets"), /total=536870913 bytes/);
  await assert.rejects(
    gitSnapshot(repo, reader(Array.from({ length: 1001 }, (_, i) => `f${i}`)), "large-assets"),
    /1000 files/,
  );
  await assert.rejects(gitSnapshot(repo, reader([]), "unlimited"), /profile/);
});
