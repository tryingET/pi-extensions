import {
  boundedText,
  exactKeys,
  invariant,
  isSafePath,
  normalizeText,
  portableText,
  sha256Digest,
  unique,
} from "./source-selection-experiment-utils.js";

export const SCI_RECEIPT_SCHEMA = "semantic-code-intelligence.structural_evidence_receipt.v1";

const OPERATIONS = new Set([
  "structural_search",
  "find_definition",
  "find_references",
  "graph_expand",
  "ast_query",
]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const COMPATIBLE_KINDS = {
  structural_search: ["match"],
  ast_query: ["match"],
  find_definition: ["definition"],
  find_references: ["reference"],
  graph_expand: ["graph_node", "graph_edge"],
};

function positiveInteger(value, maximum) {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum;
}

export function validateRequest(request, label) {
  exactKeys(request, ["question", "seeds", "operations", "limits"], [], label);
  invariant(
    boundedText(request.question, 4000, true) &&
      request.question === normalizeText(request.question) &&
      portableText(request.question),
    `${label}.question must be normalized portable text`,
  );
  invariant(
    Array.isArray(request.seeds) && request.seeds.length >= 1 && request.seeds.length <= 256,
    `${label}.seeds is invalid`,
  );
  for (const [index, seed] of request.seeds.entries()) {
    exactKeys(seed, ["id", "kind", "value"], [], `${label}.seeds[${index}]`);
    invariant(/^seed:[a-z0-9][a-z0-9._-]{0,127}$/.test(seed.id), `${label}: seed id is invalid`);
    invariant(["path", "symbol", "text"].includes(seed.kind), `${label}: seed kind is invalid`);
    invariant(
      boundedText(seed.value, 4096, true) && portableText(seed.value),
      `${label}: seed value is invalid`,
    );
    if (seed.kind === "path") invariant(isSafePath(seed.value), `${label}: seed path is invalid`);
    else
      invariant(seed.value === normalizeText(seed.value), `${label}: seed text is not normalized`);
  }
  invariant(unique(request.seeds.map(({ id }) => id)), `${label}: seed ids must be unique`);
  invariant(
    Array.isArray(request.operations) &&
      request.operations.length >= 1 &&
      request.operations.length <= 16 &&
      request.operations.every((operation) => OPERATIONS.has(operation)) &&
      unique(request.operations),
    `${label}.operations is invalid`,
  );
  exactKeys(
    request.limits,
    ["maxCandidates", "maxCandidatesPerFile", "maxEvidenceBytes", "timeoutMs"],
    [],
    `${label}.limits`,
  );
  const bounds = {
    maxCandidates: 10000,
    maxCandidatesPerFile: 10000,
    maxEvidenceBytes: 64 * 1024 * 1024,
    timeoutMs: 120000,
  };
  for (const [key, maximum] of Object.entries(bounds)) {
    invariant(positiveInteger(request.limits[key], maximum), `${label}.limits.${key} is invalid`);
  }
  invariant(
    request.limits.maxCandidatesPerFile <= request.limits.maxCandidates,
    `${label}: per-file cap exceeds total cap`,
  );
}

export function validatePhaseBRequest(request, label) {
  invariant(
    request.operations.length === 1 && request.operations[0] === "structural_search",
    `${label}: Phase B requires exactly one structural_search`,
  );
  const language = request.seeds.filter(({ id }) => id === "seed:language");
  const pattern = request.seeds.filter(({ id }) => id === "seed:pattern");
  invariant(
    language.length === 1 && language[0].kind === "text",
    `${label}: Phase B requires exactly one seed:language text seed`,
  );
  invariant(
    pattern.length === 1 && pattern[0].kind === "text",
    `${label}: Phase B requires exactly one seed:pattern text seed`,
  );
  invariant(
    request.seeds.every(
      (seed) => seed.id === "seed:language" || seed.id === "seed:pattern" || seed.kind === "path",
    ),
    `${label}: Phase B permits only language/pattern text and optional path seeds`,
  );
}

function validatePosition(position, label) {
  exactKeys(position, ["line", "column"], [], label);
  invariant(Number.isSafeInteger(position.line) && position.line >= 0, `${label}.line is invalid`);
  invariant(
    Number.isSafeInteger(position.column) && position.column >= 0,
    `${label}.column is invalid`,
  );
}

function validateRange(range, label) {
  exactKeys(range, ["start", "end"], [], label);
  validatePosition(range.start, `${label}.start`);
  validatePosition(range.end, `${label}.end`);
  invariant(
    range.end.line > range.start.line ||
      (range.end.line === range.start.line && range.end.column >= range.start.column),
    `${label} is reversed`,
  );
}

function validateIdentity(identity, label) {
  invariant(identity && typeof identity.kind === "string", `${label}.kind is required`);
  const common = ["path", "kind"];
  if (identity.kind === "match") exactKeys(identity, [...common, "range"], [], label);
  else if (["definition", "reference"].includes(identity.kind)) {
    exactKeys(identity, [...common, "range", "symbol"], [], label);
  } else if (identity.kind === "graph_node") {
    exactKeys(identity, [...common, "symbol"], ["range"], label);
  } else if (identity.kind === "graph_edge") {
    exactKeys(
      identity,
      [...common, "symbol", "relatedPath", "relatedSymbol", "edgeType"],
      [],
      label,
    );
  } else invariant(false, `${label}.kind is invalid`);
  invariant(isSafePath(identity.path), `${label}.path is invalid`);
  if (identity.range !== undefined) validateRange(identity.range, `${label}.range`);
  if (identity.symbol !== undefined) {
    invariant(boundedText(identity.symbol, 1024, true), `${label}.symbol is invalid`);
  }
  if (identity.kind === "graph_edge") {
    invariant(isSafePath(identity.relatedPath), `${label}.relatedPath is invalid`);
    invariant(boundedText(identity.relatedSymbol, 1024, true), `${label}.relatedSymbol is invalid`);
    invariant(
      identity.path !== identity.relatedPath || identity.symbol !== identity.relatedSymbol,
      `${label}: graph self-edges are rejected`,
    );
    invariant(
      ["import", "export", "caller", "callee", "semantic"].includes(identity.edgeType),
      `${label}.edgeType is invalid`,
    );
  }
}

function validateRepository(repository) {
  exactKeys(
    repository,
    ["snapshotId", "baseFingerprint", "observedFingerprint", "stableAcrossExecution"],
    [],
    "receipt.repository",
  );
  for (const key of ["snapshotId", "baseFingerprint", "observedFingerprint"]) {
    invariant(
      typeof repository[key] === "string" && /^[A-Za-z0-9._:-]{16,256}$/.test(repository[key]),
      `receipt.repository.${key} is invalid`,
    );
  }
  invariant(
    typeof repository.stableAcrossExecution === "boolean",
    "receipt.repository.stableAcrossExecution is invalid",
  );
  invariant(
    !repository.stableAcrossExecution ||
      repository.baseFingerprint === repository.observedFingerprint,
    "stableAcrossExecution requires matching base and observed fingerprints",
  );
}

function validateBackend(receipt) {
  exactKeys(receipt.producer, ["name", "version", "workflow"], [], "receipt.producer");
  invariant(
    receipt.producer.name === "semantic-code-intelligence" &&
      TOKEN.test(receipt.producer.version) &&
      TOKEN.test(receipt.producer.workflow),
    "receipt producer provenance is invalid",
  );
  exactKeys(receipt.backend, ["name", "version", "executable", "outcome"], [], "receipt.backend");
  invariant(
    TOKEN.test(receipt.backend.name) && TOKEN.test(receipt.backend.version),
    "receipt backend provenance is invalid",
  );
  exactKeys(receipt.backend.executable, ["name", "version"], [], "receipt.backend.executable");
  invariant(
    TOKEN.test(receipt.backend.executable.name) && TOKEN.test(receipt.backend.executable.version),
    "receipt executable provenance is invalid",
  );
  exactKeys(
    receipt.backend.outcome,
    ["status", "exitCode", "message"],
    [],
    "receipt.backend.outcome",
  );
  const { status, exitCode, message } = receipt.backend.outcome;
  invariant(
    ["succeeded", "failed", "timed_out", "unavailable"].includes(status),
    "receipt backend outcome is invalid",
  );
  invariant(
    boundedText(message, 2000) && portableText(message),
    "receipt backend message is invalid",
  );
  if (status === "succeeded") invariant(exitCode === 0, "succeeded outcome requires exit 0");
  else if (status === "failed") {
    invariant(
      Number.isSafeInteger(exitCode) && exitCode !== 0,
      "failed outcome requires nonzero exit",
    );
  } else invariant(exitCode === null, `${status} outcome requires null exit`);
}

function validateEvidence(receipt) {
  invariant(
    Array.isArray(receipt.evidence) && receipt.evidence.length <= 10000,
    "receipt.evidence is invalid",
  );
  const ids = [];
  const perFile = new Map();
  let evidenceBytes = 0;
  for (const [index, candidate] of receipt.evidence.entries()) {
    const label = `receipt.evidence[${index}]`;
    exactKeys(
      candidate,
      ["id", "identity", "operation", "snippet", "byteCount", "provenance"],
      [],
      label,
    );
    validateIdentity(candidate.identity, `${label}.identity`);
    invariant(
      candidate.id === `candidate:${sha256Digest(candidate.identity)}`,
      `${label}.id mismatch`,
    );
    ids.push(candidate.id);
    invariant(
      OPERATIONS.has(candidate.operation) &&
        receipt.request.operations.includes(candidate.operation),
      `${label}.operation is invalid`,
    );
    invariant(
      COMPATIBLE_KINDS[candidate.operation].includes(candidate.identity.kind),
      `${label}.kind is incompatible`,
    );
    invariant(boundedText(candidate.snippet, 20000, true), `${label}.snippet is invalid`);
    invariant(
      candidate.byteCount === Buffer.byteLength(candidate.snippet, "utf8") &&
        candidate.byteCount > 0,
      `${label}.byteCount mismatch`,
    );
    exactKeys(candidate.provenance, ["backend", "workflow"], [], `${label}.provenance`);
    invariant(
      candidate.provenance.backend === receipt.backend.name &&
        candidate.provenance.workflow === receipt.producer.workflow,
      `${label}.provenance mismatch`,
    );
    evidenceBytes += candidate.byteCount;
    const path = candidate.identity.path;
    perFile.set(path, (perFile.get(path) ?? 0) + 1);
  }
  invariant(unique(ids), "receipt candidate ids must be unique");
  return { evidenceBytes, perFile };
}

function validateSummary(receipt, accounting) {
  exactKeys(
    receipt.summary,
    ["returnedCount", "totalObservedCount", "evidenceBytes", "capped", "complete"],
    [],
    "receipt.summary",
  );
  const { summary, limits } = { summary: receipt.summary, limits: receipt.request.limits };
  invariant(summary.returnedCount === receipt.evidence.length, "receipt returnedCount mismatch");
  invariant(
    Number.isSafeInteger(summary.totalObservedCount) &&
      summary.totalObservedCount >= summary.returnedCount,
    "receipt totalObservedCount mismatch",
  );
  invariant(summary.evidenceBytes === accounting.evidenceBytes, "receipt evidenceBytes mismatch");
  invariant(summary.returnedCount <= limits.maxCandidates, "receipt candidate cap exceeded");
  invariant(summary.evidenceBytes <= limits.maxEvidenceBytes, "receipt byte cap exceeded");
  invariant(
    [...accounting.perFile.values()].every((count) => count <= limits.maxCandidatesPerFile),
    "receipt per-file cap exceeded",
  );
  invariant(
    summary.capped === summary.totalObservedCount > summary.returnedCount,
    "receipt capped mismatch",
  );
  invariant(
    Array.isArray(receipt.limitations) && receipt.limitations.length <= 128,
    "receipt limitations are invalid",
  );
  for (const [index, limitation] of receipt.limitations.entries()) {
    exactKeys(
      limitation,
      ["code", "message", "affectsCompleteness"],
      [],
      `receipt.limitations[${index}]`,
    );
    invariant(
      /^[a-z][a-z0-9_]{0,63}$/.test(limitation.code) &&
        boundedText(limitation.message, 2000, true) &&
        portableText(limitation.message) &&
        typeof limitation.affectsCompleteness === "boolean",
      "receipt limitation is invalid",
    );
  }
  const canBeComplete =
    receipt.repository.stableAcrossExecution &&
    receipt.repository.baseFingerprint === receipt.repository.observedFingerprint &&
    receipt.backend.outcome.status === "succeeded" &&
    !summary.capped &&
    !receipt.limitations.some(({ affectsCompleteness }) => affectsCompleteness);
  invariant(summary.complete === canBeComplete, "receipt completeness claim is inconsistent");
}

export function validateReceipt(receipt) {
  exactKeys(
    receipt,
    [
      "schema",
      "request",
      "requestDigest",
      "repository",
      "producer",
      "backend",
      "evidence",
      "summary",
      "limitations",
      "receiptDigest",
    ],
    [],
    "receipt",
  );
  invariant(receipt.schema === SCI_RECEIPT_SCHEMA, "receipt.schema is unsupported");
  validateRequest(receipt.request, "receipt.request");
  invariant(
    receipt.requestDigest === sha256Digest(receipt.request),
    "receipt.requestDigest mismatch",
  );
  const { receiptDigest: _ignored, ...body } = receipt;
  invariant(receipt.receiptDigest === sha256Digest(body), "receipt.receiptDigest mismatch");
  validateRepository(receipt.repository);
  validateBackend(receipt);
  const accounting = validateEvidence(receipt);
  validateSummary(receipt, accounting);
  return receipt;
}
