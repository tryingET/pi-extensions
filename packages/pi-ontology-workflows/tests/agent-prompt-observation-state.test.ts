import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_PROMPT_OBSERVATION_PROTOCOL_REVISION,
  AGENT_PROMPT_OBSERVATION_SCHEMA,
  createAgentPromptObservationState,
  renderAgentPromptObservation,
} from "../src/semantic/agent-prompt-observation-state.ts";
import { buildHandlerObservationRecord } from "../src/semantic/handler-observation.ts";

function predecessor(output = "BASE\n\nBLOCK") {
  return buildHandlerObservationRecord({
    input: "BASE",
    contribution: output.slice("BASE".length),
    output,
  });
}

function ownEvent(token: unknown, prompt: unknown): object {
  return Object.freeze({
    type: "agent_prompt_ready",
    promptRunToken: token,
    systemPrompt: prompt,
  });
}

test("prepared and terminal records are immutable, JCS-digested, and exact-match correlated", () => {
  const state = createAgentPromptObservationState();
  const prepared = state.prepare("private-A", predecessor());
  assert.ok(prepared);
  assert.equal(prepared.schema, AGENT_PROMPT_OBSERVATION_SCHEMA);
  assert.equal(prepared.protocol_revision, AGENT_PROMPT_OBSERVATION_PROTOCOL_REVISION);
  assert.equal(prepared.phase, "prepared");
  assert.equal(Object.isFrozen(prepared), true);
  assert.match(prepared.record_digest, /^sha256:[0-9a-f]{64}$/);

  const terminal = state.observeReady(ownEvent("private-A", "BASE\n\nBLOCK"));
  assert.ok(terminal);
  assert.equal(terminal.phase, "terminal");
  assert.equal(terminal.observation_outcome, "agent_prompt_exact_match");
  assert.equal(terminal.whole_prompt_exact_match_observed, true);
  assert.equal(Object.isFrozen(terminal), true);
  assert.notEqual(terminal.record_digest, prepared.record_digest);
});

test("whole-prompt mismatch is terminal without claiming contribution survival", () => {
  const state = createAgentPromptObservationState();
  state.prepare("run", predecessor());
  const terminal = state.observeReady(ownEvent("run", "BASE\n\nBLOCK\nlater-handler"));
  assert.ok(terminal);
  assert.equal(terminal.phase, "terminal");
  assert.equal(terminal.observation_outcome, "agent_prompt_mismatch");
  assert.equal(terminal.whole_prompt_exact_match_observed, false);
  assert.equal(
    renderAgentPromptObservation(true, true, terminal),
    "semantic-preflight-observation protocol=pi-ontology-workflows-agent-prompt-observation-v0-r2 state=terminal outcome=mismatch claim=pi-agent-state-only contribution_survival=unknown provider=false model=false",
  );
});

test("latest preparation wins and reversed old readiness cannot consume the slot", () => {
  const state = createAgentPromptObservationState();
  const first = state.prepare("old", predecessor("BASE\n\nOLD"));
  const second = state.prepare("new", predecessor("BASE\n\nNEW"));
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.record_digest, second.record_digest);
  assert.equal(state.observeReady(ownEvent("old", "BASE\n\nOLD")), second);
  const terminal = state.observeReady(ownEvent("new", "BASE\n\nNEW"));
  assert.equal(terminal?.observation_outcome, "agent_prompt_exact_match");
});

test("missing, non-string, and nonmatching tokens ignore without reading prompt", () => {
  for (const token of [undefined, 1, {}, "other"]) {
    const state = createAgentPromptObservationState();
    const prepared = state.prepare("match", predecessor());
    let reads = 0;
    const event = Object.defineProperties(
      {},
      {
        promptRunToken: { value: token, enumerable: true },
        systemPrompt: {
          enumerable: true,
          get() {
            reads++;
            throw new Error("prompt must not be read");
          },
        },
      },
    );
    assert.equal(state.observeReady(event), prepared);
    assert.equal(reads, 0);
    assert.equal(state.latest(), prepared);
  }
});

test("event inspection reentrancy cannot consume a newer preparation", () => {
  const state = createAgentPromptObservationState();
  state.prepare("same", predecessor("BASE\n\nOLD"));
  const event = new Proxy(
    {},
    {
      getOwnPropertyDescriptor(_target, key) {
        if (key === "promptRunToken")
          return { configurable: true, enumerable: true, value: "same", writable: false };
        if (key === "systemPrompt") {
          state.prepare("same", predecessor("BASE\n\nNEW"));
          return {
            configurable: true,
            enumerable: true,
            value: "BASE\n\nOLD",
            writable: false,
          };
        }
        return undefined;
      },
    },
  );
  const observed = state.observeReady(event);
  assert.equal(observed?.phase, "prepared");
  assert.equal(observed, state.latest());
  assert.equal(observed?.prepared_prompt_byte_length, Buffer.byteLength("BASE\n\nNEW"));
});

test("matching malformed prompts clear silently while malformed events after terminal are no-ops", () => {
  for (const prompt of [undefined, 1, {}, "bad\ud800"]) {
    const state = createAgentPromptObservationState();
    state.prepare("match", predecessor());
    assert.doesNotThrow(() => state.observeReady(ownEvent("match", prompt)));
    assert.equal(state.latest(), undefined);
  }
  const state = createAgentPromptObservationState();
  state.prepare("match", predecessor());
  const terminal = state.observeReady(ownEvent("match", "BASE\n\nBLOCK"));
  assert.ok(terminal);
  const malformed = Object.freeze({ promptRunToken: "match" });
  assert.equal(state.observeReady(malformed), terminal);
  assert.equal(state.observeReady(ownEvent("match", "different")), terminal);
});

test("record keys and digests are token-free and token-invariant", () => {
  const bytes: string[] = [];
  const digests: string[][] = [];
  for (const token of ["TOKEN-SECRET-A", "TOKEN-SECRET-B"]) {
    const state = createAgentPromptObservationState();
    const prepared = state.prepare(token, predecessor());
    assert.ok(prepared);
    const terminal = state.observeReady(ownEvent(token, "BASE\n\nBLOCK"));
    assert.ok(terminal);
    for (const record of [prepared, terminal]) {
      assert.equal(
        Object.keys(record).some((key) => /token/i.test(key)),
        false,
      );
      assert.equal(JSON.stringify(record).includes(token), false);
    }
    const serialized = JSON.stringify({ prepared, terminal });
    bytes.push(serialized);
    digests.push([prepared.record_digest, terminal.record_digest]);
  }
  assert.equal(bytes[0], bytes[1]);
  assert.deepEqual(digests[0], digests[1]);
});

test("errors, console logs, simulated session/evidence, and command output stay sanitized", () => {
  const token = "TOKEN-PRIVATE-SERIALIZATION";
  const prompt = "PROMPT-PRIVATE-SERIALIZATION";
  const logs: string[] = [];
  const original = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const capture = (...values: unknown[]) => logs.push(values.map(String).join(" "));
  console.debug = capture;
  console.error = capture;
  console.info = capture;
  console.log = capture;
  console.warn = capture;
  let thrown = "";
  let output = "";
  try {
    const state = createAgentPromptObservationState();
    state.prepare(token, predecessor());
    state.observeReady(ownEvent(token, prompt));
    output = renderAgentPromptObservation(true, true, state.latest());
    try {
      buildHandlerObservationRecord({ input: prompt, contribution: "", output: prompt });
    } catch (error) {
      thrown = String(error);
    }
  } finally {
    console.debug = original.debug;
    console.error = original.error;
    console.info = original.info;
    console.log = original.log;
    console.warn = original.warn;
  }
  assert.notEqual(thrown, "");
  assert.deepEqual(logs, []);
  const simulatedSession = [{ type: "notification", text: output }];
  const simulatedEvidence = { command_output: output, errors: [thrown], logs };
  const serialized = JSON.stringify({ simulatedSession, simulatedEvidence });
  assert.doesNotMatch(
    serialized,
    /TOKEN-PRIVATE|PROMPT-PRIVATE|sha256:|digest|byte.?length|prepared_prompt/i,
  );
});

test("clear removes prepared and terminal state", () => {
  const state = createAgentPromptObservationState();
  state.prepare("run", predecessor());
  state.clear();
  assert.equal(state.latest(), undefined);
  state.prepare("run", predecessor());
  state.observeReady(ownEvent("run", "BASE\n\nBLOCK"));
  state.clear();
  assert.equal(state.latest(), undefined);
});
