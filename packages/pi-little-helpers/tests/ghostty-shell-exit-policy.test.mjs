// Executes the generated scaffold with private fake Pi/debug shell executables; no GUI or Pi session.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildGhosttyArgs, buildGhosttyExecArgs } from "../extensions/sidequestGhostty.ts";

const builders = {
  exec: buildGhosttyExecArgs,
  tab: (input) => buildGhosttyArgs({ ...input, launchMode: "tab", surfaceId: "4660" }),
  window: (input) => buildGhosttyArgs({ ...input, launchMode: "window" }),
};

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "pi-attachment-shell-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pi = join(root, "fake pi");
  const debugShell = join(root, "debug shell");
  const piMarker = join(root, "pi-argv");
  const shellMarker = join(root, "shell-fallback");
  writeFileSync(
    pi,
    '#!/bin/sh\nprintf "PI_PID=%s\\n" "$$"\nprintf "%s\\n" "$@" > "$PI_ARGS_MARKER"\nexit 23\n',
    { mode: 0o700 },
  );
  writeFileSync(debugShell, '#!/bin/sh\nprintf "%s\\n" "$@" > "$DEBUG_SHELL_MARKER"\nexit 71\n', {
    mode: 0o700,
  });
  const run = (builder, cwd, shellExitPolicy) => {
    const argv = builder({
      cwd,
      title: "attachment ' title",
      piArgs: [pi, "a 'quoted' argument", "--no-tools"],
      shellExitPolicy,
    });
    const executable = argv.indexOf("-e") + 1;
    return spawnSync(argv[executable], argv.slice(executable + 1), {
      encoding: "utf8",
      timeout: 2000,
      env: {
        ...process.env,
        SHELL: debugShell,
        PI_ARGS_MARKER: piMarker,
        DEBUG_SHELL_MARKER: shellMarker,
      },
    });
  };
  return { root, piMarker, shellMarker, run };
}

for (const [name, builder] of Object.entries(builders)) {
  test(`${name}: attachment nonzero Pi exit replaces scaffold and never enters a shell`, (t) => {
    const f = fixture(t);
    const result = f.run(builder, f.root, "fail-closed");
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 23);
    assert.match(
      result.stdout,
      new RegExp(`PI_PID=${result.pid}\\b`),
      "Pi must replace sh via exec",
    );
    assert.equal(readFileSync(f.piMarker, "utf8"), "a 'quoted' argument\n--no-tools\n");
    assert.equal(existsSync(f.shellMarker), false);
    assert.doesNotMatch(result.stdout, /interactive shell/);
  });

  test(`${name}: attachment failed cwd exits before Pi without shell fallback`, (t) => {
    const f = fixture(t);
    const result = f.run(builder, join(f.root, "missing ' cwd"), "fail-closed");
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0);
    assert.notEqual(result.status, 23);
    assert.notEqual(result.status, 71);
    assert.equal(existsSync(f.piMarker), false);
    assert.equal(existsSync(f.shellMarker), false);
    assert.match(result.stdout, /failed to enter working directory/);
    assert.doesNotMatch(result.stdout, /interactive shell/);
  });

  for (const failedCwd of [false, true]) {
    test(`${name}: ordinary default preserves debug shell after ${failedCwd ? "cwd" : "Pi"} failure`, (t) => {
      const f = fixture(t);
      const result = f.run(builder, failedCwd ? join(f.root, "missing cwd") : f.root);
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, 71);
      assert.equal(existsSync(f.piMarker), !failedCwd);
      assert.equal(readFileSync(f.shellMarker, "utf8"), "-i\n");
      assert.match(result.stdout, /leaving an interactive shell open for debugging/);
    });
  }
}

// Source-declaration checks only: builds and packing are intentionally not exercised here.
test("raw-TS package includes the extracted runtime shell dependency", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(manifest.files.includes("extensions/sidequestGhosttyShell.ts"));
  const ghostty = readFileSync(
    new URL("../extensions/sidequestGhostty.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    ghostty,
    /import \{ buildPiShellCommand, type ShellExitPolicy \} from "\.\/sidequestGhosttyShell\.ts"/,
  );
  assert.ok(existsSync(new URL("../extensions/sidequestGhosttyShell.ts", import.meta.url)));
});

test("standalone transport declares shell source copy, explicit emit and JS import rewrite", () => {
  const build = readFileSync(new URL("../scripts/task-session-build.mjs", import.meta.url), "utf8");
  assert.ok(
    build.includes('.replaceAll("./sidequestGhosttyShell.ts", "./shared-ghostty-shell.js")'),
  );
  assert.match(
    build,
    /copyFileSync\(\s*"extensions\/sidequestGhosttyShell\.ts",\s*resolve\(emitRoot, "shared-ghostty-shell\.ts"\),?\s*\)/,
  );
  assert.match(
    build,
    /resolve\(emitRoot, "restricted-transport\.ts"\),\s*resolve\(emitRoot, "shared-ghostty-shell\.ts"\),/,
  );
});
