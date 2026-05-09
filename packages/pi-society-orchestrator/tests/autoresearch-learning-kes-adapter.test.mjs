import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../extensions/society-orchestrator.ts";
import {
  AUTORESEARCH_LEARNING_KES_ADAPTER_KIND,
  buildAutoresearchLearningKesAdapterResult,
  loadAutoresearchLearningPacket,
} from "../src/runtime/autoresearch-learning-kes-adapter.ts";

function registerLearningKesAdapterTool(options = {}) {
  const tools = new Map();
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    options,
  );

  const tool = tools.get("autoresearch_learning_kes_adapter");
  assert.ok(tool, "expected autoresearch_learning_kes_adapter to register");
  return tool;
}

function createLearningPacket(overrides = {}) {
  return {
    packetKind: "autoresearch.learning.v1",
    adapterContractVersion: 1,
    targetKinds: ["kes", "kms", "knowledge_base", "notes"],
    suggestedPath: "docs/learnings/autoresearch-learning-widget-speed.md",
    title: "Autoresearch learning: widget-speed",
    markdown: "## What was learned\n\nThe bounded run produced a candidate-only learning.",
    closeout: {
      packetKind: "autoresearch.closeout.v1",
      campaign: "widget-speed",
      empiricalDecisionClass: "candidate_improved",
      empiricalPosture: { promotionReady: true, summary: "ready for review" },
      recommendedAction: "Review the learning before promotion.",
      receiptPath: "/tmp/widget-speed/autoresearch.jsonl",
    },
    adapterBoundary:
      "Knowledge export packet is non-mutating and adapter-ready; KES/KMS adapters own persistence, promotion, and any external writes.",
    ...overrides,
  };
}

test("plans a package-owned KES adapter result without writing artifacts", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-plan-"));

  try {
    const result = buildAutoresearchLearningKesAdapterResult({
      packageRoot,
      packet: createLearningPacket(),
      action: "plan",
      sessionId: "session-123",
      timestamp: new Date("2026-05-08T12:00:00Z"),
    });

    assert.equal(result.kind, AUTORESEARCH_LEARNING_KES_ADAPTER_KIND);
    assert.equal(result.status, "planned");
    assert.equal(result.effect.kesArtifactsWritten, false);
    assert.equal(result.effect.piAutoresearchMutated, false);
    assert.equal(result.effect.akCalled, false);
    assert.equal(result.effect.externalAuthorityMutated, false);
    assert.equal(result.effect.promotionStateChanged, false);
    assert.deepEqual(result.writtenArtifacts, []);
    assert.match(result.kesPlan.diary.relativePath, /^diary\//);
    assert.match(result.kesPlan.learningCandidate.relativePath, /^docs\/learnings\//);
    assert.match(result.kesPlan.diary.content, /autoresearch\.learning\.v1/);
    assert.match(result.kesPlan.learningCandidate.content, /State: candidate-only/);
    assert.equal(fs.existsSync(result.kesPlan.diary.absolutePath), false);
    assert.equal(fs.existsSync(result.kesPlan.learningCandidate.absolutePath), false);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("materializes only package-owned KES diary and candidate learning artifacts", () => {
  const packageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "pi-orch-autoresearch-kes-materialize-"),
  );

  try {
    const result = buildAutoresearchLearningKesAdapterResult({
      packageRoot,
      packet: createLearningPacket(),
      action: "materialize",
      timestamp: new Date("2026-05-08T12:00:00Z"),
    });

    assert.equal(result.status, "materialized");
    assert.equal(result.effect.kesArtifactsWritten, true);
    assert.deepEqual(result.writtenArtifacts, [
      result.kesPlan.diary.relativePath,
      result.kesPlan.learningCandidate.relativePath,
    ]);
    assert.equal(fs.existsSync(result.kesPlan.diary.absolutePath), true);
    assert.equal(fs.existsSync(result.kesPlan.learningCandidate.absolutePath), true);
    assert.match(
      fs.readFileSync(result.kesPlan.learningCandidate.absolutePath, "utf8"),
      /Keep autoresearch learning persistence outside pi-autoresearch/,
    );
    assert.equal(fs.existsSync(path.join(packageRoot, ".autoresearch")), false);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("loads packet JSON and validates the KES adapter contract", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-load-"));
  const packetPath = path.join(packageRoot, "packet.json");
  fs.writeFileSync(packetPath, `${JSON.stringify(createLearningPacket())}\n`, "utf8");

  try {
    const packet = loadAutoresearchLearningPacket(packetPath);
    const result = buildAutoresearchLearningKesAdapterResult({ packageRoot, packet });
    assert.equal(result.source.packetKind, "autoresearch.learning.v1");
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("rejects packets that do not target KES or suggest an escaped learning path", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-invalid-"));

  try {
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket({ targetKinds: ["notes"] }),
        }),
      /targetKinds must be an array of strings that includes kes/,
    );
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket({ suggestedPath: "../outside.md" }),
        }),
      /must not escape/,
    );
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket({ suggestedPath: "/tmp/outside.md" }),
        }),
      /must be relative/,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("registered tool plans and materializes through the KES owner seam", async () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-tool-"));
  const packetPath = path.join(packageRoot, "packet.json");
  fs.writeFileSync(packetPath, `${JSON.stringify(createLearningPacket())}\n`, "utf8");

  try {
    const tool = registerLearningKesAdapterTool({
      autoresearchLearningKesPackageRoot: packageRoot,
    });
    const planned = await tool.execute("call-1", { action: "plan", packetPath });
    assert.equal(planned.details.ok, true);
    assert.equal(planned.details.result.status, "planned");
    assert.equal(fs.existsSync(planned.details.result.kesPlan.diary.absolutePath), false);

    const materialized = await tool.execute("call-2", {
      action: "materialize",
      packetPath,
    });
    assert.equal(materialized.details.ok, true);
    assert.equal(materialized.details.result.status, "materialized");
    assert.equal(materialized.details.result.effect.kesArtifactsWritten, true);
    assert.equal(fs.existsSync(materialized.details.result.kesPlan.diary.absolutePath), true);
    assert.equal(
      fs.existsSync(materialized.details.result.kesPlan.learningCandidate.absolutePath),
      true,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("registered tool ignores caller-supplied packageRoot and stays on the owner root", async () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-owner-"));
  const maliciousRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-other-"));
  const packetPath = path.join(packageRoot, "packet.json");
  fs.writeFileSync(packetPath, `${JSON.stringify(createLearningPacket())}\n`, "utf8");

  try {
    const tool = registerLearningKesAdapterTool({
      autoresearchLearningKesPackageRoot: packageRoot,
    });
    const materialized = await tool.execute("call-root", {
      action: "materialize",
      packetPath,
      packageRoot: maliciousRoot,
    });

    assert.equal(materialized.details.ok, true);
    assert.equal(materialized.details.result.packageRoot, path.resolve(packageRoot));
    assert.equal(fs.existsSync(path.join(packageRoot, "diary")), true);
    assert.equal(fs.existsSync(path.join(maliciousRoot, "diary")), false);
    assert.equal(fs.existsSync(path.join(maliciousRoot, "docs", "learnings")), false);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(maliciousRoot, { recursive: true, force: true });
  }
});

test("rejects malformed optional closeout fields before KES rendering", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-bad-"));

  try {
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket({ closeout: { recommendedAction: 123 } }),
        }),
      /closeout\.recommendedAction must be a non-empty string/,
    );
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket({
            closeout: { empiricalPosture: { promotionReady: "yes" } },
          }),
        }),
      /closeout\.empiricalPosture\.promotionReady must be a boolean/,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("materialize failure cleans staged KES files instead of leaving a diary partial", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-partial-"));
  const diaryDir = path.join(packageRoot, "diary");
  const learningsDir = path.join(packageRoot, "docs", "learnings");
  fs.mkdirSync(diaryDir, { recursive: true });
  fs.mkdirSync(learningsDir, { recursive: true });
  fs.chmodSync(learningsDir, 0o555);

  try {
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket(),
          action: "materialize",
          timestamp: new Date("2026-05-08T12:00:00Z"),
        }),
      /Package-owned KES artifacts could not be written/,
    );
    assert.deepEqual(fs.readdirSync(diaryDir), []);
    assert.deepEqual(fs.readdirSync(learningsDir), []);
  } finally {
    fs.chmodSync(learningsDir, 0o755);
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("materialize rejects symlinked KES roots instead of writing outside the package root", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-symlink-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-outside-"));
  fs.mkdirSync(path.join(packageRoot, "docs", "learnings"), { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(packageRoot, "diary"), "dir");

  try {
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket(),
          action: "materialize",
          timestamp: new Date("2026-05-08T12:00:00Z"),
        }),
      /Package-owned KES artifacts could not be written/,
    );
    assert.deepEqual(fs.readdirSync(outsideRoot), []);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test("materialize rejects symlinked intermediate KES roots before mkdir escapes", () => {
  const packageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "pi-orch-autoresearch-kes-docs-symlink-"),
  );
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-docs-out-"));
  fs.symlinkSync(outsideRoot, path.join(packageRoot, "docs"), "dir");

  try {
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket(),
          action: "materialize",
          timestamp: new Date("2026-05-08T12:00:00Z"),
        }),
      /Package-owned KES artifacts could not be written/,
    );
    assert.deepEqual(fs.readdirSync(outsideRoot), []);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});
