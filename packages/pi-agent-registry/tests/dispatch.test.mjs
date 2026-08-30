// ---
// summary: verifies Fleet Phase-0 standing-agent dispatch is fail-closed before every execution effect.
// read_when:
//   - changing the Phase-0 dispatch gate or preparing the AK 5132 exact-task read-only contract.
// ---

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AgentDispatchError, dispatchAgent, STANDING_AGENT_PHASE0_GATE } from "../src/dispatch.ts";
import { resolveRegistrySubagentSessionsDir } from "../src/sessions-dir.ts";

function hostileValue(label, reads) {
  return new Proxy(
    {},
    {
      get() {
        reads.push(label);
        throw new Error(`Phase-0 gate must not inspect ${label}`);
      },
      ownKeys() {
        reads.push(label);
        throw new Error(`Phase-0 gate must not enumerate ${label}`);
      },
    },
  );
}

test("dispatchAgent rejects before reading caller properties or causing execution effects", async () => {
  const reads = [];
  const update = new Proxy(() => undefined, {
    apply() {
      reads.push("update callback");
      throw new Error("Phase-0 gate must not call updates");
    },
  });

  await assert.rejects(
    dispatchAgent(
      hostileValue("options", reads),
      hostileValue("request", reads),
      hostileValue("context", reads),
      update,
      hostileValue("signal", reads),
    ),
    (error) => {
      assert.ok(error instanceof AgentDispatchError);
      assert.equal(error.reason, "fleet_phase0_dispatch_disabled");
      assert.equal(error.details, STANDING_AGENT_PHASE0_GATE);
      assert.match(error.message, /AK task 5132/);
      return true;
    },
  );

  assert.deepEqual(reads, []);
  assert.equal(Object.isFrozen(STANDING_AGENT_PHASE0_GATE), true);
  assert.deepEqual(STANDING_AGENT_PHASE0_GATE, {
    code: "fleet_phase0_dispatch_disabled",
    phase: "fleet_phase_0",
    nextTaskId: 5132,
    effectDisposition: "confirmed_no_effects",
    spawnAttempted: false,
    capacityReserved: false,
    worktreeCreated: false,
    authorityGranted: false,
  });
});

test("legacy launch-policy overrides cannot bypass the Phase-0 gate", async () => {
  let spawned = 0;
  await assert.rejects(
    dispatchAgent(
      {
        registry: { resolve: () => assert.fail("registry resolution must not run") },
        spawner: async () => {
          spawned += 1;
        },
      },
      {
        agent: "agent-fixture-steward",
        objective: "attempt a broad launch",
        mutationPolicy: "bounded_mutation",
        allowedPaths: ["/**"],
        forbiddenPaths: [],
        extensions: ["/arbitrary/extension.ts"],
      },
    ),
    (error) => error instanceof AgentDispatchError,
  );
  assert.equal(spawned, 0);
});

test("legacy registry session-root resolution is quarantined until ASC owns Phase-2 dispatch", () => {
  assert.throws(
    () => resolveRegistrySubagentSessionsDir(),
    /disabled in Fleet Phase 0; ASC must own this contract/,
  );
  const source = readFileSync(new URL("../src/sessions-dir.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /mkdirSync|PI_SUBAGENT_SESSIONS_DIR|PI_CODING_AGENT_SESSION_DIR/);
});

test("shipped Phase-0 dispatch adapter carries no ASC runtime, raw spawn, or alternate route", () => {
  const source = readFileSync(new URL("../src/dispatch.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /createAscExecutionRuntime|createSubagentState|spawnSubagent|fork_peer_spawn|scout_peer_spawn|candidate_peer_spawn|workflow_execute|loop_execute/,
  );
});
