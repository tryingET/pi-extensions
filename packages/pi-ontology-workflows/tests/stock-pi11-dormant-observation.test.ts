// AK6847: on the stock Pi 1.1 host (no immutable hostCapabilities), the accepted Decision 89/98
// development observers stay inactive and fail closed; SYSTEM bytes stay identical across prompts.
// Capable-fork behavior remains covered by the Decision 89/98 tests with simulated capabilities.
// If a future host advertises the capabilities, this test fails so the disposition is revisited
// (owner disposition 2026-10-10; architecture history: core/rocs-cli Decision 89/98 ADRs).
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { DISABLED_PREFLIGHT_HINT } from "../src/semantic/preflight-runtime-state.ts";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const hostVersion = JSON.parse(
  readFileSync(
    new URL("../package.json", import.meta.resolve("@earendil-works/pi-coding-agent")),
    "utf8",
  ),
).version;

const subprocesses: string[] = [];
for (const name of ["spawn", "execFile", "exec", "fork", "spawnSync", "execFileSync", "execSync"]) {
  const module = childProcess as unknown as Record<string, (...args: unknown[]) => unknown>;
  const original = module[name];
  module[name] = function (this: unknown, ...args: unknown[]) {
    subprocesses.push(`${name}:${String(args[0])}`);
    return original.apply(this, args);
  };
}
syncBuiltinESMExports();

type Message = { role: string; content?: unknown; customType?: string };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("stock Pi 1.1 keeps the Decision 89/98 development observers inactive with a stable SYSTEM", async (t) => {
  assert.equal(hostVersion, "1.1.0");
  const scratch = mkdtempSync(path.join(tmpdir(), "ak6847-stock-pi11-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const cwd = scratch;
  const agentDir = path.join(scratch, "agent");
  const settingsManager = SettingsManager.inMemory({});
  let observedCtx: Record<string, unknown> | undefined;
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [PACKAGE_ROOT],
    noSkills: true,
    noPromptTemplates: true,
    noContextFiles: true,
    extensionFactories: [
      (pi) => {
        pi.on("session_start", (_event, ctx) => {
          observedCtx = ctx as unknown as Record<string, unknown>;
        });
      },
    ],
  });
  await resourceLoader.reload();
  assert.ok(
    resourceLoader
      .getExtensions()
      .extensions.some((extension) => extension.path.endsWith("ontology-workflows.ts")),
  );

  const requests: Message[][] = [];
  const faux = fauxProvider({ provider: "ak6847-faux", models: [{ id: "faux-1" }] });
  faux.setResponses(
    Array.from({ length: 32 }, () => (context: { messages: unknown[] }) => {
      requests.push(JSON.parse(JSON.stringify(context.messages)));
      return fauxAssistantMessage("ok");
    }),
  );
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(scratch, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    model: faux.getModel(),
    modelRuntime,
    settingsManager,
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "builtin",
  });
  t.after(() => session.dispose());

  const notices: string[] = [];
  let confirms = 0;
  const ui = new Proxy(
    {
      notify: (message: string) => notices.push(message),
      setStatus: () => undefined,
      confirm: async () => {
        confirms++;
        return true;
      },
    } as Record<string, unknown>,
    { get: (target, key) => (key in target ? target[key as string] : () => undefined) },
  );
  await session.bindExtensions({ uiContext: ui as never, mode: "tui" });

  // Real TUI-bound host context: no capability object, so the grant can never be admitted.
  assert.equal(observedCtx?.mode, "tui");
  assert.equal("hostCapabilities" in (observedCtx ?? {}), false);

  const before = subprocesses.length;
  for (const action of ["status", "observation", "enable-development", "status"])
    await session.prompt(`/ontology-preflight ${action}`);
  assert.equal(confirms, 0, "no confirmation, preparation, cache write, or build may start");
  assert.deepEqual(notices, [
    "Semantic preflight unavailable: immutable host capabilities unavailable.",
    "semantic-preflight-observation protocol=pi-ontology-workflows-agent-prompt-observation-v0-r2 state=unsupported-host",
    "Development semantic preflight not enabled: immutable host capabilities unavailable.",
    "Semantic preflight unavailable: immutable host capabilities unavailable.",
  ]);
  assert.equal(requests.length, 0);

  const prompts = [
    "ordinary task one",
    "explain the ontology concept and relation",
    "ordinary task two",
    "change the system4d invariant meaning",
    "semantic bridge mapping review",
    "ordinary task one",
  ];
  for (const prompt of prompts) await session.prompt(prompt);
  assert.equal(subprocesses.length - before, 0, subprocesses.slice(before).join("\n"));
  assert.equal(requests.length, prompts.length);

  const systems = requests.map((messages) => messages.filter((m) => m.role === "system"));
  assert.ok(systems.every((system) => system.length === 1));
  assert.equal(new Set(systems.map(digest)).size, 1, "SYSTEM must be byte-identical every turn");
  const system = JSON.stringify(systems[0]);
  assert.match(system, /Ontology workflow routing directives:/);
  assert.doesNotMatch(system, /pi-ontology-workflows:semantic-preflight\.v0/);

  // History is append-only: each request starts with the previous request's messages.
  for (let index = 1; index < requests.length; index++)
    assert.deepEqual(requests[index].slice(0, requests[index - 1].length), requests[index - 1]);
  // Three keyword prompts, one provider-visible advisory note.
  const finalHints = (requests.at(-1) ?? []).filter((m) =>
    JSON.stringify(m.content ?? "").includes("only when the SYSTEM prompt sent with it carries"),
  );
  assert.equal(finalHints.length, 1);
  assert.ok(
    JSON.stringify(finalHints[0].content).includes(
      JSON.stringify(DISABLED_PREFLIGHT_HINT).slice(1, -1),
    ),
  );
});
