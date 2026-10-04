// Exercises the actual renderer in an explicitly selected fresh Ghostty window and real PTY.
// Does not test automatic tab placement or dispatch execution/effect truth.
import assert from "node:assert/strict";
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
import { launchDetachedGhosttyWindow } from "../../extensions/sidequestDetachedWindow.ts";
import { buildGhosttyArgs, findGhosttyAncestor } from "../../extensions/sidequestGhostty.ts";

const scriptPath = fileURLToPath(
  new URL("../../scripts/asc-execution-observer.mjs", import.meta.url),
);
const ghostty = findGhosttyAncestor(process.pid);
const desktopAvailable =
  process.platform === "linux" && process.env.TERM_PROGRAM === "ghostty" && ghostty?.exe;
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
  { skip: desktopAvailable ? false : "requires controller Ghostty TUI environment" },
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
