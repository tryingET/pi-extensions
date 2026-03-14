import assert from "node:assert/strict";
import test from "node:test";
import extension from "../extensions/ontology-workflows.ts";

test("extension registers the compact ontology workflow surface", () => {
  const tools: string[] = [];
  const commands: string[] = [];
  const events: string[] = [];

  extension({
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    registerCommand(name: string) {
      commands.push(name);
    },
    on(event: string) {
      events.push(event);
    },
  } as never);

  assert.deepEqual(tools.sort(), ["ontology_change", "ontology_inspect"]);
  assert.deepEqual(commands, ["ontology-status"]);
  assert.deepEqual(events.sort(), ["before_agent_start", "session_start", "session_start"]);
});
