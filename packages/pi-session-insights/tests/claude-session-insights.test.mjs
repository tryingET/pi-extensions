// Synthetic only. Never copy real sessions or private evaluation text here.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, "bin/pi-session-insights.mjs");
const msg = (uuid, parentUuid = null, content = "synthetic\nmultiline") => ({
  type: "user",
  uuid,
  parentUuid,
  sessionId: "synthetic-session",
  version: "2.1.280",
  message: { role: "user", content },
});
function scratch(fn) {
  const dir = mkdtempSync(join(tmpdir(), "claude-insights-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function fixture(dir, rows) {
  const path = join(dir, "session.jsonl");
  writeFileSync(
    path,
    `${rows.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n")}\n`,
  );
  return path;
}
function run(file, args = [], env = {}) {
  const result = spawnSync(process.execPath, [cli, "--format", "claude", ...args, file], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 4_194_304,
  });
  return { ...result, data: JSON.parse(result.stdout) };
}
function good(file, args = []) {
  const result = run(file, args);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.data;
}
function script(dir, body) {
  const path = join(dir, "jq-wrapper");
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o700 });
  return path;
}

test("explicit Claude adapter preserves physical lines, branches and differing pointer without asserting active leaf", () =>
  scratch((dir) => {
    const file = fixture(dir, [
      msg("u"),
      msg("branch", "u"),
      msg("other", "u"),
      { type: "last-prompt", leafUuid: "branch" },
    ]);
    const out = good(file, ["--page-size", "2"]);
    assert.equal(out.schema, "agent.session-recovery.claude.v1");
    assert.equal(out.coverage.physical_lines, 4);
    assert.equal(out.coverage.uuid_nodes, 3);
    assert.equal(out.coverage.leaf_count, 2);
    assert.deepEqual(out.graph.last_appended_uuid, { line: 3, uuid: "other" });
    assert.equal(out.graph.last_prompt_pointer.leaf_uuid, "branch");
    assert.equal(out.graph.active_leaf, "not_inferred");
    assert.equal(out.graph.effective_context, "unsupported");
    assert.equal(out.pagination.next_page, 2);
    const second = good(file, ["--page-size", "2", "--page", "2"]);
    assert.deepEqual(
      second.records.map((r) => r.source.line),
      [3, 4],
    );
    assert.equal(second.pagination.next_page, null);
    assert.equal(out.records[0].message.text, null);
    assert.equal(out.records[0].message.text_omitted, true);
    assert.equal(out.custody.sha256, createHash("sha256").update(readFileSync(file)).digest("hex"));
    assert.match(out.custody.read_binding, /single_descriptor/);
    const leaves = good(file, ["--view", "leaves", "--page-size", "1"]);
    assert.equal(leaves.pagination.total, 2);
    assert.equal(leaves.pagination.next_page, 2);
  }));

test("torn/malformed/non-object and blank records are paged machine errors without source leakage", () =>
  scratch((dir) => {
    const file = fixture(dir, [msg("u"), '{"PRIVATE_SENTINEL":', "null", "", msg("v", "u")]);
    const out = good(file);
    assert.equal(out.coverage.physical_lines, 5);
    assert.equal(out.coverage.parse_errors, 3);
    assert.equal(out.coverage.parsed_objects, 2);
    assert.deepEqual(
      out.records.map((r) => r.source.line),
      [1, 2, 3, 4, 5],
    );
    assert.equal(out.records[1].error, "malformed_json");
    assert.equal(out.records[2].error, "record_not_object");
    assert.ok(!JSON.stringify(out).includes("PRIVATE_SENTINEL"));
    assert.equal(good(file, ["--view", "errors"]).pagination.total, 3);
  }));

test("optional text preserves multiline only for user/assistant and never emits private body sentinels", () =>
  scratch((dir) => {
    const file = fixture(dir, [
      msg("u"),
      {
        ...msg("a", "u"),
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "public\nexample" },
            { type: "thinking", thinking: "THINKING_SENTINEL" },
            { type: "tool_use", id: "t", name: "Task", input: { prompt: "INPUT_SENTINEL" } },
          ],
        },
      },
      {
        ...msg("r", "a"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t",
              is_error: true,
              content: "TOOL_BODY_SENTINEL",
            },
          ],
        },
        toolUseResult: { stdout: "STDOUT_SENTINEL" },
      },
      { type: "system", message: { content: "SYSTEM_SENTINEL" } },
      { type: "attachment", attachment: { type: "instructions", content: "ATTACHMENT_SENTINEL" } },
      { type: "queue-operation", operation: "enqueue", content: "QUEUE_SENTINEL" },
    ]);
    const artifact = join(dir, "private-text.json");
    const receipt = good(file, [
      "--include-text",
      "--max-text-chars",
      "8",
      "--private-output",
      artifact,
    ]);
    assert.equal(receipt.private_output_written, true);
    const out = JSON.parse(readFileSync(artifact, "utf8"));
    assert.equal(out.records[0].message.text, "syntheti");
    assert.equal(out.records[0].message.text_truncated, true);
    assert.equal(out.records[1].message.text, "public\ne");
    assert.equal(out.records[2].tools[0].reported_error, true);
    assert.equal(out.records[3].message.text_omitted, true);
    assert.ok(!JSON.stringify(out).includes("SENTINEL"));
  }));

test("peer-origin user messages stay unknown and compaction/logical-parent metadata is not effective context", () =>
  scratch((dir) => {
    const file = fixture(dir, [
      {
        ...msg("u"),
        origin: { kind: "peer", body: "PEER_BODY_SENTINEL", msg_id: "m" },
        turnOrigin: "peer",
        sourceToolUseID: "t",
        isSidechain: true,
        agentId: "child",
      },
      {
        type: "system",
        uuid: "c",
        parentUuid: "u",
        subtype: "compact_boundary",
        logicalParentUuid: "older",
        compactMetadata: { preTokens: 1000, trigger: "auto" },
      },
      { ...msg("s", "c"), isCompactSummary: true },
    ]);
    const out = good(file);
    assert.equal(out.records[0].message.authorship, "unknown");
    assert.equal(out.records[0].message.origin_kind, "peer");
    assert.equal(out.coverage.compaction_records, 2);
    const compact = good(file, ["--view", "compactions"]);
    assert.equal(compact.records[0].compaction.logical_parent_uuid, "older");
    assert.equal(compact.records[0].compaction.effective_context, "unsupported");
    assert.ok(!JSON.stringify(out).includes("PEER_BODY_SENTINEL"));
  }));

test("every projected child/task/peer reference independently appears in reference pages", () =>
  scratch((dir) => {
    const refs = [
      { agentId: "a" },
      { parentToolUseID: "t" },
      { parentSessionId: "s" },
      { sourceToolUseID: "t" },
      { sourceToolAssistantUUID: "a" },
      { data: { agentId: "a" } },
      ...["task_id", "backgroundTaskId", "agentId", "msg_id"].map((key) => ({
        toolUseResult: { [key]: "id" },
      })),
    ];
    const file = fixture(
      dir,
      refs.map((r, i) => ({ ...msg(String(i)), ...r })),
    );
    const out = good(file, ["--view", "references"]);
    assert.equal(out.pagination.total, refs.length);
    assert.equal(out.records.length, refs.length);
  }));

test("missing sidecar is explicit, checked only inside selected root; no tool-body emission or symlink escape", () =>
  scratch((dir) => {
    const sidecars = join(dir, "tool-results");
    mkdirSync(sidecars);
    const present = join(sidecars, "present.txt");
    writeFileSync(present, "PRIVATE_SIDECAR_SENTINEL");
    const missing = join(sidecars, "missing.txt");
    symlinkSync(root, join(sidecars, "escape"));
    const file = fixture(dir, [
      {
        ...msg("u"),
        toolUseResult: { outputFile: present },
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "t",
              content: `<persisted-output>${missing}</persisted-output>`,
            },
          ],
        },
      },
      { ...msg("v"), toolUseResult: { outputFile: join(sidecars, "escape/package.json") } },
    ]);
    const noCheck = good(file);
    assert.ok(noCheck.records[0].sidecars.every((r) => r.status === "not_inspected"));
    const out = good(file, ["--sidecar-root", dir]);
    assert.deepEqual(out.records[0].sidecars.map((r) => r.status).sort(), [
      "missing",
      "present_unread",
    ]);
    assert.equal(out.records[1].sidecars[0].status, "outside_allowed_root");
    assert.ok(!JSON.stringify(out).includes("PRIVATE_SIDECAR_SENTINEL"));
  }));

test("chains explicitly report missing parents, cycles, duplicates, limits, and invalid parents", () =>
  scratch((dir) => {
    let file = fixture(dir, [msg("a", "b"), msg("b", "a")]);
    assert.equal(good(file, ["--view", "chain", "--leaf", "a"]).graph.chain_status, "cycle");
    assert.equal(
      good(file, ["--view", "chain", "--leaf", "a", "--max-chain", "1"]).graph.chain_status,
      "budget_exhausted",
    );
    file = fixture(dir, [msg("a", "missing")]);
    assert.equal(
      good(file, ["--view", "chain", "--leaf", "a"]).graph.chain_status,
      "missing_parent",
    );
    assert.equal(good(file).coverage.missing_parent_count, 1);
    file = fixture(dir, [msg("a"), msg("a")]);
    assert.equal(
      good(file, ["--view", "chain", "--leaf", "a"]).graph.chain_status,
      "ambiguous_duplicate_uuids",
    );
    for (const parent of [12, {}, "", "p".repeat(257)]) {
      file = fixture(dir, [msg("a", parent)]);
      assert.equal(
        good(file, ["--view", "chain", "--leaf", "a"]).graph.chain_status,
        "invalid_parent",
      );
    }
  }));

test("malformed nested shapes and unknown variants retain records and surface issues", () =>
  scratch((dir) => {
    const rows = [
      ...[42, "bad", [], true].map((message, i) => ({ type: "user", uuid: `m${i}`, message })),
      { type: "future-record", uuid: "future" },
      { type: "user", message: { content: 42 } },
      { type: "assistant", message: { content: [1, null, "bad", {}] } },
    ];
    const file = fixture(dir, rows);
    const out = good(file);
    assert.equal(out.records.length, rows.length);
    assert.equal(out.coverage.records_with_shape_or_type_issues, rows.length);
    assert.equal(out.coverage.unsupported_record_count, 1);
    assert.ok(out.records.every((r) => r.issues.length));
  }));

test("budgets fail closed or preserve physical error refs; no silently capped all", () =>
  scratch((dir) => {
    let file = fixture(dir, [msg("u")]);
    assert.equal(run(file, ["--max-input-bytes", "1"]).data.error.code, "INPUT_BUDGET_EXCEEDED");
    for (const args of [
      ["--page-size", "101"],
      ["--max-chain", "4097"],
      ["--page", "0"],
      ["--view", "chain"],
      ["--attribution", file],
    ]) {
      assert.equal(run(file, args).data.error.code, "INVALID_ARGUMENT");
    }
    file = fixture(dir, ["x".repeat(8_388_609), msg("u")]);
    assert.equal(good(file).records[0].error, "line_budget_exceeded");
    assert.equal(good(file).records[1].source.line, 2);
    file = fixture(dir, Array(200_001).fill("{}"));
    assert.equal(run(file).data.error.code, "JQ_EXTRACTION_FAILED");
    file = fixture(dir, [
      {
        type: "assistant",
        message: { content: Array(50_000).fill({ type: "tool_use", id: "t", name: "Task" }) },
      },
    ]);
    assert.equal(run(file).data.ok, false);
  }));

test("source changes during jq withhold payload and jq diagnostics never leak", () =>
  scratch((dir) => {
    const file = fixture(dir, [msg("a")]);
    const changing = script(dir, `printf '\\n' >> '${file}'; exec jq "$@"`);
    const changed = run(file, ["--jq-bin", changing]);
    assert.equal(changed.status, 3);
    assert.equal(changed.data.error.code, "SOURCE_CHANGED");
    assert.ok(!changed.stdout.includes("synthetic"));
    const failing = script(dir, "echo 'PRIVATE_DIAGNOSTIC_SENTINEL' >&2; exit 7");
    const failed = run(file, ["--jq-bin", failing]);
    assert.equal(failed.data.error.code, "JQ_EXTRACTION_FAILED");
    assert.ok(!(failed.stdout + failed.stderr).includes("PRIVATE_DIAGNOSTIC_SENTINEL"));
  }));

test("ABA pathname swap cannot make jq read a different file from the hashed snapshot", () =>
  scratch((dir) => {
    const a = fixture(dir, [msg("a")]);
    const b = join(dir, "other.jsonl");
    writeFileSync(b, `${JSON.stringify(msg("b"))}\n`);
    const link = join(dir, "source.jsonl");
    symlinkSync(a, link);
    const swapping = script(dir, `ln -sfn '${b}' '${link}'; jq "$@"; ln -sfn '${a}' '${link}'`);
    const out = run(link, ["--jq-bin", swapping]);
    assert.equal(out.status, 0);
    assert.equal(out.data.records[0].source.uuid, "a");
    assert.equal(
      out.data.custody.sha256,
      createHash("sha256").update(readFileSync(a)).digest("hex"),
    );
  }));

test("invalid UTF-8 fails closed while literal replacement character is accepted", () =>
  scratch((dir) => {
    const file = join(dir, "session.jsonl");
    writeFileSync(
      file,
      Buffer.concat([
        Buffer.from('{"type":"user","message":{"content":"'),
        Buffer.from([255]),
        Buffer.from('"}}\n'),
      ]),
    );
    assert.equal(run(file).data.error.code, "INVALID_UTF8");
    fixture(dir, [msg("a", null, "valid replacement: \uFFFD")]);
    assert.equal(good(file).coverage.parse_errors, 0);
  }));

test("recognized malformed block payloads retain explicit issues", () =>
  scratch((dir) => {
    const file = fixture(dir, [
      {
        ...msg("a"),
        message: {
          role: "user",
          content: [
            { type: "text", text: 42 },
            { type: "text", text: [] },
            { type: "tool_use", id: 42, name: "Task" },
            { type: "tool_result", tool_use_id: 12, is_error: "false" },
          ],
        },
      },
    ]);
    const out = good(file);
    assert.equal(out.coverage.records_with_shape_or_type_issues, 1);
    assert.deepEqual(
      out.records[0].issues.sort(),
      ["invalid_text_block", "invalid_tool_call_metadata", "invalid_tool_result_metadata"].sort(),
    );
  }));

test("growth/truncation during descriptor reads are detected deterministically", () =>
  scratch((dir) => {
    const file = fixture(dir, [msg("a", null, "x".repeat(70_000))]);
    const preload = join(dir, "read-race.mjs");
    writeFileSync(
      preload,
      `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const read=fs.readSync; const file=${JSON.stringify(file)}; let reads=0;
fs.readSync=function(fd,...args){ const target=fs.statSync(file); const actual=fs.fstatSync(fd);
 if(actual.ino===target.ino && actual.dev===target.dev && ++reads===2){
   if(process.env.TEST_READ_RACE==='grow') fs.appendFileSync(file,'x'.repeat(10000));
   else fs.truncateSync(file,20);
 } return read.call(fs,fd,...args); }; syncBuiltinESMExports();`,
    );
    const env = { NODE_OPTIONS: `--import=${preload}`, TEST_READ_RACE: "grow" };
    assert.equal(
      run(file, ["--max-input-bytes", "73000"], env).data.error.code,
      "INPUT_BUDGET_EXCEEDED",
    );
    fixture(dir, [msg("a", null, "x".repeat(70_000))]);
    assert.equal(
      run(file, [], { ...env, TEST_READ_RACE: "truncate" }).data.error.code,
      "SOURCE_CHANGED",
    );
  }));

test("documented Pi private-first workflow emits only a selected body-free projection", () =>
  scratch((dir) => {
    const file = fixture(dir, [
      {
        type: "session",
        id: "pi-private",
        version: 3,
        cwd: "/synthetic",
        timestamp: "2026-10-22T00:00:00Z",
      },
      {
        type: "message",
        id: "u",
        parentId: null,
        message: { role: "user", content: "PI_PRIVATE_SENTINEL", timestamp: 1 },
      },
    ]);
    const output = join(dir, "pi-facts.json");
    const result = spawnSync(
      "bash",
      [
        "-c",
        `(umask 077; set -o noclobber; node '${cli}' --format pi '${file}' 2>/dev/null > '${output}') && node '${join(root, "bin/recovery-model-projection.mjs")}' '${output}'`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!(result.stdout + result.stderr).includes("PI_PRIVATE_SENTINEL"));
    assert.ok(readFileSync(output, "utf8").includes("PI_PRIVATE_SENTINEL"));
  }));

test("declared support is separate from observed versions and unknown formats", () =>
  scratch((dir) => {
    let file = fixture(dir, [msg("u")]);
    assert.equal(good(file).support.full_schema_coverage, false);
    assert.equal(
      good(file).support.observed_version_status,
      "qualified_version_observed_not_full_format_coverage",
    );
    file = fixture(dir, [{ ...msg("u"), version: "future-9" }]);
    assert.equal(good(file).support.observed_version_status, "unqualified_version_present");
    file = fixture(dir, [{ type: "future-schema" }]);
    assert.equal(good(file).support.observed_version_status, "unknown");
    assert.equal(good(file).coverage.unsupported_record_count, 1);
  }));

test("default Pi invocation remains compatible and does not auto-detect Claude", () =>
  scratch((dir) => {
    const file = fixture(dir, [msg("a")]);
    const result = spawnSync(process.execPath, [cli, file], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    const pi = join(root, "tests/fixtures/controller.jsonl");
    const original = spawnSync(process.execPath, [cli, pi], { encoding: "utf8" });
    const explicit = spawnSync(process.execPath, [cli, "--format", "pi", pi], { encoding: "utf8" });
    assert.equal(original.status, 0);
    assert.equal(explicit.stdout, original.stdout);
  }));
