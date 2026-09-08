import { validateExecutionObservation } from "./source-selection-experiment-observation.js";
import {
  validatePhaseBRequest,
  validateReceipt,
  validateRequest,
} from "./source-selection-experiment-receipt.js";
import {
  canonicalJson,
  compareUtf8,
  exactKeys,
  invariant,
  sha256Digest,
} from "./source-selection-experiment-utils.js";

export const EVIDENCE_KIND_ORDER = Object.freeze([
  "definition",
  "reference",
  "match",
  "graph_node",
  "graph_edge",
]);

function validateExpectedProvenance(expected, receipt) {
  exactKeys(
    expected,
    [
      "producerName",
      "producerVersion",
      "producerWorkflow",
      "backendName",
      "backendVersion",
      "executableName",
      "executableVersion",
    ],
    [],
    "structuralEvidence.expectedProvenance",
  );
  invariant(
    expected.producerName === receipt.producer.name &&
      expected.producerVersion === receipt.producer.version &&
      expected.producerWorkflow === receipt.producer.workflow,
    "producer provenance mismatch",
  );
  invariant(
    expected.backendName === receipt.backend.name &&
      expected.backendVersion === receipt.backend.version &&
      expected.executableName === receipt.backend.executable.name &&
      expected.executableVersion === receipt.backend.executable.version,
    "backend provenance mismatch",
  );
  invariant(
    expected.producerWorkflow === "structural-evidence-export-v1",
    "unexpected SCI workflow posture",
  );
}

function emptyStats(repository) {
  return new Map(
    repository.records.map(({ path }) => [
      path,
      {
        directCount: 0,
        relatedCount: 0,
        kindCounts: Object.fromEntries(EVIDENCE_KIND_ORDER.map((kind) => [kind, 0])),
        evidenceIds: [],
      },
    ]),
  );
}

function structuralStats(receipt, repository) {
  const stats = emptyStats(repository);
  for (const candidate of receipt.evidence) {
    invariant(stats.has(candidate.identity.path), "receipt evidence path is outside inventory");
    invariant(
      candidate.identity.kind !== "graph_edge" ||
        candidate.identity.path !== candidate.identity.relatedPath ||
        candidate.identity.symbol !== candidate.identity.relatedSymbol,
      "graph self-edges cannot contribute structural counts",
    );
    const direct = stats.get(candidate.identity.path);
    direct.directCount += 1;
    direct.kindCounts[candidate.identity.kind] += 1;
    direct.evidenceIds.push(candidate.id);
    if (candidate.identity.kind === "graph_edge") {
      invariant(
        stats.has(candidate.identity.relatedPath),
        "receipt related path is outside inventory",
      );
      stats.get(candidate.identity.relatedPath).relatedCount += 1;
    }
  }
  return stats;
}

export function validateStructuralEvidenceBundle(caseDefinition, repository) {
  const failures = [];
  let receipt;
  let stats = emptyStats(repository);
  try {
    const bundle = caseDefinition.structuralEvidence;
    invariant(bundle, "structural evidence bundle is missing");
    exactKeys(
      bundle,
      [
        "expectedRequest",
        "expectedRequestDigest",
        "expectedProvenance",
        "receipt",
        "executionObservation",
      ],
      [],
      "structuralEvidence",
    );
    validateRequest(bundle.expectedRequest, "structuralEvidence.expectedRequest");
    validatePhaseBRequest(bundle.expectedRequest, "structuralEvidence.expectedRequest");
    invariant(
      bundle.expectedRequest.question === caseDefinition.question,
      "expected request question mismatch",
    );
    invariant(
      bundle.expectedRequestDigest === sha256Digest(bundle.expectedRequest),
      "expected requestDigest mismatch",
    );
    receipt = validateReceipt(bundle.receipt);
    validatePhaseBRequest(receipt.request, "receipt.request");
    invariant(
      receipt.requestDigest === bundle.expectedRequestDigest &&
        canonicalJson(receipt.request) === canonicalJson(bundle.expectedRequest),
      "receipt expected request or digest mismatch",
    );
    const fingerprint = `git:${repository.commit}`;
    invariant(
      receipt.repository.snapshotId === fingerprint &&
        receipt.repository.baseFingerprint === fingerprint &&
        receipt.repository.observedFingerprint === fingerprint &&
        receipt.repository.stableAcrossExecution === true,
      "receipt repository commit mismatch",
    );
    validateExpectedProvenance(bundle.expectedProvenance, receipt);
    invariant(
      receipt.backend.outcome.status === "succeeded" && receipt.summary.complete === true,
      "receipt is not complete and successful",
    );
    validateExecutionObservation(bundle.executionObservation, receipt, repository);
    stats = structuralStats(receipt, repository);
  } catch (error) {
    failures.push(
      `structural_evidence_validation_failed:${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    available: failures.length === 0,
    failures,
    receipt,
    stats,
    candidateIds:
      failures.length === 0 ? receipt.evidence.map(({ id }) => id).sort(compareUtf8) : [],
  };
}
