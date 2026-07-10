import assert from "node:assert/strict";
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
    authoritativeRuntime: ["AK + society.v2.db = canonical runtime authority"],
    git: {
      available: true,
      dirty: true,
      changedCount: 2,
      sample: [" M README.md", "?? packages/example/"],
    },
    ak: {
      executable: "ak",
      doctor: "machine envelope ok",
      schema: "task.ready v1",
      repoRegistered: true,
      repoMetadata: ["company=softwareco", "layer=L2"],
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
  const marker = join(root, "aborted");
  const executable = join(root, "fake-ak");
  writeFileSync(
    executable,
    `#!/usr/bin/env node\nconst fs = require("node:fs");\nprocess.on("SIGTERM", () => { fs.appendFileSync(${JSON.stringify(marker)}, "aborted\\n"); process.exit(0); });\nsetTimeout(() => process.stdout.write('{"ok":true,"payload":{}}\\n'), 5000);\n`,
  );
  chmodSync(executable, 0o755);
  const oldAk = process.env.PI_SOCIETY_CONTEXT_AK;
  process.env.PI_SOCIETY_CONTEXT_AK = executable;
  const events = new Map<string, (...args: unknown[]) => Promise<void>>();
  try {
    societyStartupContextExtension({
      on(name: string, handler: (...args: unknown[]) => Promise<void>) {
        events.set(name, handler);
      },
      registerCommand() {},
    } as never);
    const context = { cwd: process.cwd(), hasUI: false, ui: {} };
    await events.get("session_start")?.({}, context);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await events.get("session_start")?.({}, context);
    for (let attempt = 0; attempt < 20 && !existsSync(marker); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(existsSync(marker), true, "replacement should abort the prior refresh");
    const replacementAbortCount = readFileSync(marker, "utf8").trim().split("\n").length;
    await new Promise((resolve) => setTimeout(resolve, 100));

    await events.get("session_shutdown")?.();
    let shutdownAbortCount = replacementAbortCount;
    for (
      let attempt = 0;
      attempt < 20 && shutdownAbortCount <= replacementAbortCount;
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      shutdownAbortCount = readFileSync(marker, "utf8").trim().split("\n").length;
    }
    assert.ok(
      shutdownAbortCount > replacementAbortCount,
      "shutdown should abort the replacement refresh",
    );
  } finally {
    if (oldAk === undefined) delete process.env.PI_SOCIETY_CONTEXT_AK;
    else process.env.PI_SOCIETY_CONTEXT_AK = oldAk;
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
