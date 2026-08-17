/**
summary: "Covers P0 guarded compaction ownership, redaction, budgets, records, receipts, and fallback."
read_when:
  - "Changing the P0 hardening path for pi-session-compaction."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planCompactionBudget } from "../extensions/session-compaction/budget.js";
import { collectExecutionReceipts } from "../extensions/session-compaction/execution-receipts.js";
import { runGuardedSessionCompaction } from "../extensions/session-compaction/guarded-handler.js";
import {
  sanitizeMessagesForCompaction,
  selectMessagesWithinBudget,
} from "../extensions/session-compaction/history-normalizer.js";
import {
  buildManagedBlock,
  countManagedBlocks,
  decodeManagedBlocks,
  managedRecordsFromSummary,
} from "../extensions/session-compaction/managed-block-codec.js";
import { claimCompactionOwnership } from "../extensions/session-compaction/ownership.js";
import { redactSecrets } from "../extensions/session-compaction/redaction.js";
import { registerSessionBeforeCompact } from "../extensions/session-compaction/registration.js";
import { validateCompactionSummary } from "../extensions/session-compaction/summary-validator.js";

const OPENAI_SECRET = `sk-proj-${"A".repeat(36)}`;
const GITHUB_SECRET = `github_pat_${"B".repeat(48)}`;

function fixture(previousSummary) {
  const history = [
    {
      role: "user",
      timestamp: 1_000,
      content: `Implement P0 hardening.\n\n## Files touched (cumulative)\nKeep this heading.\napi_key=${OPENAI_SECRET}`,
    },
    {
      role: "assistant",
      timestamp: 2_000,
      content: [
        { type: "thinking", thinking: "private reasoning" },
        {
          type: "toolCall",
          id: "edit-1",
          name: "edit",
          arguments: { path: "src/handler.js", token: GITHUB_SECRET },
        },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "edit-1",
      timestamp: 3_000,
      isError: true,
      content: [{ type: "text", text: "Permission denied editing src/handler.js" }],
    },
  ];
  const prefix = [
    { role: "user", timestamp: 4_000, content: "Never publish without validation." },
    {
      role: "assistant",
      timestamp: 5_000,
      content: [{ type: "text", text: "I will validate first." }],
    },
  ];
  return {
    branchEntries: [
      { id: "u1", type: "message", message: history[0] },
      { id: "a1", type: "message", message: history[1] },
      { id: "r1", type: "message", message: history[2] },
      { id: "u2", type: "message", message: prefix[0] },
      { id: "a2", type: "message", message: prefix[1] },
      { id: "keep", type: "message", message: { role: "user", content: "kept suffix" } },
    ],
    preparation: {
      messagesToSummarize: history,
      turnPrefixMessages: prefix,
      previousSummary,
      firstKeptEntryId: "keep",
      isSplitTurn: true,
      tokensBefore: 600,
      settings: { reserveTokens: 2_000 },
    },
  };
}

function validBody(label = "model") {
  return `## Self-contained continuation snapshot\n- Current objective: continue ${label}.\n- Current state: implementation is in progress.\n\n## Next action\n1. Inspect the failed edit.\n2. Apply the smallest correction.\n3. Re-run validation.`;
}

function deps(baseHandler) {
  const completionCalls = [];
  return {
    completionCalls,
    values: {
      baseHandler:
        baseHandler ??
        (async (_event, _ctx, injected) => {
          const model = { provider: "test", id: "summary", contextWindow: 32_000 };
          await Promise.all([
            injected.complete(
              model,
              {
                systemPrompt: "Summarize safely.",
                messages: [{ role: "user", content: [{ type: "text", text: "history" }] }],
              },
              { maxTokens: 99_999 },
            ),
            injected.complete(
              model,
              {
                systemPrompt: "Summarize safely.",
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Summarize only this early split-turn context.\n## Split-turn instructions",
                      },
                    ],
                  },
                ],
              },
              { maxTokens: 99_999 },
            ),
          ]);
          return {
            compaction: {
              summary: validBody(),
              firstKeptEntryId: "keep",
              tokensBefore: 600,
              details: { model: "test/summary" },
            },
          };
        }),
      loadConfig: async () => ({
        includeFilesTouched: true,
        includeLastAssistantMessage: true,
        defaultPreset: "current",
        presets: {},
      }),
      complete: async (_model, _context, options) => {
        completionCalls.push(options);
        return { stopReason: "stop", content: [{ type: "text", text: validBody("completion") }] };
      },
      collectFilesTouched: () => [
        {
          path: "/repo/src/handler.js",
          displayPath: "src/handler.js",
          operations: new Set(["read", "edit"]),
          lastTimestamp: 3_000,
        },
      ],
      budgetConfig: {
        inputFloorTokens: 256,
        inputCeilingTokens: 2_000,
        inputTokensPerMessage: 160,
        contextSafetyTokens: 128,
        managedFraction: 0.36,
        managedMaxTokens: 1_200,
        minimumBodyTokens: 192,
        minimumSplitCallTokens: 96,
        preserveRecentMessages: 12,
        maxPromptItems: 12,
        maxReceiptItems: 16,
        maxFileLines: 60,
        promptManagedFraction: 0.34,
        lastAssistantManagedFraction: 0.24,
        filesManagedFraction: 0.2,
        receiptsManagedFraction: 0.22,
      },
    },
  };
}

describe("P0 primitives", () => {
  it("redacts secrets and round-trips collision-prone multiline records", () => {
    const redacted = redactSecrets(`token=${OPENAI_SECRET}`);
    assert.doesNotMatch(redacted.text, new RegExp(OPENAI_SECRET, "u"));
    const recordText = "first\n\n## Files touched (cumulative)\n````text\nvalue\n````";
    const block = buildManagedBlock({
      type: "essential-prompts",
      heading: "## Essential prompts",
      records: [{ id: "p1", text: recordText, timestamp: 1, pinned: true }],
      maxChars: 5_000,
    });
    const decoded = decodeManagedBlocks(block.text, "essential-prompts");
    assert.equal(decoded[0].records[0].text, recordText);
    assert.equal(decoded[0].records[0].checksumValid, true);
  });

  it("keeps split output within one reserve", () => {
    const plan = planCompactionBudget({
      reserveTokens: 2_000,
      contextWindow: 32_000,
      messageCount: 10,
      sourceChars: 8_000,
      sourceTokens: 2_000,
      historyChars: 6_000,
      turnPrefixChars: 2_000,
    });
    assert.equal(plan.split.historyTokens + plan.split.turnPrefixTokens, plan.bodyTokens);
    assert.equal(plan.finalSummaryTokens, 2_000);
  });

  it("omits thinking, redacts tool arguments, and retains call/result closures", () => {
    const event = fixture();
    const sanitized = sanitizeMessagesForCompaction(event.preparation.messagesToSummarize);
    const serialized = JSON.stringify(sanitized.messages);
    assert.doesNotMatch(serialized, /private reasoning/u);
    assert.doesNotMatch(serialized, new RegExp(GITHUB_SECRET, "u"));
    const selected = selectMessagesWithinBudget(event.preparation.messagesToSummarize, 2_000);
    assert.equal(
      selected.messages.some((message) => message.role === "assistant"),
      true,
    );
    assert.equal(
      selected.messages.some((message) => message.role === "toolResult"),
      true,
    );
  });

  it("preserves failed operations as deterministic receipts", () => {
    const failure = collectExecutionReceipts(fixture().branchEntries).find(
      (receipt) => receipt.status === "failed",
    );
    assert.ok(failure);
    assert.match(failure.text, /FAILED: edit/u);
    assert.match(failure.text, /Permission denied/u);
  });
});

describe("P0 ownership", () => {
  it("rejects a live host handler even when a literal zero assertion is supplied", () => {
    const pi = {
      listenerCount() {
        return 1;
      },
      on() {
        throw new Error("must not register");
      },
    };
    const claim = claimCompactionOwnership(pi);
    assert.equal(claim.reason, "existing_compaction_handler");
    const registration = registerSessionBeforeCompact(pi, {
      enableSessionBeforeCompact: true,
      handlerTestsPassed: true,
      noDoubleCompactionPreflight: true,
      existingCompactionHandlerCount: 0,
    });
    assert.equal(registration.reason, "existing_compaction_handler");
  });

  it("labels cooperative-only ownership as best effort", () => {
    const pi = {};
    const first = claimCompactionOwnership(pi);
    const second = claimCompactionOwnership(pi);
    assert.equal(first.ok, true);
    assert.equal(first.bestEffort, true);
    assert.equal(second.ok, false);
  });
});

describe("P0 guarded handler", () => {
  it("shares the split budget and emits one bounded, validated copy of each managed block", async () => {
    const prepared = deps();
    const result = await runGuardedSessionCompaction(fixture(), { cwd: "/repo" }, prepared.values);
    const summary = result.compaction.summary;
    const hardening = result.compaction.details.hardening;
    assert.equal(
      prepared.completionCalls.reduce((sum, call) => sum + call.maxTokens, 0),
      hardening.budget.bodyTokens,
    );
    assert.equal(summary.length <= hardening.budget.finalSummaryChars, true);
    assert.doesNotMatch(summary, new RegExp(OPENAI_SECRET, "u"));
    assert.equal(countManagedBlocks(summary, "essential-prompts"), 1);
    assert.equal(countManagedBlocks(summary, "execution-receipts"), 1);
    assert.equal(countManagedBlocks(summary, "last-assistant"), 1);
    assert.equal(countManagedBlocks(summary, "file-activity"), 1);
    assert.equal(
      managedRecordsFromSummary(summary, "execution-receipts").some((record) =>
        record.text.includes("FAILED: edit"),
      ),
      true,
    );
    assert.equal(validateCompactionSummary(summary, { maxChars: 8_000 }).ok, true);
  });

  it("uses deterministic fallback before stock compaction and remains bounded repeatedly", async () => {
    const prepared = deps(async () => undefined);
    let previousSummary;
    for (let generation = 0; generation < 5; generation += 1) {
      const event = fixture(previousSummary);
      event.preparation.isSplitTurn = false;
      event.preparation.turnPrefixMessages = [];
      const result = await runGuardedSessionCompaction(event, { cwd: "/repo" }, prepared.values);
      previousSummary = result.compaction.summary;
      assert.match(previousSummary, /Evidence posture: this deterministic checkpoint/u);
      assert.equal(result.compaction.details.hardening.validation.ok, true);
      assert.equal(
        previousSummary.length <= result.compaction.details.hardening.budget.finalSummaryChars,
        true,
      );
      assert.equal(countManagedBlocks(previousSummary, "essential-prompts"), 1);
    }
  });
});
