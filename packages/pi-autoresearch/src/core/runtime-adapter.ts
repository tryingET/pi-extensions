import { isRecord } from "./runtime-common.ts";

export interface AutoresearchAdapterContractEntry {
  packetKind: string;
  adapterContractVersion: number;
  producerAction: string;
  targetKinds: string[];
  requiredFields: string[];
  optionalFields: string[];
  summary: string;
  boundary: string;
}

export interface AutoresearchAdapterContractCatalog {
  packetKind: "autoresearch.adapter_contracts.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  entries: AutoresearchAdapterContractEntry[];
  adapterBoundary: string;
}

export interface AutoresearchAdapterPacketValidationIssue {
  path: string;
  message: string;
}

export interface AutoresearchAdapterPacketValidationResult {
  packetKind: "autoresearch.adapter_validation.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  valid: boolean;
  validatedPacketKind: string | null;
  validatedVersion: number | null;
  issues: AutoresearchAdapterPacketValidationIssue[];
  adapterBoundary: string;
}

export function buildAutoresearchAdapterContractCatalog(): AutoresearchAdapterContractCatalog {
  return {
    packetKind: "autoresearch.adapter_contracts.v1",
    adapterContractVersion: 1,
    targetKinds: ["adapter_authoring", "integration", "documentation"],
    adapterBoundary:
      "Adapter contracts are descriptive and non-mutating; downstream adapters still own validation, target identity, plan/apply posture, and persistence.",
    entries: [
      {
        packetKind: "autoresearch.closeout.v1",
        adapterContractVersion: 1,
        producerAction: 'autoresearch_runtime_status({ action: "closeout", cwd })',
        targetKinds: ["adapter_source", "evidence", "learning", "task_system", "knowledge_base"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "cwd",
          "receiptPath",
          "campaign",
          "metricName",
          "direction",
          "runCount",
          "successfulRunCount",
          "empiricalDecisionClass",
          "empiricalPosture",
          "runs",
          "candidateBindings",
          "recommendedAction",
          "oracleReadyEvidence",
          "adapterBoundary",
        ],
        optionalFields: ["status", "timingInterpretation", "baselineMetric", "bestMetric"],
        summary:
          "Structured package-local empirical segment summary for downstream evidence, learning, and Oracle-memory adapters.",
        boundary:
          "Package-local empirical evidence only; adapters must explicitly promote to AK, Beads, KES, notes, DSPx Oracle, or another target owner.",
      },
      {
        packetKind: "autoresearch.oracle_evidence.v1",
        adapterContractVersion: 1,
        producerAction: 'autoresearch_runtime_status({ action: "oracle_evidence", cwd })',
        targetKinds: ["dspx_oracle", "empirical_memory", "evidence", "adapter_source"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "cwd",
          "campaign",
          "sourceArtifacts",
          "records",
          "publicationPreflight",
          "adapterBoundary",
          "evidenceBoundary",
          "authorityBoundary",
        ],
        optionalFields: [],
        summary:
          "Oracle-readable campaign evidence packet for DSPx-owned publication preflight without shared Oracle writes.",
        boundary:
          "Non-mutating empirical-memory handoff only; DSPx owns publication preflight/shared writes and AK/society.v2.db remains canonical authority.",
      },
      {
        packetKind: "autoresearch.ak_evidence.v1",
        adapterContractVersion: 1,
        producerAction: 'autoresearch_runtime_status({ action: "ak_evidence", cwd, akTaskId })',
        targetKinds: ["ak", "task_system", "evidence_ledger"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "taskId",
          "checkType",
          "result",
          "closeout",
          "suggestedToolCall",
          "adapterBoundary",
        ],
        optionalFields: ["evidenceBoundary"],
        summary: "Exact-task evidence packet for AK-like evidence ledgers and task systems.",
        boundary:
          "Non-mutating and task-bound; controllers or adapters must write through the target evidence owner surface.",
      },
      {
        packetKind: "autoresearch.candidate_result.v1",
        adapterContractVersion: 1,
        producerAction:
          'autoresearch_runtime_status({ action: "candidate_result", cwd }) or autoresearch_runtime_status({ action: "candidate_result_export", cwd, outPath })',
        targetKinds: ["candidate_review", "task_system", "evidence", "issue_tracker"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "cwd",
          "campaign",
          "candidate",
          "candidateRun",
          "empiricalDecisionClass",
          "recommendedAction",
          "resultSummary",
          "closeout",
          "adapterBoundary",
        ],
        optionalFields: [],
        summary:
          "Latest visible-candidate measurement summary for review, task, issue, or evidence adapters.",
        boundary:
          "Non-mutating candidate-result evidence only; candidate lifecycle, review, merge, and promotion remain external owner responsibilities.",
      },
      {
        packetKind: "autoresearch.learning.v1",
        adapterContractVersion: 1,
        producerAction: 'autoresearch_runtime_status({ action: "learning", cwd })',
        targetKinds: ["kes", "kms", "knowledge_base", "notes"],
        requiredFields: [
          "packetKind",
          "adapterContractVersion",
          "targetKinds",
          "suggestedPath",
          "title",
          "markdown",
          "closeout",
          "adapterBoundary",
        ],
        optionalFields: [],
        summary:
          "Markdown plus structured closeout for KES, notes, KMS, and knowledge-base adapters.",
        boundary:
          "Non-mutating and adapter-ready; learning adapters own persistence, promotion, and external writes.",
      },
    ],
  };
}

export function validateAutoresearchAdapterPacket(
  packet: unknown,
): AutoresearchAdapterPacketValidationResult {
  const issues: AutoresearchAdapterPacketValidationIssue[] = [];
  const adapterBoundary =
    "Adapter packet validation is non-mutating and structural; target adapters remain responsible for target identity, authority checks, and persistence.";

  const addIssue = (pathName: string, message: string) => {
    issues.push({ path: pathName, message });
  };

  if (!isRecord(packet) || Array.isArray(packet)) {
    return {
      packetKind: "autoresearch.adapter_validation.v1",
      adapterContractVersion: 1,
      targetKinds: ["adapter_validation"],
      valid: false,
      validatedPacketKind: null,
      validatedVersion: null,
      issues: [{ path: "$", message: "packet must be an object" }],
      adapterBoundary,
    };
  }

  const packetKind = typeof packet.packetKind === "string" ? packet.packetKind : null;
  const version =
    typeof packet.adapterContractVersion === "number" ? packet.adapterContractVersion : null;
  if (!packetKind) addIssue("packetKind", "packetKind must be a string");
  if (version === null)
    addIssue("adapterContractVersion", "adapterContractVersion must be a number");

  const catalog = buildAutoresearchAdapterContractCatalog();
  const entry = catalog.entries.find((candidate) => candidate.packetKind === packetKind);
  if (packetKind && !entry) {
    addIssue("packetKind", `unsupported packet kind ${packetKind}`);
  }
  if (entry && version !== entry.adapterContractVersion) {
    addIssue(
      "adapterContractVersion",
      `expected adapter contract version ${entry.adapterContractVersion}`,
    );
  }

  if (entry) {
    for (const field of entry.requiredFields) {
      if (packet[field] === undefined) addIssue(field, "required field is missing");
    }
  }

  validateStringArrayField(packet, "targetKinds", addIssue);
  validateStringField(packet, "adapterBoundary", addIssue);

  if (packetKind === "autoresearch.closeout.v1") {
    validateCloseoutPacketFields(packet, "", addIssue);
  } else if (packetKind === "autoresearch.oracle_evidence.v1") {
    validateStringField(packet, "cwd", addIssue);
    validateArrayField(packet, "records", addIssue);
    if (isRecord(packet.publicationPreflight) && !Array.isArray(packet.publicationPreflight)) {
      if (packet.publicationPreflight.sharedOracleMutated !== false) {
        addIssue("publicationPreflight.sharedOracleMutated", "sharedOracleMutated must be false");
      }
      if (packet.publicationPreflight.localCoordinatesDbMigrated !== false) {
        addIssue(
          "publicationPreflight.localCoordinatesDbMigrated",
          "localCoordinatesDbMigrated must be false",
        );
      }
      if (packet.publicationPreflight.canonicalAuthorityMutated !== false) {
        addIssue(
          "publicationPreflight.canonicalAuthorityMutated",
          "canonicalAuthorityMutated must be false",
        );
      }
    } else {
      addIssue("publicationPreflight", "publicationPreflight must be an object");
    }
    validateStringField(packet, "evidenceBoundary", addIssue);
    validateStringField(packet, "authorityBoundary", addIssue);
  } else if (packetKind === "autoresearch.ak_evidence.v1") {
    validatePositiveIntegerField(packet, "taskId", addIssue);
    if (packet.checkType !== "autoresearch:segment_closeout") {
      addIssue("checkType", 'checkType must be "autoresearch:segment_closeout"');
    }
    validateStringField(packet, "result", addIssue);
    validateStringField(packet, "suggestedToolCall", addIssue);
    if (isRecord(packet.closeout) && !Array.isArray(packet.closeout)) {
      validateCloseoutPacketFields(packet.closeout, "closeout.", addIssue);
    } else {
      addIssue("closeout", "closeout must be an object");
    }
  } else if (packetKind === "autoresearch.candidate_result.v1") {
    validateStringField(packet, "cwd", addIssue);
    validateStringField(packet, "empiricalDecisionClass", addIssue);
    validateStringField(packet, "recommendedAction", addIssue);
    validateStringField(packet, "resultSummary", addIssue);
    if (
      packet.candidate !== null &&
      (!isRecord(packet.candidate) || Array.isArray(packet.candidate))
    ) {
      addIssue("candidate", "candidate must be an object or null");
    } else if (isRecord(packet.candidate) && !Array.isArray(packet.candidate)) {
      validateCandidateResultCandidateFields(packet.candidate, addIssue);
    }
    if (
      packet.candidateRun !== null &&
      (!isRecord(packet.candidateRun) || Array.isArray(packet.candidateRun))
    ) {
      addIssue("candidateRun", "candidateRun must be an object or null");
    } else if (isRecord(packet.candidateRun) && !Array.isArray(packet.candidateRun)) {
      validateCandidateResultRunFields(packet.candidateRun, addIssue);
    }
    if (isRecord(packet.closeout) && !Array.isArray(packet.closeout)) {
      validateCloseoutPacketFields(packet.closeout, "closeout.", addIssue);
    } else {
      addIssue("closeout", "closeout must be an object");
    }
  } else if (packetKind === "autoresearch.learning.v1") {
    validateStringField(packet, "suggestedPath", addIssue);
    validateStringField(packet, "title", addIssue);
    validateStringField(packet, "markdown", addIssue);
    if (isRecord(packet.closeout) && !Array.isArray(packet.closeout)) {
      validateCloseoutPacketFields(packet.closeout, "closeout.", addIssue);
    } else {
      addIssue("closeout", "closeout must be an object");
    }
  }

  return {
    packetKind: "autoresearch.adapter_validation.v1",
    adapterContractVersion: 1,
    targetKinds: ["adapter_validation"],
    valid: issues.length === 0,
    validatedPacketKind: packetKind,
    validatedVersion: version,
    issues,
    adapterBoundary,
  };
}

function validateCandidateResultCandidateFields(
  candidate: Record<string, unknown>,
  addIssue: (pathName: string, message: string) => void,
): void {
  validateNullableStringField(candidate, "source", addIssue, "candidate.");
  validateNullableStringField(candidate, "worktreePath", addIssue, "candidate.");
  validateNullableStringField(candidate, "branch", addIssue, "candidate.");
  validateNullableStringField(candidate, "baseRef", addIssue, "candidate.");
  validateNullableStringField(candidate, "diffSummary", addIssue, "candidate.");
  validateStringArrayField(candidate, "filesChanged", addIssue, "candidate.");
}

function validateCandidateResultRunFields(
  candidateRun: Record<string, unknown>,
  addIssue: (pathName: string, message: string) => void,
): void {
  validateStringField(candidateRun, "status", addIssue, "candidateRun.");
  validateStringField(candidateRun, "empiricalDecisionClass", addIssue, "candidateRun.");
  validateNumberField(candidateRun, "metric", addIssue, "candidateRun.");
}

function validateCloseoutPacketFields(
  packet: Record<string, unknown>,
  prefix: string,
  addIssue: (pathName: string, message: string) => void,
): void {
  if (packet.packetKind !== "autoresearch.closeout.v1") {
    addIssue(`${prefix}packetKind`, 'packetKind must be "autoresearch.closeout.v1"');
  }
  if (packet.adapterContractVersion !== 1) {
    addIssue(`${prefix}adapterContractVersion`, "adapterContractVersion must be 1");
  }
  validateStringArrayField(packet, "targetKinds", addIssue, prefix);
  validateStringField(packet, "cwd", addIssue, prefix);
  validateStringField(packet, "receiptPath", addIssue, prefix);
  validateNumberField(packet, "runCount", addIssue, prefix);
  validateNumberField(packet, "successfulRunCount", addIssue, prefix);
  validateStringField(packet, "empiricalDecisionClass", addIssue, prefix);
  validateEmpiricalPostureField(packet, "empiricalPosture", addIssue, prefix);
  validateArrayField(packet, "runs", addIssue, prefix);
  validateArrayField(packet, "candidateBindings", addIssue, prefix);
  validateStringField(packet, "recommendedAction", addIssue, prefix);
  const oracleReadyEvidence = packet.oracleReadyEvidence;
  if (!isRecord(oracleReadyEvidence) || Array.isArray(oracleReadyEvidence)) {
    addIssue(`${prefix}oracleReadyEvidence`, "oracleReadyEvidence must be an object");
  } else {
    if (oracleReadyEvidence.packetKind !== "autoresearch.oracle_evidence.v1") {
      addIssue(
        `${prefix}oracleReadyEvidence.packetKind`,
        'oracleReadyEvidence.packetKind must be "autoresearch.oracle_evidence.v1"',
      );
    }
    validateNumberField(
      oracleReadyEvidence,
      "recordCount",
      addIssue,
      `${prefix}oracleReadyEvidence.`,
    );
    validateStringField(
      oracleReadyEvidence,
      "authorityBoundary",
      addIssue,
      `${prefix}oracleReadyEvidence.`,
    );
  }
  validateStringField(packet, "adapterBoundary", addIssue, prefix);
}

function validateEmpiricalPostureField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  const value = packet[field];
  const fieldPath = `${prefix}${field}`;
  if (!isRecord(value) || Array.isArray(value)) {
    addIssue(fieldPath, `${field} must be an object`);
    return;
  }
  validateStringField(value, "classification", addIssue, `${fieldPath}.`);
  validateStringField(value, "summary", addIssue, `${fieldPath}.`);
  if (typeof value.promotionReady !== "boolean") {
    addIssue(`${fieldPath}.promotionReady`, "promotionReady must be a boolean");
  }
  validateStringField(value, "recommendedNextAction", addIssue, `${fieldPath}.`);
}

function validateStringField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  if (typeof packet[field] !== "string") {
    addIssue(`${prefix}${field}`, `${field} must be a string`);
  }
}

function validateNullableStringField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  const value = packet[field];
  if (value !== null && typeof value !== "string") {
    addIssue(`${prefix}${field}`, `${field} must be a string or null`);
  }
}

function validateNumberField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  if (typeof packet[field] !== "number" || !Number.isFinite(packet[field])) {
    addIssue(`${prefix}${field}`, `${field} must be a finite number`);
  }
}

function validatePositiveIntegerField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
): void {
  if (!Number.isInteger(packet[field]) || Number(packet[field]) < 1) {
    addIssue(field, `${field} must be a positive integer`);
  }
}

function validateArrayField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  if (!Array.isArray(packet[field])) {
    addIssue(`${prefix}${field}`, `${field} must be an array`);
  }
}

function validateStringArrayField(
  packet: Record<string, unknown>,
  field: string,
  addIssue: (pathName: string, message: string) => void,
  prefix = "",
): void {
  const value = packet[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    addIssue(`${prefix}${field}`, `${field} must be an array of strings`);
  }
}
