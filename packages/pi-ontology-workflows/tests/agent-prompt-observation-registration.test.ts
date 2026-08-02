import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import type { RocsPort } from "../src/ports/rocs-port.ts";
import {
  createSemanticPreflightRuntime,
  type PiHostCapabilities,
  type RuntimeContext,
} from "../src/semantic/preflight-runtime.ts";

const capability = "prompt.agent-state.observation.v1";
const digest = `sha256:${"a".repeat(64)}`;

function host(supported: boolean): PiHostCapabilities {
  return Object.freeze({
    host_package: "@earendil-works/pi-coding-agent",
    host_version: "0.83.0",
    extension_api_version: "1.0.0",
    capabilities: Object.freeze([
      "prompt.system.chain.v1",
      "session.lifecycle.reason.v1",
      "ui.mode.v1",
      "ui.confirm.timeout.v1",
      "session.shutdown.v1",
      ...(supported ? [capability] : []),
    ]),
  });
}

type Command = (args: string, ctx: RuntimeContext) => Promise<void>;
type Event = (event: Record<string, unknown>, ctx: RuntimeContext) => unknown | Promise<unknown>;

async function harness(supported: boolean) {
  const notifications: string[] = [];
  const commands = new Map<string, Command>();
  const events = new Map<string, Event[]>();
  const ctx: RuntimeContext = {
    cwd: "/workspace/repo",
    mode: "tui",
    hasUI: true,
    hostCapabilities: host(supported),
    isIdle: () => true,
    ui: {
      async confirm() {
        return true;
      },
      notify(message) {
        notifications.push(message);
      },
      setStatus() {},
    },
  };
  const legacyRocs: RocsPort = {
    async summary() {
      throw new Error("not used");
    },
    async validate() {
      throw new Error("not used");
    },
    async build() {
      throw new Error("not used");
    },
    async pack() {
      return { text: "legacy" };
    },
  };
  const runtime = createSemanticPreflightRuntime({
    workspace: {
      async detect(cwd) {
        return {
          cwd,
          workspaceRoot: "/workspace",
          workspaceRefMode: "strict",
          currentRepoPath: "/workspace/repo",
          currentRepoDetectedFromGit: true,
          currentRepoHasOntology: true,
          currentRepoKind: "repo",
          currentCompany: "softwareco",
        };
      },
      async resolveTarget() {
        return {
          scope: "repo",
          repoPath: "/workspace/repo",
          repoKind: "repo",
          workspaceRoot: "/workspace",
          workspaceRefMode: "strict",
          reasons: ["test"],
          externalToCurrentRepo: false,
        };
      },
    },
    legacyRocs,
    async prepare() {
      return {
        location: {} as never,
        manifest: {} as never,
        cacheRoot: "/private/cache",
        published: false,
      };
    },
    async activate() {
      return {
        descriptor: { manifestDigest: digest } as never,
        port: {
          developmentDescriptor: { manifestDigest: digest } as never,
          async discover() {
            return { invocation: "unavailable", message: "test unavailable" };
          },
          async boundPack() {
            throw new Error("not used");
          },
        },
      };
    },
  });
  runtime.register({
    registerCommand(name: string, definition: { handler: Command }) {
      commands.set(name, definition.handler);
    },
    on(name: string, event: Event) {
      events.set(name, [...(events.get(name) ?? []), event]);
    },
  } as never);
  const emit = async (name: string, event: Record<string, unknown> = {}) =>
    Promise.all([...(events.get(name) ?? [])].map((handler) => handler(event, ctx)));
  return { runtime, ctx, notifications, commands, events, emit };
}

async function command(h: Awaited<ReturnType<typeof harness>>, action: string): Promise<string> {
  await h.commands.get("ontology-preflight")?.(action, h.ctx);
  return h.notifications.at(-1) ?? "";
}

test("ready registration is capability-gated, structural, and exactly once", async () => {
  const h = await harness(false);
  assert.equal(h.events.get("before_agent_start")?.length, 1);
  assert.equal(h.events.has("agent_prompt_ready"), false);
  await h.emit("session_start", { reason: "startup" });
  assert.equal(h.events.has("agent_prompt_ready"), false);
  h.ctx.hostCapabilities = host(true);
  await h.emit("session_start", { reason: "new" });
  assert.equal(h.events.get("agent_prompt_ready")?.length, 1);
  await h.emit("session_start", { reason: "resume" });
  assert.equal(h.events.get("agent_prompt_ready")?.length, 1);
});

test("literal readback implements unsupported, disabled, none, prepared, match, and mismatch", async () => {
  const unsupported = await harness(false);
  assert.equal(
    await command(unsupported, "observation"),
    "semantic-preflight-observation protocol=pi-ontology-workflows-agent-prompt-observation-v0-r2 state=unsupported-host",
  );

  const h = await harness(true);
  await h.emit("session_start", { reason: "startup" });
  assert.equal(
    await command(h, "observation"),
    "semantic-preflight-observation protocol=pi-ontology-workflows-agent-prompt-observation-v0-r2 state=disabled",
  );
  await command(h, "enable-development");
  assert.equal(
    await command(h, "observation"),
    "semantic-preflight-observation protocol=pi-ontology-workflows-agent-prompt-observation-v0-r2 state=enabled outcome=none",
  );

  const secretToken = "PRIVATE-TOKEN-DO-NOT-LEAK";
  const secretPrompt = "SECRET-PROMPT-DO-NOT-LEAK";
  const [preparedResult] = await h.emit("before_agent_start", {
    type: "before_agent_start",
    promptRunToken: secretToken,
    prompt: "agent",
    systemPrompt: secretPrompt,
  });
  assert.equal(
    await command(h, "observation"),
    "semantic-preflight-observation protocol=pi-ontology-workflows-agent-prompt-observation-v0-r2 state=prepared claim=pre-return-only",
  );
  const assigned = (preparedResult as { systemPrompt: string }).systemPrompt;
  await h.emit("agent_prompt_ready", {
    type: "agent_prompt_ready",
    promptRunToken: secretToken,
    systemPrompt: assigned,
  });
  assert.equal(
    await command(h, "observation"),
    "semantic-preflight-observation protocol=pi-ontology-workflows-agent-prompt-observation-v0-r2 state=terminal outcome=exact_match claim=pi-agent-state-only provider=false model=false",
  );

  const [mismatchResult] = await h.emit("before_agent_start", {
    type: "before_agent_start",
    promptRunToken: "PRIVATE-MISMATCH-TOKEN",
    prompt: "agent mismatch",
    systemPrompt: "OTHER-SECRET-PROMPT",
  });
  await h.emit("agent_prompt_ready", {
    type: "agent_prompt_ready",
    promptRunToken: "PRIVATE-MISMATCH-TOKEN",
    systemPrompt: `${(mismatchResult as { systemPrompt: string }).systemPrompt}\nlater`,
  });
  assert.equal(
    await command(h, "observation"),
    "semantic-preflight-observation protocol=pi-ontology-workflows-agent-prompt-observation-v0-r2 state=terminal outcome=mismatch claim=pi-agent-state-only contribution_survival=unknown provider=false model=false",
  );
  const readbacks = h.notifications.filter((text) =>
    text.startsWith("semantic-preflight-observation "),
  );
  assert.equal(
    readbacks.some((text) =>
      /PRIVATE|SECRET-PROMPT|sha256:|digest|length|prepared_prompt/i.test(text),
    ),
    false,
  );
});

test("observation readback is silent and state-preserving in RPC, json, and print modes", async () => {
  for (const mode of ["rpc", "json", "print"]) {
    const h = await harness(true);
    await h.emit("session_start", { reason: "startup" });
    await command(h, "enable-development");
    await h.emit("before_agent_start", {
      promptRunToken: `private-${mode}`,
      prompt: `prompt-${mode}`,
      systemPrompt: `SECRET-${mode}`,
    });
    const prior = h.runtime.latestAgentPromptObservation();
    assert.ok(prior);
    const sessionEntries: unknown[] = [];
    const evidenceEntries: unknown[] = [];
    const logEntries: unknown[] = [];
    Object.assign(h.ctx, {
      sessionManager: { appendEntry: (entry: unknown) => sessionEntries.push(entry) },
      evidence: { append: (entry: unknown) => evidenceEntries.push(entry) },
      log: (...values: unknown[]) => logEntries.push(values),
    });
    h.ctx.mode = mode;
    const notificationCount = h.notifications.length;
    const consoleEntries: string[] = [];
    const original = {
      error: console.error,
      info: console.info,
      log: console.log,
      warn: console.warn,
    };
    const capture = (...values: unknown[]) => consoleEntries.push(values.map(String).join(" "));
    console.error = capture;
    console.info = capture;
    console.log = capture;
    console.warn = capture;
    try {
      await h.commands.get("ontology-preflight")?.("observation", h.ctx);
    } finally {
      console.error = original.error;
      console.info = original.info;
      console.log = original.log;
      console.warn = original.warn;
    }
    assert.equal(h.notifications.length, notificationCount, mode);
    assert.deepEqual(consoleEntries, [], mode);
    assert.deepEqual(logEntries, [], mode);
    assert.deepEqual(sessionEntries, [], mode);
    assert.deepEqual(evidenceEntries, [], mode);
    assert.equal(h.runtime.latestAgentPromptObservation(), prior, mode);
  }
});

test("unsupported-host precedence clears a prior terminal observation", async () => {
  const h = await harness(true);
  await h.emit("session_start", { reason: "startup" });
  await command(h, "enable-development");
  const [result] = await h.emit("before_agent_start", {
    promptRunToken: "private",
    prompt: "agent",
    systemPrompt: "BASE",
  });
  await h.emit("agent_prompt_ready", {
    promptRunToken: "private",
    systemPrompt: (result as { systemPrompt: string }).systemPrompt,
  });
  assert.equal(h.runtime.latestAgentPromptObservation()?.phase, "terminal");
  h.ctx.hostCapabilities = host(false);
  assert.match(await command(h, "observation"), /state=unsupported-host$/);
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);
});

test("AST proves runtime delegation and capability-gated exactly-once ready registration", async () => {
  const runtime = ts.createSourceFile(
    "preflight-runtime.ts",
    await readFile(new URL("../src/semantic/preflight-runtime.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const state = ts.createSourceFile(
    "agent-prompt-observation-state.ts",
    await readFile(
      new URL("../src/semantic/agent-prompt-observation-state.ts", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(runtime.getText().match(/agentPromptObservation\.registerReady/g)?.length, 1);
  const coordinator = state.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "createAgentPromptObservationRuntime",
  );
  assert.ok(coordinator);
  const text = coordinator.getText(state);
  const guard = text.indexOf(
    "if (readyRegistered || !supportsAgentPromptObservation(host)) return",
  );
  const markRegistered = text.indexOf("readyRegistered = true");
  const subscription = text.indexOf("registerAgentPromptReady(pi, state)");
  assert.ok(guard >= 0 && guard < markRegistered && markRegistered < subscription);

  const readySubscriptions = state.statements.flatMap(
    (statement) => statement.getText(state).match(/"agent_prompt_ready"/g) ?? [],
  ).length;
  assert.equal(readySubscriptions, 3); // interface type, structural on signature, and call argument
});
