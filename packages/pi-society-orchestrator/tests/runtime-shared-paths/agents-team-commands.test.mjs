import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../../extensions/society-orchestrator.ts";

test("agents-team command fails clearly when no session identity is available", async () => {
  const commands = new Map();
  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  const notifications = [];
  const command = commands.get("agents-team");
  assert.ok(command, "expected agents-team command to register");

  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      async select() {
        return "quality — reviewer, researcher";
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });

  assert.deepEqual(notifications, [
    {
      message: "Cannot set team for this session because no session identity is available.",
      level: "error",
    },
  ]);
});

test("agents-team command presents the internal full team as all agents to operators", async () => {
  const commands = new Map();
  extension({
    registerTool() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on() {},
  });

  let selectTitle;
  let selectOptions;
  const command = commands.get("agents-team");
  assert.ok(command, "expected agents-team command to register");

  await command.handler("", {
    hasUI: true,
    cwd: process.cwd(),
    ui: {
      async select(title, options) {
        selectTitle = title;
        selectOptions = options;
        return undefined;
      },
      notify() {},
    },
  });

  assert.equal(selectTitle, "Select routing scope");
  assert.ok(selectOptions.includes("all agents — builder, researcher, reviewer, scout"));
  assert.equal(
    selectOptions.some((option) => option.startsWith("full —")),
    false,
  );
});

test("agents-team command stores team selection per session manager", async () => {
  const commands = new Map();
  const tools = new Map();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-session-manager-"));

  try {
    extension({
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
      on() {},
    });

    const command = commands.get("agents-team");
    const loopTool = tools.get("loop_execute");
    assert.ok(command, "expected agents-team command to register");
    assert.ok(loopTool, "expected loop_execute tool to register");

    const sessionA = { id: "session-a" };
    const sessionB = { id: "session-b" };
    const notifications = [];

    await command.handler("", {
      hasUI: true,
      sessionManager: sessionA,
      cwd: tempDir,
      ui: {
        async select() {
          return "quality — reviewer, researcher";
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    const blocked = await loopTool.execute(
      "tc-1",
      { loop: "strategic", objective: "Plan the migration" },
      undefined,
      undefined,
      { cwd: tempDir, sessionManager: sessionA, model: undefined },
    );
    assert.equal(blocked.details.ok, false);
    assert.equal(blocked.details.error, "loop-agent-team-mismatch");
    assert.match(blocked.content[0].text, /Loop 'strategic' is incompatible with the active team/);

    const sessionBAbort = new AbortController();
    sessionBAbort.abort();
    const notBlockedBySessionASelection = await loopTool.execute(
      "tc-2",
      { loop: "strategic", objective: "Plan the migration" },
      sessionBAbort.signal,
      undefined,
      { cwd: tempDir, sessionManager: sessionB, model: undefined },
    );
    assert.notEqual(notBlockedBySessionASelection.details.error, "loop-agent-team-mismatch");

    assert.deepEqual(notifications, [
      {
        message: "Routing: quality (reviewer, researcher)",
        level: "info",
      },
    ]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("agents-team command stores team selection per session key", async () => {
  const commands = new Map();
  const tools = new Map();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-session-key-"));

  try {
    extension({
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
      on() {},
    });

    const command = commands.get("agents-team");
    const loopTool = tools.get("loop_execute");
    assert.ok(command, "expected agents-team command to register");
    assert.ok(loopTool, "expected loop_execute tool to register");

    await command.handler("", {
      hasUI: true,
      sessionKey: "session-key-A",
      cwd: tempDir,
      ui: {
        async select() {
          return "quality — reviewer, researcher";
        },
        notify() {},
      },
    });

    const blocked = await loopTool.execute(
      "tc-3",
      { loop: "strategic", objective: "Plan the migration" },
      undefined,
      undefined,
      { cwd: tempDir, sessionKey: "session-key-A", model: undefined },
    );
    assert.equal(blocked.details.ok, false);
    assert.equal(blocked.details.error, "loop-agent-team-mismatch");

    const otherSessionAbort = new AbortController();
    otherSessionAbort.abort();
    const notBlockedBySessionKeySelection = await loopTool.execute(
      "tc-4",
      { loop: "strategic", objective: "Plan the migration" },
      otherSessionAbort.signal,
      undefined,
      { cwd: tempDir, sessionKey: "session-key-B", model: undefined },
    );
    assert.notEqual(notBlockedBySessionKeySelection.details.error, "loop-agent-team-mismatch");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
