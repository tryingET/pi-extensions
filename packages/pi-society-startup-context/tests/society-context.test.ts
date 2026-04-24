import assert from "node:assert/strict";
import test from "node:test";
import societyStartupContextExtension, {
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
    capturedAt: "2026-04-24T00:00:00.000Z",
    cwd: "/tmp/outside",
    aiSocietyRoot: "/tmp/home/ai-society",
    authoritativeRuntime: [],
    readyTasks: [],
    taskStatusCounts: {},
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
    taskStatusCounts: { pending: 1, done: 2 },
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
  assert.match(rendered, /Open architecture decision/);
  assert.doesNotMatch(rendered, /"payload"/);
  assert.doesNotMatch(rendered, /"tasks"/);
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
  assert.equal(typeof commands.get("society-context"), "object");
});
