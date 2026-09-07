import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../extensions/society-orchestrator.ts";
import {
  AUTORESEARCH_LEARNING_KES_ADAPTER_KIND,
  buildAutoresearchLearningKesAdapterResult,
  loadAutoresearchLearningPacket,
  loadAutoresearchLearningPacketWithSource,
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
    assert.match(
      result.kesPlan.learningCandidate.content,
      /Source packet sha256 \(normalized_packet\): [a-f0-9]{64}/,
    );
    assert.match(result.kesPlan.learningCandidate.content, /Source receipt sha256: unavailable/);
    assert.match(result.kesPlan.learningCandidate.content, /Source evidence warning:/);
    assert.match(result.sourceEvidenceSnapshot.packetSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.sourceEvidenceSnapshot.packetHashKind, "normalized_packet");
    assert.equal(result.sourceEvidenceSnapshot.receiptSha256, null);
    assert.match(result.sourceEvidenceWarnings.join("\n"), /semantic only/);
    assert.match(result.sourceEvidenceWarnings.join("\n"), /not under a \.autoresearch/);
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

// Model canonical path placement independently of the checkout/TMPDIR. Bytes, file
// descriptors, hashes and regular-file checks still use real owned scratch files.
for (const { name, campaignRoot, warns } of [
  { name: "configured-temp", campaignRoot: "/fixture-temp/campaign", warns: true },
  { name: "literal /tmp", campaignRoot: "/tmp/campaign", warns: true },
  { name: "non-temp", campaignRoot: "/fixture-stable/campaign", warns: false },
]) {
  test(`snapshots an existing ${name} campaign receipt with exact placement warnings`, (t) => {
    const packageRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "pi-orch-autoresearch-kes-placement-"),
    );
    const backingRoot = path.join(packageRoot, "campaign");
    const packetPath = path.join(campaignRoot, ".autoresearch", "learning.json");
    const receiptPath = path.join(campaignRoot, "autoresearch.jsonl");
    const receiptBytes = "{}\n";
    const packetBytes = `${JSON.stringify(createLearningPacket({ closeout: { ...createLearningPacket().closeout, receiptPath } }))}\n`;
    const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const toBacking = (input) =>
      typeof input === "string" &&
      (input === campaignRoot || input.startsWith(`${campaignRoot}${path.sep}`))
        ? backingRoot + input.slice(campaignRoot.length)
        : input;

    try {
      fs.mkdirSync(path.join(backingRoot, ".autoresearch"), { recursive: true });
      fs.writeFileSync(toBacking(receiptPath), receiptBytes, "utf8");
      fs.writeFileSync(toBacking(packetPath), packetBytes, "utf8");
      const realpathSync = fs.realpathSync;
      const canonicalBackingRoot = realpathSync(backingRoot);
      // Synchronous, test-local FS mapping; no writes to the virtual absolute paths.
      for (const method of ["openSync", "existsSync", "statSync"]) {
        const original = fs[method];
        t.mock.method(fs, method, (input, ...args) => original(toBacking(input), ...args));
      }
      t.mock.method(fs, "realpathSync", (input, ...args) => {
        const resolved = realpathSync(toBacking(input), ...args);
        return resolved === canonicalBackingRoot ||
          resolved.startsWith(`${canonicalBackingRoot}${path.sep}`)
          ? campaignRoot + resolved.slice(canonicalBackingRoot.length)
          : resolved;
      });
      t.mock.method(os, "tmpdir", () => "/fixture-temp");

      const loaded = loadAutoresearchLearningPacketWithSource(packetPath);
      const result = buildAutoresearchLearningKesAdapterResult({
        packageRoot,
        packet: loaded.packet,
        packetSource: loaded.source,
        action: "plan",
      });

      assert.deepEqual(
        result.sourceEvidenceWarnings,
        warns
          ? [
              `closeout receiptPath is under a temp directory and may disappear before review: ${receiptPath}`,
            ]
          : [],
      );
      assert.equal(result.source.receiptPath, receiptPath);
      assert.match(result.sourceEvidenceSnapshot.packetSha256, /^[a-f0-9]{64}$/);
      assert.equal(result.sourceEvidenceSnapshot.packetSha256, sha256(packetBytes));
      assert.equal(result.sourceEvidenceSnapshot.packetHashKind, "raw_file");
      assert.equal(result.sourceEvidenceSnapshot.packetPath, packetPath);
      assert.equal(loaded.source.campaignRoot, campaignRoot);
      assert.match(result.sourceEvidenceSnapshot.receiptSha256, /^[a-f0-9]{64}$/);
      assert.equal(result.sourceEvidenceSnapshot.receiptSha256, sha256(receiptBytes));
      assert.equal(result.sourceEvidenceSnapshot.receiptPath, receiptPath);
      assert.equal(result.sourceEvidenceSnapshot.receiptExists, true);
      assert.equal(result.sourceEvidenceSnapshot.receiptBytes, Buffer.byteLength(receiptBytes));
      assert.equal(result.sourceEvidenceSnapshot.receiptLineCount, 1);
      assert.deepEqual(result.sourceEvidenceSnapshot.receiptTailPreview, ["{}"]);
    } finally {
      t.mock.restoreAll();
      fs.rmSync(packageRoot, { recursive: true, force: true });
    }
  });
}

test("refuses to snapshot receipt paths outside the packet campaign root", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-outside-"));
  const campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-campaign-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-secret-"));
  const packetDir = path.join(campaignRoot, ".autoresearch");
  const outsideReceipt = path.join(outsideRoot, "autoresearch.jsonl");
  fs.mkdirSync(packetDir, { recursive: true });
  fs.writeFileSync(outsideReceipt, "SECRET_TOKEN=do-not-copy\n", "utf8");
  const packetPath = path.join(packetDir, "learning.json");
  fs.writeFileSync(
    packetPath,
    `${JSON.stringify(createLearningPacket({ closeout: { ...createLearningPacket().closeout, receiptPath: outsideReceipt } }))}\n`,
    "utf8",
  );

  try {
    const loaded = loadAutoresearchLearningPacketWithSource(packetPath);
    const result = buildAutoresearchLearningKesAdapterResult({
      packageRoot,
      packet: loaded.packet,
      packetSource: loaded.source,
      action: "plan",
    });

    assert.equal(result.sourceEvidenceSnapshot.receiptSha256, null);
    assert.deepEqual(result.sourceEvidenceSnapshot.receiptTailPreview, []);
    assert.match(
      result.sourceEvidenceWarnings.join("\n"),
      /outside the packet-derived campaign root/,
    );
    assert.doesNotMatch(result.kesPlan.learningCandidate.content, /do-not-copy/);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(campaignRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test("refuses to snapshot symlinked receipt paths that escape the campaign root", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-link-"));
  const campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-campaign-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-link-secret-"));
  const packetDir = path.join(campaignRoot, ".autoresearch");
  const outsideReceipt = path.join(outsideRoot, "autoresearch.jsonl");
  const linkedReceipt = path.join(campaignRoot, "autoresearch.jsonl");
  fs.mkdirSync(packetDir, { recursive: true });
  fs.writeFileSync(outsideReceipt, "SECRET_TOKEN=do-not-copy\n", "utf8");
  fs.symlinkSync(outsideReceipt, linkedReceipt);
  const packetPath = path.join(packetDir, "learning.json");
  fs.writeFileSync(
    packetPath,
    `${JSON.stringify(createLearningPacket({ closeout: { ...createLearningPacket().closeout, receiptPath: linkedReceipt } }))}\n`,
    "utf8",
  );

  try {
    const loaded = loadAutoresearchLearningPacketWithSource(packetPath);
    const result = buildAutoresearchLearningKesAdapterResult({
      packageRoot,
      packet: loaded.packet,
      packetSource: loaded.source,
      action: "plan",
    });

    assert.equal(result.sourceEvidenceSnapshot.receiptSha256, null);
    assert.deepEqual(result.sourceEvidenceSnapshot.receiptTailPreview, []);
    assert.match(
      result.sourceEvidenceWarnings.join("\n"),
      /outside the packet-derived campaign root/,
    );
    assert.doesNotMatch(result.kesPlan.learningCandidate.content, /do-not-copy/);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(campaignRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test("rejects invalid receipt snapshot byte limits", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-limit-"));
  const campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-campaign-"));
  const packetDir = path.join(campaignRoot, ".autoresearch");
  const receiptPath = path.join(campaignRoot, "autoresearch.jsonl");
  fs.mkdirSync(packetDir, { recursive: true });
  fs.writeFileSync(receiptPath, "{}\n", "utf8");
  const packetPath = path.join(packetDir, "learning.json");
  fs.writeFileSync(
    packetPath,
    `${JSON.stringify(createLearningPacket({ closeout: { ...createLearningPacket().closeout, receiptPath } }))}\n`,
    "utf8",
  );

  try {
    const loaded = loadAutoresearchLearningPacketWithSource(packetPath);
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: loaded.packet,
          packetSource: loaded.source,
          sourceEvidencePolicy: { maxReceiptBytes: Number.POSITIVE_INFINITY },
          action: "plan",
        }),
      /sourceEvidencePolicy\.maxReceiptBytes must be a safe integer/,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(campaignRoot, { recursive: true, force: true });
  }
});

test("skips oversized receipt snapshots instead of reading the full file", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-large-"));
  const campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-campaign-"));
  const packetDir = path.join(campaignRoot, ".autoresearch");
  const receiptPath = path.join(campaignRoot, "autoresearch.jsonl");
  fs.mkdirSync(packetDir, { recursive: true });
  fs.writeFileSync(receiptPath, "1234567890\n", "utf8");
  const packetPath = path.join(packetDir, "learning.json");
  fs.writeFileSync(
    packetPath,
    `${JSON.stringify(createLearningPacket({ closeout: { ...createLearningPacket().closeout, receiptPath } }))}\n`,
    "utf8",
  );

  try {
    const loaded = loadAutoresearchLearningPacketWithSource(packetPath);
    const result = buildAutoresearchLearningKesAdapterResult({
      packageRoot,
      packet: loaded.packet,
      packetSource: loaded.source,
      sourceEvidencePolicy: { maxReceiptBytes: 5 },
      action: "plan",
    });

    assert.equal(result.sourceEvidenceSnapshot.receiptExists, true);
    assert.equal(result.sourceEvidenceSnapshot.receiptSha256, null);
    assert.deepEqual(result.sourceEvidenceSnapshot.receiptTailPreview, []);
    assert.match(
      result.sourceEvidenceWarnings.join("\n"),
      /exceeds source evidence snapshot limit/,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(campaignRoot, { recursive: true, force: true });
  }
});

test("redacts sensitive-looking receipt tail values before KES rendering", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-redact-"));
  const campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-campaign-"));
  const packetDir = path.join(campaignRoot, ".autoresearch");
  const receiptPath = path.join(campaignRoot, "autoresearch.jsonl");
  fs.mkdirSync(packetDir, { recursive: true });
  fs.writeFileSync(receiptPath, '{"token":"super-secret-token","ok":true}\n', "utf8");
  const packetPath = path.join(packetDir, "learning.json");
  fs.writeFileSync(
    packetPath,
    `${JSON.stringify(createLearningPacket({ closeout: { ...createLearningPacket().closeout, receiptPath } }))}\n`,
    "utf8",
  );

  try {
    const loaded = loadAutoresearchLearningPacketWithSource(packetPath);
    const result = buildAutoresearchLearningKesAdapterResult({
      packageRoot,
      packet: loaded.packet,
      packetSource: loaded.source,
      action: "plan",
    });

    assert.match(result.sourceEvidenceSnapshot.receiptTailPreview.join("\n"), /\[REDACTED\]/);
    assert.doesNotMatch(result.kesPlan.learningCandidate.content, /super-secret-token/);
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(campaignRoot, { recursive: true, force: true });
  }
});

test("rejects packetSource hashes for a different in-memory packet", () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-kes-mismatch-"));
  const campaignRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-campaign-"));
  const packetDir = path.join(campaignRoot, ".autoresearch");
  fs.mkdirSync(packetDir, { recursive: true });
  const packetPath = path.join(packetDir, "learning.json");
  fs.writeFileSync(
    packetPath,
    `${JSON.stringify(createLearningPacket({ title: "packet B" }))}\n`,
    "utf8",
  );

  try {
    const loaded = loadAutoresearchLearningPacketWithSource(packetPath);
    assert.throws(
      () =>
        buildAutoresearchLearningKesAdapterResult({
          packageRoot,
          packet: createLearningPacket({ title: "packet A" }),
          packetSource: loaded.source,
          action: "plan",
        }),
      /packetSource\.packetPath content does not match the packet being adapted/,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(campaignRoot, { recursive: true, force: true });
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
    assert.match(planned.content[0].text, /Source packet sha256 \(raw_file\):/);
    assert.match(planned.content[0].text, /Source evidence warnings:/);
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
