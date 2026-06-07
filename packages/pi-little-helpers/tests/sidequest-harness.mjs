import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

export const LOCAL_GHOSTTY_WRAPPER_SUFFIX = "/.local/bin/ghostty-sidequest";
export const LOCAL_GHOSTTY_BIN_SUFFIX = "/.local/opt/ghostty-sidequest/bin/ghostty";
export const LOCAL_GHOSTTY_NEXT_BIN_SUFFIX = "/.local/opt/ghostty-sidequest-next/bin/ghostty";
export const LOCAL_GHOSTTY_PREV_BIN_SUFFIX =
  "/.local/opt/ghostty-sidequest-prev-20260512T211350/bin/ghostty";
export const LOCAL_GHOSTTY_BIN = `/home/tryinget${LOCAL_GHOSTTY_BIN_SUFFIX}`;
export const LOCAL_GHOSTTY_NEXT_BIN = `/home/tryinget${LOCAL_GHOSTTY_NEXT_BIN_SUFFIX}`;
export const LOCAL_GHOSTTY_PREV_BIN = `/home/tryinget${LOCAL_GHOSTTY_PREV_BIN_SUFFIX}`;

export function isLocalGhosttyWrapper(path) {
  return path.endsWith(LOCAL_GHOSTTY_WRAPPER_SUFFIX);
}

export function isLocalGhosttyBin(path) {
  return path.endsWith(LOCAL_GHOSTTY_BIN_SUFFIX);
}

export function isAnyLocalSidequestGhosttyBin(path) {
  return (
    path.endsWith(LOCAL_GHOSTTY_BIN_SUFFIX) ||
    path.endsWith(LOCAL_GHOSTTY_NEXT_BIN_SUFFIX) ||
    path.endsWith(LOCAL_GHOSTTY_PREV_BIN_SUFFIX)
  );
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function registerExtension(extension, { thinkingLevel = "medium" } = {}) {
  const commands = new Map();
  const tools = new Map();
  const events = new Map();
  const userMessages = [];

  extension({
    getThinkingLevel() {
      return thinkingLevel;
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    on(name, handler) {
      const handlers = events.get(name) ?? [];
      handlers.push(handler);
      events.set(name, handlers);
    },
    sendUserMessage(message, options) {
      userMessages.push({ message, options });
    },
  });

  return { commands, tools, events, userMessages };
}

export function createContext(options = {}) {
  const cwd = options.cwd ?? "/repo";
  const sessionFile = Object.hasOwn(options, "sessionFile")
    ? options.sessionFile
    : "/sessions/main.jsonl";
  const model = options.model ?? { provider: "openai", id: "gpt-4o" };
  const notifications = [];

  return {
    notifications,
    ctx: {
      cwd,
      hasUI: true,
      model,
      ui: {
        notify(message, type = "info") {
          notifications.push({ message, type });
        },
      },
      sessionManager: {
        getSessionFile() {
          return sessionFile;
        },
        getSessionId() {
          return "019e10d2-15f5-705a-aea4-01ba49d2bbac";
        },
        getSessionName() {
          return "controller";
        },
        getCwd() {
          return cwd;
        },
      },
    },
  };
}

export function setTemporaryHomeWithPromptTemplates(homePath) {
  const originalHome = process.env.HOME;
  mkdirSync(`${homePath}/.pi/agent/prompts`, { recursive: true });
  writeFileSync(`${homePath}/.pi/agent/prompts/deep-review.md`, "GLOBAL DEEP REVIEW\n", "utf8");
  writeFileSync(`${homePath}/.pi/agent/prompts/commit.md`, "GLOBAL COMMIT\n", "utf8");
  process.env.HOME = homePath;
  return () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  };
}

export function createExecStub(handler) {
  const calls = [];

  return {
    calls,
    exec: async (command, args, options = {}) => {
      calls.push({ command, args, options });
      return handler({ command, args, options, calls });
    },
  };
}

export function extractPiArgs(ghosttyArgs) {
  const marker = ghosttyArgs.indexOf("sidequest-pi");
  assert.notEqual(marker, -1, "expected sidequest-pi marker in Ghostty args");
  return ghosttyArgs.slice(marker + 1);
}

export function extractShellCommand(ghosttyArgs) {
  const shellIndex = ghosttyArgs.indexOf("-lc");
  assert.notEqual(shellIndex, -1, "expected -lc shell invocation in Ghostty args");
  return ghosttyArgs[shellIndex + 1];
}

export function matchCount(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

export function assertIntercomReportBackContract(prompt, { peerPrefix, target }) {
  assert.match(prompt, new RegExp(`Report to the exact parent target: ${target}`));
  assert.equal(matchCount(prompt, /Only allowed pre-ACK tool: `intercom`/g), 1);
  assert.equal(
    matchCount(prompt, new RegExp(`PEER_ACK peer_run_id=${peerPrefix}-[^:]+: spawned`, "g")),
    1,
  );
  assert.equal(
    matchCount(
      prompt,
      new RegExp(`2\\. \`PEER_FINAL peer_run_id=${peerPrefix}-[^:]+: \\.\\.\\.\``, "g"),
    ),
    1,
  );
  assert.equal(
    matchCount(prompt, /Do not send both a final report and a separate final DoD report/g),
    1,
  );
  assert.equal(matchCount(prompt, /After sending `PEER_FINAL`, stop/g), 1);
  assert.equal(
    matchCount(
      prompt,
      /After ACK succeeds, continue with the objective and send exactly one `PEER_FINAL`/g,
    ),
    1,
  );
  assert.equal(matchCount(prompt, /For the final message, use: `intercom\(/g), 1);
}

export function assertLoopValidationGuidance(prompt) {
  for (const command of [
    "loop-doctor",
    "loop-verify-fast",
    "loop-impact-plan",
    "loop-impact-run",
    "loop-impact-wide",
    "loop-landing-check",
  ]) {
    assert.match(prompt, new RegExp(command));
  }
  assert.match(prompt, /repo-owned/);
  assert.match(prompt, /repo-declared invocation/);
  assert.match(prompt, /npm run loop-/);
  assert.match(prompt, /evidence-producing/);
  assert.match(prompt, /not authority/);
  assert.match(prompt, /report the fallback/);
  assert.match(prompt, /Do not claim validation authority/);
}
