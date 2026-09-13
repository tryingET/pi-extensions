import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsMutable, * as fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import test from "node:test";
import { registerAutoresearchLiveSupervisionTool } from "../../src/extension/autoresearch-live-registration.ts";
import {
  LEVEL4_DASHBOARD_MAX_BYTES,
  observeAutoresearchLevel4Dashboard,
} from "../../src/runtime/autoresearch-level4-dashboard-observation.ts";
import { runAutoresearchLevel4CampaignRunner } from "../../src/runtime/autoresearch-level4-runner.ts";
import { withTempDir } from "./helpers.mjs";

function request(cwd) {
  return {
    taskId: 5623,
    cwd,
    objective: "Observe Level 4 / café 🔎",
    scenarios: ["observation"],
    hypotheses: ["no dispatch"],
    candidateCountPerCell: 1,
    parentPeerTarget: "test-controller",
  };
}

function snapshotPath(result) {
  const digest = createHash("sha256").update(result.objective, "utf8").digest("hex");
  return path.join(
    fs.realpathSync(result.cwd),
    ".autoresearch/dashboard/level4",
    `${result.taskId}-${digest}.json`,
  );
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function publicTool() {
  let tool;
  registerAutoresearchLiveSupervisionTool(
    {
      registerTool(value) {
        tool = value;
      },
    },
    {},
  );
  return tool;
}

function call(tool, input) {
  return tool.execute("dashboard-test", {
    action: "level4_autoresearch_campaign_runner",
    ...input,
  });
}

test("dashboard exports actual frozen owner result, exact JSON identity and read-only atomic replacement", async () => {
  await withTempDir(async (cwd) => {
    const input = request(cwd);
    const initial = runAutoresearchLevel4CampaignRunner(input);
    const token = initial.sourceLevel3Executor.level3Runner.requiredToken;
    const result = freeze(
      runAutoresearchLevel4CampaignRunner({ ...input, checkpointConfirmation: token }),
    );
    const before = json(result);
    const journal = fs.readFileSync(result.receiptPath);
    const journalStat = fs.statSync(result.receiptPath);
    const exported = await observeAutoresearchLevel4Dashboard(result);
    const file = snapshotPath(result);
    assert.deepEqual(exported, { observationExport: { ok: true, path: file } });
    const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(snapshot, {
      kind: "autoresearch.level4_dashboard_observation.v1",
      observedAt: snapshot.observedAt,
      taskId: result.taskId,
      cwd: fs.realpathSync(cwd),
      objective: result.objective,
      nonAuthority: true,
      execution: "not_executed_by_orchestrator",
      result: before,
    });
    assert.equal(new Date(snapshot.observedAt).toISOString(), snapshot.observedAt);
    assert.deepEqual(json(result), before);
    assert.equal(Object.hasOwn(result, "observationExport"), false);
    assert.equal(fs.statSync(file).mode & 0o777, 0o400);
    assert.ok(fs.statSync(file).size <= LEVEL4_DASHBOARD_MAX_BYTES);
    const old = fs.openSync(file, "r");
    try {
      assert.equal((await observeAutoresearchLevel4Dashboard(result)).observationExport.ok, true);
      assert.notEqual(fs.fstatSync(old).ino, fs.statSync(file).ino);
      assert.deepEqual(JSON.parse(fs.readFileSync(old, "utf8")), snapshot);
    } finally {
      fs.closeSync(old);
    }
    assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
    assert.deepEqual(fs.readFileSync(result.receiptPath), journal);
    assert.equal(fs.statSync(result.receiptPath).mtimeMs, journalStat.mtimeMs);
    assert.ok(snapshot.result.newReceipts.every((row) => row.effectStatus === "not_dispatched"));
  });
});

test("public Level-4 call exports its returned result; snapshot is never a resume cursor or effect proof", async () => {
  await withTempDir(async (cwd) => {
    const tool = publicTool();
    const input = request(cwd);
    const first = await call(tool, input);
    assert.equal(first.details.observationExport.ok, true);
    const firstOwner = first.details.level4CampaignRunner;
    const file = first.details.observationExport.path;
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).result, json(firstOwner));
    // Even a forged observation cursor cannot advance the owner runner.
    const tampered = JSON.parse(fs.readFileSync(file));
    tampered.result.completedActionCount = 999;
    fs.chmodSync(file, 0o600);
    fs.writeFileSync(file, JSON.stringify(tampered));
    const response = await call(tool, {
      ...input,
      checkpointConfirmation: firstOwner.sourceLevel3Executor.level3Runner.requiredToken,
      allowMeasureExportReview: true,
      allowReviewGeneration: true,
      maxAutomatedActions: 25,
    });
    const owner = response.details.level4CampaignRunner;
    assert.equal(response.details.observationExport.ok, true);
    assert.equal(response.details.ok, owner.metric.status === "target_met");
    assert.equal(owner.execution, "not_executed_by_orchestrator");
    assert.equal(owner.completedActionCount, 0);
    assert.equal(owner.loadedReceiptCount, 0);
    assert.equal(owner.newReceipts.length, 1);
    assert.equal(owner.newReceipts[0].effectStatus, "not_dispatched");
    assert.equal(owner.posture, "awaiting_external_controller");
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).result, json(owner));
    assert.equal(fs.existsSync(path.join(cwd, ".worktrees")), false);
    assert.equal(fs.existsSync(path.join(cwd, "autoresearch.jsonl")), false);
    assert.equal(fs.existsSync(path.join(cwd, "autoresearch.events.jsonl")), false);
  });
});

test("observer failure is public, leaves owner output/journal intact, and never retries owner", async () => {
  await withTempDir(async (cwd) => {
    const input = request(cwd);
    const initial = runAutoresearchLevel4CampaignRunner(input);
    fs.mkdirSync(path.join(cwd, ".autoresearch"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".autoresearch/dashboard"), "not a directory");
    const response = await call(publicTool(), {
      ...input,
      checkpointConfirmation: initial.sourceLevel3Executor.level3Runner.requiredToken,
    });
    const owner = response.details.level4CampaignRunner;
    assert.ok(owner);
    assert.equal(response.details.observationExport.ok, false);
    assert.match(response.details.observationExport.error, /real directory/);
    assert.equal(Object.hasOwn(response.details, "error"), false);
    assert.equal(response.details.ok, owner.metric.status === "target_met");
    assert.equal(owner.loadedReceiptCount, 0);
    assert.equal(owner.newReceipts.length, 1);
    assert.deepEqual(
      fs.readFileSync(owner.receiptPath, "utf8").trim().split("\n").map(JSON.parse),
      json(owner.newReceipts),
    );
    assert.equal(
      fs.readFileSync(path.join(cwd, ".autoresearch/dashboard"), "utf8"),
      "not a directory",
    );
  });
});

test("observer rejects unsafe identity, oversized UTF-8 and serialization failures before creating output", async () => {
  await withTempDir(async (cwd) => {
    const result = runAutoresearchLevel4CampaignRunner(request(cwd));
    for (const taskId of ["../escape", -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(
        (await observeAutoresearchLevel4Dashboard({ ...result, taskId })).observationExport.ok,
        false,
      );
    }
    for (const changes of [{ cwd: "" }, { cwd: path.join(cwd, "missing") }, { objective: "" }]) {
      assert.equal(
        (await observeAutoresearchLevel4Dashboard({ ...result, ...changes })).observationExport.ok,
        false,
      );
    }
    const oversized = { ...result, nextStep: "🔎".repeat(LEVEL4_DASHBOARD_MAX_BYTES / 4) };
    assert.match(
      (await observeAutoresearchLevel4Dashboard(oversized)).observationExport.error,
      /exceeds 8388608 bytes/,
    );
    const cyclic = { ...result };
    cyclic.self = cyclic;
    assert.equal((await observeAutoresearchLevel4Dashboard(cyclic)).observationExport.ok, false);
    assert.equal(fs.existsSync(path.join(cwd, ".autoresearch/dashboard")), false);
  });
});

for (const component of [
  ".autoresearch",
  ".autoresearch/dashboard",
  ".autoresearch/dashboard/level4",
]) {
  test(`dashboard rejects symlink directory ${component} without writing outside cwd`, async () => {
    await withTempDir(async (cwd) => {
      const result = runAutoresearchLevel4CampaignRunner(request(cwd));
      const outside = path.join(cwd, "outside");
      fs.mkdirSync(outside);
      const target = path.join(cwd, component);
      // The owner may already have created .autoresearch; move it without touching journals.
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target)) fs.renameSync(target, path.join(cwd, "original-autoresearch"));
      fs.symlinkSync(outside, target);
      assert.equal((await observeAutoresearchLevel4Dashboard(result)).observationExport.ok, false);
      assert.deepEqual(fs.readdirSync(outside), []);
    });
  });
}

for (const shape of [
  "symlink",
  "dangling",
  "hardlink",
  "directory",
  "foreign",
  "oversized",
  "journal",
]) {
  test(`dashboard refuses ${shape} target and preserves existing bytes`, async () => {
    await withTempDir(async (cwd) => {
      const result = runAutoresearchLevel4CampaignRunner(request(cwd));
      const file = snapshotPath(result);
      const outside = path.join(cwd, "sentinel");
      fs.writeFileSync(outside, "unchanged");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (shape === "symlink") fs.symlinkSync(outside, file);
      if (shape === "dangling") fs.symlinkSync(path.join(cwd, "missing"), file);
      if (shape === "hardlink") fs.linkSync(outside, file);
      if (shape === "directory") fs.mkdirSync(file);
      if (shape === "foreign" || shape === "journal") fs.writeFileSync(file, "owner journal\n");
      if (shape === "oversized") fs.writeFileSync(file, "x".repeat(LEVEL4_DASHBOARD_MAX_BYTES + 1));
      const before = fs.lstatSync(file);
      const response = await observeAutoresearchLevel4Dashboard(
        shape === "journal" ? { ...result, receiptPath: file } : result,
      );
      assert.equal(response.observationExport.ok, false);
      assert.ok(response.observationExport.error.length <= 1024);
      assert.equal(fs.lstatSync(file).ino, before.ino);
      assert.equal(fs.lstatSync(file).size, before.size);
      assert.equal(fs.readFileSync(outside, "utf8"), "unchanged");
      assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
    });
  });
}

test("dashboard resolves owner cwd, isolates objectives, and serializes concurrent replacements", async () => {
  await withTempDir(async (cwd) => {
    const result = runAutoresearchLevel4CampaignRunner(request(cwd));
    const relative = { ...result, cwd: path.relative(process.cwd(), cwd) };
    const exports = await Promise.all(
      Array.from({ length: 3 }, () => observeAutoresearchLevel4Dashboard(relative)),
    );
    assert.ok(exports.every((entry) => entry.observationExport.path === snapshotPath(result)));
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath(result)));
    assert.equal(snapshot.cwd, fs.realpathSync(cwd));
    assert.equal(snapshot.result.cwd, relative.cwd);
    const other = await observeAutoresearchLevel4Dashboard({
      ...result,
      objective: `${result.objective}!`,
    });
    assert.equal(other.observationExport.ok, true);
    assert.notEqual(other.observationExport.path, snapshotPath(result));
  });
});

test("owner errors do not produce synthetic dashboard results", async () => {
  await withTempDir(async (cwd) => {
    const response = await call(publicTool(), { ...request(cwd), objective: "" });
    assert.equal(response.details.ok, false);
    assert.equal(Object.hasOwn(response.details, "observationExport"), false);
    assert.equal(Object.hasOwn(response.details, "level4CampaignRunner"), false);
    assert.equal(fs.existsSync(path.join(cwd, ".autoresearch/dashboard")), false);
  });
});

test("atomic rename failure preserves prior snapshot and cleans only the temporary file", async (t) => {
  await withTempDir(async (cwd) => {
    const result = runAutoresearchLevel4CampaignRunner(request(cwd));
    assert.equal((await observeAutoresearchLevel4Dashboard(result)).observationExport.ok, true);
    const file = snapshotPath(result);
    const before = fs.readFileSync(file);
    const rename = t.mock.method(fsMutable, "renameSync", () => {
      throw new Error("injected rename failure");
    });
    syncBuiltinESMExports();
    try {
      const response = await observeAutoresearchLevel4Dashboard(result);
      assert.deepEqual(response, {
        observationExport: { ok: false, error: "injected rename failure" },
      });
      assert.equal(rename.mock.callCount(), 1);
      assert.deepEqual(fs.readFileSync(file), before);
      assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
    } finally {
      rename.mock.restore();
      syncBuiltinESMExports();
    }
  });
});
