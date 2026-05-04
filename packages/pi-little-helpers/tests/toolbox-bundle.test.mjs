import assert from "node:assert/strict";
import test from "node:test";

import registerToolboxBundle, { PEER_SPAWN_TOOL_NAMES } from "../src/toolboxBundle.ts";

function registerBundle() {
  const commands = new Map();
  const tools = new Map();

  registerToolboxBundle({
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
  });

  return { commands, tools };
}

test("toolbox bundle registers the sidequest peer-spawn tools", () => {
  const { commands, tools } = registerBundle();

  assert.deepEqual(
    PEER_SPAWN_TOOL_NAMES.map((name) => tools.has(name)),
    [true, true, true],
  );
  assert.equal(commands.has("sidequest"), true);
  assert.equal(commands.has("scoutpeer"), true);
  assert.equal(commands.has("parallelquest"), true);
});
