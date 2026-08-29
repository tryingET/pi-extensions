/**
summary: "SCI extension native validator evidence, forged receipts, and explore budget validation; split from extension.test.ts."
read_when:
  - "You change native validator evidence, forged receipts, and explore budget validation behavior."
*/
import assert from "node:assert/strict";
import test from "node:test";
import { SCI_COMPOSITE_TOOL_NAMES } from "../extensions/semantic-code-intelligence.ts";
import { validExplorePayload } from "../src/explore-result-validator.ts";
import type { SciBridge } from "../src/mcp-bridge.ts";
import {
  createHarness,
  fakeBridge,
  fakeRiskSignal,
  fakeStructuralAnalysis,
  type MutableExplorePacket,
  mutatedPacket,
} from "./extension-test-helpers.ts";

test("native validator accepts structural risk evidence and rejects forged nested receipts", async () => {
  const fake = fakeBridge();
  const result = await fake.bridge.callTool(
    "explore_symbol_impact",
    { symbol: "Target" },
    "/workspace",
  );
  const text = result.content?.find((item) => item.type === "text")?.text;
  assert.equal(typeof text, "string");
  const packet = JSON.parse(String(text)) as Record<string, unknown>;
  assert.equal(validExplorePayload(packet, "compact"), true);

  const detected = structuredClone(packet) as MutableExplorePacket;
  detected.editRisk.level = "high";
  detected.editRisk.reasons = [
    "Target-specific export evidence means downstream consumers may be affected.",
  ];
  Object.assign(detected.editRisk.analysis.structural, {
    analyzedFiles: 1,
    failedFiles: 0,
    sourceBytesRead: 100,
    sourceBytesAnalyzed: 100,
    astNodesInspected: 2,
    astWorkUnits: 6,
    targetOccurrencesObserved: 1,
    targetOccurrencesAnalyzed: 1,
    limitations: [],
  });
  detected.editRisk.signals.publicApi = {
    detected: true,
    status: "detected",
    confidence: "high",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: ["An exact target occurrence participates directly in an export declaration."],
    provenance: ["ast.export_declaration"],
    namingFallback: {
      observed: true,
      confidence: "low",
      files: ["src/public-api.ts"],
      hiddenFiles: 0,
      reasons: [
        "A conventional public/api/index/export name matched, but no target-specific export was proved.",
      ],
      provenance: ["fallback.naming"],
    },
  };
  detected.impact.files.push({
    path: "src/public-api.ts",
    score: 1,
    reasons: ["reference"],
    signals: [],
  });
  detected.impact.totalFiles = 2;
  assert.equal(validExplorePayload(detected, "compact"), true);

  const graphDetectedWithFailedSourceAnalysis = structuredClone(packet) as MutableExplorePacket;
  graphDetectedWithFailedSourceAnalysis.editRisk.level = "high";
  graphDetectedWithFailedSourceAnalysis.editRisk.reasons = [
    "Target-specific export evidence means downstream consumers may be affected.",
  ];
  graphDetectedWithFailedSourceAnalysis.editRisk.signals.publicApi = {
    detected: true,
    status: "detected",
    confidence: "high",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: ["The graph backend returned a target-matching export declaration."],
    provenance: ["graph.exports"],
    namingFallback: {
      observed: false,
      confidence: "low",
      files: [],
      hiddenFiles: 0,
      reasons: [],
      provenance: [],
    },
  };
  assert.equal(validExplorePayload(graphDetectedWithFailedSourceAnalysis, "compact"), true);

  const externalAssignmentWithFailedSourceAnalysis = structuredClone(
    packet,
  ) as MutableExplorePacket;
  externalAssignmentWithFailedSourceAnalysis.editRisk.level = "high";
  externalAssignmentWithFailedSourceAnalysis.editRisk.reasons = [
    "Structural write evidence requires invariant review.",
  ];
  externalAssignmentWithFailedSourceAnalysis.editRisk.signals.state = {
    detected: true,
    status: "detected",
    confidence: "medium",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: ["An AST-validated target occurrence is an assignment."],
    provenance: ["reference.assignment"],
    namingFallback: {
      observed: false,
      confidence: "low",
      files: [],
      hiddenFiles: 0,
      reasons: [],
      provenance: [],
    },
  };
  assert.equal(validExplorePayload(externalAssignmentWithFailedSourceAnalysis, "compact"), true);

  const postReadParseFailure = structuredClone(packet) as MutableExplorePacket;
  Object.assign(postReadParseFailure.editRisk.analysis.structural, {
    sourceBytesRead: 100,
    sourceBytesAnalyzed: 100,
  });
  assert.equal(validExplorePayload(postReadParseFailure, "compact"), true);

  const truncatedStateReasons = structuredClone(detected) as MutableExplorePacket;
  truncatedStateReasons.editRisk.reasons = ["Structural write evidence requires invariant review."];
  truncatedStateReasons.editRisk.signals.publicApi = fakeRiskSignal();
  Object.assign(truncatedStateReasons.editRisk.analysis.structural, {
    astNodesInspected: 4,
    astWorkUnits: 12,
    symbolBodiesObserved: 1,
    symbolBodiesAnalyzed: 1,
    writeNodesObserved: 1,
    writeNodesAnalyzed: 1,
  });
  truncatedStateReasons.editRisk.signals.state = {
    detected: true,
    status: "detected",
    confidence: "high",
    files: ["src/target.ts"],
    hiddenFiles: 0,
    reasons: [
      "SCIP marks this target occurrence as a write access.",
      "The target occurrence is structurally on the written side of an assignment.",
      "The target occurrence is structurally updated.",
      "An AST-validated target occurrence is an assignment.",
    ],
    provenance: [
      "ast.definition_write",
      "ast.write_occurrence",
      "reference.assignment",
      "scip.roles.write",
    ],
    namingFallback: {
      observed: false,
      confidence: "low",
      files: [],
      hiddenFiles: 0,
      reasons: [],
      provenance: [],
    },
  };
  assert.equal(validExplorePayload(truncatedStateReasons, "compact"), true);

  const conservativeBreadthRisk = structuredClone(packet) as MutableExplorePacket;
  conservativeBreadthRisk.editRisk.level = "medium";
  conservativeBreadthRisk.editRisk.reasons = [];
  Object.assign(conservativeBreadthRisk.impact as Record<string, unknown>, {
    totalFiles: 4,
    truncated: true,
  });
  assert.equal(validExplorePayload(conservativeBreadthRisk, "compact"), true);

  const exhausted = structuredClone(packet) as MutableExplorePacket;
  Object.assign(exhausted.editRisk.analysis.structural, {
    observedFiles: 9,
    selectedFiles: 9,
    attemptedFiles: 9,
    analyzedFiles: 8,
    failedFiles: 0,
    totalBudgetRejectedFiles: 1,
    unattemptedFiles: 0,
    omittedFiles: 1,
    filesOmittedByTotalByteBudget: 1,
    observedCandidates: 9,
    selectedCandidates: 9,
    sourceBytesRead: 4_000_000,
    sourceBytesAnalyzed: 4_000_000,
    astNodesInspected: 8,
    astWorkUnits: 8,
    totalSourceByteBudgetExhausted: true,
    limitations: [
      "Structural source analysis reached its total byte budget; remaining signals remain unknown.",
      "Structural source files exceeded an analysis budget and were omitted deterministically.",
    ],
  });
  assert.equal(validExplorePayload(exhausted, "compact"), true);

  const mixedFailuresAcrossTwoFiles = structuredClone(packet) as MutableExplorePacket;
  Object.assign(mixedFailuresAcrossTwoFiles.editRisk.analysis.structural, {
    observedFiles: 2,
    selectedFiles: 2,
    attemptedFiles: 2,
    failedFiles: 2,
    observedCandidates: 2,
    selectedCandidates: 2,
    sourceBytesRead: 200,
    sourceBytesAnalyzed: 100,
  });
  assert.equal(validExplorePayload(mixedFailuresAcrossTwoFiles, "compact"), true);

  const lawfulPacketFitRemoval = mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
    value.impact.files = [];
    value.impact.totalFiles = 1;
    value.impact.truncated = true;
  });
  assert.equal(validExplorePayload(lawfulPacketFitRemoval, "compact"), true);

  const lawfulHiddenSignal = mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
    value.impact.totalFiles = 2;
    value.impact.truncated = true;
    value.editRisk.signals.publicApi.hiddenFiles = 1;
  });
  assert.equal(validExplorePayload(lawfulHiddenSignal, "compact"), true);

  const lawfulPostParseFailureOverlap = mutatedPacket(packet, (value) => {
    Object.assign(value.editRisk.analysis.structural, {
      analyzedFiles: 1,
      sourceBytesRead: 100,
      sourceBytesAnalyzed: 100,
    });
  });
  assert.equal(validExplorePayload(lawfulPostParseFailureOverlap, "compact"), true);

  const lawfulEarlyNodeBudgetHit = mutatedPacket(packet, (value) => {
    Object.assign(value.editRisk.analysis.structural, {
      analyzedFiles: 1,
      failedFiles: 0,
      sourceBytesRead: 100,
      sourceBytesAnalyzed: 100,
      astNodesInspected: 10_000,
      astNodeBudgetHits: 1,
      astWorkUnits: 10_000,
      astWorkBudgetHits: 1,
      limitations: [
        "Structural AST analysis reached a deterministic work budget; affected signals remain unknown.",
      ],
    });
  });
  assert.equal(validExplorePayload(lawfulEarlyNodeBudgetHit, "compact"), true);

  const lawfulWriteInspection = mutatedPacket(packet, (value) => {
    Object.assign(value.editRisk.analysis.structural, {
      analyzedFiles: 1,
      failedFiles: 0,
      sourceBytesRead: 1,
      sourceBytesAnalyzed: 1,
      astNodesInspected: 1,
      astWorkUnits: 2,
      writeNodesObserved: 1,
      writeNodesAnalyzed: 1,
      limitations: [],
    });
  });
  assert.equal(validExplorePayload(lawfulWriteInspection, "compact"), true);

  const degraded = mutatedPacket(packet, (value) => {
    value.degraded = true;
    value.editRisk.level = "high";
    value.editRisk.reasons = ["Impact evidence is degraded by failed or unusable evidence."];
  });
  assert.equal(validExplorePayload(degraded, "compact"), true);

  const invalidPackets = [
    mutatedPacket(packet, (value) => {
      value.impact.truncated = true;
    }),
    mutatedPacket(packet, (value) => {
      value.impact.totalFiles = 2;
    }),
    mutatedPacket(packet, (value) => {
      value.impact.totalFiles = 0;
    }),
    mutatedPacket(packet, (value) => {
      value.impact.files.push(structuredClone(value.impact.files[0] as Record<string, unknown>));
      value.impact.totalFiles = 2;
    }),
    mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
      value.editRisk.signals.publicApi.hiddenFiles = 1;
    }),
    mutatedPacket(lawfulPacketFitRemoval, (value) => {
      value.editRisk.signals.publicApi.files = [];
      value.editRisk.signals.publicApi.hiddenFiles = 1;
    }),
    mutatedPacket(lawfulPacketFitRemoval, (value) => {
      value.editRisk.signals.publicApi.namingFallback = {
        observed: true,
        confidence: "low",
        files: [],
        hiddenFiles: 1,
        reasons: [
          "A conventional public/api/index/export name matched, but no target-specific export was proved.",
        ],
        provenance: ["fallback.naming"],
      };
    }),
    mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
      value.editRisk.signals.publicApi.files = ["src/forged.ts"];
    }),
    mutatedPacket(graphDetectedWithFailedSourceAnalysis, (value) => {
      value.impact.files = [];
      value.impact.truncated = true;
      Object.assign(value.editRisk.signals.publicApi, {
        files: ["src/target.ts"],
        hiddenFiles: 1,
      });
    }),
    mutatedPacket(lawfulHiddenSignal, (value) => {
      value.editRisk.signals.publicApi.files = ["src/target.ts", "src/target.ts"];
      value.editRisk.signals.publicApi.hiddenFiles = 0;
    }),
    mutatedPacket(detected, (value) => {
      const fallback = value.editRisk.signals.publicApi.namingFallback as Record<string, unknown>;
      fallback.files = ["src/forged.ts"];
    }),
    mutatedPacket(detected, (value) => {
      value.editRisk.analysis.structural.astWorkUnits = 1;
    }),
    mutatedPacket(lawfulPostParseFailureOverlap, (value) => {
      value.editRisk.analysis.structural.astNodesInspected = 1;
      value.editRisk.analysis.structural.astWorkUnits = 1;
    }),
    mutatedPacket(lawfulWriteInspection, (value) => {
      value.editRisk.analysis.structural.astWorkUnits = 1;
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 2,
        selectedFiles: 2,
        attemptedFiles: 2,
        analyzedFiles: 1,
        failedFiles: 1,
        oversizedFiles: 1,
        observedCandidates: 2,
        selectedCandidates: 2,
        sourceBytesRead: 1_048_576,
        sourceBytesAnalyzed: 1_048_576,
        limitations: [
          "Oversized structural source files were not read or parsed; affected signals remain unknown.",
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 65,
        selectedFiles: 64,
        attemptedFiles: 64,
        failedFiles: 64,
        omittedFiles: 1,
        filesOmittedByFileBudget: 1,
        observedCandidates: 1_064,
        selectedCandidates: 64,
        omittedCandidates: 1_000,
        candidatesOmittedByFileBudget: 1_000,
        limitations: [
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
          "Structural source candidates exceeded an analysis budget and were omitted.",
          "Structural source files exceeded an analysis budget and were omitted deterministically.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 2,
        selectedFiles: 1,
        attemptedFiles: 1,
        omittedFiles: 1,
        filesOmittedByFileBudget: 1,
        observedCandidates: 2,
        selectedCandidates: 1,
        omittedCandidates: 1,
        candidatesOmittedByFileBudget: 1,
        limitations: [
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
          "Structural source candidates exceeded an analysis budget and were omitted.",
          "Structural source files exceeded an analysis budget and were omitted deterministically.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedCandidates: 2,
        selectedCandidates: 1,
        omittedCandidates: 1,
        limitations: [
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
          "Structural source candidates exceeded an analysis budget and were omitted.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        sourceBytesRead: 1,
        sourceBytesAnalyzed: 1,
        astNodesInspected: 1,
        astWorkUnits: 1,
        targetOccurrencesObserved: 1,
        omittedTargetOccurrences: 1,
        limitations: [
          "Structural AST evidence exceeded an item budget and was omitted deterministically.",
        ],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        sourceBytesRead: 1,
        sourceBytesAnalyzed: 1,
        astNodesInspected: 1,
        astWorkUnits: 3,
        targetOccurrencesObserved: 1,
        targetOccurrencesAnalyzed: 1,
        writeNodesObserved: 1,
        writeNodesAnalyzed: 1,
        importNodesObserved: 1,
        importNodesAnalyzed: 1,
        limitations: [],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        limitations: [],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        targetOccurrencesObserved: 1,
        targetOccurrencesAnalyzed: 1,
        limitations: [],
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        analyzedFiles: 1,
        failedFiles: 0,
        sourceBytesRead: 1,
        sourceBytesAnalyzed: 1,
        astNodesInspected: 1,
        astWorkUnits: 1,
        targetOccurrencesObserved: 4_096,
        targetOccurrencesAnalyzed: 4_096,
        symbolBodiesObserved: 256,
        symbolBodiesAnalyzed: 256,
        writeNodesObserved: 4_096,
        writeNodesAnalyzed: 4_096,
        importNodesObserved: 1_024,
        importNodesAnalyzed: 1_024,
        limitations: [],
      });
    }),
    mutatedPacket(lawfulEarlyNodeBudgetHit, (value) => {
      value.editRisk.analysis.structural.astNodesInspected = 1;
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.limitations = [];
    }),
    mutatedPacket(lawfulEarlyNodeBudgetHit, (value) => {
      value.editRisk.analysis.structural.limitations = [];
    }),
    mutatedPacket(degraded, (value) => {
      value.editRisk.reasons = ["Impact evidence is degraded by failed subcalls."];
    }),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.signals.publicApi.status = "detected";
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.signals.publicApi.confidence = "low";
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.signals.publicApi.unbounded = [];
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.analysis.structural.astWorkUnitBudgetPerFile = 200_000;
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.analysis.structural.observedCandidates = 2;
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.analysis.structural.sourceBytesRead = 4_194_305;
      return value;
    })(),
    (() => {
      const value = structuredClone(packet) as MutableExplorePacket;
      value.editRisk.analysis.structural.limitations = Array.from({ length: 9 }, () => "x");
      return value;
    })(),
    mutatedPacket(packet, (value) => {
      value.editRisk.level = ["high"];
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.level = "medium";
      value.editRisk.reasons = [];
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.signals.publicApi.files = ["src/forged.ts"];
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.level = "high";
      value.editRisk.reasons = ["forged"];
      Object.assign(value.editRisk.signals.publicApi, {
        detected: true,
        status: "detected",
        confidence: "high",
        files: [],
        hiddenFiles: 0,
        reasons: ["forged"],
        provenance: ["ast.export_declaration"],
      });
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.signals.publicApi.namingFallback = {
        observed: true,
        confidence: "low",
        files: [],
        hiddenFiles: 0,
        reasons: ["forged"],
        provenance: ["fallback.naming"],
      };
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.signals.publicApi.reasons = [""];
    }),
    mutatedPacket(detected, (value) => {
      value.editRisk.level = "low";
      value.editRisk.reasons = [];
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.level = "low";
      value.editRisk.reasons = [];
    }),
    mutatedPacket(detected, (value) => {
      Object.assign(value.editRisk.analysis.structural, fakeStructuralAnalysis());
    }),
    mutatedPacket(detected, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        sourceBytesRead: 0,
        sourceBytesAnalyzed: 0,
        astNodesInspected: 0,
        astWorkUnits: 0,
      });
    }),
    mutatedPacket(exhausted, (value) => {
      value.editRisk.analysis.structural.sourceBytesAnalyzed = 0;
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        sourceBytesRead: 200,
        sourceBytesAnalyzed: 100,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        sourceBytesRead: 524_288,
        sourceBytesAnalyzed: 0,
      });
    }),
    mutatedPacket(mixedFailuresAcrossTwoFiles, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        sourceBytesRead: 1_000_000,
        sourceBytesAnalyzed: 300_000,
      });
    }),
    mutatedPacket(truncatedStateReasons, (value) => {
      value.editRisk.signals.state.reasons = Array.from(
        { length: 4 },
        () => "The target occurrence is structurally updated.",
      );
    }),
    mutatedPacket(truncatedStateReasons, (value) => {
      value.editRisk.signals.state.reasons = [
        "The target occurrence is structurally on the written side of an assignment.",
        "The target occurrence is structurally updated.",
        "An AST-validated target occurrence is an assignment.",
        "The target definition body contains a structural member or indexed write; shared-state aliasing is not proved.",
      ];
    }),
    mutatedPacket(detected, (value) => {
      value.editRisk.signals.publicApi.provenance = ["fallback.naming"];
      value.editRisk.signals.publicApi.reasons = [
        "A conventional public/api/index/export name matched, but no target-specific export was proved.",
      ];
    }),
    mutatedPacket(detected, (value) => {
      value.editRisk.signals.publicApi.reasons = ["forged structural reason"];
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 2,
        selectedFiles: 2,
        attemptedFiles: 1,
        unattemptedFiles: 1,
        omittedFiles: 1,
        filesOmittedByTotalByteBudget: 1,
        totalSourceByteBudgetExhausted: true,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 65,
        selectedFiles: 65,
        attemptedFiles: 1,
        unattemptedFiles: 64,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 4,
        selectedFiles: 4,
        attemptedFiles: 1,
        unattemptedFiles: 3,
        observedCandidates: 1_025,
        selectedCandidates: 1_025,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 4,
        selectedFiles: 4,
        attemptedFiles: 4,
        analyzedFiles: 4,
        failedFiles: 0,
        sourceBytesRead: 2_097_153,
        sourceBytesAnalyzed: 2_097_153,
      });
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedFiles: 4,
        selectedFiles: 4,
        attemptedFiles: 4,
        analyzedFiles: 4,
        failedFiles: 0,
        targetOccurrencesObserved: 16_385,
        targetOccurrencesAnalyzed: 16_385,
      });
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.failedFiles = 0;
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.observedFiles = 2;
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.astNodeBudgetHits = 1;
    }),
    mutatedPacket(packet, (value) => {
      value.editRisk.analysis.structural.astWorkBudgetHits = 1;
    }),
    mutatedPacket(packet, (value) => {
      Object.assign(value.editRisk.analysis.structural, {
        observedCandidates: Number.MAX_SAFE_INTEGER + 1,
        selectedCandidates: Number.MAX_SAFE_INTEGER + 1,
        omittedCandidates: 1,
      });
    }),
  ];
  for (const invalid of invalidPackets)
    assert.equal(validExplorePayload(invalid, "compact"), false);
});

test("native explore validation rejects nested unknown fields and false budget receipts", async () => {
  const fake = fakeBridge();
  const base = await fake.bridge.callTool(
    "explore_symbol_impact",
    { symbol: "Target", mode: "standard" },
    "/workspace/repo",
  );
  const textItem = base.content?.find(
    (item) => item && typeof item === "object" && "text" in item && typeof item.text === "string",
  );
  assert.ok(textItem && typeof textItem === "object" && "text" in textItem);
  const packet = JSON.parse(String(textItem.text)) as Record<string, unknown>;
  const details = packet.details as Record<string, unknown>;
  const evidence = details.evidence as Record<string, unknown>;
  const definitions = evidence.definitions as Record<string, unknown>;
  const disclosure = details.disclosure as Record<string, unknown>;
  definitions.raw = "unrestricted backend";
  disclosure.byteBudget = 50_000;
  disclosure.emittedBytes = 1;

  const bridge: SciBridge = {
    async callTool() {
      return { content: [{ type: "text", text: JSON.stringify(packet) }] };
    },
    async advertisedToolNames() {
      return [...SCI_COMPOSITE_TOOL_NAMES];
    },
    async close() {},
  };
  const tool = createHarness(bridge).tools.get("explore_symbol_impact");
  assert.ok(tool);
  const result = await tool.execute(
    "call-nested-invalid",
    { symbol: "Target", mode: "standard" },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "indeterminate");
  assert.doesNotMatch(result.content[0].text, /unrestricted backend/);
});

test("native explore validation accepts ten next reads and rejects eleven", async () => {
  const fake = fakeBridge();
  const base = await fake.bridge.callTool(
    "explore_symbol_impact",
    { symbol: "Target" },
    "/workspace/repo",
  );
  const textItem = base.content?.find(
    (item) => item && typeof item === "object" && "text" in item && typeof item.text === "string",
  );
  assert.ok(textItem && typeof textItem === "object" && "text" in textItem);
  const packet = JSON.parse(String(textItem.text)) as Record<string, unknown>;

  for (const count of [10, 11]) {
    packet.nextReads = Array.from({ length: count }, (_, index) => ({
      path: `src/target-${index}.ts`,
      reason: "Bounded read",
    }));
    const bridge: SciBridge = {
      async callTool() {
        return { content: [{ type: "text", text: JSON.stringify(packet) }] };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    };
    const tool = createHarness(bridge).tools.get("explore_symbol_impact");
    assert.ok(tool);
    const result = await tool.execute(
      "call-next-reads",
      { symbol: "Target" },
      undefined,
      undefined,
      {
        cwd: "/workspace/repo",
      },
    );
    const parsed = JSON.parse(result.content[0].text);
    if (count === 10) {
      assert.equal(parsed.schema, "pi.sci_explore_model.v1");
      assert.equal(parsed.status, "confirmed");
    } else {
      assert.equal(parsed.ok, false);
      assert.equal(parsed.status, "indeterminate");
    }
  }
});
