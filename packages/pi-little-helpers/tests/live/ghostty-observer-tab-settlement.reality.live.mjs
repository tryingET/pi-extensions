// Explicit new isolated trials, never retries of historical indeterminate attempts.
// Real Ghostty/PTY renderer ACK with injected lost callback settlement; no model requests.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { findGhosttyAncestor } from "../../extensions/sidequestGhostty.ts";
import { launchPiQuestSession } from "../../extensions/sidequestLaunch.ts";
import { createAscExecutionObserverController } from "../../src/ascExecutionObserver.ts";
import { observerIsolationRefusal } from "../ghostty-observer-tab-harness.mjs";

const ghostty = findGhosttyAncestor(process.pid);
const isolationRefusal = observerIsolationRefusal();
const enabled = !isolationRefusal && process.env.TERM_PROGRAM === "ghostty" && ghostty?.exe;
const script = fileURLToPath(new URL("../../scripts/asc-execution-observer.mjs", import.meta.url));
const run = promisify(execFile);
const quote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;
async function until(read, predicate, label) {
  const end = performance.now() + 5000;
  while (performance.now() < end) {
    const value = read();
    if (predicate(value)) return value;
    await delay(25);
  }
  assert.fail(`No ${label}; retained attempt, no automatic retry`);
}

for (const settlement of ["rejected", "unclassified"]) {
  test(
    `Scenario: Given a real isolated Ghostty tab with ${settlement} callback settlement, When its delayed renderer ACK arrives, Then the same request becomes launched without a duplicate`,
    { skip: enabled ? false : (isolationRefusal ?? "requires a real isolated Ghostty ancestor") },
    async () => {
      const root = mkdtempSync(join(tmpdir(), "ak6867-observer-settlement-"));
      const release = join(root, "release-renderer");
      const calls = [];
      const requests = [];
      let transport;
      const controller = createAscExecutionObserverController({
        stateRoot: root,
        startupTimeoutMs: 50,
        async launch(request) {
          requests.push(request);
          const args = [
            script,
            "--state",
            request.statePath,
            "--controller-instance",
            request.controllerInstanceId,
            "--session-id",
            request.sessionId,
            "--startup-token",
            request.startupToken,
            "--startup-receipt",
            request.startupReceiptPath,
          ];
          // A controlled barrier withholds this fresh trial's Node start until unconfirmed.
          // This is fault injection, not a longer production timeout or another dispatch.
          const command = `while [ ! -f ${quote(release)} ]; do sleep 0.05; done; exec ${[process.execPath, ...args].map(quote).join(" ")}`;
          transport = await launchPiQuestSession({
            pi: { getThinkingLevel: () => "off" },
            ctx: {},
            options: {
              env: { ...process.env, PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0" },
              currentGhosttyAncestor: ghostty,
              currentSessionGhosttyBin: ghostty.exe,
              async exec(command, args, options) {
                calls.push({ command, args });
                try {
                  return {
                    code: 0,
                    ...(await run(command, args, {
                      timeout: options?.timeout,
                      maxBuffer: 1024 * 1024,
                    })),
                  };
                } catch (error) {
                  return {
                    code: Number.isInteger(error.code) ? error.code : -1,
                    stdout: error.stdout ?? "",
                    stderr: error.stderr ?? "",
                    killed: Boolean(error.killed),
                  };
                }
              },
            },
            defaultPiBin: process.execPath,
            prompt: "controlled lost observer settlement",
            titlePrompt: "AK6867 isolated observer settlement",
            placementPolicy: "controller-tab-only",
            cwd: process.cwd(),
            command: { command: "/bin/sh", args: ["-c", command] },
          });
          writeFileSync(join(root, "transport.json"), JSON.stringify(transport), { mode: 0o600 });
          // Do not conceal real refusal/indeterminate transport as the injected condition.
          if (!transport.ok) return transport;
          if (settlement === "rejected")
            throw new Error("controlled post-dispatch settlement loss");
          return { ok: false, failure: "controlled post-dispatch settlement loss" };
        },
      });
      const sessionId = randomUUID();
      controller.setHostContext({ mode: "tui", hasUI: true, cwd: process.cwd(), sessionId });
      const progress = (id) => ({
        schema: "asc.execution_observation.v1",
        event: "dispatch_progress",
        observedAt: new Date().toISOString(),
        cwd: process.cwd(),
        producer: "dispatch_subagent",
        group: { id, kind: "dispatch", label: "AK6867 isolated settlement" },
        dispatch: { dispatchId: id },
        progress: {
          status: "running",
          sequence: 1,
          latestTool: "read",
          lastActivityAt: Date.now(),
        },
      });
      const state = () => JSON.parse(readFileSync(requests[0].statePath, "utf8"));
      try {
        controller.handle(progress("initial"));
        await controller.flush();
        assert.equal(transport.ok, true, "fault injection requires accepted real transport");
        assert.equal(state().observer.effectDisposition, "effect_indeterminate");
        assert.equal(state().observer.launchStatus, "unconfirmed");
        assert.equal(existsSync(requests[0].startupReceiptPath), false);
        writeFileSync(release, "release same attempt\n", { mode: 0o600 });
        await until(
          state,
          (s) => s.observer.launchStatus === "launched",
          "same-attempt renderer ACK",
        );
        const receipt = JSON.parse(readFileSync(requests[0].startupReceiptPath, "utf8"));
        assert.equal(receipt.sessionId, sessionId);
        assert.equal(receipt.startupToken, requests[0].startupToken);
        assert.equal(receipt.rendererPid, state().observer.rendererPid);
        assert.match(
          readFileSync(`/proc/${receipt.rendererPid}/cmdline`, "utf8"),
          /asc-execution-observer\.mjs/,
        );
        assert.match(
          await run("readlink", [`/proc/${receipt.rendererPid}/fd/1`]).then((r) => r.stdout),
          /^\/dev\/pts\/\d+/,
        );
        controller.handle(progress("later"));
        await controller.flush();
        assert.equal(requests.length, 1);
        assert.equal(
          calls.filter((c) => c.command === "busctl" && c.args.includes("Activate")).length,
          1,
        );
        writeFileSync(
          join(root, "result.json"),
          JSON.stringify(
            {
              ok: true,
              settlement,
              sessionId,
              rendererPid: receipt.rendererPid,
              controllerInstanceId: requests[0].controllerInstanceId,
              activationCount: 1,
              effectDisposition: state().observer.effectDisposition,
              launchStatus: state().observer.launchStatus,
              limit:
                "Injected settlement loss; renderer startup/PTY, not pixels, placement, original cause or ASC effects",
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
      } finally {
        await controller.dispose();
        writeFileSync(release, "release fenced attempt\n", { mode: 0o600 });
        // Disposing this controller fences only its own renderer; retain all evidence.
        if (requests.length && existsSync(requests[0].startupReceiptPath)) {
          const receipt = JSON.parse(readFileSync(requests[0].startupReceiptPath, "utf8"));
          await until(
            () => {
              try {
                return readFileSync(`/proc/${receipt.rendererPid}/stat`, "utf8");
              } catch {
                return "";
              }
            },
            (stat) => !stat || stat.includes(") Z "),
            "owned renderer shutdown",
          );
        }
        console.log(`Retained AK6867 isolated settlement fixture: ${root}`);
      }
    },
  );
}
