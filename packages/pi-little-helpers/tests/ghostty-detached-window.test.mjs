// summary: verifies direct Ghostty windows detach safely, require a private command handshake, and preserve indeterminate effects.
// read_when:
//   - changing direct window launch process lifetime, handshake semantics, or retry classification.

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { launchDetachedGhosttyWindow } from "../extensions/sidequestDetachedWindow.ts";
import { buildGhosttyArgs } from "../extensions/sidequestGhostty.ts";

function nodeLaunchRequest(scratchRoot, script, startupTimeoutMs = 500) {
  return {
    command: process.execPath,
    cwd: process.cwd(),
    scratchRoot,
    startupTimeoutMs,
    buildArgs: ({ path, token }) => ["-e", script, path, token],
  };
}

test("detached window launch settles only after the exact private command handshake", async () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "ghostty-window-success-"));
  try {
    const startedAt = Date.now();
    const result = await launchDetachedGhosttyWindow(
      nodeLaunchRequest(
        scratchRoot,
        'require("node:fs").writeFileSync(process.argv[1], process.argv[2] + "\\n"); setTimeout(() => {}, 100)',
      ),
    );

    assert.equal(result.ok, true);
    assert.equal(result.effectDisposition, "settled");
    assert.ok(Date.now() - startedAt < 500, "handshake must return before the child exits");
    assert.deepEqual(readdirSync(scratchRoot), []);
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("only pre-spawn rejection confirms no effects; post-spawn nonzero exit is indeterminate", async () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "ghostty-window-rejected-"));
  try {
    const missing = await launchDetachedGhosttyWindow({
      command: join(scratchRoot, "missing-ghostty"),
      cwd: process.cwd(),
      scratchRoot,
      startupTimeoutMs: 100,
      buildArgs: () => [],
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.effectDisposition, "confirmed_no_effects");

    const exited = await launchDetachedGhosttyWindow(
      nodeLaunchRequest(scratchRoot, 'console.error("display rejected"); process.exit(7)', 200),
    );
    assert.equal(exited.ok, false);
    assert.equal(exited.code, 7);
    assert.equal(exited.effectDisposition, "effect_indeterminate");
    assert.match(exited.stderr, /display rejected/);
    assert.deepEqual(readdirSync(scratchRoot), []);
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("timeout, signal, and zero handoff without a handshake remain effect-indeterminate", async () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "ghostty-window-indeterminate-"));
  try {
    for (const script of [
      "setTimeout(() => {}, 150)",
      'process.kill(process.pid, "SIGTERM")',
      "process.exit(0)",
    ]) {
      const result = await launchDetachedGhosttyWindow(nodeLaunchRequest(scratchRoot, script, 40));
      assert.equal(result.ok, false);
      assert.equal(result.effectDisposition, "effect_indeterminate");
    }
    assert.deepEqual(readdirSync(scratchRoot), []);
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("Ghostty shell argv writes the handshake before invoking Pi", () => {
  const args = buildGhosttyArgs({
    cwd: "/repo with spaces",
    title: "Forkpeer: handshake",
    launchMode: "window",
    piArgs: ["pi", "--fork", "/sessions/main.jsonl", "objective"],
    launchHandshake: {
      path: "/runtime/private launch/command-admitted",
      token: "0123456789abcdef",
    },
  });
  const shell = args[args.indexOf("-lc") + 1];

  assert.match(shell, /command -v "\$cmd"/);
  assert.match(shell, /0123456789abcdef/);
  assert.match(shell, /private launch/);
  assert.match(shell, /mv -f --/);
  assert.ok(shell.indexOf("mv -f --") < shell.indexOf('"$cmd" "$@"'));
});
