import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
  validateAutoresearchAdapterPacket,
  writeAutoresearchCandidateResultPacket,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
import { verifyLevel4MeasuredPacket } from "../../src/runtime/autoresearch-level4-runner-packets.ts";

function withFixture(fn, outcome = {}) {
  const root = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "ak5582-packets-"));
  try {
    const cwd = path.join(root, "controller");
    mkdirSync(cwd);
    const laneId = "cell-01-01-candidate-01";
    const binding = {
      laneId,
      candidateWorktree: path.join(root, "candidate"),
      candidateBranch: `candidate/${laneId}`,
      candidateBaseRef: "abc1234",
      candidateDiffSummary: "bounded candidate patch",
      candidateFilesChanged: ["src/a.ts", "src/b.ts"],
    };
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: `matrix-${laneId}`,
        metricName: "blockers",
        direction: "lower",
        createdAt: 1,
      }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({ status: "baseline", metric: 10, timestamp: 2, description: "baseline" }),
    );
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "candidate",
        metric: 1,
        timestamp: 3,
        iteration: 1,
        description: "measured candidate",
        runKind: "ordinary",
        empiricalDecisionClass: "candidate_improvement",
        ...outcome,
        experiment: {
          hypothesisId: laneId,
          candidate: {
            source: "candidate_peer_spawn",
            worktreePath: binding.candidateWorktree,
            branch: binding.candidateBranch,
            baseRef: binding.candidateBaseRef,
            diffSummary: binding.candidateDiffSummary,
            filesChanged: binding.candidateFilesChanged,
          },
        },
      }),
    );
    const packetPath = `.autoresearch/matrix-campaign/cell-01-01/${laneId}.json`;
    const exported = writeAutoresearchCandidateResultPacket({ cwd, outPath: packetPath });
    assert.equal(
      validateAutoresearchAdapterPacket(exported.packet).valid,
      true,
      "fixture must be owner-valid",
    );
    const input = { cwd, packetPath, laneId, binding, metricName: "blockers", direction: "lower" };
    fn({
      root,
      cwd,
      input,
      packet: exported.packet,
      packetFile: exported.path,
      save(packet) {
        writeFileSync(exported.path, JSON.stringify(packet));
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function rejected(result, pattern) {
  assert.equal(result.verified, false);
  assert.ok(result.issues.length > 0);
  if (pattern) assert.match(result.issues.join("\n"), pattern);
}

function snapshot(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? snapshot(file) : [[file, readFileSync(file).toString("base64")]];
  });
}

test("Given an owner-exported measured lane When verified Then it passes without writing files", () =>
  withFixture(({ cwd, input }) => {
    const before = snapshot(cwd);
    assert.deepEqual(verifyLevel4MeasuredPacket(input), { verified: true, issues: [] });
    assert.deepEqual(
      verifyLevel4MeasuredPacket({ ...input, packetPath: path.resolve(cwd, input.packetPath) }),
      { verified: true, issues: [] },
    );
    assert.deepEqual(snapshot(cwd), before);
  }));

for (const outcome of [
  { status: "discard", metric: 12, empiricalDecisionClass: "candidate_regression" },
  {
    status: "checks_failed",
    metric: 1,
    empiricalDecisionClass: "checks_failed",
    checksPassed: false,
  },
]) {
  test(`Given a measured ${outcome.status} outcome When verified Then measurement is not confused with selection`, () =>
    withFixture(({ input }) => {
      assert.equal(verifyLevel4MeasuredPacket(input).verified, true);
    }, outcome));
}

for (const [label, change, issue] of [
  [
    "missing binding",
    (x) => {
      delete x.binding;
    },
    /binding/,
  ],
  [
    "wrong binding lane",
    (x) => {
      x.binding.laneId = "other";
    },
    /laneId/,
  ],
  [
    "missing expected metric",
    (x) => {
      delete x.metricName;
    },
    /metricName/,
  ],
  [
    "invalid expected direction",
    (x) => {
      x.direction = "sideways";
    },
    /direction/,
  ],
  [
    "missing worktree",
    (x) => {
      delete x.binding.candidateWorktree;
    },
    /candidateWorktree/,
  ],
  [
    "placeholder branch",
    (x) => {
      x.binding.candidateBranch = "<branch>";
    },
    /candidateBranch/,
  ],
  [
    "empty files",
    (x) => {
      x.binding.candidateFilesChanged = [];
    },
    /candidateFilesChanged/,
  ],
  [
    "controller-inline worktree",
    (x) => {
      x.binding.candidateWorktree = x.cwd;
    },
    /candidateWorktree/,
  ],
]) {
  test(`Given ${label} When verifying a real packet Then fail closed`, () =>
    withFixture(({ input }) => {
      change(input);
      rejected(verifyLevel4MeasuredPacket(input), issue);
    }));
}

for (const [label, change, issue] of [
  [
    "wrong kind",
    (p) => {
      p.packetKind = "autoresearch.learning.v1";
    },
    /packetKind/,
  ],
  [
    "wrong version",
    (p) => {
      p.adapterContractVersion = 2;
    },
    /adapterContractVersion/,
  ],
  [
    "missing owner-required field",
    (p) => {
      delete p.targetKinds;
    },
    /targetKinds/,
  ],
  [
    "malformed closeout",
    (p) => {
      p.closeout = {};
    },
    /closeout/,
  ],
  [
    "null candidate",
    (p) => {
      p.candidate = null;
    },
    /candidate/,
  ],
  [
    "null run",
    (p) => {
      p.candidateRun = null;
    },
    /candidateRun/,
  ],
  [
    "foreign controller",
    (p) => {
      p.cwd = "/foreign";
    },
    /cwd/,
  ],
  [
    "foreign closeout controller",
    (p) => {
      p.closeout.cwd = "/foreign";
    },
    /closeout.cwd/,
  ],
  [
    "wrong campaign",
    (p) => {
      p.closeout.campaign = "other";
    },
    /campaign/,
  ],
  [
    "wrong metric",
    (p) => {
      p.closeout.metricName = "other";
    },
    /metricName/,
  ],
  [
    "wrong direction",
    (p) => {
      p.closeout.direction = "higher";
    },
    /direction/,
  ],
  [
    "foreign candidate",
    (p) => {
      p.candidate.worktreePath = "/foreign";
    },
    /worktreePath/,
  ],
  [
    "wrong branch",
    (p) => {
      p.candidate.branch = "other";
    },
    /branch/,
  ],
  [
    "wrong base",
    (p) => {
      p.candidate.baseRef = "other";
    },
    /baseRef/,
  ],
  [
    "wrong diff",
    (p) => {
      p.candidate.diffSummary = "other";
    },
    /diffSummary/,
  ],
  [
    "wrong files",
    (p) => {
      p.candidate.filesChanged = ["src/other.ts"];
    },
    /filesChanged/,
  ],
  [
    "manual source",
    (p) => {
      p.candidate.source = "manual";
    },
    /source/,
  ],
  [
    "missing run lineage",
    (p) => {
      delete p.candidateRun.experiment.candidate;
    },
    /experiment.candidate/,
  ],
  [
    "wrong hypothesis lane",
    (p) => {
      p.candidateRun.experiment.hypothesisId = "other";
    },
    /hypothesisId/,
  ],
  [
    "unknown run status",
    (p) => {
      p.candidateRun.status = "invented";
    },
    /status/,
  ],
  [
    "non-finite metric",
    (p) => {
      p.candidateRun.metric = Infinity;
    },
    /metric/,
  ],
  [
    "unknown empirical class",
    (p) => {
      p.candidateRun.empiricalDecisionClass = "invented";
    },
    /empiricalDecisionClass/,
  ],
  [
    "calibration",
    (p) => {
      p.candidateRun.runKind = "calibration";
    },
    /runKind/,
  ],
  [
    "zero run inventory",
    (p) => {
      p.closeout.runs = [];
      p.closeout.runCount = 0;
    },
    /runs|runCount/,
  ],
  [
    "count mismatch",
    (p) => {
      p.closeout.runCount = 99;
    },
    /runCount/,
  ],
  [
    "absent binding inventory",
    (p) => {
      p.closeout.candidateBindings = [];
    },
    /candidateBindings/,
  ],
  [
    "run not in inventory",
    (p) => {
      p.candidateRun.timestamp = 100;
    },
    /closeout.runs/,
  ],
  [
    "stale candidate run",
    (p) => {
      p.closeout.runs.push({ ...p.closeout.runs.at(-1), timestamp: 100 });
      p.closeout.runCount++;
    },
    /latest/,
  ],
]) {
  test(`Given ${label} When verifying an existing JSON packet Then fail closed`, () =>
    withFixture(({ input, packet, save }) => {
      // Break aliases shared by the owner's in-memory packet, as a parsed export would.
      const changed = JSON.parse(JSON.stringify(packet));
      change(changed);
      save(changed);
      rejected(verifyLevel4MeasuredPacket(input), issue);
    }));
}

for (const text of ["{", "{}", "[]", "null"]) {
  test(`Given invalid packet text ${JSON.stringify(text)} When verifying Then fail closed`, () =>
    withFixture(({ input, packetFile }) => {
      writeFileSync(packetFile, text);
      rejected(verifyLevel4MeasuredPacket(input));
    }));
}

for (const kind of ["missing", "directory", "oversized", "outside", "symlink", "parent-symlink"]) {
  test(`Given a ${kind} packet path When verifying Then fail closed`, () =>
    withFixture(({ root, cwd, input, packetFile }) => {
      if (kind === "missing") rmSync(packetFile);
      if (kind === "directory") {
        rmSync(packetFile);
        mkdirSync(packetFile);
      }
      if (kind === "oversized") writeFileSync(packetFile, " ".repeat(8 * 1024 * 1024 + 1));
      if (["outside", "symlink", "parent-symlink"].includes(kind)) {
        const outside = path.join(root, "outside.json");
        writeFileSync(outside, readFileSync(packetFile));
        if (kind === "outside") input.packetPath = outside;
        if (kind === "symlink") {
          rmSync(packetFile);
          symlinkSync(outside, packetFile);
        }
        if (kind === "parent-symlink") {
          symlinkSync(root, path.join(cwd, ".autoresearch", "escape"));
          input.packetPath = ".autoresearch/escape/outside.json";
        }
      }
      rejected(verifyLevel4MeasuredPacket(input), /packetPath/);
    }));
}
