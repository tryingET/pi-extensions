// ---
// summary: verifies exact-task AK read/authorization rules and dispatch evidence recording.
// read_when:
//   - changing AK authorization boundaries or evidence semantics.
// ---

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AkAuthorizationError,
  authorizeExactTask,
  readAkTask,
  recordDispatchEvidence,
} from "../src/dispatch-authorization.ts";

function writeFakeAk(dir, source) {
  const bin = join(dir, "ak");
  writeFileSync(bin, `#!/usr/bin/env node\n${source}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function withScratch(fn) {
  const dir = mkdtempSync(join(tmpdir(), "ak-auth-"));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

const CLAIMED_TASK = {
  id: 5132,
  repo: "/repo/alpha",
  title: "Fleet phase 2 proof",
  status: "claimed",
  claimed_by: "claimer-1",
  lease_expires_at: "2999-01-01T00:00:00.000000000+00:00",
};

test("readAkTask parses the ak task-show JSON envelope", async () => {
  await withScratch(async (dir) => {
    const bin = writeFakeAk(
      dir,
      `process.stdout.write(${JSON.stringify(JSON.stringify(CLAIMED_TASK))} + "\\n");`,
    );
    const task = await readAkTask(5132, { akBinary: bin });
    assert.deepEqual(task, CLAIMED_TASK);
  });
});

test("readAkTask fails closed on ak absence, bad exit, bad JSON, and identity drift", async () => {
  await withScratch(async (dir) => {
    await assert.rejects(readAkTask(5132, { akBinary: join(dir, "missing") }), (error) => {
      assert.ok(error instanceof AkAuthorizationError);
      assert.equal(error.code, "ak_unavailable");
      return true;
    });
    const failing = writeFakeAk(dir, `process.stderr.write("boom\\n"); process.exit(1);`);
    await assert.rejects(readAkTask(5132, { akBinary: failing }), /could not be read/);
    const garbage = writeFakeAk(dir, `process.stdout.write("not-json");`);
    await assert.rejects(readAkTask(5132, { akBinary: garbage }), /unparseable output/);
    const mismatched = writeFakeAk(
      dir,
      `process.stdout.write(${JSON.stringify(JSON.stringify({ ...CLAIMED_TASK, id: 9999 }))} + "\\n");`,
    );
    await assert.rejects(readAkTask(5132, { akBinary: mismatched }), (error) => {
      assert.equal(error.code, "task_not_found");
      return true;
    });
  });
});

test("authorizeExactTask binds repo, claim state, and lease freshness", () => {
  const ok = authorizeExactTask(CLAIMED_TASK, "/repo/alpha");
  assert.deepEqual(ok, { ok: true });
  assert.equal(
    authorizeExactTask(CLAIMED_TASK, "/repo/alpha/").ok,
    true,
    "trailing slash tolerant",
  );
  const mismatch = authorizeExactTask(CLAIMED_TASK, "/repo/beta");
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "task_repo_mismatch");
  const pending = authorizeExactTask({ ...CLAIMED_TASK, status: "pending" }, "/repo/alpha");
  assert.equal(pending.code, "task_not_claimed");
  const unclaimed = authorizeExactTask({ ...CLAIMED_TASK, claimed_by: null }, "/repo/alpha");
  assert.equal(unclaimed.code, "task_not_claimed");
  const staleLease = authorizeExactTask(
    { ...CLAIMED_TASK, lease_expires_at: "2000-01-01T00:00:00.000000000+00:00" },
    "/repo/alpha",
  );
  assert.equal(staleLease.code, "task_lease_expired");
  const noLease = authorizeExactTask({ ...CLAIMED_TASK, lease_expires_at: null }, "/repo/alpha");
  assert.equal(noLease.code, "task_lease_expired");
  const malformedLease = authorizeExactTask(
    { ...CLAIMED_TASK, lease_expires_at: "not-a-time" },
    "/repo/alpha",
  );
  assert.equal(malformedLease.code, "task_lease_expired");
});

test("recordDispatchEvidence captures the ak evidence id", async () => {
  await withScratch(async (dir) => {
    const bin = writeFakeAk(dir, `console.log("Recorded evidence #777 task=5132");`);
    const result = await recordDispatchEvidence(
      { taskId: 5132, details: { receiptSha256: "a".repeat(64) } },
      { akBinary: bin },
    );
    assert.equal(result.evidenceId, 777);
    const failing = writeFakeAk(dir, `process.exit(3);`);
    await assert.rejects(
      recordDispatchEvidence({ taskId: 5132, details: {} }, { akBinary: failing }),
      /AK evidence recording failed/,
    );
    const noId = writeFakeAk(dir, `console.log("something else");`);
    await assert.rejects(
      recordDispatchEvidence({ taskId: 5132, details: {} }, { akBinary: noId }),
      /no evidence id/,
    );
  });
});
