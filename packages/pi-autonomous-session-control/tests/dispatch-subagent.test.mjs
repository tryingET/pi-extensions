import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSubagentState,
  registerSubagentTool,
  SUBAGENT_PROFILES,
} from "../extensions/self/subagent.ts";

async function setup(spawnerOverride) {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dispatch-test-"));
  const state = createSubagentState(sessionsDir);

  let registeredTool;
  let capturedDef;

  const pi = {
    registerTool(definition) {
      registeredTool = definition;
    },
  };

  const spawner =
    spawnerOverride ||
    (async (def) => {
      capturedDef = def;
      return {
        output: "ok",
        exitCode: 0,
        elapsed: 250,
        status: "done",
      };
    });

  registerSubagentTool(
    pi,
    state,
    () => "test/model",
    async (...args) => {
      const def = args[0];
      capturedDef = def;
      return spawner(...args);
    },
  );

  return {
    state,
    tool: registeredTool,
    getCapturedDef: () => capturedDef,
    cleanup: async () => {
      await rm(sessionsDir, { recursive: true, force: true });
    },
  };
}

test("dispatch_subagent keeps legacy profile/systemPrompt behavior when no prompt envelope is provided", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-1",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.systemPrompt, SUBAGENT_PROFILES.reviewer.systemPrompt);

    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_name, undefined);
    assert.equal(result.details.prompt_source, undefined);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent records the current live session key on spawned sessions when available", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-session-scope",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd(), sessionKey: "live-session-42" },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.parentSessionKey, "live-session-42");
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent applies prompt envelope deterministically and returns provenance", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-2",
      {
        profile: "custom",
        objective: "Do the thing",
        systemPrompt: "Base prompt",
        prompt_name: "nexus",
        prompt_content: "Use the single highest leverage intervention.",
        prompt_tags: ["phase:hypothesis", "", "scope:system"],
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(
      def.systemPrompt,
      [
        "[Prompt Envelope]",
        "name: nexus",
        "source: vault-client",
        "tags: phase:hypothesis, scope:system",
        "Use the single highest leverage intervention.",
        "",
        "---",
        "",
        "Base prompt",
      ].join("\n"),
    );

    assert.equal(result.details.prompt_applied, true);
    assert.equal(result.details.prompt_name, "nexus");
    assert.equal(result.details.prompt_source, "vault-client");
    assert.deepEqual(result.details.prompt_tags, ["phase:hypothesis", "scope:system"]);
    assert.equal(result.details.prompt_warning, undefined);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent fails soft with guidance when envelope metadata is provided without content", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-3",
      {
        profile: "reviewer",
        objective: "Review changes",
        prompt_name: "meta-orchestration",
        prompt_tags: ["phase:validation"],
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.systemPrompt, SUBAGENT_PROFILES.reviewer.systemPrompt);
    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_name, "meta-orchestration");
    assert.equal(result.details.prompt_source, "vault-client");
    assert.equal(
      result.details.prompt_warning,
      "Prompt envelope metadata was provided without prompt_content; no prompt was injected. Pass prompt_content from vault_retrieve output to apply the envelope.",
    );
    assert.match(result.content[0].text, /Prompt envelope warning:/);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent fails soft with guidance when prompt_content is blank", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-4",
      {
        profile: "reviewer",
        objective: "Review changes",
        prompt_content: "   ",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.systemPrompt, SUBAGENT_PROFILES.reviewer.systemPrompt);
    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_source, "vault-client");
    assert.equal(
      result.details.prompt_warning,
      "prompt_content was provided but empty; no prompt was injected. Provide non-empty prompt_content to apply a prompt envelope.",
    );
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent does not emit warning for empty prompt_tags without other envelope metadata", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-5",
      {
        profile: "reviewer",
        objective: "Review changes",
        prompt_tags: [],
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.prompt_applied, false);
    assert.equal(result.details.prompt_warning, undefined);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent sanitizes prompt header metadata to a single line", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-6",
      {
        profile: "custom",
        objective: "Do the thing",
        prompt_name: "nexus\nINJECT",
        prompt_source: "vault-client\nsecond-line",
        prompt_tags: ["phase:hypothesis", "line\nbreak"],
        prompt_content: "Prompt body",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.match(def.systemPrompt, /name: nexus INJECT/);
    assert.match(def.systemPrompt, /source: vault-client second-line/);
    assert.match(def.systemPrompt, /tags: phase:hypothesis, line break/);
    assert.equal(result.details.prompt_name, "nexus INJECT");
    assert.equal(result.details.prompt_source, "vault-client second-line");
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent sanitizes session name to prevent path traversal", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-7",
      {
        profile: "reviewer",
        objective: "Review changes",
        name: "../../outside",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.ok(def.sessionFile.startsWith(harness.state.sessionsDir));
    assert.match(def.sessionFile, /\.\._\.\._outside\.json$/);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent converts thrown spawner errors into structured tool errors", async () => {
  const harness = await setup(async () => {
    throw new Error("spawn exploded");
  });

  try {
    const result = await harness.tool.execute(
      "tc-8",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "error");
    assert.equal(result.details.exitCode, 1);
    assert.match(result.content[0].text, /spawn exploded/);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent passes timeout to spawner def", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-9",
      {
        profile: "reviewer",
        objective: "Review changes",
        timeout: 60, // 60 seconds
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.timeout, 60000); // Converted to milliseconds
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent uses default timeout when not specified", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-10",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(def.timeout, undefined); // Default applied in spawnSubagent
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent generates unique session names for colliding inputs", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-11a",
      {
        profile: "reviewer",
        objective: "Review changes",
        name: "test/name",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def1 = harness.getCapturedDef();

    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(harness.state.sessionsDir, "test_name.json"), "{}");

    await harness.tool.execute(
      "tc-11b",
      {
        profile: "reviewer",
        objective: "Review changes",
        name: "test/name", // Same input, should get suffix
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def2 = harness.getCapturedDef();

    assert.notEqual(def1.sessionFile, def2.sessionFile);
    assert.match(def1.sessionFile, /test_name\.json$/);
    assert.match(def2.sessionFile, /test_name-1\.json$/);
  } finally {
    await harness.cleanup();
  }
});

async function runConcurrentSameNameDispatch(reservationEnvValue) {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-concurrency-test-"));
  const state = createSubagentState(sessionsDir);
  const previous = process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES;

  if (reservationEnvValue === undefined) {
    delete process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES;
  } else {
    process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES = reservationEnvValue;
  }

  let registeredTool;
  const capturedDefs = [];

  const pi = {
    registerTool(definition) {
      registeredTool = definition;
    },
  };

  registerSubagentTool(
    pi,
    state,
    () => "test/model",
    async (def) => {
      capturedDefs.push(def);
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        output: "ok",
        exitCode: 0,
        elapsed: 25,
        status: "done",
      };
    },
  );

  try {
    await Promise.all([
      registeredTool.execute(
        "tc-11c",
        { profile: "reviewer", objective: "Review A", name: "same" },
        null,
        null,
        { cwd: process.cwd() },
      ),
      registeredTool.execute(
        "tc-11d",
        { profile: "reviewer", objective: "Review B", name: "same" },
        null,
        null,
        { cwd: process.cwd() },
      ),
    ]);

    return capturedDefs;
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES;
    } else {
      process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES = previous;
    }
    await rm(sessionsDir, { recursive: true, force: true });
  }
}

test("dispatch_subagent generates unique session names for concurrent dispatches", async () => {
  const capturedDefs = await runConcurrentSameNameDispatch(undefined);
  assert.equal(capturedDefs.length, 2);
  assert.notEqual(capturedDefs[0].sessionFile, capturedDefs[1].sessionFile);
});

test("dispatch_subagent can disable session-name reservation protections via env flag", async () => {
  const capturedDefs = await runConcurrentSameNameDispatch("false");
  assert.equal(capturedDefs.length, 2);
  assert.equal(capturedDefs[0].sessionFile, capturedDefs[1].sessionFile);
});

test("dispatch_subagent rate limits when max concurrent reached", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-ratelimit-test-"));
  const state = createSubagentState(sessionsDir, { maxConcurrent: 2 });

  let registeredTool;
  const pi = {
    registerTool(definition) {
      registeredTool = definition;
    },
  };

  let _capturedDef;
  const spawner = async (def) => {
    _capturedDef = def;
    return {
      output: "ok",
      exitCode: 0,
      elapsed: 100,
      status: "done",
    };
  };

  registerSubagentTool(pi, state, () => "test/model", spawner);

  try {
    state.activeCount = 2;

    const result = await registeredTool.execute(
      "tc-12",
      { profile: "reviewer", objective: "Task" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "rate_limited");
    assert.equal(result.details.maxConcurrent, 2);
    assert.match(result.content[0].text, /Maximum concurrent/);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
