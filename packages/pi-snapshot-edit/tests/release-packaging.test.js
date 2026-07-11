import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const bundlePath = path.join(root, "dist/snapshot-edit.js");
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, encoding: "utf8", ...options });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function mockPi() {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  return {
    tools,
    commands,
    api: {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
      registerFlag() {},
      getFlag() {
        return false;
      },
      getAllTools() {
        return [];
      },
      getActiveTools() {
        return [];
      },
      setActiveTools() {},
      on(name, handler) {
        handlers.set(name, handler);
      },
    },
  };
}

async function importBuilt(marker) {
  run(process.execPath, ["scripts/build-extension.mjs"], {
    env: { ...process.env, PI_SNAPSHOT_EDIT_BUILD_MARKER: marker },
  });
  return import(`${pathToFileURL(bundlePath).href}?marker=${encodeURIComponent(marker)}`);
}

test("build is byte-deterministic, readable, and self-contained", async () => {
  run(process.execPath, ["scripts/build-extension.mjs"]);
  const first = await readFile(bundlePath);
  run(process.execPath, ["scripts/build-extension.mjs"]);
  const second = await readFile(bundlePath);
  assert.equal(digest(first), digest(second));
  const text = second.toString("utf8");
  assert.match(text, /^\/\* @tryinget\/pi-snapshot-edit .*restricted LICENSE/);
  assert.doesNotMatch(text, /sourceMappingURL|from\s+["']\.\.?\//);
  assert.match(text, /\/\/ src\/snapshot-service\.js/);
});

test("bundled entry imports and registers the extension", async () => {
  run(process.execPath, ["scripts/build-extension.mjs"]);
  const extension = await import(`${pathToFileURL(bundlePath).href}?registration`);
  const pi = mockPi();
  extension.default(pi.api);
  assert.deepEqual([...pi.tools.keys()], ["snapshot_read", "snapshot_edit"]);
  assert.equal(pi.commands.has("snapshot-edit"), true);
  assert.equal(pi.commands.has("snapshot-edit-release-smoke"), false);
});

test("same process loads changed marker and matching package behavior together", async () => {
  const previous = process.env.PI_SNAPSHOT_EDIT_RELEASE_SMOKE;
  process.env.PI_SNAPSHOT_EDIT_RELEASE_SMOKE = "1";
  const directory = await mkdtemp(path.join(tmpdir(), "snapshot-reload-regression-"));
  try {
    for (const marker of ["regression-v1", "regression-v2"]) {
      const extension = await importBuilt(marker);
      const pi = mockPi();
      extension.default(pi.api);
      const notifications = [];
      const command = pi.commands.get("snapshot-edit-release-smoke");
      assert.ok(command);
      const target = path.join(directory, `${marker}.txt`);
      await writeFile(target, "same\nsame\n", { mode: 0o600 });
      await command.handler(JSON.stringify({ action: "probe", path: target }), {
        cwd: directory,
        ui: { notify: (message) => notifications.push(message) },
      });
      assert.match(notifications.at(-1), new RegExp(`protocol-b:${marker}|${marker}`));
      assert.equal(await readFile(target, "utf8"), `same\nchanged:${marker}\n`);
    }
  } finally {
    if (previous === undefined) delete process.env.PI_SNAPSHOT_EDIT_RELEASE_SMOKE;
    else process.env.PI_SNAPSHOT_EDIT_RELEASE_SMOKE = previous;
    run(process.execPath, ["scripts/build-extension.mjs"]);
    await rm(directory, { recursive: true, force: true });
  }
});

test("packed artifact has the exact manifest and bundled entry", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "snapshot-packaging-"));
  try {
    const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", directory]));
    const tarball = path.join(directory, packed[0].filename);
    const entries = run("tar", ["-tzf", tarball]).trim().split("\n").sort();
    assert.deepEqual(entries, [
      "package/LICENSE",
      "package/README.md",
      "package/dist/snapshot-edit.js",
      "package/package.json",
      "package/policy/engineering-lane.json",
      "package/policy/security-policy.json",
    ]);
    const manifest = JSON.parse(run("tar", ["-xOf", tarball, "package/package.json"]));
    assert.deepEqual(manifest.pi.extensions, ["./dist/snapshot-edit.js"]);
    assert.equal(manifest.license, "SEE LICENSE IN LICENSE");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
