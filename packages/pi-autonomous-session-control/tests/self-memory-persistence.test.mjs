import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createExtension } from "../extensions/self.ts";

function createPiHarness() {
  const tools = new Map();
  const commands = new Map();
  const eventHandlers = new Map();

  const pi = {
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    on(eventName, handler) {
      eventHandlers.set(eventName, handler);
    },
    getModel() {
      return undefined;
    },
  };

  return { pi, tools, commands, eventHandlers };
}

function createMockContext(overrides = {}) {
  return {
    hasUI: false,
    isIdle: () => true,
    ...overrides,
  };
}

function recordWrite(harness, id, path) {
  const toolCallHandler = harness.eventHandlers.get("tool_call");
  toolCallHandler({
    toolName: "write",
    toolCallId: id,
    input: { path, content: "export const value = 1;\n" },
  });
}

async function withMemoryPath(memoryPath, fn) {
  const previous = process.env.PI_SELF_MEMORY_PATH;
  process.env.PI_SELF_MEMORY_PATH = memoryPath;

  try {
    await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SELF_MEMORY_PATH;
    } else {
      process.env.PI_SELF_MEMORY_PATH = previous;
    }
  }
}

function createPatternMemory(id, content, topic = "general") {
  const now = Date.now();
  return {
    id,
    type: "pattern",
    content,
    context: "seeded snapshot",
    topic,
    topics: [topic],
    strength: 1,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    source: "crystallized",
    metadata: {},
  };
}

function createTrapMemory(id, description, triggers = ["trap-trigger"]) {
  const now = Date.now();
  return {
    id,
    type: "trap",
    content: description,
    context: "seeded snapshot",
    topic: triggers[0] ?? "trap",
    topics: [...triggers],
    strength: 1,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 1,
    source: "crystallized",
    metadata: {
      triggers: [...triggers],
      encounterCount: 1,
      markedAt: now,
    },
  };
}

test("self memory persists crystallization + protection across extension lifecycle", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "self-memory-roundtrip-"));
  const sessionsDir = join(tempRoot, "sessions");
  const memoryPath = join(tempRoot, "persist", "self-memory.json");

  try {
    await withMemoryPath(memoryPath, async () => {
      const firstHarness = createPiHarness();
      createExtension(sessionsDir)(firstHarness.pi);
      const firstSelf = firstHarness.tools.get("self");
      const context = createMockContext();

      await firstSelf.execute(
        "tc-remember",
        {
          query: 'Remember: "Roundtrip pattern survives restart"',
          context: { topic: "roundtrip" },
        },
        null,
        null,
        context,
      );

      await firstSelf.execute(
        "tc-trap",
        {
          query: 'Mark as trap: "Roundtrip trap survives restart"',
          context: { triggers: ["roundtrip", "restart"] },
        },
        null,
        null,
        context,
      );

      await firstSelf.execute(
        "tc-checkpoint",
        {
          query: 'Create checkpoint "Roundtrip checkpoint survives restart"',
          context: { entryId: "entry-roundtrip" },
        },
        null,
        null,
        context,
      );

      await firstSelf.execute(
        "tc-followup",
        {
          query: "Queue followup: Roundtrip followup survives restart",
          context: { context: "level-4 dogfood" },
        },
        null,
        null,
        context,
      );

      const snapshot = JSON.parse(await readFile(memoryPath, "utf8"));
      assert.equal(snapshot.schemaVersion, 1);
      assert.ok(Array.isArray(snapshot.entries));
      assert.ok(snapshot.entries.some((entry) => entry.memory?.type === "pattern"));
      assert.ok(snapshot.entries.some((entry) => entry.memory?.type === "trap"));
      assert.ok(snapshot.entries.some((entry) => entry.memory?.type === "checkpoint"));
      assert.ok(snapshot.entries.some((entry) => entry.memory?.type === "followup"));

      const secondHarness = createPiHarness();
      createExtension(sessionsDir)(secondHarness.pi);
      const secondSelf = secondHarness.tools.get("self");

      const recall = await secondSelf.execute(
        "tc-recall",
        { query: "What did I learn?", context: { topic: "roundtrip" } },
        null,
        null,
        context,
      );
      assert.ok(recall.content[0].text.includes("Roundtrip pattern survives restart"));

      const traps = await secondSelf.execute(
        "tc-list-traps",
        { query: "List traps" },
        null,
        null,
        context,
      );
      assert.equal(traps.details.data.count, 1);
      assert.equal(traps.details.data.traps[0].description, "Roundtrip trap survives restart");

      const actions = await secondSelf.execute(
        "tc-action-summary",
        { query: "action summary" },
        null,
        null,
        context,
      );
      assert.equal(actions.details.data.checkpoints.length, 1);
      assert.equal(actions.details.data.followups.length, 1);
      assert.equal(
        actions.details.data.checkpoints[0].reason,
        "Roundtrip checkpoint survives restart",
      );
      assert.equal(actions.details.data.followups[0].text, "Roundtrip followup survives restart");
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("self memory persists fresh same-cwd continuation candidate across reload", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "self-memory-continuation-"));
  const sessionsDir = join(tempRoot, "sessions");
  const memoryPath = join(tempRoot, "persist", "self-memory.json");

  try {
    await withMemoryPath(memoryPath, async () => {
      const firstHarness = createPiHarness();
      createExtension(sessionsDir)(firstHarness.pi);
      const firstSelf = firstHarness.tools.get("self");
      const context = createMockContext({ cwd: "/repo/self-evolution" });

      recordWrite(firstHarness, "write-continuation-candidate", "src/local-validation.ts");

      const first = await firstSelf.execute(
        "tc-continuation-record",
        { query: "continue safely" },
        null,
        null,
        context,
      );
      assert.equal(first.details.data.continuationCandidate.kind, "self.continuation_candidate.v1");
      assert.equal(first.details.data.nextMove.owner, "local-shell");
      assert.equal(first.details.data.sendUserMessage, true);

      const secondHarness = createPiHarness();
      createExtension(sessionsDir)(secondHarness.pi);
      const secondSelf = secondHarness.tools.get("self");

      const resumed = await secondSelf.execute(
        "tc-continuation-resume",
        { query: "next autonomous step" },
        null,
        null,
        context,
      );
      assert.equal(resumed.details.data.usedPersistedContinuationCandidate, true);
      assert.equal(
        resumed.details.data.continuationCandidate.kind,
        "self.continuation_candidate.v1",
      );
      assert.equal(resumed.details.data.nextMove.owner, "local-shell");
      assert.match(resumed.content[0].text, /User-message continuation suggested/);
      assert.match(
        resumed.details.data.nextMove.reason,
        /reloaded from mirror-only continuation candidate/,
      );
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("controller handoff summary persists continuation candidate for reload fallback", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "self-memory-handoff-continuation-"));
  const sessionsDir = join(tempRoot, "sessions");
  const memoryPath = join(tempRoot, "persist", "self-memory.json");

  try {
    await withMemoryPath(memoryPath, async () => {
      const firstHarness = createPiHarness();
      createExtension(sessionsDir)(firstHarness.pi);
      const firstSelf = firstHarness.tools.get("self");
      const context = createMockContext({ cwd: "/repo/handoff-continuation" });

      recordWrite(firstHarness, "write-handoff-continuation-candidate", "src/handoff.ts");

      const handoff = await firstSelf.execute(
        "tc-handoff-continuation-record",
        { query: "controller handoff summary" },
        null,
        null,
        context,
      );
      assert.equal(
        handoff.details.data.continuationCandidate.kind,
        "self.continuation_candidate.v1",
      );
      assert.match(handoff.content[0].text, /continuation candidate=/);

      const secondHarness = createPiHarness();
      createExtension(sessionsDir)(secondHarness.pi);
      const secondSelf = secondHarness.tools.get("self");

      const resumed = await secondSelf.execute(
        "tc-handoff-continuation-resume",
        { query: "next autonomous step" },
        null,
        null,
        context,
      );
      assert.equal(resumed.details.data.usedPersistedContinuationCandidate, true);
      assert.equal(resumed.details.data.nextMove.owner, "local-shell");
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("controller handoff summary without nextMove does not create scoped memory file", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "self-memory-empty-handoff-"));
  const sessionsDir = join(tempRoot, "sessions");
  const memoryPath = join(tempRoot, "persist", "self-memory.json");

  try {
    await withMemoryPath(memoryPath, async () => {
      const harness = createPiHarness();
      createExtension(sessionsDir)(harness.pi);
      const selfTool = harness.tools.get("self");
      const context = createMockContext({ cwd: "/repo/empty-handoff" });

      const handoff = await selfTool.execute(
        "tc-empty-handoff-no-continuation",
        { query: "controller handoff summary" },
        null,
        null,
        context,
      );
      assert.equal(handoff.details.data.continuationCandidate, undefined);

      await assert.rejects(readFile(memoryPath, "utf8"), { code: "ENOENT" });
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("self memory handles malformed persisted payload with safe fallback", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "self-memory-malformed-"));
  const sessionsDir = join(tempRoot, "sessions");
  const memoryPath = join(tempRoot, "persist", "self-memory.json");

  try {
    await mkdir(join(tempRoot, "persist"), { recursive: true });
    await writeFile(memoryPath, "{ malformed-json", "utf8");

    await withMemoryPath(memoryPath, async () => {
      const harness = createPiHarness();
      createExtension(sessionsDir)(harness.pi);
      const selfTool = harness.tools.get("self");
      const context = createMockContext();

      const recall = await selfTool.execute(
        "tc-recall-empty",
        { query: "What did I learn?" },
        null,
        null,
        context,
      );
      assert.ok(recall.content[0].text.includes("No patterns crystallized yet."));

      await selfTool.execute(
        "tc-remember",
        {
          query: 'Remember: "Recovered from malformed payload"',
          context: { topic: "recovery" },
        },
        null,
        null,
        context,
      );

      const repaired = JSON.parse(await readFile(memoryPath, "utf8"));
      assert.equal(repaired.schemaVersion, 1);
      assert.ok(repaired.entries.some((entry) => entry.memory?.type === "pattern"));
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("self memory handles schemaVersion mismatch with safe fallback", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "self-memory-schema-mismatch-"));
  const sessionsDir = join(tempRoot, "sessions");
  const memoryPath = join(tempRoot, "persist", "self-memory.json");

  try {
    await mkdir(join(tempRoot, "persist"), { recursive: true });

    const legacySnapshot = {
      schemaVersion: 999,
      savedAt: Date.now(),
      entries: [
        {
          layer: "longterm",
          memory: createPatternMemory(
            "mem-legacy-pattern",
            "This stale schema pattern should not hydrate",
            "legacy-topic",
          ),
        },
      ],
    };

    await writeFile(memoryPath, JSON.stringify(legacySnapshot, null, 2), "utf8");

    await withMemoryPath(memoryPath, async () => {
      const harness = createPiHarness();
      createExtension(sessionsDir)(harness.pi);
      const selfTool = harness.tools.get("self");
      const context = createMockContext();

      const recall = await selfTool.execute(
        "tc-schema-recall",
        { query: "What did I learn?", context: { topic: "legacy-topic" } },
        null,
        null,
        context,
      );
      assert.ok(recall.content[0].text.includes("No patterns crystallized yet."));

      await selfTool.execute(
        "tc-schema-remember",
        {
          query: 'Remember: "Recovered from schema mismatch"',
          context: { topic: "schema" },
        },
        null,
        null,
        context,
      );

      const repaired = JSON.parse(await readFile(memoryPath, "utf8"));
      assert.equal(repaired.schemaVersion, 1);
      assert.equal(
        repaired.entries.some((entry) => entry.memory?.id === "mem-legacy-pattern"),
        false,
      );
      assert.ok(
        repaired.entries.some(
          (entry) => entry.memory?.content === "Recovered from schema mismatch",
        ),
      );
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("self memory loads valid entries and discards invalid snapshot entries deterministically", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "self-memory-mixed-entries-"));
  const sessionsDir = join(tempRoot, "sessions");
  const memoryPath = join(tempRoot, "persist", "self-memory.json");

  try {
    await mkdir(join(tempRoot, "persist"), { recursive: true });

    const mixedSnapshot = {
      schemaVersion: 1,
      savedAt: Date.now(),
      entries: [
        {
          layer: "longterm",
          memory: createPatternMemory(
            "mem-valid-pattern",
            "Valid pattern loaded from mixed snapshot",
            "mixed-topic",
          ),
        },
        {
          layer: "longterm",
          memory: createTrapMemory("mem-valid-trap", "Valid trap loaded from mixed snapshot", [
            "mixed-trigger",
          ]),
        },
        {
          layer: "longterm",
          memory: { not: "a valid memory" },
        },
        {
          layer: "unknown-layer",
          memory: createPatternMemory(
            "mem-invalid-layer",
            "Invalid layer should be discarded",
            "mixed-topic",
          ),
        },
        {
          layer: "longterm",
          memory: {
            ...createPatternMemory(
              "mem-nonscoped-learning",
              "Non-scoped type should be discarded during load",
              "mixed-topic",
            ),
            type: "learning",
          },
        },
      ],
    };

    await writeFile(memoryPath, JSON.stringify(mixedSnapshot, null, 2), "utf8");

    await withMemoryPath(memoryPath, async () => {
      const harness = createPiHarness();
      createExtension(sessionsDir)(harness.pi);
      const selfTool = harness.tools.get("self");
      const context = createMockContext();

      const recall = await selfTool.execute(
        "tc-mixed-recall",
        { query: "What did I learn?", context: { topic: "mixed-topic" } },
        null,
        null,
        context,
      );
      assert.ok(recall.content[0].text.includes("Valid pattern loaded from mixed snapshot"));

      const traps = await selfTool.execute(
        "tc-mixed-traps",
        { query: "List traps" },
        null,
        null,
        context,
      );
      assert.equal(traps.details.data.count, 1);
      assert.equal(traps.details.data.traps[0].id, "mem-valid-trap");

      const status = await selfTool.execute(
        "tc-memory-lifecycle-status",
        { query: "self memory status" },
        null,
        null,
        context,
      );
      assert.match(status.content[0].text, /Self memory lifecycle status/);
      assert.equal(status.details.data.kind, "self.memory_lifecycle_status.v1");
      assert.equal(status.details.data.loadResult.status, "loaded");
      assert.equal(status.details.data.loadResult.loaded, 2);
      assert.equal(status.details.data.loadResult.discarded, 3);
      assert.equal(status.details.data.counts.patterns, 1);
      assert.equal(status.details.data.counts.traps, 1);
      assert.equal(status.details.data.counts.totalScoped, 2);
      assert.match(status.content[0].text, /not AK\/KES\/evidence\/ontology\/agent_vent truth/);

      const spoofedStatus = await selfTool.execute(
        "tc-memory-lifecycle-status-spoof",
        {
          query: "memory lifecycle status",
          context: {
            memoryLoadResult: { status: "invalid", loaded: 999, discarded: 999 },
          },
        },
        null,
        null,
        context,
      );
      assert.equal(spoofedStatus.details.data.loadResult.status, "loaded");
      assert.equal(spoofedStatus.details.data.loadResult.loaded, 2);
      assert.equal(spoofedStatus.details.data.loadResult.discarded, 3);

      await selfTool.execute(
        "tc-mixed-persist",
        {
          query: 'Remember: "Persist mixed snapshot load result"',
          context: { topic: "mixed-topic" },
        },
        null,
        null,
        context,
      );

      const repaired = JSON.parse(await readFile(memoryPath, "utf8"));
      assert.equal(repaired.schemaVersion, 1);
      assert.ok(repaired.entries.every((entry) => entry.layer === "longterm"));
      assert.ok(repaired.entries.some((entry) => entry.memory?.id === "mem-valid-pattern"));
      assert.ok(repaired.entries.some((entry) => entry.memory?.id === "mem-valid-trap"));
      assert.equal(
        repaired.entries.some((entry) => entry.memory?.id === "mem-invalid-layer"),
        false,
      );
      assert.equal(
        repaired.entries.some((entry) => entry.memory?.id === "mem-nonscoped-learning"),
        false,
      );
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
