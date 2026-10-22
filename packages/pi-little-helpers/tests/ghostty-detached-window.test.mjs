// summary: verifies direct Ghostty windows detach safely, require a private command handshake, and preserve indeterminate effects.
// read_when:
//   - changing direct window launch process lifetime, handshake semantics, or retry classification.

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { launchDetachedGhosttyWindow } from "../extensions/sidequestDetachedWindow.ts";
import { buildGhosttyArgs } from "../extensions/sidequestGhostty.ts";
import {
  assertLaunchWhileAlive,
  ownLaunchProcesses,
  withDeadman,
} from "./launch-oracle-harness.mjs";

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
  const owned = ownLaunchProcesses();
  try {
    const ready = Promise.withResolvers();
    const launch = launchDetachedGhosttyWindow({
      ...nodeLaunchRequest(
        scratchRoot,
        `const fs = require("node:fs");
         fs.writeFileSync(process.argv[1], "wrong-token\\n");
         process.on("message", message => {
           if (message === "admit") fs.writeFileSync(process.argv[1], process.argv[2] + "\\n");
           else if (message.challenge) process.send(message.challenge);
         });
         process.send("ready");`,
      ),
      spawnProcess(command, args, options) {
        assert.equal(options.stdio[0], "ignore");
        const child = owned.spawnProcess(command, args, {
          ...options,
          stdio: [...options.stdio, "ipc"],
        });
        child.once("message", ready.resolve);
        return child;
      },
    });
    assert.equal(await withDeadman(ready.promise, "owned child ready"), "ready");
    // Readiness proves the write, not that the launcher inspected it. The separate
    // wrong-token-only control below proves rejection without ever admitting a valid token.
    const child = owned.children[0].child;
    child.send("admit");
    const result = await launch;
    // The child has no self-expiry: it stays alive until our finally block releases it.
    // A post-settlement IPC challenge proves liveness, regardless of scheduling latency.
    await assertLaunchWhileAlive(result, child);
    assert.deepEqual(readdirSync(scratchRoot), []);
  } finally {
    await owned.dispose();
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("wrong-token-only handshake is rejected by the production launcher", async () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "ghostty-window-wrong-token-"));
  const owned = ownLaunchProcesses();
  try {
    const result = await launchDetachedGhosttyWindow({
      ...nodeLaunchRequest(scratchRoot, "setInterval(() => {}, 1000)"),
      buildArgs({ path, token }) {
        assert.notEqual(token, "wrong-token");
        // Publish before spawn/polling, and never replace it with a valid token.
        // Production's deadline check must inspect this file before rejecting.
        writeFileSync(path, "wrong-token\n");
        return ["-e", "setInterval(() => {}, 1000)"];
      },
      spawnProcess: owned.spawnProcess,
    });
    assert.equal(result.ok, false);
    assert.equal(result.effectDisposition, "effect_indeterminate");
    assert.match(result.stderr, /command admission was not observed within 500ms/);
    assert.equal(owned.children[0].child.exitCode, null);
    assert.equal(owned.children[0].child.signalCode, null);
    assert.deepEqual(readdirSync(scratchRoot), []);
  } finally {
    await owned.dispose();
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("only pre-spawn rejection confirms no effects; post-spawn nonzero exit is indeterminate", async () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "ghostty-window-rejected-"));
  const owned = ownLaunchProcesses();
  try {
    const missing = await launchDetachedGhosttyWindow({
      spawnProcess: owned.spawnProcess,
      command: join(scratchRoot, "missing-ghostty"),
      cwd: process.cwd(),
      scratchRoot,
      startupTimeoutMs: 100,
      buildArgs: () => [],
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.effectDisposition, "confirmed_no_effects");

    const exited = await launchDetachedGhosttyWindow({
      ...nodeLaunchRequest(scratchRoot, 'console.error("display rejected"); process.exit(7)', 200),
      spawnProcess: owned.spawnProcess,
    });
    assert.equal(exited.ok, false);
    assert.equal(exited.code, 7);
    assert.equal(exited.effectDisposition, "effect_indeterminate");
    assert.match(exited.stderr, /display rejected/);
    assert.deepEqual(readdirSync(scratchRoot), []);
  } finally {
    await owned.dispose();
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test("timeout, signal, and zero handoff without a handshake remain effect-indeterminate", async () => {
  const scratchRoot = mkdtempSync(join(tmpdir(), "ghostty-window-indeterminate-"));
  const owned = ownLaunchProcesses();
  try {
    for (const script of [
      "setTimeout(() => {}, 150)",
      'process.kill(process.pid, "SIGTERM")',
      "process.exit(0)",
    ]) {
      const result = await launchDetachedGhosttyWindow({
        ...nodeLaunchRequest(scratchRoot, script, 40),
        spawnProcess: owned.spawnProcess,
      });
      assert.equal(result.ok, false);
      assert.equal(result.effectDisposition, "effect_indeterminate");
    }
    assert.deepEqual(readdirSync(scratchRoot), []);
  } finally {
    await owned.dispose();
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
