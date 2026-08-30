// ---
// summary: "Consumes strict read-only AK machine envelopes for canonical repo and evidence reads."
// read_when:
//   - "Changing orchestrator repo resolution, task evidence reads, or AK machine-envelope validation."
// ---

import { runAkCommandAsync } from "./ak.ts";
import {
  AK_EVIDENCE_TASK_CONTRACT,
  AK_REPO_RESOLVE_CONTRACT,
  type AkMachineReadParams,
  type BoundaryResult,
  isJsonRecord,
  type JsonRecord,
  type MachineSurfaceContract,
  readJsonInteger,
  readJsonString,
  readNullableJsonString,
  runMachineRead,
} from "./boundaries.ts";

const DEFAULT_AK_MACHINE_MAX_STDOUT_BYTES =
  Number.parseInt(process.env.PI_ORCH_AK_MACHINE_MAX_STDOUT_BYTES || "", 10) || 10 * 1024 * 1024;

export interface AkRepoDetail {
  path: string;
  company: string;
  archetype: string;
  layer: string;
  generated_from: string | null;
  copier_answers: unknown;
  ontology_ref: string | null;
  last_sync: string;
  created_at: string;
}

export interface AkRepoResolution {
  input: string;
  canonical_path: string | null;
  registered: boolean;
  repo: AkRepoDetail | null;
}

export interface AkTaskEvidenceEntry extends JsonRecord {
  id: number;
  task_id: number;
  check_type: string;
  details: JsonRecord | null;
}

export interface AkTaskEvidenceCollection {
  task_id: number;
  count: number;
  evidence: AkTaskEvidenceEntry[];
}

async function runAkMachineRead(
  params: AkMachineReadParams,
  args: string[],
  contract: MachineSurfaceContract,
): Promise<BoundaryResult<JsonRecord>> {
  return runMachineRead(
    {
      akPath: params.akPath,
      societyDb: params.societyDb,
      cwd: params.cwd,
      signal: params.signal,
      maxStdoutBytes: params.maxStdoutBytes ?? DEFAULT_AK_MACHINE_MAX_STDOUT_BYTES,
      maxStderrBytes: params.maxStderrBytes,
      runCommand: params.runAk || runAkCommandAsync,
    },
    args,
    contract,
  );
}

function parseRepoDetail(value: unknown): BoundaryResult<AkRepoDetail> {
  if (!isJsonRecord(value)) {
    return { ok: false, error: "repo.resolve payload.repo was not an object" };
  }

  const path = readJsonString(value, "path");
  const company = readJsonString(value, "company");
  const archetype = readJsonString(value, "archetype");
  const layer = readJsonString(value, "layer");
  const generatedFrom = readNullableJsonString(value, "generated_from");
  const ontologyRef = readNullableJsonString(value, "ontology_ref");
  const lastSync = readJsonString(value, "last_sync");
  const createdAt = readJsonString(value, "created_at");
  if (
    !path ||
    !company ||
    !archetype ||
    !layer ||
    generatedFrom === undefined ||
    ontologyRef === undefined ||
    !lastSync ||
    !createdAt
  ) {
    return { ok: false, error: "repo.resolve payload.repo failed canonical shape validation" };
  }

  return {
    ok: true,
    value: {
      path,
      company,
      archetype,
      layer,
      generated_from: generatedFrom,
      copier_answers: value.copier_answers,
      ontology_ref: ontologyRef,
      last_sync: lastSync,
      created_at: createdAt,
    },
  };
}

export async function resolveAkRepo(
  params: AkMachineReadParams,
  requestedPath: string,
): Promise<BoundaryResult<AkRepoResolution>> {
  const payload = await runAkMachineRead(
    params,
    ["repo", "resolve", requestedPath, "--machine"],
    AK_REPO_RESOLVE_CONTRACT,
  );
  if (!payload.ok) return payload;

  const input = readJsonString(payload.value, "input");
  const registered = payload.value.registered;
  const canonicalPath = readNullableJsonString(payload.value, "canonical_path");
  if (!input || typeof registered !== "boolean" || canonicalPath === undefined) {
    return { ok: false, error: "repo.resolve payload failed canonical shape validation" };
  }
  if (input !== requestedPath) {
    return {
      ok: false,
      error: `repo.resolve input mismatch: expected ${requestedPath}, received ${input}`,
    };
  }

  if (!registered) {
    if (canonicalPath !== null || payload.value.repo !== null) {
      return {
        ok: false,
        error: "repo.resolve unregistered payload carried canonical repo data",
      };
    }
    return {
      ok: true,
      value: { input, canonical_path: null, registered: false, repo: null },
    };
  }

  if (!canonicalPath) {
    return { ok: false, error: "repo.resolve registered payload omitted canonical_path" };
  }
  const repo = parseRepoDetail(payload.value.repo);
  if (!repo.ok) return repo;
  if (repo.value.path !== canonicalPath) {
    return {
      ok: false,
      error: "repo.resolve canonical_path did not match payload.repo.path",
    };
  }

  return {
    ok: true,
    value: {
      input,
      canonical_path: canonicalPath,
      registered: true,
      repo: repo.value,
    },
  };
}

function parseTaskEvidenceEntry(
  value: unknown,
  expectedTaskId: number,
): BoundaryResult<AkTaskEvidenceEntry> {
  if (!isJsonRecord(value)) {
    return { ok: false, error: "evidence.task payload contained a non-object evidence row" };
  }
  const id = readJsonInteger(value, "id");
  const taskId = readJsonInteger(value, "task_id");
  const checkType = readJsonString(value, "check_type");
  const details =
    value.details === null ? null : isJsonRecord(value.details) ? value.details : undefined;
  if (
    id === undefined ||
    id <= 0 ||
    taskId !== expectedTaskId ||
    !checkType ||
    details === undefined
  ) {
    return { ok: false, error: "evidence.task row failed canonical shape validation" };
  }

  return {
    ok: true,
    value: {
      ...value,
      id,
      task_id: taskId,
      check_type: checkType,
      details,
    },
  };
}

export async function readAkTaskEvidence(
  params: AkMachineReadParams,
  taskId: number,
): Promise<BoundaryResult<AkTaskEvidenceCollection>> {
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return { ok: false, error: `evidence.task requires a positive task id, received ${taskId}` };
  }

  const payload = await runAkMachineRead(
    params,
    ["evidence", "task", String(taskId), "--machine"],
    AK_EVIDENCE_TASK_CONTRACT,
  );
  if (!payload.ok) return payload;

  const payloadTaskId = readJsonInteger(payload.value, "task_id");
  const count = readJsonInteger(payload.value, "count");
  const rows = payload.value.evidence;
  if (payloadTaskId !== taskId || count === undefined || count < 0 || !Array.isArray(rows)) {
    return { ok: false, error: "evidence.task payload failed canonical shape validation" };
  }
  if (count !== rows.length) {
    return {
      ok: false,
      error: `evidence.task count mismatch: declared ${count}, emitted ${rows.length}`,
    };
  }

  const evidence: AkTaskEvidenceEntry[] = [];
  for (const row of rows) {
    const parsed = parseTaskEvidenceEntry(row, taskId);
    if (!parsed.ok) return parsed;
    evidence.push(parsed.value);
  }

  return { ok: true, value: { task_id: taskId, count, evidence } };
}

export function findLatestAkTaskEvidence(
  collection: AkTaskEvidenceCollection,
  input: { checkType: string; projectionKey?: string },
): AkTaskEvidenceEntry | null {
  let latest: AkTaskEvidenceEntry | null = null;
  for (const row of collection.evidence) {
    if (row.check_type !== input.checkType) continue;
    if (input.projectionKey !== undefined && row.details?.projection_key !== input.projectionKey) {
      continue;
    }
    if (!latest || row.id > latest.id) latest = row;
  }
  return latest;
}
