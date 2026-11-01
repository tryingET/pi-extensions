// Pi 1.2 made BeforeAgentStartEvent a union: a run started by pi.sendMessage(..., { triggerTurn: true })
// carries messageType "custom" and a message, and no prompt. Semantic preflight routes user prompts, so a
// custom run must neither reach discovery nor leave a prompt binding, whatever the grant state (AK7963).
import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedOntologyTarget } from "../src/core/contracts.ts";
import type { RocsDevelopmentPort, RocsPort } from "../src/ports/rocs-port.ts";
import {
  createSemanticPreflightRuntime,
  type PiHostCapabilities,
  type RuntimeContext,
} from "../src/semantic/preflight-runtime.ts";
import { createTestDevelopmentDescriptor } from "./helpers.ts";

const descriptorPromise = createTestDevelopmentDescriptor();
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const target: ResolvedOntologyTarget = {
  scope: "repo",
  repoPath: "/workspace/repo",
  repoKind: "repo",
  workspaceRoot: "/workspace",
  workspaceRefMode: "strict",
  reasons: ["test"],
  externalToCurrentRepo: false,
};
const hostCapabilities: PiHostCapabilities = Object.freeze({
  host_package: "@earendil-works/pi-coding-agent",
  host_version: "1.4.0",
  extension_api_version: "1.0.0",
  capabilities: Object.freeze([
    "prompt.system.chain.v1",
    "session.lifecycle.reason.v1",
    "ui.mode.v1",
    "ui.confirm.timeout.v1",
    "session.shutdown.v1",
  ]),
});
const discovery = {
  schema: "semantic-discovery-result.v0",
  caller_request_digest: digest("1"),
  corpus_snapshot_digest: digest("2"),
  tool_identity: { digest: digest("3") },
  effective_execution_digest: digest("4"),
  algorithm: {},
  retrieval: "unique_candidate",
  candidates: [
    {
      rank: 1,
      ont_id: "core.Agent",
      kind: "concept",
      layer: "core",
      score: 400,
      matched_query_tokens: ["agent"],
      evidence: [{ field: "label", rule: "token_exact", query_term: "agent" }],
      document_digest: digest("5"),
    },
  ],
  effective_limits: {},
  truncated: false,
  result_digest: digest("6"),
};
// The shape emitBeforeAgentStart builds for an idle custom-message run: there is no prompt key at all.
const customRun = {
  messageType: "custom",
  message: { role: "custom", customType: "peer", content: "ontology concept", display: true },
  systemPrompt: "BASE",
};

type Handler = (event: Record<string, unknown>, ctx: RuntimeContext) => unknown;

async function enabledHarness() {
  const descriptor = await descriptorPromise;
  const events = new Map<string, Handler[]>();
  const commands = new Map<string, (args: string, ctx: RuntimeContext) => Promise<void>>();
  const notifications: string[] = [];
  const queries: unknown[] = [];
  let timestamp = 1_000;
  const ctx: RuntimeContext = {
    cwd: "/workspace/repo",
    mode: "tui",
    hasUI: true,
    hostCapabilities,
    isIdle: () => true,
    ui: {
      confirm: async () => true,
      notify: (message) => notifications.push(message),
      setStatus: () => {},
    },
  };
  const port: RocsDevelopmentPort = {
    developmentDescriptor: descriptor,
    async discover(_repo, query) {
      queries.push(query);
      return { invocation: "ok", result: discovery } as never;
    },
    async boundPack() {
      throw new Error("not used");
    },
  };
  const runtime = createSemanticPreflightRuntime({
    workspace: {
      detect: async (cwd) => ({
        cwd,
        workspaceRoot: "/workspace",
        workspaceRefMode: "strict" as const,
        currentRepoPath: "/workspace/repo",
        currentRepoDetectedFromGit: true,
        currentRepoHasOntology: true,
        currentRepoKind: "repo" as const,
        currentCompany: "softwareco",
      }),
      resolveTarget: async () => target,
    },
    legacyRocs: {} as RocsPort,
    now: () => timestamp,
    prepare: async () => ({
      location: {} as never,
      manifest: {} as never,
      cacheRoot: "/home/test/.cache/pi-ontology-workflows/extension-cache",
      published: true,
    }),
    activate: async () => ({ descriptor, port }),
  });
  runtime.register({
    registerCommand: (name: string, definition: { handler: never }) =>
      commands.set(name, definition.handler),
    on: (name: string, handler: Handler) =>
      events.set(name, [...(events.get(name) ?? []), handler]),
  } as never);
  const emit = (name: string, event: Record<string, unknown>) =>
    Promise.all((events.get(name) ?? []).map((handler) => handler(event, ctx)));
  await emit("session_start", { reason: "startup" });
  await Promise.resolve();
  await commands.get("ontology-preflight")?.("enable-development", ctx);
  assert.equal(runtime.snapshot().grant, true);
  return {
    runtime,
    emit,
    notifications,
    queries,
    expire: () => {
      timestamp = 601_000;
    },
  };
}

test("Given a live grant, when a custom-message run starts, then preflight stays out of it", async () => {
  const h = await enabledHarness();
  const [result] = await h.emit("before_agent_start", customRun);
  assert.equal(result, undefined);
  assert.deepEqual(h.queries, []);
  assert.equal(h.runtime.snapshot().promptBindings, 0);
  assert.equal(h.runtime.snapshot().grant, true);
});

test("Given an expired grant, when a custom-message run starts, then the grant is still withdrawn", async () => {
  const h = await enabledHarness();
  h.expire();
  await h.emit("before_agent_start", customRun);
  assert.equal(h.runtime.snapshot().grant, false);
  assert.deepEqual(h.queries, []);
  assert.match(h.notifications.at(-1) ?? "", /continuing without semantic context/);
});

test("Given a user-prompt run from a 1.1 host with no messageType, then preflight still runs", async () => {
  const h = await enabledHarness();
  await h.emit("before_agent_start", { prompt: "agent", systemPrompt: "BASE" });
  assert.deepEqual(h.queries, ["agent"]);
});

test("Given an earlier user run, when a custom run starts, then its observation is not reported as latest", async () => {
  const h = await enabledHarness();
  await h.emit("before_agent_start", {
    messageType: "user",
    prompt: "agent",
    systemPrompt: "BASE",
  });
  assert.notEqual(h.runtime.latestObservation(), undefined);
  await h.emit("before_agent_start", customRun);
  assert.equal(h.runtime.latestObservation(), undefined);
});
