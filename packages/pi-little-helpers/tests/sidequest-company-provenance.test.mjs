// summary: verifies visible Pi children receive explicit company provenance (env and parent-cwd sources) at the launchPiQuestSession seam.
// read_when:
//   - changing company-context propagation into sidequest-launched children or Ghostty exec arg construction.
import assert from "node:assert/strict";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import { launchPiQuestSession } from "../extensions/sidequestLaunch.ts";
import {
  createContext,
  createExecStub,
  extractPiArgs,
  registerExtension,
} from "./sidequest-harness.mjs";

function createTabCapableExecStub() {
  return createExecStub(({ command, args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-tab\n  +new-window\n" };
    }
    if (args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0\n" };
    }
    if (args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${command} ${args.join(" ")}`);
  });
}

function lastTabLaunchCall(execStub) {
  const call = [...execStub.calls].reverse().find(({ args }) => args[0] === "+new-tab");
  assert.ok(call, "expected a +new-tab launch");
  return call;
}

test("sidequest carries explicit PI_COMPANY environment provenance into the visible child", async () => {
  const execStub = createTabCapableExecStub();

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
      PI_COMPANY: "core",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { commands } = registerExtension(extension);
  const harness = createContext({ cwd: "/scratch/unrelated" });

  await commands.get("sidequest").handler("trace this failure", harness.ctx);

  assert.deepEqual(extractPiArgs(lastTabLaunchCall(execStub).args), [
    "env",
    "PI_COMPANY=core",
    "PI_COMPANY_PROVENANCE=environment",
    "pi",
    "--fork",
    "/sessions/main.jsonl",
    "--model",
    "openai/gpt-4o",
    "--thinking",
    "medium",
    "trace this failure",
  ]);
});

test("launchPiQuestSession carries parent-cwd company provenance into unscoped children only", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-tab\n  +new-window\n" };
    }
    if (args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0\n" };
    }
    return { code: 0, stdout: "" };
  });
  const launchOptions = {
    env: { TERM_PROGRAM: "ghostty", GHOSTTY_BIN_DIR: "/usr/bin", PI_SIDEQUEST_PI_BIN: "pi" },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  };
  const pi = { getThinkingLevel: () => "medium", exec: execStub.exec };

  const unscoped = await launchPiQuestSession({
    pi,
    ctx: { model: undefined, cwd: "/home/u/ai-society/softwareco/owned/pi-extensions" },
    options: launchOptions,
    defaultPiBin: "pi",
    prompt: "work",
    titlePrompt: "work",
    cwd: "/home/tryinget/.local/state/pi-quests/tmp/task-x",
  });
  assert.equal(unscoped.ok, true);
  assert.deepEqual(extractPiArgs(lastTabLaunchCall(execStub).args), [
    "env",
    "PI_COMPANY=software",
    "PI_COMPANY_PROVENANCE=parent_cwd",
    "PI_COMPANY_SOURCE_CWD=/home/u/ai-society/softwareco/owned/pi-extensions",
    "pi",
    "work",
  ]);

  const scoped = await launchPiQuestSession({
    pi,
    ctx: { model: undefined, cwd: "/home/u/src/unrelated" },
    options: launchOptions,
    defaultPiBin: "pi",
    prompt: "work",
    titlePrompt: "work",
    cwd: "/srv/ai-society/financeco/owned/book",
  });
  assert.equal(scoped.ok, true);
  const scopedPiArgs = extractPiArgs(lastTabLaunchCall(execStub).args);
  assert.equal(scopedPiArgs[0], "pi");
  assert.equal(
    scopedPiArgs.some((arg) => arg.startsWith("PI_COMPANY=")),
    false,
    "scoped target cwd must self-recover company without an env prefix",
  );
});

test("spawn tool ads tell harnessed models provenance is automatic and session mode is not a company switch", () => {
  const extension = createSidequestExtension({ registerTools: true });
  const { tools, commands } = registerExtension(extension);
  const names = [
    "fork_peer_spawn",
    "scout_peer_spawn",
    "fresh_handoff_spawn",
    "candidate_peer_spawn",
  ];
  for (const name of names) {
    const tool = tools.get(name);
    assert.ok(tool, name);
    assert.match(
      tool.promptSnippet,
      /company provenance automatically/i,
      `${name} promptSnippet must advertise automatic company provenance`,
    );
    assert.match(
      tool.description,
      /company provenance automatically/i,
      `${name} description must advertise automatic company provenance when promptSnippet is stripped`,
    );
  }
  assert.match(
    tools.get("fresh_handoff_spawn").promptSnippet,
    /session mode is not a company switch/i,
  );
  assert.match(
    tools.get("fork_peer_spawn").parameters.properties.cwd.description,
    /Do not set PI_COMPANY/,
  );
  for (const name of ["sidequest", "scoutpeer", "fresh-handoff", "parallelquest"]) {
    const command = commands.get(name);
    assert.ok(command, name);
    assert.match(
      command.description,
      /company provenance automatically/i,
      `/${name} help must advertise automatic company provenance`,
    );
  }
});
