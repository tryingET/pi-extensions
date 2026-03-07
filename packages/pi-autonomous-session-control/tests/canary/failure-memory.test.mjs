import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveQuery } from "../../extensions/self/query-resolver.ts";
import { createSelfState } from "../../extensions/self/state.ts";
import {
  clearSubagentSessions,
  createSubagentState,
  registerSubagentTool,
} from "../../extensions/self/subagent.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = join(TEST_DIR, "cards");

async function loadCards() {
  const files = (await readdir(CARDS_DIR)).filter((f) => f.endsWith(".json")).sort();
  const cards = [];

  for (const file of files) {
    const fullPath = join(CARDS_DIR, file);
    const parsed = JSON.parse(await readFile(fullPath, "utf8"));
    cards.push(parsed);
  }

  return cards;
}

function getByPath(scope, path) {
  return path
    .split(".")
    .filter(Boolean)
    .reduce((current, segment) => {
      if (current === null || current === undefined) return undefined;
      const index = Number(segment);
      if (Number.isInteger(index) && String(index) === segment && Array.isArray(current)) {
        return current[index];
      }
      return current[segment];
    }, scope);
}

function assertCardAssertions(card, scope) {
  assert.ok(Array.isArray(card.assertions), `${card.id}: assertions must be an array`);
  assert.ok(card.assertions.length > 0, `${card.id}: assertions must not be empty`);

  for (const assertion of card.assertions) {
    const actual = getByPath(scope, assertion.path);
    const prefix = `${card.id} :: ${assertion.path}`;

    if (Object.hasOwn(assertion, "equals")) {
      assert.deepEqual(actual, assertion.equals, `${prefix} expected equality`);
    }

    if (Object.hasOwn(assertion, "notEquals")) {
      assert.notDeepEqual(actual, assertion.notEquals, `${prefix} expected inequality`);
    }

    if (Object.hasOwn(assertion, "includes")) {
      if (typeof actual === "string") {
        assert.ok(actual.includes(assertion.includes), `${prefix} expected to include text`);
      } else if (Array.isArray(actual)) {
        assert.ok(actual.includes(assertion.includes), `${prefix} expected array to include value`);
      } else {
        assert.fail(`${prefix} includes assertion requires string or array actual value`);
      }
    }

    if (Object.hasOwn(assertion, "notIncludes")) {
      if (typeof actual === "string") {
        assert.equal(
          actual.includes(assertion.notIncludes),
          false,
          `${prefix} expected text to exclude value`,
        );
      } else if (Array.isArray(actual)) {
        assert.equal(
          actual.includes(assertion.notIncludes),
          false,
          `${prefix} expected array to exclude value`,
        );
      } else {
        assert.fail(`${prefix} notIncludes assertion requires string or array actual value`);
      }
    }
  }
}

async function runSelfCard(card) {
  const state = createSelfState();

  for (const setupStep of card.setup ?? []) {
    resolveQuery({ query: setupStep.query, context: setupStep.context }, state);
  }

  const result = resolveQuery({ query: card.query, context: card.context }, state);
  return { result, state };
}

function createCardSpawner(card) {
  if (card.spawner?.mode !== "set_active_count_before_return") {
    return undefined;
  }

  return async (_def, _model, _ctx, state) => {
    if (typeof card.spawner.activeCount === "number") {
      state.activeCount = card.spawner.activeCount;
    }

    const result = card.spawner.result ?? {};
    return {
      output: typeof result.output === "string" ? result.output : "ok",
      exitCode: typeof result.exitCode === "number" ? result.exitCode : 0,
      elapsed: typeof result.elapsed === "number" ? result.elapsed : 1,
      status:
        result.status === "error" || result.status === "timeout" || result.status === "done"
          ? result.status
          : "done",
    };
  };
}

async function runDispatchCard(card) {
  const sessionsDir = await mkdtemp(join(tmpdir(), "failure-memory-dispatch-"));
  const state = createSubagentState(sessionsDir, {
    maxConcurrent: card.state?.maxConcurrent,
  });

  let tool;
  const pi = {
    registerTool(definition) {
      tool = definition;
    },
  };

  registerSubagentTool(pi, state, () => "test/model", createCardSpawner(card));

  try {
    const results = [];

    for (const call of card.calls ?? []) {
      const result = await tool.execute(
        `failure-memory-${card.id}-${results.length}`,
        call,
        null,
        null,
        { cwd: process.cwd() },
      );
      results.push(result);
    }

    return { results, state };
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
}

async function runSubagentSessionsCard(card) {
  const sessionsDir = await mkdtemp(join(tmpdir(), "failure-memory-sessions-"));

  try {
    for (const seed of card.seedFiles ?? []) {
      await writeFile(join(sessionsDir, seed.name), seed.content ?? "");
    }

    const state = createSubagentState(sessionsDir);
    clearSubagentSessions(state);

    const files = await readdir(sessionsDir);
    return { files, state };
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
}

async function runCard(card) {
  switch (card.target) {
    case "self":
      return runSelfCard(card);
    case "dispatch_subagent":
      return runDispatchCard(card);
    case "subagent_sessions":
      return runSubagentSessionsCard(card);
    default:
      throw new Error(`Unknown failure-memory card target: ${card.target}`);
  }
}

const cards = await loadCards();

test("failure-memory lane has cards", () => {
  assert.ok(cards.length >= 8, "expected at least 8 failure-memory cards");
});

for (const card of cards) {
  test(`failure-memory card: ${card.id}`, async () => {
    const scope = await runCard(card);
    assertCardAssertions(card, scope);
  });
}
