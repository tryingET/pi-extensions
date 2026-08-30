// ---
// summary: verifies startup-context applicability, packet rendering, read-first hints, refresh aborts, and extension hooks.
// read_when:
//   - changing startup-context collection or user-visible packet semantics.
// ---
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import societyStartupContextExtension, {
  buildStartupContextPacket,
  collectReadFirstHints,
  createFastStartupContextPacket,
  isInsideAiSocietyPath,
  renderStartupContextPacket,
} from "../extensions/society-context.ts";

test("detects paths under ~/ai-society without treating siblings as applicable", () => {
  assert.equal(
    isInsideAiSocietyPath("/tmp/home/ai-society/softwareco/owned/pi-extensions", "/tmp/home"),
    true,
  );
  assert.equal(isInsideAiSocietyPath("/tmp/home/ai-society-sibling/repo", "/tmp/home"), false);
});

test("renders not-applicable startup packet without AK/git probes", () => {
  const rendered = renderStartupContextPacket({
    applicable: false,
    disabled: false,
    packetTier: "fast",
    fullRefreshStatus: "not_applicable",
    capturedAt: "2026-04-24T00:00:00.000Z",
    cwd: "/tmp/outside",
    aiSocietyRoot: "/tmp/home/ai-society",
    authoritativeRuntime: [],
    readyTasks: [],
    activeTasks: [],
    blockedTasks: [],
    activeDecisions: [],
    decisionPassports: [],
    readFirstHints: [],
    capabilityHints: [],
    recommendedNext: [
      "No AI Society startup context was injected because cwd is outside ~/ai-society.",
    ],
    warnings: [],
  });

  assert.match(rendered, /not applicable outside ~\/ai-society/);
  assert.match(rendered, /no AK, git, docs, task, decision, projection, receipt, evidence/);
});

test("renders compact semantic summary instead of raw machine JSON", () => {
  const rendered = renderStartupContextPacket({
    applicable: true,
    disabled: false,
    packetTier: "full",
    fullRefreshStatus: "complete",
    capturedAt: "2026-04-24T00:00:00.000Z",
    cwd: "/home/me/ai-society/softwareco/owned/pi-extensions/packages/example",
    aiSocietyRoot: "/home/me/ai-society",
    repoRoot: "/home/me/ai-society/softwareco/owned/pi-extensions",
    identity: {
      company: "softwareco",
      lane: "owned",
      repo: "pi-extensions",
      relativePath: "softwareco/owned/pi-extensions",
    },
    authoritativeRuntime: ["AK is canonical runtime authority"],
    git: {
      available: true,
      dirty: true,
      changedCount: 2,
      sample: [" M README.md", "?? packages/example/"],
    },
    ak: {
      executable: "ak",
      machineSurfaces: ["repo.resolve v1", "startup.snapshot v1"],
      runtimeSchemaVersion: 40,
      canonicalRepoPath: "/home/me/ai-society/softwareco/owned/pi-extensions",
      repoRegistered: true,
      repoMetadata: ["company=softwareco", "layer=L2"],
      snapshotGeneratedAt: "2026-04-24T00:00:00.000Z",
      activeDeferralCount: 2,
      expiredLeaseCount: 0,
    },
    direction: {
      exportOk: true,
      checkOk: true,
      nodeCount: 3,
      importedNodeCount: 3,
      parsedNodeCount: 3,
      activeNodes: ["AK.V5.SG01 [active] Keep package-owner boundaries truthful"],
      issues: [],
    },
    readyTasks: [{ id: 42, title: "Bounded task", status: "pending", priority: 2 }],
    readyTaskCount: 1,
    activeTasks: [
      { id: 43, title: "Claimed bounded task", status: "claimed", priority: 1, claimedBy: "pi" },
    ],
    activeTaskCount: 1,
    blockedTasks: [],
    blockedTaskCount: 0,
    activeDecisions: [{ id: 7, title: "Open architecture decision", state: "in_review" }],
    decisionSampleChecked: true,
    decisionPassports: ["#7 Open architecture decision: passport readable"],
    readFirstHints: ["/home/me/ai-society/softwareco/owned/pi-extensions/AGENTS.md"],
    capabilityHints: ["/home/me/ai-society/softwareco/owned/docs/project/repo-capability-map.md"],
    recommendedNext: ["Read the highest-signal local pointer first."],
    warnings: ["ak doctor: timed out"],
  });

  assert.match(rendered, /AI Society startup context \(read-only\)/);
  assert.match(rendered, /dirty \(2 changed paths\)/);
  assert.match(rendered, /ready queue: 1/);
  assert.match(rendered, /active execution tasks: 1/);
  assert.match(rendered, /Claimed bounded task/);
  assert.match(rendered, /Open architecture decision/);
  assert.doesNotMatch(rendered, /"payload"/);
  assert.doesNotMatch(rendered, /"tasks"/);
});

test("read-first hints include package product posture and vision pointers", () => {
  const root = mkdtempSync(join(tmpdir(), "society-context-read-first-"));
  try {
    const repoRoot = join(root, "repo");
    const packageRoot = join(repoRoot, "packages", "example");
    mkdirSync(join(packageRoot, "docs", "project"), { recursive: true });
    writeFileSync(join(repoRoot, "AGENTS.md"), "# repo agents\n", "utf8");
    writeFileSync(join(packageRoot, "AGENTS.md"), "# package agents\n", "utf8");
    writeFileSync(join(packageRoot, "README.md"), "# package readme\n", "utf8");
    writeFileSync(
      join(packageRoot, "docs", "project", "product-posture.md"),
      "# posture\n",
      "utf8",
    );
    writeFileSync(join(packageRoot, "docs", "project", "vision.md"), "# vision\n", "utf8");

    const hints = collectReadFirstHints(repoRoot, packageRoot);

    assert.deepEqual(hints.slice(0, 4), [
      join(packageRoot, "AGENTS.md"),
      join(packageRoot, "README.md"),
      join(packageRoot, "docs", "project", "product-posture.md"),
      join(packageRoot, "docs", "project", "vision.md"),
    ]);
    assert.ok(hints.includes(join(repoRoot, "AGENTS.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("full collector consumes repo.resolve and startup.snapshot without legacy probes", async () => {
  const root = mkdtempSync(join(tmpdir(), "society-context-snapshot-"));
  const repoRoot = join(root, "ai-society", "softwareco", "owned", "demo");
  const packageRoot = join(repoRoot, "packages", "example");
  const binDir = join(root, "bin");
  const executable = join(binDir, "fake-ak");
  const callLog = join(root, "ak-calls.jsonl");
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(repoRoot, "README.md"), "# fixture\n", "utf8");
  execFileSync("git", ["init", "--quiet"], { cwd: repoRoot });
  execFileSync("git", ["add", "README.md"], { cwd: repoRoot });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Startup Context Test",
      "-c",
      "user.email=startup-context@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "test: seed fixture",
    ],
    { cwd: repoRoot },
  );

  writeFileSync(
    executable,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const mode = process.env.PI_SOCIETY_CONTEXT_TEST_MODE || "normal";
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify({ args, akDb: process.env.AK_DB ?? null }) + "\\n");
const emit = (surface, payloadKind, payload) => process.stdout.write(JSON.stringify({ surface, schema_version: 1, emitted_at: "2026-08-30T00:00:00Z", payload_kind: payloadKind, schema_locator: "test", ok: true, payload, error: null }));
if (args[0] === "repo" && args[1] === "resolve") {
  emit("repo.resolve", "repo_resolution", { input: args[2], canonical_path: ${JSON.stringify(repoRoot)}, registered: true, repo: { path: ${JSON.stringify(repoRoot)}, company: "softwareco", archetype: "project", layer: "L2", generated_from: null } });
  if (mode === "failed-repo") process.exitCode = 17;
} else if (args[0] === "startup" && args[1] === "snapshot") {
  const readySample = mode === "malformed" ? "not-an-array" : [{ id: 7, title: "First ready", priority: 1 }, { id: 8, title: "Second ready", priority: 2 }];
  emit("startup.snapshot", "startup_snapshot", { schema_version: 40, repo_scope: ${JSON.stringify(repoRoot)}, repo_count: 1, task_status_counts: { claimed: 1, pending: 2 }, ready_task_count: 2, ready_sample: readySample, active_deferral_count: 4, expired_lease_count: 0, evidence_count: 10, decision_count: 3, generated_at: "2026-08-30T00:00:00Z" });
} else if (args[0] === "direction" && args[1] === "export") {
  emit("direction.export", "direction_graph", { nodes: [{ display_id: "AK.V5.SG01", title: "Bounded direction", state: "active" }] });
} else if (args[0] === "direction" && args[1] === "check") {
  if (mode === "malformed") emit("decision.list", "decision_collection", { decisions: [] });
  else emit("direction.check", "direction_check_report", { ok: true, imported_node_count: 1, parsed_node_count: 1, issues: [] });
} else if (args[0] === "decision" && args[1] === "list") {
  emit("decision.list", "decision_collection", { decisions: [] });
} else {
  console.error("unexpected args: " + args.join(" "));
  process.exit(1);
}
`,
    "utf8",
  );
  chmodSync(executable, 0o755);

  const previous = {
    HOME: process.env.HOME,
    AK_DB: process.env.AK_DB,
    PI_SOCIETY_CONTEXT_AK: process.env.PI_SOCIETY_CONTEXT_AK,
    PI_SOCIETY_CONTEXT_TEST_MODE: process.env.PI_SOCIETY_CONTEXT_TEST_MODE,
  };
  process.env.HOME = root;
  process.env.PI_SOCIETY_CONTEXT_AK = executable;
  delete process.env.AK_DB;
  try {
    const packet = await buildStartupContextPacket(packageRoot);
    const rendered = renderStartupContextPacket(packet);
    const calls = readFileSync(callLog, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { args: string[]; akDb: string | null });

    assert.equal(packet.ak?.repoRegistered, true);
    assert.equal(packet.ak?.canonicalRepoPath, repoRoot);
    assert.deepEqual(packet.ak?.machineSurfaces, ["repo.resolve v1", "startup.snapshot v1"]);
    assert.equal(packet.ak?.runtimeSchemaVersion, 40);
    assert.equal(packet.readyTaskCount, 2);
    assert.equal(packet.activeTaskCount, 1);
    assert.equal(packet.blockedTaskCount, 0);
    assert.equal(packet.decisionSampleChecked, true);
    assert.deepEqual(calls.map(({ args }) => args.slice(0, 2).join(" ")).sort(), [
      "decision list",
      "direction check",
      "direction export",
      "repo resolve",
      "startup snapshot",
    ]);
    assert.ok(
      calls.every(({ akDb }) => akDb === null),
      "collector must not inject a default AK_DB",
    );
    assert.ok(calls.every(({ args }) => !["doctor", "task"].includes(args[0])));
    assert.match(rendered, /active sample: not emitted by startup\.snapshot v1; count only/);
    assert.match(rendered, /absence is not proven/);
    assert.doesNotMatch(rendered, /society\.v2\.db/);

    writeFileSync(callLog, "", "utf8");
    process.env.PI_SOCIETY_CONTEXT_TEST_MODE = "failed-repo";
    const contradictory = await buildStartupContextPacket(packageRoot);
    const contradictoryCalls = readFileSync(callLog, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(contradictory.ak?.repoRegistered, null);
    assert.deepEqual(contradictory.ak?.machineSurfaces, []);
    assert.equal(contradictoryCalls.length, 1, "failed repo resolution must stop scoped reads");
    assert.ok(
      contradictory.warnings.some((warning) => /despite an ok=true machine envelope/.test(warning)),
    );

    writeFileSync(callLog, "", "utf8");
    process.env.PI_SOCIETY_CONTEXT_TEST_MODE = "malformed";
    const malformed = await buildStartupContextPacket(packageRoot);
    assert.equal(malformed.readyTaskCount, undefined);
    assert.equal(malformed.direction?.checkOk, false);
    assert.ok(malformed.warnings.some((warning) => /ready_sample was not an array/.test(warning)));
    assert.ok(
      malformed.warnings.some((warning) => /expected surface direction\.check/.test(warning)),
    );
  } finally {
    if (previous.HOME === undefined) delete process.env.HOME;
    else process.env.HOME = previous.HOME;
    if (previous.AK_DB === undefined) delete process.env.AK_DB;
    else process.env.AK_DB = previous.AK_DB;
    if (previous.PI_SOCIETY_CONTEXT_AK === undefined) delete process.env.PI_SOCIETY_CONTEXT_AK;
    else process.env.PI_SOCIETY_CONTEXT_AK = previous.PI_SOCIETY_CONTEXT_AK;
    if (previous.PI_SOCIETY_CONTEXT_TEST_MODE === undefined)
      delete process.env.PI_SOCIETY_CONTEXT_TEST_MODE;
    else process.env.PI_SOCIETY_CONTEXT_TEST_MODE = previous.PI_SOCIETY_CONTEXT_TEST_MODE;
    rmSync(root, { recursive: true, force: true });
  }
});

test("renders fast startup packet with explicit pending warning and no posture claims", () => {
  const packet = createFastStartupContextPacket(
    "/tmp/home/ai-society/softwareco/owned/pi-extensions/packages/example",
    "/tmp/home",
  );
  const rendered = renderStartupContextPacket(packet);

  assert.equal(packet.packetTier, "fast");
  assert.equal(packet.fullRefreshStatus, "pending");
  assert.match(rendered, /fast\/minimal/);
  assert.match(rendered, /full_refresh_status: pending/);
  assert.match(
    rendered,
    /AK, git dirty state, direction, task, and decision surfaces were not checked/,
  );
  assert.match(rendered, /no absence-of-blockers claim is made/);
  assert.doesNotMatch(rendered, /ready queue: 0/);
  assert.doesNotMatch(rendered, /no active repo-scoped decision blockers found/);
});

test("replacement and shutdown abort in-flight full-refresh subprocesses", async () => {
  const root = mkdtempSync(join(tmpdir(), "society-context-abort-"));
  const repoRoot = join(root, "ai-society", "test-repo");
  mkdirSync(repoRoot, { recursive: true });
  const readyMarker = join(root, "ready");
  const abortMarker = join(root, "aborted");
  const executable = join(root, "fake-ak");
  writeFileSync(
    executable,
    `#!/usr/bin/env node\nimport("node:fs").then(({ appendFileSync }) => {\n  if (process.argv[2] !== "repo" || process.argv[3] !== "resolve") { process.stdout.write('{"ok":true,"payload":{}}\\n'); return; }\n  process.on("SIGTERM", () => { appendFileSync(${JSON.stringify(abortMarker)}, "aborted\\n"); process.exit(0); });\n  appendFileSync(${JSON.stringify(readyMarker)}, "ready\\n");\n  setTimeout(() => process.stdout.write('{"ok":true,"payload":{}}\\n'), 5000);\n});\n`,
  );
  chmodSync(executable, 0o755);
  const oldAk = process.env.PI_SOCIETY_CONTEXT_AK;
  const oldHome = process.env.HOME;
  process.env.PI_SOCIETY_CONTEXT_AK = executable;
  process.env.HOME = root;
  const events = new Map<string, (...args: unknown[]) => Promise<void>>();
  const markerCount = (path: string) =>
    existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).length : 0;
  const waitForMarkerCount = async (path: string, expectedCount: number) => {
    const deadline = Date.now() + 4_000;
    while (markerCount(path) < expectedCount && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  try {
    societyStartupContextExtension({
      on(name: string, handler: (...args: unknown[]) => Promise<void>) {
        events.set(name, handler);
      },
      registerCommand() {},
    } as never);
    const context = { cwd: repoRoot, hasUI: false, ui: {} };
    await events.get("session_start")?.({}, context);
    await waitForMarkerCount(readyMarker, 1);
    assert.equal(markerCount(readyMarker), 1, "initial refresh subprocess should be ready");

    await events.get("session_start")?.({}, context);
    await waitForMarkerCount(abortMarker, 1);
    assert.equal(markerCount(abortMarker), 1, "replacement should abort the prior refresh");
    const replacementAbortCount = markerCount(abortMarker);
    await waitForMarkerCount(readyMarker, 2);
    assert.equal(markerCount(readyMarker), 2, "replacement refresh subprocess should be ready");

    await events.get("session_shutdown")?.();
    await waitForMarkerCount(abortMarker, replacementAbortCount + 1);
    const shutdownAbortCount = markerCount(abortMarker);
    assert.ok(
      shutdownAbortCount > replacementAbortCount,
      "shutdown should abort the replacement refresh",
    );
  } finally {
    if (oldAk === undefined) delete process.env.PI_SOCIETY_CONTEXT_AK;
    else process.env.PI_SOCIETY_CONTEXT_AK = oldAk;
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    rmSync(root, { recursive: true, force: true });
  }
});

test("headless society-context command prints the read-only packet", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  societyStartupContextExtension({
    on() {},
    registerCommand(
      name: string,
      command: { handler: (args: string, ctx: unknown) => Promise<void> },
    ) {
      commands.set(name, command);
    },
  } as never);
  const output: string[] = [];
  const oldLog = console.log;
  console.log = (message?: unknown) => output.push(String(message));
  try {
    await commands.get("society-context")?.handler("", { cwd: "/tmp", hasUI: false });
  } finally {
    console.log = oldLog;
  }
  assert.match(output.join("\n"), /AI Society startup context/);
  assert.match(output.join("\n"), /not applicable outside/);
});

test("extension registers startup, prompt injection, and manual context command", () => {
  const events = new Map<string, unknown>();
  const commands = new Map<string, unknown>();
  societyStartupContextExtension({
    on(name: string, handler: unknown) {
      events.set(name, handler);
    },
    registerCommand(name: string, command: unknown) {
      commands.set(name, command);
    },
  } as never);

  assert.equal(typeof events.get("session_start"), "function");
  assert.equal(typeof events.get("before_agent_start"), "function");
  assert.equal(typeof events.get("session_shutdown"), "function");
  assert.equal(typeof commands.get("society-context"), "object");
});
