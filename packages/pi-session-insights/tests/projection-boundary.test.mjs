// Synthetic invocation/error-channel regressions for independent HOLD R2-F4.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wrapper = join(root, "bin/recovery-model-projection.mjs");
const extractor = join(root, "bin/pi-session-insights.mjs");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
function scratch(fn) {
  const d = mkdtempSync(join(tmpdir(), "projection-boundary-"));
  try {
    fn(d);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}
function run(file, args = []) {
  const r = spawnSync(process.execPath, [wrapper, ...args, file], { encoding: "utf8" });
  return { ...r, data: JSON.parse(r.stdout) };
}
function privateReceipt(dir, name = "PUPIL_PATH_SENTINEL.json") {
  const source = join(dir, "source.jsonl");
  writeFileSync(
    source,
    `${JSON.stringify({ type: "user", uuid: "BODY_PRIVATE_SENTINEL", message: { content: "TEXT_PRIVATE_SENTINEL" } })}\n`,
  );
  const artifact = join(dir, name);
  const r = spawnSync(
    process.execPath,
    [extractor, "--format", "claude", "--private-output", artifact, source],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const receipt = JSON.parse(r.stdout);
  assert.equal(receipt.artifact_sha256, sha(artifact));
  return { artifact, receipt };
}
function failedWithoutLeak(r) {
  assert.notEqual(r.status, 0);
  assert.equal(r.data.ok, false);
  assert.equal(r.stderr, "");
  assert.ok(!(r.stdout + r.stderr).includes("SENTINEL"));
  assert.equal(r.data.schema, undefined);
}

test("R2-F4 malformed structure in a private-named file exposes fixed error only", () =>
  scratch((d) => {
    const file = join(d, "PUPIL_PATH_SENTINEL.json");
    writeFileSync(
      file,
      JSON.stringify({
        schema: "agent.session-recovery.claude.v1",
        ok: true,
        records: ["BODY_PRIVATE_SENTINEL"],
      }),
    );
    const r = run(file, ["--artifact-sha256", sha(file)]);
    failedWithoutLeak(r);
    assert.equal(r.data.error.code, "PROJECTION_FAILED");
  }));

test("R2-F4 input-open, parse, UTF-8 and budget failures never reflect private filenames or bodies", () =>
  scratch((d) => {
    failedWithoutLeak(run(join(d, "PUPIL_ABSENT_SENTINEL.json")));
    const directory = join(d, "PUPIL_DIRECTORY_SENTINEL");
    mkdirSync(directory);
    failedWithoutLeak(run(directory));
    const file = join(d, "PUPIL_PARSE_SENTINEL.json");
    writeFileSync(file, '{"BODY_PRIVATE_SENTINEL":');
    failedWithoutLeak(run(file, ["--artifact-sha256", sha(file)]));
    writeFileSync(file, Buffer.from([255]));
    const utf = run(file, ["--artifact-sha256", sha(file)]);
    failedWithoutLeak(utf);
    assert.equal(utf.data.error.code, "PROJECTION_INVALID_UTF8");
    writeFileSync(file, "x".repeat(2_097_154));
    const large = run(file);
    failedWithoutLeak(large);
    assert.equal(large.data.error.code, "PROJECTION_INPUT_BUDGET_EXCEEDED");
  }));

test("R2-F4 moved-after-receipt artifact fails safely and preserves the moved artifact", () =>
  scratch((d) => {
    const { artifact, receipt } = privateReceipt(d, "PUPIL_DISAPPEARED_SENTINEL.json");
    const preserved = join(d, "preserved.json");
    renameSync(artifact, preserved);
    const r = run(artifact, ["--artifact-sha256", receipt.artifact_sha256]);
    failedWithoutLeak(r);
    assert.equal(sha(preserved), receipt.artifact_sha256);
  }));

test("projection verifies exact receipt bytes and withholds any mismatch", () =>
  scratch((d) => {
    const { artifact, receipt } = privateReceipt(d);
    const r = run(artifact, ["--artifact-sha256", receipt.artifact_sha256]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.data.expected_artifact_hash_verified, true);
    assert.equal(r.data.artifact_sha256, receipt.artifact_sha256);
    assert.equal(r.data.schema, "agent.session-recovery.model-projection.v1");
    assert.ok(!(r.stdout + r.stderr).includes("SENTINEL"));
    const mismatch = run(artifact, ["--artifact-sha256", "0".repeat(64)]);
    failedWithoutLeak(mismatch);
    assert.equal(mismatch.data.error.code, "ARTIFACT_HASH_MISMATCH");
    const missingHash = run(artifact);
    failedWithoutLeak(missingHash);
    assert.equal(missingHash.data.error.code, "ARTIFACT_HASH_REQUIRED");
  }));

test("trusted jq execution/diagnostic failures are captured, not forwarded", () =>
  scratch((d) => {
    const { artifact, receipt } = privateReceipt(d);
    const program = join(d, "PUPIL_EXECUTABLE_SENTINEL");
    writeFileSync(
      program,
      "#!/usr/bin/env bash\nprintf 'BODY_PRIVATE_SENTINEL'\nprintf 'PUPIL_PATH_SENTINEL' >&2\nexit 9\n",
      { mode: 0o700 },
    );
    failedWithoutLeak(
      run(artifact, ["--artifact-sha256", receipt.artifact_sha256, "--jq-bin", program]),
    );
    failedWithoutLeak(
      run(artifact, [
        "--artifact-sha256",
        receipt.artifact_sha256,
        "--jq-bin",
        join(d, "PUPIL_MISSING_JQ_SENTINEL"),
      ]),
    );
  }));

test("artifact removal during projection exposes neither private source path nor child diagnostics", () =>
  scratch((d) => {
    const { artifact, receipt } = privateReceipt(d);
    const moved = join(d, "preserved-after-open.json");
    const program = join(d, "jq-move");
    writeFileSync(
      program,
      `#!/usr/bin/env bash\nset -euo pipefail\nmv '${artifact}' '${moved}'\nexec jq "$@"\n`,
      { mode: 0o700 },
    );
    const r = run(artifact, ["--artifact-sha256", receipt.artifact_sha256, "--jq-bin", program]);
    failedWithoutLeak(r);
    assert.equal(sha(moved), receipt.artifact_sha256);
  }));

test("Pi projection without native receipt labels observed hash unverified", () =>
  scratch((d) => {
    const file = join(d, "PUPIL_PI_PATH_SENTINEL.json");
    writeFileSync(
      file,
      JSON.stringify({
        schema: "pi.session-insights.v2",
        session_id: "PI_ID_PRIVATE_SENTINEL",
        compaction_count: 1,
      }),
    );
    const r = run(file);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.data.harness, "pi");
    assert.equal(r.data.expected_artifact_hash_verified, false);
    assert.equal(r.data.artifact_sha256, sha(file));
    assert.ok(!(r.stdout + r.stderr).includes("SENTINEL"));
  }));

test("Pi private-first redirection suppresses no-clobber and source-open pathname errors", () =>
  scratch((d) => {
    const output = join(d, "PUPIL_OUTPUT_SENTINEL.json");
    writeFileSync(output, "preserved");
    const missing = join(d, "PUPIL_SOURCE_SENTINEL.jsonl");
    const command = `(umask 077; set -o noclobber; node '${extractor}' --format pi '${missing}' 2>/dev/null > '${output}') && node '${wrapper}' '${output}'`;
    const r = spawnSync("bash", ["-c", command], { encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout + r.stderr, "");
    assert.equal(readFileSync(output, "utf8"), "preserved");
    const absent = join(d, "PUPIL_NEW_OUTPUT_SENTINEL.json");
    const second = spawnSync(
      "bash",
      [
        "-c",
        `(umask 077; set -o noclobber; node '${extractor}' --format pi '${missing}' 2>/dev/null > '${absent}')`,
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(second.status, 0);
    assert.equal(second.stdout + second.stderr, "");
  }));
