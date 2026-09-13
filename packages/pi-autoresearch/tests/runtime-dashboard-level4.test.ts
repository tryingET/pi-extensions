import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverAutoresearchMatrixCampaignArtifacts } from "../src/core/runtime-matrix.ts";
import { getRecordField as rec } from "../src/core/runtime-matrix-fields.ts";
import { projectLevel4Observation } from "../src/core/runtime-matrix-level4.ts";
import {
  level4Envelope,
  level4Path,
  OBJECTIVE,
  withDashboardDir,
  writeDashboardSource,
} from "./runtime-dashboard-fixtures.ts";

// Test-only owner integration: exercise the actual non-dispatching runner in owned scratch.
// Dynamic URL avoids making orchestrator implementation a dashboard production dependency.
const ownerUrl = new URL(
  "../../pi-society-orchestrator/src/runtime/autoresearch-level4-runner.ts",
  import.meta.url,
).href;
const owner = (await import(ownerUrl)) as {
  runAutoresearchLevel4CampaignRunner: (input: Record<string, unknown>) => Record<string, unknown>;
};
function result(cwd: string) {
  return owner.runAutoresearchLevel4CampaignRunner({
    taskId: 5621,
    cwd,
    objective: OBJECTIVE,
    scenarios: ["50k nested rename"],
    hypotheses: ["batch index"],
    candidateCountPerCell: 2,
    parentPeerTarget: "test-controller",
  });
}

test("actual Level 4 owner result automatically discovered: prepared/ready/missing and cursor are not effects", () =>
  withDashboardDir((cwd) => {
    const actual = result(cwd);
    const receipt = String(actual.receiptPath);
    const before = existsSync(receipt) ? readFileSync(receipt) : null;
    const mtime = existsSync(receipt) ? statSync(receipt).mtimeMs : null;
    const source = level4Path();
    writeDashboardSource(cwd, source, level4Envelope(cwd, actual));
    const summary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(summary.campaignCount, 1, summary.exportVisibilityBlockers.blockers.join("\n"));
    const campaign = summary.campaigns[0];
    assert.equal(campaign.declaredLevel, "Level 4 observation");
    assert.equal(campaign.execution, "not_executed_by_orchestrator");
    assert.equal(campaign.controllerCompletedActionCount, 0);
    assert.equal(campaign.observedAt, "2026-09-10T00:00:00.000Z");
    assert.equal(summary.candidateLaneCount, 2);
    assert.equal(summary.observedMeasurementCount, 0);
    assert.equal(summary.coverageGapLaneCount, 2);
    assert.ok(
      campaign.cells[0].lanes.every(
        (l) => l.reportedState.includes("ready_for_visible_launch") && l.attempts.length === 0,
      ),
    );
    assert.deepEqual(existsSync(receipt) ? readFileSync(receipt) : null, before);
    assert.equal(existsSync(receipt) ? statSync(receipt).mtimeMs : null, mtime);
    const tampered = structuredClone(actual);
    tampered.completedActionCount = 999;
    writeDashboardSource(cwd, source, level4Envelope(cwd, tampered));
    const changed = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(changed.campaigns[0].controllerCompletedActionCount, 999);
    assert.equal(changed.observedMeasurementCount, 0);
    assert.equal(changed.coverageGapLaneCount, 2);
    assert.equal(changed.campaigns[0].execution, "not_executed_by_orchestrator");
    assert.deepEqual(existsSync(receipt) ? readFileSync(receipt) : null, before);
  }));

test("Level 4 exact envelope/nested owner identity, nonAuthority and timestamp checks fail closed", () =>
  withDashboardDir((cwd) => {
    const actual = result(cwd);
    const base = level4Envelope(cwd, actual);
    const variants: Array<(value: Record<string, unknown>) => void> = [
      (v) => {
        v.taskId = 999;
      },
      (v) => {
        v.cwd = `${cwd}/foreign`;
      },
      (v) => {
        v.nonAuthority = false;
      },
      (v) => {
        v.execution = "executed";
      },
      (v) => {
        v.observedAt = "yesterday";
      },
      (v) => {
        v.objective = `${OBJECTIVE} `;
      },
      (v) => {
        requiredRecord(v, "result").execution = "running";
      },
      (v) => {
        requiredRecord(v, "result").sourceLevel3Executor = { level3Runner: {} };
      },
      (v) => {
        requiredRecord(rec(v, "result"), "sourceLevel3Executor").cwd = "/wrong";
      },
      (v) => {
        requiredRecord(v, "result").promptRunnerBundle = null;
      },
      (v) => {
        requiredRecord(v, "result").completedActionCount = 1.5;
      },
    ];
    for (const mutate of variants) {
      const v = structuredClone(base);
      mutate(v);
      assert.throws(() => projectLevel4Observation(v, cwd, level4Path()));
      writeDashboardSource(cwd, level4Path(), v);
      const summary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
      assert.equal(summary.campaignCount, 0);
      assert.equal(summary.observedMeasurementCount, 0);
      assert.ok(summary.exportVisibilityBlockers.blockers.length > 0);
    }
  }));

test("Level 4 consumer rejects symlinks, hardlinks, oversize, malformed JSON and linked parents", () => {
  for (const mode of ["symlink", "hardlink", "oversize", "malformed", "parent"] as const)
    withDashboardDir((cwd) => {
      const actual = result(cwd);
      const data = JSON.stringify(level4Envelope(cwd, actual));
      const target = path.join(cwd, level4Path());
      mkdirSync(path.dirname(target), { recursive: true });
      const other = path.join(cwd, "source.json");
      writeFileSync(other, data);
      if (mode === "symlink") symlinkSync(other, target);
      if (mode === "hardlink") linkSync(other, target);
      if (mode === "oversize") {
        writeFileSync(target, data);
        truncateSync(target, 8 * 1024 * 1024 + 1);
      }
      if (mode === "malformed") writeFileSync(target, "{broken");
      let scratch: string | null = null;
      if (mode === "parent") {
        rmSync(path.join(cwd, ".autoresearch/dashboard"), { recursive: true });
        scratch = mkdtempSync(path.join(os.tmpdir(), "observatory-parent-"));
        mkdirSync(path.join(scratch, "level4"));
        writeFileSync(path.join(scratch, "level4", path.basename(target)), data);
        symlinkSync(scratch, path.join(cwd, ".autoresearch/dashboard"));
      }
      try {
        const summary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
        assert.equal(summary.campaignCount, 0);
        assert.equal(summary.observedMeasurementCount, 0);
        assert.ok(summary.exportVisibilityBlockers.blockers.length > 0, mode);
        assert.equal(readFileSync(other, "utf8"), data);
      } finally {
        if (scratch) {
          chmodSync(scratch, 0o700);
          rmSync(scratch, { recursive: true });
        }
      }
    });
});

function requiredRecord(v: unknown, key: string): Record<string, unknown> {
  const value = rec(v, key);
  assert.ok(value);
  return value;
}

test("Level 4 reported measured/verified inventory still needs real valid packet files", () =>
  withDashboardDir((cwd) => {
    const actual = result(cwd);
    const inventory = requiredRecord(
      requiredRecord(requiredRecord(actual, "promptRunnerBundle"), "candidateCloseoutPacket"),
      "packetInventory",
    );
    assert.ok(Array.isArray(inventory.rows));
    for (const row of inventory.rows) {
      assert.ok(row && typeof row === "object");
      row.controllerVerified = true;
      row.measuredPacket = true;
      row.status = "controller_verified_measured_packet";
    }
    actual.loadedReceiptCount = 999;
    writeDashboardSource(cwd, level4Path(), level4Envelope(cwd, actual));
    const model = discoverAutoresearchMatrixCampaignArtifacts(cwd);
    assert.equal(model.observedMeasurementCount, 0);
    assert.equal(model.coverageGapLaneCount, 2);
    assert.equal(model.campaigns[0].controllerCompletedActionCount, 0);
    const lane = model.campaigns[0].cells[0].lanes[0];
    assert.match(lane.verificationReport, /controllerVerified=true/);
    assert.ok(lane.promptTitle);
    assert.ok(lane.objective);
    assert.ok(lane.promptMarkdown);
  }));
