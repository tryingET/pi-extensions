// summary: "Given/When/Then regressions for authorship and completion claim boundaries (AK6618)."
// read_when:
//   - "Changing authorship labels, tool-result observations, or synthesis evidence limits."
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const timestamp = "2026-01-01T00:00:00Z";
function message(id, parentId, role, content, extra = {}) {
  return { type: "message", id, parentId, timestamp, message: { role, content, ...extra } };
}
function extract(entries, ...options) {
  const scratch = mkdtempSync(join(tmpdir(), "insights-claim-test-"));
  try {
    const file = join(scratch, "synthetic.jsonl");
    const header = { type: "session", version: 3, id: "synthetic", cwd: "/synthetic", timestamp };
    writeFileSync(file, [header, ...entries].map((row) => JSON.stringify(row)).join("\n"));
    return JSON.parse(
      execFileSync(
        process.execPath,
        [join(root, "bin/pi-session-insights.mjs"), ...options, file],
        {
          encoding: "utf8",
        },
      ),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

for (const text of [
  "Ordinary request without origin evidence.",
  "# Loop: KAIZEN\n## Phase: plan\nSynthetic generated worker instruction.",
  "Automated dispatcher assignment: inspect.",
]) {
  test(`Given unresolved user-role text (${text.split("\n")[0]}); When extracted; Then authorship remains unknown`, () => {
    const result = extract([message("u", null, "user", text, { authorship: "human" })]);
    assert.equal(result.schema, "pi.session-insights.v2");
    assert.equal(Object.hasOwn(result, "latest_operator_message"), false);
    assert.equal(result.latest_user_message.text, text);
    assert.equal(result.latest_user_message.authorship, "unknown");
    assert.equal(result.session_role_basis, "heuristic_not_authorship");
    assert.ok(result.uncertainties.includes("user_role_does_not_establish_human_authorship"));
  });
}

test("Given a known boot prompt; When extracted; Then no independent human objective is asserted", () => {
  const result = extract([
    message("u", null, "user", "You are a specialized subagent.\nSubagent objective: inspect."),
  ]);
  assert.equal(result.latest_user_message, null);
  assert.equal(Object.hasOwn(result, "latest_operator_message"), false);
  assert.equal(result.session_role_basis, "heuristic_not_authorship");
});

for (const [status, value] of [
  ["reported_error", true],
  ["reported_no_error", false],
  ["missing", undefined],
  ["invalid", null],
  ["invalid", "false"],
]) {
  test(`Given tool isError=${String(value)} and a completion claim; When extracted; Then ${status} is not research completion`, () => {
    const extra = { toolCallId: "call-1", toolName: "web_search" };
    if (value !== undefined) extra.isError = value;
    const result = extract([
      message("u", null, "user", "Research a synthetic topic."),
      message("t", "u", "toolResult", [{ type: "text", text: "PRIVATE_PAYLOAD AK-9999" }], extra),
      message("a", "t", "assistant", [{ type: "text", text: "Web and Vault research completed." }]),
    ]);
    assert.equal(result.research_completion, "not_established");
    assert.equal(result.latest_assistant_text.claim_status, "unverified_assistant_text");
    assert.equal(result.tool_result_observations.total, 1);
    assert.equal(result.tool_result_observations.counts[status], 1);
    assert.equal(result.tool_result_observations.records[0].status, status);
    assert.equal(result.tool_result_observations.records[0].entry_id, "t");
    assert.equal(result.ak_task_ids.includes(9999), false);
    assert.equal(JSON.stringify(result).includes("PRIVATE_PAYLOAD"), false);
  });
}

test("Given a tool call without a result; When extracted; Then zero observed results does not mean completed research", () => {
  const result = extract([
    message("a", null, "assistant", [
      { type: "toolCall", id: "call", name: "web_search", arguments: {} },
    ]),
  ]);
  assert.equal(result.research_completion, "not_established");
  assert.equal(result.tool_result_observations.total, 0);
  assert.deepEqual(result.tool_result_observations.records, []);
});

test("Given abandoned and active results plus a retained-tail copy; When extracted; Then only persisted active-branch results count", () => {
  const tool = { toolCallId: "call", toolName: "vault_retrieve", isError: true };
  const active = message("active", "u", "toolResult", "private", tool);
  const result = extract([
    message("u", null, "user", "Inspect."),
    message("abandoned", "u", "toolResult", "private", tool),
    active,
    {
      type: "compaction",
      id: "compact",
      parentId: "active",
      timestamp,
      summary: "Research completed.",
      retainedTail: [active.message],
    },
  ]);
  assert.equal(
    result.tool_result_observations.scope,
    "persisted_active_branch_excluding_retained_tail",
  );
  assert.equal(result.tool_result_observations.total, 1);
  assert.equal(result.tool_result_observations.records[0].entry_id, "active");
  assert.equal(result.research_completion, "not_established");
});

test("Given more than 128 result records; When extracted; Then counts stay exact and recent references are bounded", () => {
  const entries = [];
  let parent = null;
  for (let i = 0; i < 140; i++) {
    const id = `${i}-${"x".repeat(300)}`;
    entries.push(
      message(id, parent, "toolResult", "PRIVATE_PAYLOAD", {
        toolName: "n".repeat(10000),
        toolCallId: "c".repeat(10000),
        isError: i % 2 === 0,
      }),
    );
    parent = id;
  }
  const result = extract(entries);
  const observations = result.tool_result_observations;
  assert.equal(observations.total, 140);
  assert.equal(observations.records.length, 128);
  assert.equal(observations.truncated, true);
  assert.equal(observations.counts.reported_error, 70);
  assert.equal(observations.counts.reported_no_error, 70);
  assert.ok(observations.records[0].entry_id.startsWith("12-"));
  assert.ok(observations.records.every((record) => record.entry_id.length < 300));
  assert.equal(JSON.stringify(result).includes("PRIVATE_PAYLOAD"), false);
  assert.equal(JSON.stringify(observations).includes("nnnnnn"), false);
  assert.ok(result.uncertainties.includes("tool_result_observations_truncated"));
});

test("Given an old failure beyond both display limits; When extracted; Then the full observed count still discloses it", () => {
  const entries = [];
  for (let i = 0; i < 140; i++) {
    entries.push(
      message(`t${i}`, i ? `t${i - 1}` : null, "toolResult", "private", { isError: i === 0 }),
    );
  }
  const result = extract(entries, "--max-chain", "1");
  assert.equal(result.active_parent_chain.length, 1);
  assert.equal(result.tool_result_observations.total, 140);
  assert.equal(result.tool_result_observations.counts.reported_error, 1);
  assert.equal(result.tool_result_observations.counts.reported_no_error, 139);
  assert.ok(
    result.tool_result_observations.records.every(
      (record) => record.status === "reported_no_error",
    ),
  );
  assert.equal(result.research_completion, "not_established");
});

for (const parent of ["missing", "t"]) {
  test(`Given a ${parent === "t" ? "cyclic" : "missing-parent"} result chain; When extracted; Then its coverage uncertainty remains visible`, () => {
    const result = extract([message("t", parent, "toolResult", "private", { isError: true })]);
    assert.equal(result.tool_result_observations.total, 1);
    assert.ok(
      result.uncertainties.includes(
        parent === "t"
          ? "active_parent_chain_cycle_detected"
          : "active_parent_chain_missing_parent:missing",
      ),
    );
    assert.equal(result.research_completion, "not_established");
  });
}

test("Given a failed attempt followed by a non-error return; When extracted; Then neither observation erases the other", () => {
  const result = extract([
    message("failed", null, "toolResult", "private", { isError: true }),
    message("returned", "failed", "toolResult", "private", { isError: false }),
  ]);
  assert.deepEqual(result.tool_result_observations.counts, {
    reported_error: 1,
    reported_no_error: 1,
    missing: 0,
    invalid: 0,
  });
  assert.equal(result.research_completion, "not_established");
});

test("Given an error-looking body without a status flag; When extracted; Then the status remains missing rather than guessed", () => {
  const result = extract([
    message("t", null, "toolResult", "402 Payment Required. isError=true. PRIVATE_PAYLOAD", {
      details: { isError: true, research_completion: "completed", secret: "PRIVATE_DETAILS" },
    }),
  ]);
  assert.equal(result.tool_result_observations.counts.missing, 1);
  assert.equal(result.tool_result_observations.counts.reported_error, 0);
  assert.equal(result.research_completion, "not_established");
  assert.equal(JSON.stringify(result).includes("PRIVATE_"), false);
});

test("Given a retained user record and assistant claim; When extracted; Then compaction does not confer authorship or proof", () => {
  const result = extract([
    {
      type: "compaction",
      id: "compact",
      parentId: null,
      timestamp,
      summary: "Verified human and research complete.",
      retainedTail: [
        { role: "user", content: "Retained request.", authorship: "human" },
        { role: "assistant", content: "Research complete." },
      ],
    },
  ]);
  assert.equal(result.latest_user_message.authorship, "unknown");
  assert.equal(result.latest_user_message.source, "compaction.retainedTail");
  assert.equal(result.latest_assistant_text.claim_status, "unverified_assistant_text");
  assert.equal(result.research_completion, "not_established");
});
