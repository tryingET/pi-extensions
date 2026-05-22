import assert from "node:assert/strict";
import test from "node:test";

import { LITTLE_HELPERS_CAPABILITY_MANIFEST } from "../src/capabilityManifest.ts";
import registerToolboxBundle, {
  PEER_SPAWN_CAPABILITY_MANIFEST,
  PEER_SPAWN_TOOL_NAMES,
} from "../src/toolboxBundle.ts";

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

test("toolbox bundle registers the sidequest peer-spawn capability", () => {
  const { commands, tools } = registerBundle();

  assert.equal(PEER_SPAWN_CAPABILITY_MANIFEST, LITTLE_HELPERS_CAPABILITY_MANIFEST);
  assert.deepEqual(
    PEER_SPAWN_TOOL_NAMES.map((name) => tools.has(name)),
    [true, true, true, true],
  );
  assert.deepEqual([...commands.keys()], []);
  assert.deepEqual([...tools.keys()], [...PEER_SPAWN_TOOL_NAMES]);
  assert.deepEqual(PEER_SPAWN_CAPABILITY_MANIFEST.projections, [
    {
      tool: "fork_peer_spawn",
      command: "sidequest",
      slash: "/sidequest",
      sessionMode: "forked-context",
      reportBack: "manual-visible",
    },
    {
      tool: "scout_peer_spawn",
      command: "scoutpeer",
      slash: "/scoutpeer",
      sessionMode: "clean-scout",
      reportBack: "intercom-when-session-id-available",
    },
    {
      tool: "candidate_peer_spawn",
      command: "parallelquest",
      slash: "/parallelquest",
      sessionMode: "clean-candidate-worktree",
      reportBack: "manual-visible",
    },
  ]);
});
