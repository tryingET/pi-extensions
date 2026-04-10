import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createKesArtifactPlan,
  KES_CONTRACT_VERSION,
  KES_DIARY_DIR,
  KES_LEARNINGS_DIR,
  materializeKesArtifactPlan,
  resolveKesRoots,
} from "../src/kes/index.ts";

test("resolveKesRoots keeps KES outputs inside the package boundary", () => {
  const packageRoot = path.join(os.tmpdir(), "pi-orch-kes-roots");
  const roots = resolveKesRoots(packageRoot);

  assert.equal(roots.packageRoot, path.resolve(packageRoot));
  assert.equal(roots.diaryDir, path.join(path.resolve(packageRoot), KES_DIARY_DIR));
  assert.equal(roots.learningsDir, path.join(path.resolve(packageRoot), KES_LEARNINGS_DIR));
  assert.equal(roots.diaryRelativeDir, KES_DIARY_DIR);
  assert.equal(roots.learningsRelativeDir, KES_LEARNINGS_DIR);
});

test("createKesArtifactPlan builds bounded diary and learning-candidate drafts", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-kes-plan-"));

  try {
    const plan = createKesArtifactPlan(packageRoot, {
      diary: {
        kind: "phase",
        summary: "Tighten release proof after timeout regressions",
        source: {
          kind: "loop_phase",
          loop: "kaizen",
          phase: "act",
          sessionId: "loop-123",
          objective: "Keep release smoke truthful",
        },
        actions: [
          "Compared timeout failures across release-smoke runs",
          "Sketched a bounded KES contract for future loop consumers",
        ],
        surprises: ["The package had no package-owned KES seam yet."],
        patterns: ["Bounded contract-first slices keep follow-on wiring smaller."],
        candidateHints: ["Promote timeout-proof scaffolding into a reusable guardrail."],
        followUps: ["Adopt src/kes from loop execution in task:1090."],
        metadata: { task: 1089 },
        timestamp: new Date("2026-04-10T12:00:00Z"),
      },
      learningCandidate: {
        kind: "guardrail",
        summary: "Contract-first KES scaffolding prevents shadow authority drift",
        claim:
          "Define package-owned diary and learning-candidate roots before wiring runtime emission.",
        evidence: ["task:1089 landed src/kes scaffolding before task:1090 loop wiring."],
        heuristics: ["Make raw diary capture explicit before auto-promotion enters the design."],
        antiPatterns: ["Do not invent a third storage surface for learning state."],
        followUps: ["Prove the emitted outputs through package and root validation in task:1091."],
        metadata: { owner: "pi-society-orchestrator" },
      },
    });

    assert.equal(plan.version, KES_CONTRACT_VERSION);
    assert.match(plan.diary.relativePath, /^diary\//);
    assert.doesNotMatch(plan.diary.relativePath, /\.\./);
    assert.match(
      plan.diary.relativePath,
      /2026-04-10--phase-kaizen-act-tighten-release-proof-after-timeout-regr.md$/,
    );
    assert.match(plan.diary.content, /^---\nsummary:/);
    assert.match(plan.diary.content, /^kes_contract_version: 1$/m);
    assert.match(plan.diary.content, /^system4d:$/m);
    assert.match(plan.diary.content, /^## What I Did$/m);
    assert.match(plan.diary.content, /loop-123/);

    assert.ok(plan.learningCandidate, "expected learning candidate draft");
    assert.match(plan.learningCandidate.relativePath, /^docs\/learnings\//);
    assert.doesNotMatch(plan.learningCandidate.relativePath, /\.\./);
    assert.match(plan.learningCandidate.content, /^---\nsummary:/);
    assert.match(plan.learningCandidate.content, /State: candidate-only/);
    assert.match(plan.learningCandidate.content, /Source diary: `diary\//);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("createKesArtifactPlan omits a learning candidate when none is requested", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-kes-no-candidate-"));

  try {
    const plan = createKesArtifactPlan(packageRoot, {
      diary: {
        kind: "session",
        summary: "Capture package-local KES baseline",
        source: {
          kind: "manual",
          objective: "Record the first bounded KES scaffold",
        },
        actions: ["Added src/kes contract helpers."],
      },
    });

    assert.equal(plan.learningCandidate, undefined);
    assert.match(plan.diary.relativePath, /^diary\//);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("materializeKesArtifactPlan creates scaffold directories and allocates unique filenames", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-kes-materialize-"));

  try {
    const request = {
      diary: {
        kind: "validation",
        summary: "Verify package-local KES writes stay bounded",
        source: {
          kind: "manual",
          objective: "Check directory creation and duplicate naming",
        },
        actions: ["Write the first bounded KES entry."],
        timestamp: new Date("2026-04-10T13:00:00Z"),
      },
      learningCandidate: {
        kind: "contract",
        summary: "Package-local KES roots stay stable",
        claim: "Keep KES artifacts under diary/ and docs/learnings/ only.",
        evidence: ["The helper rejects paths outside the allowed roots."],
      },
    };

    const firstPlan = createKesArtifactPlan(packageRoot, request);
    materializeKesArtifactPlan(firstPlan);

    assert.equal(fs.existsSync(path.join(packageRoot, "diary")), true);
    assert.equal(fs.existsSync(path.join(packageRoot, "docs", "learnings")), true);
    assert.equal(fs.existsSync(firstPlan.diary.absolutePath), true);
    assert.equal(fs.existsSync(firstPlan.learningCandidate.absolutePath), true);

    const secondPlan = createKesArtifactPlan(packageRoot, request);
    materializeKesArtifactPlan(secondPlan);

    assert.match(secondPlan.diary.relativePath, /--2\.md$/);
    assert.match(secondPlan.learningCandidate.relativePath, /--2\.md$/);
    assert.equal(fs.existsSync(secondPlan.diary.absolutePath), true);
    assert.equal(fs.existsSync(secondPlan.learningCandidate.absolutePath), true);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});
