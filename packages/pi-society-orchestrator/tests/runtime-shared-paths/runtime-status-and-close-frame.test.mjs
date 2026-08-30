import assert from "node:assert/strict";
import test from "node:test";
import extension from "../../extensions/society-orchestrator.ts";
import {
  formatAkCloseFrameStatusSection,
  readAkCloseFrameStatus,
} from "../../src/runtime/ak-close-frame-status.ts";
import { resetBoundaryTelemetry } from "../../src/runtime/boundaries.ts";
import {
  createRuntimeTruthSnapshot,
  formatRuntimeStatusReport,
} from "../../src/runtime/status-semantics.ts";
import { createContextUsage, createSessionUsageManager } from "./helpers.mjs";

test("runtime status report centralizes the shared runtime truth descriptor", () => {
  const snapshot = createRuntimeTruthSnapshot({
    cwd: "/tmp/runtime-truth",
    model: "test-model",
    activeTeam: "quality",
    contextUsage: {
      tokens: 20000,
      contextWindow: 128000,
    },
    sessionTokens: {
      input: 1200,
      output: 400,
      cacheRead: 300,
      cacheWrite: 200,
    },
    boundaryTelemetry: {
      totalCalls: 5,
      successCount: 4,
      failureCount: 1,
      averageLatencyMs: 12.3,
      maxLatencyMs: 45.6,
      commandCounts: {
        "ak:repo": 3,
        "ak:evidence": 2,
      },
      latestFailure: {
        timestamp: "2026-04-21T15:00:00.000Z",
        command: "ak:evidence",
        exitCode: 7,
        error: "process exited with code 7",
      },
    },
    societyDbPath: "/tmp/society.v2.db",
    societyDbAvailable: true,
    vaultAvailable: true,
    vaultSummary: "available (7 cognitive tools)",
  });

  const text = formatRuntimeStatusReport(snapshot);
  assert.match(text, /coordination owner: `pi-society-orchestrator`/);
  assert.match(text, /execution owner: `@tryinget\/pi-autonomous-session-control`/);
  assert.match(text, /routing: `quality` \(reviewer, researcher\)/);
  assert.match(text, /boundary telemetry inspector: `\/runtime-boundary-telemetry`/);
  assert.match(text, /context: 20,000 tokens \(window 128,000\)/);
  assert.match(text, /session tokens: in 1,200 · cache 500 \(300 read \+ 200 write\) · out 400/);
  assert.match(text, /lower-plane telemetry: 5 calls · 4 ok · 1 fail · avg 12\.3ms · max 45\.6ms/);
  assert.match(text, /lower-plane command mix: ak:repo=3, ak:evidence=2/);
  assert.match(
    text,
    /latest lower-plane failure: 2026-04-21T15:00:00\.000Z · ak:evidence · exit=7 · process exited with code 7/,
  );
  assert.match(text, /footer left: `test-model · orchestrator→ASC`/);
  assert.match(
    text,
    /footer optional context slot: `ctx <tokens>` when current context usage is known/,
  );
  assert.match(
    text,
    /footer optional token slot: `↑<input> ↺<cache> ↓<output>` after the session records usage/,
  );
  assert.match(text, /footer optional slots: `DB✓\|DB✗ · Vault✓\|Vault✗` when width allows/);
  assert.match(text, /footer right: fast mode .* Starship-style Git branch\/status/);
  assert.match(text, /routing is intentionally omitted/);
});

test("AK close-frame status reader uses read-only AK surfaces", async () => {
  const calls = [];
  const runAk = async ({ args, cwd }) => {
    calls.push(args);
    assert.equal(cwd, "/repo");

    if (args[0] === "strategy" && args[1] === "list") {
      return {
        ok: true,
        stdout: JSON.stringify({
          nodes: [{ key: "SF4", state: "active" }],
        }),
        stderr: "",
      };
    }
    if (args[0] === "wave" && args[1] === "list") {
      return {
        ok: true,
        stdout: JSON.stringify({
          nodes: [{ key: "IW8", parent_key: "SF4", state: "active" }],
        }),
        stderr: "",
      };
    }
    if (args[0] === "strategy" && args[1] === "open-frame-status") {
      return {
        ok: true,
        stdout: JSON.stringify({
          active_execution_task: { status: "present", task_id: 2692, title: "Await next route" },
          closeout_status: {
            closeout_ready: true,
            readiness_state: "ready",
            ready_for_operator_gate: true,
            blockers: [{ domain: "packet_lineage", reason: "packet check needed" }],
          },
          route_guidance: {
            posture: "route_wait",
            generic_proceed_rule: "inspect_status_before_proceeding",
            safe_commands: ["ak strategy open-frame-status --repo . SF4 -F json"],
            non_authorizations: ["no_sf4_closeout", "no_lifecycle_state_mutation"],
          },
          route_selection_policy: {
            status: "inspect_status",
            state_machine: "product_posture_first_route_selection_v1",
            recommended_action: "inspect status before proceeding",
          },
          route_wait_context: { generic_proceed_allowed: false },
        }),
        stderr: "",
      };
    }
    if (args[0] === "task" && args[1] === "close-check") {
      return {
        ok: true,
        stdout: JSON.stringify({ ready_to_close: true, warnings: [] }),
        stderr: "",
      };
    }
    if (args[0] === "strategy" && args[1] === "close-frame") {
      return {
        ok: true,
        stdout: JSON.stringify({
          apply_supported: false,
          blockers: ["unsafe_execution_task_posture"],
          non_actions: ["no_lifecycle_state_mutation", "no_source_owner_mutation"],
        }),
        stderr: "",
      };
    }
    throw new Error(`unexpected ak args: ${args.join(" ")}`);
  };

  const snapshot = await readAkCloseFrameStatus({
    cwd: "/repo",
    societyDb: "/tmp/society.v2.db",
    akPath: "ak",
    runAk,
  });

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.strategicFrame, "SF4");
  assert.equal(snapshot.implementationWave, "IW8");
  assert.equal(snapshot.routePosture, "route_wait");
  assert.equal(snapshot.genericProceedRule, "inspect_status_before_proceeding");
  assert.equal(snapshot.genericProceedAllowed, false);
  assert.equal(snapshot.routePolicyStatus, "inspect_status");
  assert.equal(snapshot.routePolicyStateMachine, "product_posture_first_route_selection_v1");
  assert.equal(snapshot.closeoutReadinessState, "ready");
  assert.equal(snapshot.activeTaskCloseCheckReady, true);
  assert.deepEqual(snapshot.activeTaskCloseCheckWarnings, []);
  assert.equal(snapshot.closeFrameApplySupported, false);
  assert.deepEqual(snapshot.closeFrameBlockers, ["unsafe_execution_task_posture"]);
  assert.deepEqual(snapshot.closeoutBlockers, ["packet_lineage (packet check needed)"]);
  assert.deepEqual(snapshot.nonAuthorizations, ["no_sf4_closeout", "no_lifecycle_state_mutation"]);
  assert.ok(calls.every((args) => !args.includes("--apply")));

  const section = formatAkCloseFrameStatusSection(snapshot);
  assert.match(section, /AK close-frame\/readiness/);
  assert.match(section, /common proceed: `inspect_status_before_proceeding`/);
  assert.match(section, /generic proceed allowed: false/);
  assert.match(
    section,
    /route-policy: `inspect_status` \(product_posture_first_route_selection_v1\)/,
  );
  assert.match(section, /active task close-check ready: true/);
  assert.match(section, /close-frame apply supported: false/);
  assert.match(section, /closeout blockers: packet_lineage \(packet check needed\)/);
  assert.match(section, /non-authorized: no_sf4_closeout, no_lifecycle_state_mutation/);
  assert.match(section, /writes: none; Pi only displays AK readbacks/);
});

test("AK close-frame status reader renders no-wave active-frame discovery posture", async () => {
  const calls = [];
  const runAk = async ({ args, cwd }) => {
    calls.push(args);
    assert.equal(cwd, "/repo");

    if (args[0] === "strategy" && args[1] === "list") {
      return {
        ok: true,
        stdout: JSON.stringify({ nodes: [{ key: "SF13", state: "active" }] }),
        stderr: "",
      };
    }
    if (args[0] === "wave" && args[1] === "list") {
      return {
        ok: true,
        stdout: JSON.stringify({
          nodes: [
            {
              key: "IW25",
              parent_key: "SF13",
              state: "next",
              state_detail: "reserved_post_adr_placeholder",
            },
          ],
        }),
        stderr: "",
      };
    }
    if (args[0] === "strategy" && args[1] === "open-frame-status") {
      assert.equal(args.includes("--implementation-wave"), false);
      return {
        ok: true,
        stdout: JSON.stringify({
          implementation_wave: null,
          active_execution_task: { status: "present", task_id: 3338, title: "Track receipts" },
          closeout_status: {
            closeout_ready: false,
            readiness_state: "blocked",
            ready_for_operator_gate: false,
            blockers: [],
          },
          route_guidance: {
            posture: "active_execution",
            generic_proceed_rule: "continue_current_execution_task",
            safe_commands: ["ak strategy open-frame-status --repo . SF13 -F json"],
            non_authorizations: ["no_sf13_closeout", "no_lifecycle_state_mutation"],
          },
          route_selection_policy: {
            status: "active_execution_ok",
            state_machine: "product_posture_first_route_selection_v1",
            recommended_action:
              "continue the linked execution_task; do not create route-wait state",
          },
          route_wait_context: { generic_proceed_allowed: true },
        }),
        stderr: "",
      };
    }
    if (args[0] === "task" && args[1] === "close-check") {
      return {
        ok: true,
        stdout: JSON.stringify({
          ready_to_close: false,
          warnings: ["task can still complete because first-slice close-check is advisory"],
          missing_outcomes: ["owner receipt"],
          missing_validation: ["ak direction check --repo . --machine"],
          missing_evidence_classes: [],
        }),
        stderr: "",
      };
    }
    throw new Error(`unexpected ak args: ${args.join(" ")}`);
  };

  const snapshot = await readAkCloseFrameStatus({
    cwd: "/repo",
    societyDb: "/tmp/society.v2.db",
    akPath: "ak",
    runAk,
  });

  assert.equal(snapshot.status, "available");
  assert.equal(snapshot.strategicFrame, "SF13");
  assert.equal(snapshot.implementationWave, undefined);
  assert.equal(snapshot.mode, "frame_without_active_wave");
  assert.deepEqual(snapshot.nonExecutionWaves, ["IW25:next/reserved_post_adr_placeholder"]);
  assert.equal(snapshot.genericProceedAllowed, true);
  assert.equal(snapshot.activeTaskCloseCheckReady, false);
  assert.match(snapshot.activeTaskCloseCheckWarnings.join("\n"), /missing outcome: owner receipt/);
  assert.ok(calls.every((args) => !(args[0] === "strategy" && args[1] === "close-frame")));

  const section = formatAkCloseFrameStatusSection(snapshot);
  assert.match(
    section,
    /no active implementation wave \(DiscoveryOrExecution\/default-discovery\)/,
  );
  assert.match(
    section,
    /non-execution waves\/placeholders: `IW25:next\/reserved_post_adr_placeholder`/,
  );
  assert.match(section, /active task close-check ready: false/);
  assert.match(section, /no_implementation_wave_creation_from_runtime_status/);
});

test("runtime-status command opens a runtime truth inspector", async () => {
  resetBoundaryTelemetry();
  const commands = new Map();
  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const editors = [];
  const command = commands.get("runtime-status");
  assert.ok(command, "expected runtime-status command to register");

  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    model: { id: "test-model" },
    sessionManager: createSessionUsageManager(),
    getContextUsage() {
      return createContextUsage();
    },
    ui: {
      async editor(title, text) {
        editors.push({ title, text });
      },
      notify() {},
    },
  });

  assert.equal(editors.length, 1);
  assert.equal(editors[0].title, "Runtime Status");
  assert.match(editors[0].text, /^# Society Orchestrator Runtime Status/m);
  assert.match(editors[0].text, /routing selector: `\/agents-team`/);
  assert.match(editors[0].text, /inspector: `\/runtime-status`/);
  assert.match(editors[0].text, /boundary telemetry inspector: `\/runtime-boundary-telemetry`/);
  assert.match(editors[0].text, /context: 20,000 tokens \(window 128,000\)/);
  assert.match(
    editors[0].text,
    /session tokens: in 1,200 · cache 500 \(300 read \+ 200 write\) · out 400/,
  );
  assert.match(editors[0].text, /lower-plane telemetry:/);
  assert.match(editors[0].text, /lower-plane command mix:/);
  assert.match(editors[0].text, /latest lower-plane failure: none recorded/);
  assert.match(editors[0].text, /footer left: `test-model · orchestrator→ASC`/);
  assert.match(
    editors[0].text,
    /footer optional context slot: `ctx <tokens>` when current context usage is known/,
  );
  assert.match(
    editors[0].text,
    /footer optional token slot: `↑<input> ↺<cache> ↓<output>` after the session records usage/,
  );
  assert.match(
    editors[0].text,
    /footer optional slots: `DB✓\|DB✗ · Vault✓\|Vault✗` when width allows/,
  );
  assert.match(editors[0].text, /footer right: fast mode .* Starship-style Git branch\/status/);
  assert.match(editors[0].text, /routing is intentionally omitted/);
  assert.match(editors[0].text, /routing: `all agents` \[internal: `full`\]/);
  assert.match(editors[0].text, /## AK close-frame\/readiness/);
  assert.match(editors[0].text, /writes: none/);
  resetBoundaryTelemetry();
});

test("runtime-boundary-telemetry command opens a lower-plane telemetry inspector", async () => {
  resetBoundaryTelemetry();
  const commands = new Map();
  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const editors = [];
  const command = commands.get("runtime-boundary-telemetry");
  assert.ok(command, "expected runtime-boundary-telemetry command to register");

  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    model: { id: "test-model" },
    ui: {
      async editor(title, text) {
        editors.push({ title, text });
      },
      notify() {},
    },
  });

  assert.equal(editors.length, 1);
  assert.equal(editors[0].title, "Runtime Boundary Telemetry");
  assert.match(editors[0].text, /^# Orchestrator Boundary Telemetry/m);
  assert.match(editors[0].text, /Recent events/);
  resetBoundaryTelemetry();
});
