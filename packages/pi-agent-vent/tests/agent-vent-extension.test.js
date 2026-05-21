import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import agentVentExtension from "../extensions/agent-vent.ts";

function createMockPi() {
  const tools = new Map();
  const commands = new Map();
  return {
    tools,
    commands,
    api: {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
    },
  };
}

test("extension registers agent_vent tool and command aliases", () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);

  assert.equal(pi.tools.has("agent_vent"), true);
  assert.equal(pi.commands.has("agent_vent"), true);
  assert.equal(pi.commands.has("agent-vent"), true);
  assert.match(pi.tools.get("agent_vent").description, /frustration/i);
});

test("agent_vent records minimized local diagnostics without external authority claims", async () => {
  const pi = createMockPi();
  agentVentExtension(pi.api);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-extension-"));
  const oldDir = process.env.PI_AGENT_VENT_DIR;
  process.env.PI_AGENT_VENT_DIR = dir;
  try {
    const tool = pi.tools.get("agent_vent");
    const result = await tool.execute(
      "tool-call-1",
      {
        action: "record",
        summary: "Repeated reload loses tool registration",
        category: "tool-failure",
        severity: "high",
      },
      undefined,
      undefined,
      {
        cwd: "/repo",
        sessionManager: { getSessionFile: () => "/tmp/session.jsonl" },
      },
    );

    assert.match(result.content[0].text, /Recorded agent vent/);
    assert.equal(result.details.record.category, "tool_failure");
    assert.equal(result.details.record.context.source, "agent_vent_tool");
    assert.equal(result.details.record.context.cwd, "/repo");
    assert.equal(result.details.record.context.sessionFile, "session.jsonl");
    assert.equal(fs.existsSync(path.join(dir, "vents.jsonl")), true);

    const pathResult = await tool.execute("tool-call-2", { action: "path" }, undefined, undefined, {
      cwd: "/repo",
      sessionManager: { getSessionFile: () => undefined },
    });
    assert.match(
      pathResult.content[0].text,
      /local diagnostics, not tasks, issues, incidents, or evidence/,
    );
  } finally {
    if (oldDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
