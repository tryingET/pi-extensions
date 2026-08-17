/**
summary: "Tests P1 continuity facts, evidence anchors, active-lineage recall, and provider/telemetry adapters."
read_when:
  - "Changing P1 recall, continuity merge, evidence references, or cross-package adapters."
*/
import assert from "node:assert/strict";
import test from "node:test";
import { collectCurrentWorktreeState } from "../extensions/session-compaction/context-provider.js";
import {
  buildContinuityRecords,
  CONTINUITY_STATE_TYPE,
  mergeContinuityRecords,
  renderContinuityStateBlock,
} from "../extensions/session-compaction/continuity-state.js";
import {
  buildEvidenceAnchors,
  EVIDENCE_ANCHORS_TYPE,
  renderEvidenceAnchorsBlock,
} from "../extensions/session-compaction/evidence-anchors.js";
import {
  decodeManagedBlocks,
  managedRecordsFromSummary,
} from "../extensions/session-compaction/managed-block-codec.js";
import {
  compactionSessionId,
  recordCompactionQuality,
} from "../extensions/session-compaction/quality-telemetry.js";
import {
  parseCompactRecallArgs,
  runSessionCompactionRecall,
  searchSessionEntries,
  selectRecallEntries,
} from "../extensions/session-compaction/session-recall.js";

const userMessage = (id, text, timestamp) => ({
  role: "user",
  content: [{ type: "text", text }],
  timestamp,
  _entryId: id,
});
const assistantMessage = (id, text, timestamp) => ({
  role: "assistant",
  content: [{ type: "text", text }],
  timestamp,
  _entryId: id,
});
const sessionEntry = (id, message, parentId) => ({
  id,
  ...(parentId ? { parentId } : {}),
  type: "message",
  message,
});

function verifiedWorktree(overrides = {}) {
  return {
    ok: true,
    verified: true,
    generatedAt: "2026-08-17T12:00:00.000Z",
    state: {
      verified: true,
      branch: "feature/p1",
      clean: false,
      counts: { staged: 0, unstaged: 2, untracked: 1, conflicted: 0 },
      changedPaths: [{ status: " M", path: "packages/pi-session-compaction/file.js" }],
      ...overrides,
    },
  };
}

test("continuity state supersedes volatile intent and preserves bounded lifecycle-aware facts", () => {
  const previous = renderContinuityStateBlock([
    {
      id: "old-intent",
      kind: "intent",
      text: "status=current | epistemic=observed | intent=implement the old design",
      timestamp: 1,
      priority: 120,
    },
    {
      id: "old-constraint",
      kind: "constraint",
      text: "status=current | epistemic=observed | constraint=Never expose raw secrets.",
      timestamp: 1,
      priority: 105,
    },
    {
      id: "old-decision",
      kind: "decision",
      text: "status=current | epistemic=observed | decision=Use lexical recall first.",
      timestamp: 1,
      priority: 90,
    },
  ]).text;

  const records = buildContinuityRecords({
    previousSummary: previous,
    messages: [
      userMessage("u2", "Actually use the stable API. Never expose raw secrets.", 2),
      assistantMessage("a2", "Refactoring the provider boundary now.", 3),
    ],
    receipts: [
      {
        id: "r1",
        status: "failed",
        sourceEntryId: "tool-4",
        text: "npm test failed in the recall fixture",
        timestamp: 4,
      },
    ],
    worktree: verifiedWorktree(),
  });

  const intents = records.filter((record) => record.kind === "intent");
  assert.equal(intents.length, 1);
  assert.match(intents[0].text, /stable API/u);
  assert.doesNotMatch(intents[0].text, /old design/u);
  assert.ok(
    records.some(
      (record) => record.kind === "constraint" && /Never expose raw secrets/u.test(record.text),
    ),
  );
  assert.ok(
    records.some(
      (record) =>
        record.kind === "decision" &&
        /status=carried_unverified/u.test(record.text) &&
        /epistemic=carried_summary/u.test(record.text),
    ),
  );
  assert.ok(
    records.some((record) => record.kind === "failure" && /npm test failed/u.test(record.text)),
  );
  assert.ok(
    records.some(
      (record) => record.kind === "worktree" && /status=current_verified/u.test(record.text),
    ),
  );

  const block = renderContinuityStateBlock(records, { maxChars: 8_000 });
  const decoded = decodeManagedBlocks(block.text, CONTINUITY_STATE_TYPE);
  assert.equal(decoded.length, 1);
  assert.ok(decoded[0].records.every((record) => record.checksumValid));
});

test("an unavailable live worktree provider supersedes stale verified worktree state", () => {
  const previous = renderContinuityStateBlock([
    {
      id: "worktree-live",
      kind: "worktree",
      text: "status=current_verified | epistemic=observed | worktree=branch=old; clean=true",
      timestamp: 1,
      priority: 118,
      pinned: true,
    },
  ]).text;
  const records = buildContinuityRecords({
    previousSummary: previous,
    messages: [userMessage("u", "Continue", 2)],
    worktree: {
      ok: false,
      verified: false,
      omissions: [{ reason: "unavailable" }],
    },
  });
  const worktrees = records.filter((record) => record.kind === "worktree");
  assert.equal(worktrees.length, 1);
  assert.match(worktrees[0].text, /status=current_unverified/u);
  assert.match(worktrees[0].text, /verify from the git owner surface/u);
  assert.doesNotMatch(worktrees[0].text, /branch=old/u);
});

test("continuity merge caps sticky fact classes", () => {
  const current = Array.from({ length: 20 }, (_, index) => ({
    id: `c-${index}`,
    kind: "constraint",
    text: `status=current | epistemic=observed | constraint=constraint ${index}`,
    timestamp: index,
    priority: 50,
  }));
  assert.equal(
    mergeContinuityRecords([], current).filter((record) => record.kind === "constraint").length,
    8,
  );
});

test("evidence anchors point to exact entries, live git, and recall guidance", () => {
  const anchors = buildEvidenceAnchors({
    messages: [userMessage("u-latest", "Implement the P1 recall surface", 10)],
    receipts: [
      {
        id: "test-failed",
        sourceEntryId: "tr-9",
        status: "failed",
        text: "node --test failed",
        timestamp: 11,
      },
    ],
    worktree: verifiedWorktree({ branch: "main" }),
    compactedMessageCount: 1,
    omittedMessageCount: 0,
  });
  assert.ok(anchors.some((anchor) => /ref=E:u-latest/u.test(anchor.text)));
  assert.ok(anchors.some((anchor) => /ref=E:tr-9/u.test(anchor.text)));
  assert.ok(anchors.some((anchor) => /ref=G:worktree-live/u.test(anchor.text)));
  assert.ok(
    anchors.some(
      (anchor) =>
        /session_compaction_recall/u.test(anchor.text) && /1 historical message/u.test(anchor.text),
    ),
  );
  const block = renderEvidenceAnchorsBlock(anchors, { maxChars: 8_000 });
  assert.equal(managedRecordsFromSummary(block.text, EVIDENCE_ANCHORS_TYPE).length, anchors.length);
});

test("active-lineage selection excludes abandoned branches and all scope can include them", () => {
  const entries = [
    sessionEntry("root", userMessage("root", "root", 1)),
    sessionEntry("a", assistantMessage("a", "active branch", 2), "root"),
    sessionEntry("b", assistantMessage("b", "abandoned branch", 3), "root"),
    sessionEntry("leaf", userMessage("leaf", "current request", 4), "a"),
  ];
  const manager = {
    getEntries: () => entries,
    getCurrentLeafId: () => "leaf",
  };
  assert.deepEqual(
    selectRecallEntries(manager, "lineage").entries.map((entry) => entry.id),
    ["root", "a", "leaf"],
  );
  assert.deepEqual(
    selectRecallEntries(manager, "all").entries.map((entry) => entry.id),
    ["root", "a", "b", "leaf"],
  );
});

test("recall ranks matching evidence, omits thinking, redacts secrets, and emits counts only", async () => {
  const secret = `sk-proj-${"A".repeat(40)}`;
  const entries = [
    sessionEntry("u1", {
      role: "user",
      content: [{ type: "text", text: "Please refactor telemetry" }],
      timestamp: 1,
    }),
    sessionEntry(
      "a1",
      {
        role: "assistant",
        timestamp: 2,
        content: [
          { type: "thinking", thinking: "HIDDEN_REASONING_SHOULD_NOT_APPEAR" },
          { type: "text", text: `Telemetry test failed with token ${secret}` },
          {
            type: "toolCall",
            name: "bash",
            arguments: { command: "node --test tests/recall.test.mjs" },
          },
        ],
      },
      "u1",
    ),
  ];
  const telemetry = [];
  const result = await runSessionCompactionRecall(
    { query: "telemetry test failed", mode: "failures", scope: "lineage", expand: [1] },
    { sessionManager: { getEntries: () => entries, getCurrentLeafId: () => "a1" } },
    { recordRecall: async (event) => telemetry.push(event) },
  );
  const text = result.content[0].text;
  assert.match(text, /Untrusted historical data/u);
  assert.match(text, /Telemetry test failed/u);
  assert.match(text, /\[REDACTED:openai_token:/u);
  assert.doesNotMatch(text, /HIDDEN_REASONING/u);
  assert.doesNotMatch(text, new RegExp(secret, "u"));
  assert.deepEqual(Object.keys(telemetry[0]).sort(), [
    "candidateCount",
    "directRefCount",
    "durationMs",
    "expandedCount",
    "hitCount",
    "mode",
    "page",
    "queryTokens",
    "scope",
    "scopeWidened",
    "sourceEntries",
    "sourceEntriesOmitted",
    "totalHits",
  ]);
  assert.equal("query" in telemetry[0], false);
});

test("direct evidence refs bypass lexical ranking and remain scoped and sanitized", async () => {
  const secret = `github_pat_${"B".repeat(48)}`;
  const entries = [
    sessionEntry("root", userMessage("root", "unrelated current request", 1)),
    sessionEntry(
      "proof",
      assistantMessage("proof", `Exact validation receipt ${secret}`, "2026-08-17T11:00:00Z"),
      "root",
    ),
  ];
  const result = await runSessionCompactionRecall(
    { refs: ["E:proof"], query: "does-not-match", scope: "lineage" },
    { sessionManager: { getEntries: () => entries, getCurrentLeafId: () => "proof" } },
    { recordRecall: async () => {} },
  );
  assert.deepEqual(result.details.matchedDirectRefs, ["E:proof"]);
  assert.deepEqual(result.details.resultRefs.slice(0, 1), ["E:proof"]);
  assert.match(result.content[0].text, /direct-ref/u);
  assert.match(result.content[0].text, /Exact validation receipt/u);
  assert.doesNotMatch(result.content[0].text, new RegExp(secret, "u"));
});

test("lexical ranking rewards repeated matching terms and ISO timestamps order recent evidence", () => {
  const repeated = [
    sessionEntry("older-dense", userMessage("older-dense", "needle needle needle needle", 1)),
    sessionEntry("newer-sparse", userMessage("newer-sparse", "needle", 2)),
  ];
  const ranked = searchSessionEntries(repeated, { query: "needle", pageSize: 2 });
  assert.equal(ranked.results[0].record.id, "older-dense");

  const dated = [
    sessionEntry("old", userMessage("old", "alpha", "2026-08-16T10:00:00Z")),
    sessionEntry("new", userMessage("new", "beta", "2026-08-17T10:00:00Z")),
  ];
  const recent = searchSessionEntries(dated, { pageSize: 2 });
  assert.equal(recent.results[0].record.id, "new");
});

test("recall paging, exact refs, and command parsing remain bounded", () => {
  const entries = Array.from({ length: 50 }, (_, index) =>
    sessionEntry(`e-${index}`, userMessage(`e-${index}`, `telemetry context ${index}`, index)),
  );
  const result = searchSessionEntries(entries, { query: "telemetry", page: 2, pageSize: 4 });
  assert.equal(result.results.length, 4);
  assert.equal(result.results[0].rank, 5);
  assert.equal(result.hasMore, true);
  assert.deepEqual(
    parseCompactRecallArgs(
      "--all --mode=files --page=2 --page-size=3 --expand=4,5 --refs=E:e-2,e-4 package json",
    ),
    {
      scope: "all",
      mode: "files",
      page: 2,
      pageSize: 3,
      expand: [4, 5],
      refs: ["E:e-2", "E:e-4"],
      query: "package json",
    },
  );
});

test("context provider and telemetry adapters fail closed and remain injectable", async () => {
  const worktree = await collectCurrentWorktreeState(
    { cwd: "/repo" },
    {
      contextProviderApi: {
        createGitWorktreeProvider: () => ({ apiVersion: 1, id: "git-worktree" }),
        runReadOnlyContextProvider: async () => ({
          ok: true,
          state: {
            verified: true,
            branch: "main",
            clean: true,
            counts: {},
            changedPaths: [],
          },
          omissions: [],
          measurement: { redactions: 0 },
        }),
      },
    },
  );
  assert.equal(worktree.verified, true);
  assert.equal(worktree.providerApi, "@tryinget/pi-context-packer/api:v1");

  const failed = await collectCurrentWorktreeState({ cwd: "/repo" }, { contextProviderApi: {} });
  assert.equal(failed.verified, false);
  assert.equal(failed.omissions[0].reason, "unavailable");

  const events = [];
  const ctx = { sessionManager: { getSessionFile: () => "/private/session-1.jsonl" } };
  assert.equal(compactionSessionId(ctx), "session-1.jsonl");
  await recordCompactionQuality({ validationOk: true }, ctx, {
    telemetry: { recordCompactionQualityTelemetry: async (event) => events.push(event) },
  });
  assert.equal(events[0].sessionId, "session-1.jsonl");
});

test("context provider discovers the stable process-local API without a package dependency", async () => {
  const symbol = Symbol.for("tryinget.pi-context-packer.provider-api.v1");
  const previous = globalThis[symbol];
  globalThis[symbol] = Object.freeze({
    apiVersion: 1,
    createGitWorktreeProvider: () => ({ apiVersion: 1, id: "git-worktree" }),
    runReadOnlyContextProvider: async () => ({
      ok: true,
      state: {
        verified: true,
        branch: "main",
        clean: true,
        counts: {},
        changedPaths: [],
      },
      omissions: [],
      measurement: { redactions: 0 },
    }),
  });
  try {
    const result = await collectCurrentWorktreeState({ cwd: "/repo" });
    assert.equal(result.verified, true);
    assert.equal(result.state.branch, "main");
  } finally {
    if (previous === undefined) delete globalThis[symbol];
    else globalThis[symbol] = previous;
  }
});

test("lineage recall fails closed when branch metadata exists but the active leaf cannot be proven", () => {
  const entries = [
    sessionEntry("root", userMessage("root", "root", 1)),
    sessionEntry("branch-a", assistantMessage("branch-a", "A", 2), "root"),
    sessionEntry("branch-b", assistantMessage("branch-b", "B", 3), "root"),
  ];
  const result = selectRecallEntries({
    getEntries: () => entries,
    getCurrentLeafId: () => "missing",
  });
  assert.equal(result.scope, "degraded");
  assert.equal(result.scopeDegraded, true);
  assert.deepEqual(result.entries, []);
});

test("linear sessions remain recallable without branch APIs", () => {
  const entries = [
    sessionEntry("one", userMessage("one", "one", 1)),
    sessionEntry("two", assistantMessage("two", "two", 2)),
  ];
  const result = selectRecallEntries({ getEntries: () => entries });
  assert.equal(result.scope, "lineage");
  assert.equal(result.scopeDegraded, false);
  assert.deepEqual(result.entries, entries);
});

test("bounded recall source keeps the tail bounded while resolving an explicitly anchored older entry", () => {
  const entries = Array.from({ length: 20_050 }, (_value, index) => ({
    id: `entry-${index}`,
    type: "message",
    message: { role: "user", content: `history ${index}`, timestamp: index },
  }));
  entries[3] = {
    id: "old-anchor",
    type: "message",
    message: { role: "user", content: "anchored old evidence", timestamp: 3 },
  };
  const result = searchSessionEntries(entries, {
    query: "anchored",
    refs: ["E:old-anchor"],
    pageSize: 2,
  });
  assert.equal(result.sourceEntryCount, 20_050);
  assert.ok(result.sourceEntriesOmittedByCap > 0);
  assert.deepEqual(result.matchedDirectRefs, ["E:old-anchor"]);
  assert.equal(result.results[0].record.id, "old-anchor");
});
