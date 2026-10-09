// Exercises the actual renderer in an explicitly selected fresh Ghostty window and real PTY.
// Does not test automatic tab placement or dispatch execution/effect truth.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { launchDetachedGhosttyWindow } from "../../extensions/sidequestDetachedWindow.ts";
import { buildGhosttyArgs, findGhosttyAncestor } from "../../extensions/sidequestGhostty.ts";
import { launchAscExecutionObserverSession } from "../../extensions/sidequestLaunch.ts";
import { createAscExecutionObserverController } from "../../src/ascExecutionObserver.ts";
import { processStart } from "../../src/ascExecutionObserverProtocol.ts";

const scriptPath = fileURLToPath(
  new URL("../../scripts/asc-execution-observer.mjs", import.meta.url),
);
const ghostty = findGhosttyAncestor(process.pid);
const desktopAvailable =
  process.env.PI_ASC_OBSERVER_LIVE_ISOLATED === "1" &&
  process.platform === "linux" &&
  process.env.TERM_PROGRAM === "ghostty" &&
  ghostty?.exe;
const quote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;

async function waitFor(read, predicate, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = read();
    if (predicate(value)) return value;
    await delay(50);
  }
  assert.fail(`No ${label} within 10 seconds`);
}

test(
  "reality: real Ghostty observer retains stale progress, recovers and exits",
  {
    skip: desktopAvailable
      ? false
      : "requires parent-provided isolated Ghostty TUI and PI_ASC_OBSERVER_LIVE_ISOLATED=1; never operator desktop",
  },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "asc-observer-live-"));
    chmodSync(root, 0o700);
    const statePath = join(root, "state.json");
    const transcript = join(root, "terminal.txt");
    const ttyPath = join(root, "tty.txt");
    const resultPath = join(root, "exit.txt");
    const runner = join(root, "run.sh");
    const instance = randomUUID();
    function writeSnapshot(tool) {
      const now = Date.now();
      const temporary = join(root, "next.json");
      writeFileSync(
        temporary,
        JSON.stringify({
          schema: "pi.asc_execution_observer_state.v1",
          group: { id: instance, kind: "dispatch", label: "AK6626 live display proof" },
          controllerInstanceId: instance,
          ownerPid: process.pid,
          controllerActive: true,
          createdAt: new Date(now - 20_000).toISOString(),
          updatedAt: new Date(now).toISOString(),
          lastObservationAt: now,
          lastActivityAt: now,
          status: "running",
          activeDispatch: { latestTool: tool },
          phases: [{ name: "inspect", index: 1, count: 2, status: "running" }],
        }),
        { mode: 0o600 },
      );
      renameSync(temporary, statePath);
    }
    writeSnapshot("bash");
    const command = `env PI_ASC_OBSERVER_DISCONNECTED_HOLD_MS=3000 ${quote(process.execPath)} ${quote(scriptPath)} --state ${quote(statePath)} --controller-instance ${quote(instance)}`;
    writeFileSync(
      runner,
      [
        "#!/bin/sh",
        `tty > ${quote(ttyPath)}`,
        `/usr/bin/script --quiet --flush --return --command ${quote(command)} ${quote(transcript)}`,
        "status=$?",
        `printf '%s\\n' "$status" > ${quote(resultPath)}`,
        'exit "$status"',
        "",
      ].join("\n"),
      { mode: 0o700 },
    );
    const text = () => (existsSync(transcript) ? readFileSync(transcript, "utf8") : "");
    const frames = () => text().split("\u001b[2J\u001b[H").slice(1);
    let admitted = false;
    try {
      // Select the window route before launch; do not retry an indeterminate tab request.
      const launch = await launchDetachedGhosttyWindow({
        command: ghostty.exe,
        cwd: process.cwd(),
        buildArgs: (launchHandshake) =>
          buildGhosttyArgs({
            cwd: process.cwd(),
            title: "AK6626 observer display proof",
            launchMode: "window",
            piArgs: ["/bin/sh", runner],
            launchHandshake,
          }),
      });
      assert.ok(launch.ok, JSON.stringify(launch));
      admitted = true;
      await waitFor(text, (value) => value.includes("latest tool: bash"), "live progress frame");
      assert.match(readFileSync(ttyPath, "utf8"), /^\/dev\/pts\/\d+/);
      unlinkSync(statePath);
      const lost = await waitFor(
        () => frames().at(-1) ?? "",
        (value) => value.includes("Progress updates unavailable"),
        "unavailable frame",
      );
      assert.match(lost, /Last known progress \(stale — no longer live\)/);
      assert.match(lost, /last known status: running/);
      assert.match(lost, /latest tool: bash/);
      assert.match(lost, /1\/2 inspect: running/);
      assert.match(lost, /all progress above is stale, not live/);
      assert.ok(lost.indexOf("Technical details:") > lost.indexOf("latest tool: bash"));
      assert.doesNotMatch(lost, /supervision: healthy|supervision: complete/);
      writeSnapshot("read");
      const recovered = await waitFor(
        () => frames().at(-1) ?? "",
        (value) => value.includes("latest tool: read"),
        "recovered frame",
      );
      assert.doesNotMatch(recovered, /Progress updates unavailable|stale — no longer live/);
      unlinkSync(statePath);
      await waitFor(
        () => (existsSync(resultPath) ? readFileSync(resultPath, "utf8").trim() : ""),
        (value) => value === "0",
        "clean observer exit",
      );
      console.log(`Live real-PTY display proof retained at ${root}; renderer=${scriptPath}`);
    } finally {
      // Disconnect only this test's snapshot. No process signalling or blind tab retries.
      // Retain the transcript and scratch even on failure so uncertain launches remain inspectable.
      if (existsSync(statePath)) unlinkSync(statePath);
      if (admitted && !existsSync(resultPath)) {
        await waitFor(() => existsSync(resultPath), Boolean, "renderer shutdown").catch(
          () => undefined,
        );
      }
      console.log(`Retained live observer fixture: ${root}`);
    }
  },
);

// No models, installs, window fallback, focus commands, or dispatch replay. Run this file only
// inside a parent-provided sandbox/nested GUI Ghostty surface with an isolated session bus.
test(
  "reality: four dispatches plus loop use one real Ghostty activation and renderer ACK",
  {
    skip:
      desktopAvailable && process.env.GHOSTTY_SURFACE_ID
        ? false
        : "requires parent-provided isolated Ghostty surface/bus and PI_ASC_OBSERVER_LIVE_ISOLATED=1",
  },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "asc-session-6844-live-"));
    const run = promisify(execFile);
    const calls = [];
    const requests = [];
    const makeController = () =>
      createAscExecutionObserverController({
        stateRoot: root,
        launch(request) {
          requests.push(request);
          return launchAscExecutionObserverSession(
            { getThinkingLevel: () => "off" },
            {
              env: { ...process.env, PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0" },
              currentGhosttyAncestor: ghostty,
              currentSessionGhosttyBin: ghostty.exe,
              async exec(command, args, options) {
                calls.push({ command, args });
                try {
                  const result = await run(command, args, {
                    timeout: options?.timeout,
                    maxBuffer: 1024 * 1024,
                  });
                  return { code: 0, ...result };
                } catch (error) {
                  return {
                    code: Number.isInteger(error.code) ? error.code : 1,
                    killed: error.killed,
                    stdout: error.stdout ?? "",
                    stderr: error.stderr ?? "",
                  };
                }
              },
            },
            request,
            process.execPath,
            scriptPath,
          );
        },
      });
    let controller = makeController();
    const host = { mode: "tui", hasUI: true, cwd: process.cwd(), sessionId: randomUUID() };
    controller.setHostContext(host);
    function progress(id, loop = false) {
      return {
        schema: "asc.execution_observation.v1",
        event: "dispatch_progress",
        observedAt: new Date().toISOString(),
        cwd: process.cwd(),
        producer: loop ? "loop_execute" : "dispatch_subagent",
        group: { id, kind: loop ? "loop" : "dispatch", label: `AK6844 isolated ${id}` },
        ...(loop ? { phase: { name: "inspect", index: 1, count: 2 } } : {}),
        dispatch: { dispatchId: id },
        progress: {
          status: "running",
          sequence: 1,
          latestTool: "read",
          lastActivityAt: Date.now(),
        },
      };
    }
    const state = () => JSON.parse(readFileSync(requests[0].statePath, "utf8"));
    let rendererPid;
    let rendererStart;
    try {
      for (let i = 0; i < 4; i++) controller.handle(progress(`direct-${i}`));
      controller.handle(progress("loop", true));
      await controller.flush();
      assert.equal(requests.length, 1);
      await waitFor(
        state,
        (s) => s.observer.launchStatus === "launched",
        "verified real renderer ACK (no retry)",
      );
      rendererPid = state().observer.rendererPid;
      rendererStart = processStart(rendererPid);
      const receipt = JSON.parse(readFileSync(requests[0].startupReceiptPath, "utf8"));
      assert.equal(receipt.rendererPid, rendererPid);
      assert.equal(receipt.rendererStart, rendererStart);
      assert.equal(receipt.startupToken, requests[0].startupToken);
      assert.equal(state().groups.length, 5);
      for (const group of state().groups) {
        const initial = progress(group.group.id, group.group.kind === "loop");
        controller.handle({
          ...initial,
          event: "group_terminal",
          progress: undefined,
          dispatch: undefined,
          phase: undefined,
          terminal: { ok: true, status: "done", effectDisposition: "settled" },
        });
      }
      await controller.flush();
      assert.ok(state().groups.every((group) => group.terminal?.ok));
      await delay(600); // One renderer polling cycle, not a launch workaround.
      assert.equal(
        processStart(rendererPid),
        rendererStart,
        "session viewer stays alive after batch completion",
      );
      // Close only this test's validated renderer, not Ghostty, the controller, or an ASC helper.
      process.kill(rendererPid, "SIGTERM");
      await waitFor(state, (s) => s.observer.launchStatus === "closed", "manual renderer close");
      controller.handle(progress("later-batch"));
      await controller.flush();
      assert.equal(requests.length, 1);
      assert.equal(
        calls.filter((c) => c.command === "busctl" && c.args.includes("Activate")).length,
        1,
      );
      assert.equal(state().observer.launchStatus, "closed");
      await controller.dispose();
      controller = makeController();
      controller.setHostContext(host); // Same Pi session ID, fresh generation/ACK fence.
      controller.handle(progress("after-reload"));
      await controller.flush();
      const reloaded = JSON.parse(
        readFileSync(
          controller.statePathFor("after-reload", "dispatch_subagent", "dispatch"),
          "utf8",
        ),
      );
      assert.equal(reloaded.observer.launchStatus, "closed");
      assert.notEqual(reloaded.controllerInstanceId, requests[0].controllerInstanceId);
      assert.equal(requests.length, 1, "same-session reload must not create another real viewer");
      assert.equal(
        calls.filter((c) => c.command === "busctl" && c.args.includes("Activate")).length,
        1,
      );
      console.log(`Real Ghostty singleton/ACK/reload evidence: ${root}`);
    } finally {
      await controller.dispose();
      if (rendererPid && rendererStart)
        await waitFor(
          () => processStart(rendererPid),
          (value) => value !== rendererStart,
          "owned renderer teardown",
        ).catch(() => undefined);
      console.log(`Retained isolated observer fixture: ${root}`);
    }
  },
);
