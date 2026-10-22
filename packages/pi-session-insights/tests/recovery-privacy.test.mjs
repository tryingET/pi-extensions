// Synthetic independent-hold regressions. No real session content belongs here.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, "bin/pi-session-insights.mjs");
const projection = join(root, "bin/recovery-model-projection.mjs");
function scratch(fn) {
  const dir = mkdtempSync(join(tmpdir(), "recovery-privacy-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function fixture(dir, rows) {
  const file = join(dir, "synthetic.jsonl");
  writeFileSync(
    file,
    `${rows.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n")}\n`,
  );
  return file;
}
function run(file, args = []) {
  const r = spawnSync(process.execPath, [cli, "--format", "claude", ...args, file], {
    encoding: "utf8",
  });
  return { ...r, data: JSON.parse(r.stdout) };
}
function project(file) {
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  return spawnSync(process.execPath, [projection, "--artifact-sha256", sha, file], {
    encoding: "utf8",
  });
}
const privatePath = "/private/tool-results/PUPIL_SYNTHETIC_SENTINEL.txt";

test("projection failures suppress malformed artifact diagnostics", () =>
  scratch((dir) => {
    const artifact = join(dir, "malformed.json");
    writeFileSync(
      artifact,
      JSON.stringify({
        schema: "agent.session-recovery.claude.v1",
        ok: true,
        records: ["MALFORMED_PRIVATE_SENTINEL"],
      }),
    );
    const out = project(artifact);
    assert.notEqual(out.status, 0);
    assert.ok(!(out.stdout + out.stderr).includes("MALFORMED_PRIVATE_SENTINEL"));
  }));
const rows = () => [
  {
    type: "user",
    uuid: "u",
    parentUuid: null,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t", content: `output ${privatePath}` }],
    },
  },
  {
    type: "user",
    uuid: "v",
    parentUuid: "u",
    toolUseResult: { filePath: "not-a-path\nPUPIL_SYNTHETIC_BODY_SENTINEL" },
  },
];

test("F2 default paths are withheld, including path fragments found inside omitted tool bodies", () =>
  scratch((dir) => {
    const out = run(fixture(dir, rows()));
    assert.equal(out.status, 0, out.stderr);
    assert.ok(!(out.stdout + out.stderr).includes("SENTINEL"));
    const ref = out.data.records[0].sidecars[0];
    assert.equal(ref.path, null);
    assert.equal(ref.path_omitted, true);
    assert.equal(ref.path_sha256, createHash("sha256").update(privatePath).digest("hex"));
    assert.deepEqual(ref.source_ref, { line: 1, ordinal: 0 });
    assert.deepEqual(out.data.records[1].sidecars, []);
    assert.ok(out.data.records[1].issues.includes("invalid_sidecar_path"));
    assert.equal(out.data.privacy.model_exposure, "private_receipt_or_allowlisted_projection_only");
  }));

test("F2 exact paths and visible text require exclusive private artifacts, with a path/body-free receipt", () =>
  scratch((dir) => {
    const file = fixture(dir, [
      ...rows(),
      { type: "user", uuid: "w", message: { role: "user", content: "VISIBLE_PRIVATE_SENTINEL" } },
    ]);
    for (const arg of ["--include-text", "--include-paths"]) {
      assert.equal(run(file, [arg]).data.error.code, "PRIVATE_OUTPUT_REQUIRED");
    }
    const target = join(dir, "private-facts.json");
    const out = run(file, ["--include-paths", "--include-text", "--private-output", target]);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.data.schema, "agent.session-recovery.private-receipt.v1");
    assert.ok(!(out.stdout + out.stderr).includes("SENTINEL"));
    assert.equal(statSync(target).mode & 0o777, 0o600);
    const bytes = readFileSync(target);
    assert.equal(out.data.artifact_sha256, createHash("sha256").update(bytes).digest("hex"));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(artifact.records[0].sidecars[0].path, privatePath);
    assert.equal(artifact.records[2].message.text, "VISIBLE_PRIVATE_SENTINEL");
    const before = readFileSync(target);
    const again = run(file, ["--include-paths", "--private-output", target]);
    assert.notEqual(again.status, 0);
    assert.deepEqual(readFileSync(target), before);
    const shared = join(dir, "shared");
    mkdirSync(shared, { mode: 0o755 });
    assert.equal(
      run(file, ["--private-output", join(shared, "no.json")]).data.error.code,
      "PRIVATE_OUTPUT_REQUIRED",
    );
  }));

test("F2 model projection excludes arbitrary metadata strings, not only ordinary message bodies", () =>
  scratch((dir) => {
    const file = fixture(dir, [
      {
        type: "TYPE_PRIVATE_SENTINEL",
        uuid: "UUID_PRIVATE_SENTINEL",
        sessionId: "SESSION_PRIVATE_SENTINEL",
        version: "VERSION_PRIVATE_SENTINEL",
        timestamp: "TIME_PRIVATE_SENTINEL",
        origin: { kind: "ORIGIN_PRIVATE_SENTINEL" },
        message: {
          role: "ROLE_PRIVATE_SENTINEL",
          content: [
            {
              type: "tool_use",
              id: "TOOL_ID_PRIVATE_SENTINEL",
              name: "TOOL_NAME_PRIVATE_SENTINEL",
            },
          ],
        },
        toolUseResult: { outputFile: privatePath },
      },
    ]);
    const target = join(dir, "facts.json");
    const out = run(file, ["--private-output", target]);
    assert.equal(out.status, 0);
    assert.ok(readFileSync(target, "utf8").includes("UUID_PRIVATE_SENTINEL"));
    assert.ok(!out.stdout.includes("SENTINEL"));
    const r = project(target);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!(r.stdout + r.stderr).includes("SENTINEL"));
    const data = JSON.parse(r.stdout);
    assert.equal(data.schema, "agent.session-recovery.model-projection.v1");
    assert.equal(data.content_included, false);
    assert.equal(data.records[0].line, 1);
    assert.equal(data.records[0].uuid_present, true);
    assert.equal(data.coverage.unsupported_records, 1);
  }));

test("F2 Pi projection excludes malicious IDs and names as well as its legacy text fields", () =>
  scratch((dir) => {
    const file = fixture(dir, [
      {
        type: "session",
        version: 3,
        id: "PI_SESSION_PRIVATE_SENTINEL",
        cwd: "/private/PRIVATE_SENTINEL",
        timestamp: "2026-10-22T00:00:00Z",
      },
      {
        type: "message",
        id: "ENTRY_PRIVATE_SENTINEL",
        parentId: null,
        message: { role: "user", content: "PI_BODY_PRIVATE_SENTINEL", timestamp: 1 },
      },
    ]);
    const raw = spawnSync(process.execPath, [cli, file], { encoding: "utf8" });
    assert.equal(raw.status, 0);
    const target = join(dir, "pi-facts.json");
    writeFileSync(target, raw.stdout, { mode: 0o600 });
    const r = project(target);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!(r.stdout + r.stderr).includes("SENTINEL"));
    assert.equal(JSON.parse(r.stdout).harness, "pi");
  }));

test("F1 nonstandard numeric tokens are explicit physical errors, not normalized parsed objects", () =>
  scratch((dir) => {
    const tokens = ["NaN", "Infinity", "-Infinity", "01", "-01", "+1", ".1", "1.", "0x10", "1e"];
    const file = fixture(
      dir,
      tokens.map((t, i) => `{"type":"user","uuid":"n${i}","parentUuid":${t}}`),
    );
    const out = run(file);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.data.coverage.physical_lines, tokens.length);
    assert.equal(out.data.coverage.parsed_objects, 0);
    assert.equal(out.data.coverage.parse_errors, tokens.length);
    assert.deepEqual(
      out.data.records.map((r) => r.source.line),
      tokens.map((_, i) => i + 1),
    );
    assert.ok(
      out.data.records.every((r) => ["malformed_json", "nonstandard_json_token"].includes(r.error)),
    );
    assert.ok(!out.stdout.includes("NaN"));
  }));

test("F1 valid numbers and token-looking escaped strings remain accepted", () =>
  scratch((dir) => {
    const nums = ["0", "-0", "1", "-1", "0.125", "1e2", "-1.25E-02", "1e+01"];
    const file = fixture(dir, [
      ...nums.map((n, i) => `{"type":"user","uuid":"v${i}","number":${n}}`),
      { type: "user", uuid: "s", message: { content: 'quoted "NaN" Infinity 01 \\ , : [ ] {}' } },
    ]);
    const out = run(file);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.data.coverage.parse_errors, 0);
    assert.equal(out.data.coverage.parsed_objects, nums.length + 1);
  }));

test("F3 distinct enumeration totals cover values before display truncation", () =>
  scratch((dir) => {
    const file = fixture(
      dir,
      Array.from({ length: 70 }, (_, i) => ({ type: `future-${i}`, version: `future-${i}` })),
    );
    const out = run(file);
    assert.equal(out.status, 0);
    assert.equal(out.data.coverage.record_type_distinct_total, 70);
    assert.equal(out.data.coverage.version_distinct_total, 70);
    assert.equal(out.data.coverage.record_types.length, 64);
    assert.equal(out.data.coverage.versions.length, 16);
    assert.equal(out.data.coverage.record_types_truncated, true);
    assert.equal(out.data.coverage.versions_truncated, true);
  }));
