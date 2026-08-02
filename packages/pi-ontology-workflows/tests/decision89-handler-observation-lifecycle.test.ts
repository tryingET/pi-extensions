import assert from "node:assert/strict";
import test from "node:test";
import type { RocsPort } from "../src/ports/rocs-port.ts";
import {
  buildHandlerObservationRecord,
  type ObservationBuilder,
  type PromptAppendProducer,
} from "../src/semantic/handler-observation.ts";
import {
  createSemanticPreflightRuntime,
  type PiHostCapabilities,
  type RuntimeContext,
  type SemanticPreflightRuntimeDeps,
} from "../src/semantic/preflight-runtime.ts";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const OBSERVATION_CAPABILITY = "prompt.agent-state.observation.v1";

function host(observation = true): PiHostCapabilities {
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
      ...(observation ? [OBSERVATION_CAPABILITY] : []),
    ]),
  });
}

type Command = (args: string, ctx: RuntimeContext) => Promise<void>;
type Event = (event: Record<string, unknown>, ctx: RuntimeContext) => unknown | Promise<unknown>;

interface Harness {
  runtime: ReturnType<typeof createSemanticPreflightRuntime>;
  ctx: RuntimeContext;
  commands: Map<string, Command>;
  events: Map<string, Event[]>;
  setNow(value: number): void;
  emit(name: string, event?: Record<string, unknown>): Promise<unknown[]>;
  enable(): Promise<void>;
}

async function harness(
  options: {
    observation?: boolean;
    producer?: PromptAppendProducer;
    builder?: ObservationBuilder;
    discover?: () => Promise<unknown>;
  } = {},
): Promise<Harness> {
  let now = 1_000;
  const commands = new Map<string, Command>();
  const events = new Map<string, Event[]>();
  const ctx: RuntimeContext = {
    cwd: "/workspace/repo",
    mode: "tui",
    hasUI: true,
    hostCapabilities: host(options.observation ?? true),
    isIdle: () => true,
    ui: {
      async confirm() {
        return true;
      },
      notify() {},
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
  const deps: SemanticPreflightRuntimeDeps = {
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
    now: () => now,
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
        descriptor: { manifestDigest: digest("a") } as never,
        port: {
          developmentDescriptor: { manifestDigest: digest("a") } as never,
          discover: (options.discover ?? (async () => ({ invocation: "unavailable" }))) as never,
          async boundPack() {
            throw new Error("not used");
          },
        },
      };
    },
    promptAppendProducer: options.producer,
    observationBuilder: options.builder,
  };
  const runtime = createSemanticPreflightRuntime(deps);
  runtime.register({
    registerCommand(name: string, definition: { handler: Command }) {
      commands.set(name, definition.handler);
    },
    on(name: string, event: Event) {
      events.set(name, [...(events.get(name) ?? []), event]);
    },
  } as never);
  const result: Harness = {
    runtime,
    ctx,
    commands,
    events,
    setNow(value) {
      now = value;
    },
    async emit(name, event = {}) {
      return Promise.all([...(events.get(name) ?? [])].map((handler) => handler(event, ctx)));
    },
    async enable() {
      await result.emit("session_start", { reason: "startup" });
      await Promise.resolve();
      await commands.get("ontology-preflight")?.("enable-development", ctx);
    },
  };
  return result;
}

function returnedPrompt(value: unknown): string {
  assert.ok(typeof value === "object" && value !== null);
  const prompt = (value as { systemPrompt?: unknown }).systemPrompt;
  assert.equal(typeof prompt, "string");
  return prompt as string;
}

test("Decision 89 exact append preparation is rederived into the correlated prepared record", async () => {
  const h = await harness();
  await h.enable();
  const [result] = await h.emit("before_agent_start", {
    type: "before_agent_start",
    promptRunToken: "private-run",
    prompt: "agent",
    systemPrompt: "BASE",
  });
  const output = returnedPrompt(result);
  assert.ok(output.startsWith("BASE\n\n<!--"));
  const predecessor = h.runtime.latestObservation();
  assert.ok(predecessor);
  assert.equal(predecessor.prepared_return_prompt_byte_length, Buffer.byteLength(output));
  const record = h.runtime.latestAgentPromptObservation();
  assert.equal(record?.phase, "prepared");
  assert.equal(record?.observation_outcome, "package_handler_return_prepared");
  assert.match(record?.predecessor_record_digest ?? "", /^sha256:[0-9a-f]{64}$/);
  assert.equal(record?.prepared_prompt_byte_length, Buffer.byteLength(output));
});

test("non-append output forwards unchanged while observer failure clears the latest slot", async () => {
  let replacement = false;
  const h = await harness({
    async producer(input, block) {
      if (replacement) return { contribution: "x", output: "replacement" };
      const contribution = `\n\n${block}`;
      return { contribution, output: input + contribution };
    },
  });
  await h.enable();
  await h.emit("before_agent_start", {
    promptRunToken: "seed",
    prompt: "agent",
    systemPrompt: "BASE",
  });
  assert.ok(h.runtime.latestAgentPromptObservation());
  replacement = true;
  const [result] = await h.emit("before_agent_start", {
    promptRunToken: "replace",
    prompt: "agent two",
    systemPrompt: "BASE",
  });
  assert.equal(returnedPrompt(result), "replacement");
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);
});

test("producer rejection and adversarial malformed shapes clear without rewriting host errors", async () => {
  const failure = new Error("producer failed");
  let produced: unknown;
  let useProduced = false;
  let reject = false;
  let accessorReads = 0;
  const accessor = Object.defineProperties(
    {},
    {
      contribution: {
        enumerable: true,
        get() {
          accessorReads++;
          return "x";
        },
      },
      output: { enumerable: true, value: "BASE-x" },
    },
  );
  const throwingProxy = new Proxy(
    { contribution: "x", output: "BASE-x" },
    {
      ownKeys() {
        throw new Error("proxy inspection failed");
      },
    },
  );
  const h = await harness({
    async producer(input, block) {
      if (reject) throw failure;
      if (useProduced) return produced;
      const contribution = `\n\n${block}`;
      return { contribution, output: input + contribution };
    },
  });
  await h.enable();
  const seed = async (suffix: string) => {
    produced = undefined;
    useProduced = false;
    await h.emit("before_agent_start", {
      promptRunToken: `seed-${suffix}`,
      prompt: `seed ${suffix}`,
      systemPrompt: "BASE",
    });
    assert.ok(h.runtime.latestAgentPromptObservation());
  };
  await seed("reject");
  reject = true;
  await assert.rejects(
    h.emit("before_agent_start", {
      promptRunToken: "reject",
      prompt: "agent reject",
      systemPrompt: "BASE",
    }),
    (error: unknown) => error === failure,
  );
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);
  reject = false;

  const malformed = [
    { label: "undefined", value: undefined },
    { label: "null", value: null },
    { label: "array", value: ["x", "BASE-x"] },
    { label: "missing", value: { contribution: "x" } },
    { label: "extra", value: { contribution: "x", output: "BASE-x", extra: true } },
    { label: "non-string contribution", value: { contribution: 1, output: "BASE1" } },
    { label: "non-string output", value: { contribution: "x", output: 1 } },
    { label: "accessor", value: accessor },
    { label: "throwing proxy", value: throwingProxy },
  ];
  for (const testCase of malformed) {
    await seed(testCase.label);
    produced = testCase.value;
    useProduced = true;
    let observedError: unknown;
    await assert.rejects(
      h
        .emit("before_agent_start", {
          promptRunToken: "PRIVATE-MALFORMED-TOKEN",
          prompt: "malformed producer",
          systemPrompt: "SECRET-MALFORMED-PROMPT",
        })
        .catch((error) => {
          observedError = error;
          throw error;
        }),
      TypeError,
      testCase.label,
    );
    const serializedError = String(observedError);
    assert.doesNotMatch(
      serializedError,
      /PRIVATE-MALFORMED-TOKEN|SECRET-MALFORMED-PROMPT|sha256:|digest|byte.?length/i,
    );
    assert.equal(h.runtime.latestAgentPromptObservation(), undefined, testCase.label);
  }
  assert.equal(accessorReads, 0);
});

test("observer builder failure forwards the exact prepared result with a cleared slot", async () => {
  let failBuilder = false;
  const h = await harness({
    builder(value) {
      if (failBuilder) throw new Error("observer failed");
      return buildHandlerObservationRecord(value);
    },
  });
  await h.enable();
  await h.emit("before_agent_start", {
    promptRunToken: "seed",
    prompt: "seed",
    systemPrompt: "SEED",
  });
  assert.ok(h.runtime.latestAgentPromptObservation());
  failBuilder = true;
  const [result] = await h.emit("before_agent_start", {
    promptRunToken: "builder-failure",
    prompt: "builder failure",
    systemPrompt: "EXACT-PREPARED-BASE",
  });
  const output = returnedPrompt(result);
  assert.ok(output.startsWith("EXACT-PREPARED-BASE\n\n<!--"));
  assert.equal(result && (result as { systemPrompt: string }).systemPrompt, output);
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);
});

test("reset, shutdown, disable, expiry, grant replacement, and mode drift clear all observation state", async () => {
  const populate = async (h: Harness, token: string) => {
    await h.emit("before_agent_start", {
      promptRunToken: token,
      prompt: `agent ${token}`,
      systemPrompt: "BASE",
    });
    assert.ok(h.runtime.latestAgentPromptObservation());
  };
  const h = await harness();
  await h.enable();
  await populate(h, "reset");
  await h.emit("session_start", { reason: "new" });
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);
  await h.commands.get("ontology-preflight")?.("enable-development", h.ctx);
  await populate(h, "shutdown");
  await h.emit("session_shutdown", { reason: "shutdown" });
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);

  const disabled = await harness();
  await disabled.enable();
  await populate(disabled, "disable");
  await disabled.commands.get("ontology-preflight")?.("disable", disabled.ctx);
  assert.equal(disabled.runtime.latestAgentPromptObservation(), undefined);

  const expired = await harness();
  await expired.enable();
  await populate(expired, "expiry");
  expired.setNow(601_000);
  await expired.commands.get("ontology-preflight")?.("observation", expired.ctx);
  assert.equal(expired.runtime.latestAgentPromptObservation(), undefined);

  const replaced = await harness();
  await replaced.enable();
  await populate(replaced, "replacement");
  await replaced.commands.get("ontology-preflight")?.("enable-development", replaced.ctx);
  assert.equal(replaced.runtime.latestAgentPromptObservation(), undefined);

  const drifted = await harness();
  await drifted.enable();
  await populate(drifted, "mode");
  drifted.ctx.mode = "rpc";
  await drifted.emit("before_agent_start", {
    promptRunToken: "later",
    prompt: "later",
    systemPrompt: "BASE",
  });
  assert.equal(drifted.runtime.latestAgentPromptObservation(), undefined);
});

test("unsupported hosts preserve ordinary semantic-preflight append behavior", async () => {
  const h = await harness({ observation: false });
  await h.enable();
  const [result] = await h.emit("before_agent_start", {
    prompt: "agent",
    systemPrompt: "BASE",
  });
  assert.ok(returnedPrompt(result).startsWith("BASE\n\n<!--"));
  assert.equal(h.runtime.snapshot().grant, true);
  assert.ok(h.runtime.latestObservation());
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);
  assert.equal(h.events.has("agent_prompt_ready"), false);
});

test("noncanonical builder output cannot seed either observation slot", async () => {
  const h = await harness({
    builder(value) {
      const canonical = buildHandlerObservationRecord(value);
      return Object.freeze({ ...canonical, record_digest: digest("f") });
    },
  });
  await h.enable();
  const [result] = await h.emit("before_agent_start", {
    promptRunToken: "private-forged",
    prompt: "forged builder",
    systemPrompt: "BASE",
  });
  assert.ok(returnedPrompt(result).startsWith("BASE\n\n<!--"));
  assert.equal(h.runtime.latestObservation(), undefined);
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);
});

test("builder lifecycle reentrancy is rejected before either slot is published", async () => {
  let reset!: () => void;
  let resetCompletion: Promise<unknown[]> | undefined;
  const h = await harness({
    builder(value) {
      reset();
      return buildHandlerObservationRecord(value);
    },
  });
  reset = () => {
    resetCompletion = h.emit("session_start", { reason: "reentrant-reset" });
  };
  await h.enable();
  const [result] = await h.emit("before_agent_start", {
    promptRunToken: "private-reentrant",
    prompt: "reentrant builder",
    systemPrompt: "BASE",
  });
  await resetCompletion;
  assert.equal(result, undefined);
  assert.equal(h.runtime.latestObservation(), undefined);
  assert.equal(h.runtime.latestAgentPromptObservation(), undefined);
  assert.equal(h.runtime.snapshot().grant, false);
});

test("late old success after reset and a new grant cannot erase the newer observation", async () => {
  let releaseOld!: () => void;
  let oldStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  const h = await harness({
    async producer(input, block) {
      const contribution = `\n\n${block}`;
      if (input === "OLD")
        await new Promise<void>((resolve) => {
          releaseOld = resolve;
          oldStarted();
        });
      return { contribution, output: input + contribution };
    },
  });
  await h.enable();
  const old = h.emit("before_agent_start", {
    promptRunToken: "old",
    prompt: "old request",
    systemPrompt: "OLD",
  });
  await started;
  await h.emit("session_start", { reason: "new" });
  await h.commands.get("ontology-preflight")?.("enable-development", h.ctx);
  await h.emit("before_agent_start", {
    promptRunToken: "new",
    prompt: "new request",
    systemPrompt: "NEW",
  });
  const newer = h.runtime.latestAgentPromptObservation();
  assert.ok(newer);
  releaseOld();
  assert.deepEqual(await old, [undefined]);
  assert.equal(h.runtime.latestAgentPromptObservation(), newer);
});

test("late old rejection after reset and a new grant cannot clear the newer observation", async () => {
  const failure = new Error("late old rejection");
  let rejectOld!: (error: Error) => void;
  let oldStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  const h = await harness({
    async producer(input, block) {
      if (input === "OLD")
        return new Promise<never>((_resolve, reject) => {
          rejectOld = reject;
          oldStarted();
        });
      const contribution = `\n\n${block}`;
      return { contribution, output: input + contribution };
    },
  });
  await h.enable();
  const old = h.emit("before_agent_start", {
    promptRunToken: "old",
    prompt: "old request",
    systemPrompt: "OLD",
  });
  await started;
  await h.emit("session_start", { reason: "new" });
  await h.commands.get("ontology-preflight")?.("enable-development", h.ctx);
  await h.emit("before_agent_start", {
    promptRunToken: "new",
    prompt: "new request",
    systemPrompt: "NEW",
  });
  const newer = h.runtime.latestAgentPromptObservation();
  assert.ok(newer);
  rejectOld(failure);
  await assert.rejects(old, (error: unknown) => error === failure);
  assert.equal(h.runtime.latestAgentPromptObservation(), newer);
});

test("late earlier distinct-request completion cannot overwrite or clear the newer request", async () => {
  const releases = new Map<string, () => void>();
  const h = await harness({
    async producer(input, block) {
      await new Promise<void>((resolve) => releases.set(input, resolve));
      const contribution = `\n\n${block}`;
      return { contribution, output: input + contribution };
    },
  });
  await h.enable();
  const first = h.emit("before_agent_start", {
    promptRunToken: "first",
    prompt: "first distinct request",
    systemPrompt: "FIRST",
  });
  const second = h.emit("before_agent_start", {
    promptRunToken: "second",
    prompt: "second distinct request",
    systemPrompt: "SECOND",
  });
  while (releases.size < 2) await Promise.resolve();
  releases.get("SECOND")?.();
  await second;
  const newer = h.runtime.latestAgentPromptObservation();
  assert.ok(newer);
  releases.get("FIRST")?.();
  assert.deepEqual(await first, [undefined]);
  assert.equal(h.runtime.latestAgentPromptObservation(), newer);
});

test("same-key completion order makes the last completed preparation the latest slot", async () => {
  const releases = new Map<string, () => void>();
  const h = await harness({
    async producer(input, block) {
      await new Promise<void>((resolve) => releases.set(input, resolve));
      const contribution = `\n\n${block}`;
      return { contribution, output: input + contribution };
    },
  });
  await h.enable();
  const first = h.emit("before_agent_start", {
    promptRunToken: "first",
    prompt: "same",
    systemPrompt: "FIRST",
  });
  const second = h.emit("before_agent_start", {
    promptRunToken: "second",
    prompt: "same",
    systemPrompt: "SECOND",
  });
  while (releases.size < 2) await Promise.resolve();
  releases.get("SECOND")?.();
  await second;
  const secondRecord = h.runtime.latestAgentPromptObservation();
  assert.equal(
    secondRecord?.prepared_prompt_byte_length,
    Buffer.byteLength(returnedPrompt((await second)[0])),
  );
  releases.get("FIRST")?.();
  await first;
  const latest = h.runtime.latestAgentPromptObservation();
  assert.notEqual(latest, secondRecord);
  assert.equal(
    latest?.prepared_prompt_byte_length,
    Buffer.byteLength(returnedPrompt((await first)[0])),
  );
});
