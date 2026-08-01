import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { chmod, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseAudioSendArgs } from "./workstation-audio.ts";

const AI_CONTROL_ROOT_ENV = "PI_WORKSTATION_INFERENCE_AI_CONTROL_ROOT";
const DEFAULT_AI_CONTROL_ROOT = join(
  homedir(),
  "ai-society",
  "softwareco",
  "owned",
  "local-ai-control-plane",
);
const MAX_HANDOFF_BYTES = 64 * 1024;
const PROVIDER_ID = "workstation-inference";
const MODEL_ID = "inkling-small-iq2m-canary";
const PROFILE_ID = "inkling-tts-canary";
const DEPLOYMENT_ID = "workstation-capability-graph";
const STEP_ID = "inkling-small:0";

type RecordValue = Record<string, unknown>;

export type SchedulerHandoff = {
  handoffPath: string;
  snapshotDirectory: string;
  schedulerDb: string;
  handoffDigest: string;
  claimGeneration: number;
  claimExpiresAt: number;
  attemptNonce: string;
  consumerId: "pi:audio-turn";
  operationKey: "pi:inkling-audio";
  reservationId: string;
  reservationGeneration: number;
  graphStepId: typeof STEP_ID;
  providerId: typeof PROVIDER_ID;
  modelId: typeof MODEL_ID;
};

export type GovernedAudioSend = {
  path: string;
  prompt: string;
  handoffPath: string;
  schedulerDb: string;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expandPath(value: string, cwd: string): string {
  const expanded =
    value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function sameFile(before: Stats, after: Stats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs
  );
}

function commandWords(value: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  const push = () => {
    if (current) words.push(current);
    current = "";
  };
  for (const character of value.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) push();
    else current += character;
  }
  if (escaped || quote) throw new Error("audio-send has an unterminated quote or escape");
  push();
  return words;
}

export function parseGovernedAudioSendArgs(raw: string, cwd: string): GovernedAudioSend {
  const separator = raw.indexOf(" -- ");
  const command = separator >= 0 ? raw.slice(0, separator) : raw;
  const prompt = separator >= 0 ? raw.slice(separator + 4) : "";
  const words = commandWords(command);
  let handoff: string | undefined;
  let schedulerDb: string | undefined;
  const remaining: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (word === "--handoff" || word === "--scheduler-db") {
      const next = words[index + 1];
      if (!next) throw new Error(`${word} requires a path`);
      if (word === "--handoff") handoff = next;
      else schedulerDb = next;
      index += 1;
    } else if (word.startsWith("--handoff=")) {
      handoff = word.slice("--handoff=".length);
    } else if (word.startsWith("--scheduler-db=")) {
      schedulerDb = word.slice("--scheduler-db=".length);
    } else {
      remaining.push(word);
    }
  }
  if (!handoff || !schedulerDb || remaining.length !== 1) {
    throw new Error(
      "usage: audio-send --handoff <claim.json> --scheduler-db <scheduler.sqlite3> <audio> -- <prompt>",
    );
  }
  const parsed = parseAudioSendArgs(`${JSON.stringify(remaining[0])} -- ${prompt}`);
  return {
    ...parsed,
    handoffPath: expandPath(handoff, cwd),
    schedulerDb: expandPath(schedulerDb, cwd),
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is invalid`);
  return value;
}

function exactKeys(value: RecordValue, keys: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} schema is invalid`);
  }
}

export async function readSchedulerHandoff(
  handoffPath: string,
  schedulerDb: string,
  expectedProvider: string,
  expectedModel: string,
): Promise<SchedulerHandoff> {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const handle = await open(handoffPath, constants.O_RDONLY | noFollow);
  let raw: Buffer;
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size <= 0 || before.size > MAX_HANDOFF_BYTES) {
      throw new Error("scheduler handoff must be a bounded regular file");
    }
    raw = await handle.readFile();
    const after = await handle.stat();
    if (!sameFile(before, after) || raw.length !== before.size) {
      throw new Error("scheduler handoff changed while it was being read");
    }
  } finally {
    await handle.close();
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("scheduler handoff is not valid JSON");
  } finally {
    raw.fill(0);
  }
  if (!isRecord(payload)) throw new Error("scheduler handoff schema is invalid");
  exactKeys(
    payload,
    ["schema_version", "kind", "reservation_token", "claim", "owner_authority", "handoff_digest"],
    "scheduler handoff",
  );
  if (payload.schema_version !== 1 || payload.kind !== "ai-control-external-effect-claim-handoff") {
    throw new Error("scheduler handoff kind is unsupported");
  }
  if (
    !isRecord(payload.reservation_token) ||
    !isRecord(payload.claim) ||
    !isRecord(payload.owner_authority)
  ) {
    throw new Error("scheduler handoff binding is invalid");
  }
  const token = payload.reservation_token;
  const claim = payload.claim;
  exactKeys(
    token,
    [
      "reservation_id",
      "generation",
      "plan_digest",
      "expires_at",
      "physical_store_id",
      "deployment_id",
      "profile_id",
      "resource_request_digest",
      "graph_observation_digest",
      "claim_envelope_digest",
      "graph_step_ids",
    ],
    "scheduler reservation token",
  );
  exactKeys(
    claim,
    [
      "claim_generation",
      "consumer_id",
      "attempt_nonce",
      "operation_key",
      "effect_kind",
      "graph_step_id",
      "provider_id",
      "model_id",
      "claim_expires_at",
    ],
    "scheduler claim",
  );
  exactKeys(
    payload.owner_authority,
    [
      "profile_policy_store_id",
      "profile_policy_revision",
      "lifecycle_store_id",
      "lifecycle_revision",
      "profile_config_digest",
      "lifecycle_profile_config_digest",
    ],
    "scheduler owner authority",
  );
  const providerId = stringField(claim.provider_id, "scheduler provider");
  const modelId = stringField(claim.model_id, "scheduler model");
  const steps = token.graph_step_ids;
  if (
    token.deployment_id !== DEPLOYMENT_ID ||
    token.profile_id !== PROFILE_ID ||
    !Array.isArray(steps) ||
    steps.length !== 1 ||
    steps[0] !== STEP_ID ||
    claim.effect_kind !== "graph" ||
    claim.graph_step_id !== STEP_ID ||
    claim.consumer_id !== "pi:audio-turn" ||
    claim.operation_key !== "pi:inkling-audio" ||
    providerId !== PROVIDER_ID ||
    modelId !== MODEL_ID ||
    providerId !== expectedProvider ||
    modelId !== expectedModel ||
    typeof claim.claim_generation !== "number" ||
    !Number.isSafeInteger(claim.claim_generation) ||
    claim.claim_generation < 1
  ) {
    throw new Error("scheduler handoff does not bind the selected Inkling model");
  }
  const expiresAt = Date.parse(stringField(claim.claim_expires_at, "scheduler claim expiry"));
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    throw new Error("scheduler handoff claim is expired");
  }
  const handoffDigest = stringField(payload.handoff_digest, "scheduler handoff digest");
  const attemptNonce = stringField(claim.attempt_nonce, "scheduler attempt nonce");
  if (!/^[0-9a-f]{64}$/.test(handoffDigest)) {
    throw new Error("scheduler handoff digest is invalid");
  }
  const unsigned = { ...payload };
  delete unsigned.handoff_digest;
  const expectedDigest = createHash("sha256").update(canonicalJson(unsigned)).digest("hex");
  if (handoffDigest !== expectedDigest) throw new Error("scheduler handoff digest is invalid");
  const reservationId = stringField(token.reservation_id, "scheduler reservation id");
  const reservationGeneration = token.generation;
  if (
    typeof reservationGeneration !== "number" ||
    !Number.isSafeInteger(reservationGeneration) ||
    reservationGeneration < 1
  ) {
    throw new Error("scheduler reservation generation is invalid");
  }
  const snapshotDirectory = await mkdtemp(
    join(process.env.TMPDIR || tmpdir(), "pi-inkling-handoff-"),
  );
  const snapshotPath = join(snapshotDirectory, "handoff.json");
  try {
    await chmod(snapshotDirectory, 0o700);
    await writeFile(snapshotPath, JSON.stringify(payload), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    await rm(snapshotDirectory, { recursive: true, force: true });
    throw error;
  }
  return {
    handoffPath: snapshotPath,
    snapshotDirectory,
    schedulerDb,
    handoffDigest,
    claimGeneration: claim.claim_generation,
    claimExpiresAt: expiresAt,
    attemptNonce,
    consumerId: "pi:audio-turn",
    operationKey: "pi:inkling-audio",
    reservationId,
    reservationGeneration,
    graphStepId: STEP_ID,
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
  };
}

function aiControlRoot(): string {
  return resolve(process.env[AI_CONTROL_ROOT_ENV]?.trim() || DEFAULT_AI_CONTROL_ROOT);
}

async function runAiControl(
  pi: ExtensionAPI,
  args: string[],
  expectedStatus: string,
  acceptedCodes: number[] = [0],
): Promise<RecordValue> {
  const result = await pi.exec("uv", ["run", "--project", aiControlRoot(), "ai-control", ...args], {
    timeout: 30_000,
  });
  if (!acceptedCodes.includes(result.code)) {
    throw new Error("scheduler consumer command outcome is indeterminate");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error("scheduler consumer command returned invalid JSON");
  }
  if (!isRecord(payload) || payload.status !== expectedStatus) {
    throw new Error(`scheduler consumer command did not return ${expectedStatus}`);
  }
  return payload;
}

function commonArgs(handoff: SchedulerHandoff): string[] {
  return [
    "--handoff",
    handoff.handoffPath,
    "--resource-db",
    handoff.schedulerDb,
    "--scheduler-authority",
    "workstation",
    "--apply",
  ];
}

export async function consumeSchedulerHandoff(
  pi: ExtensionAPI,
  handoff: SchedulerHandoff,
  phase: "pre-effect" | "post-effect",
): Promise<void> {
  const result = await runAiControl(
    pi,
    ["schedule", "external-effect", "consume", "--phase", phase, ...commonArgs(handoff)],
    phase === "pre-effect" ? "external-effect-authorized" : "external-effect-postvalidated",
  );
  if (
    result.phase !== phase ||
    result.handoff_digest !== handoff.handoffDigest ||
    result.claim_generation !== handoff.claimGeneration
  ) {
    throw new Error("scheduler consumer response binding is mismatched");
  }
}

export async function completeSchedulerHandoff(
  pi: ExtensionAPI,
  handoff: SchedulerHandoff,
): Promise<void> {
  const root = process.env.TMPDIR || tmpdir();
  const directory = await mkdtemp(join(root, "pi-inkling-result-"));
  const resultPath = join(directory, "known-result.json");
  const knownResult = {
    schema_version: 1,
    kind: "pi-inkling-external-effect-result",
    handoff_digest: handoff.handoffDigest,
    provider_id: handoff.providerId,
    model_id: handoff.modelId,
    attempt_nonce: handoff.attemptNonce,
    dispatch_count: 1,
    outcome: "known",
    stream_completed: true,
  };
  const resultDigest = createHash("sha256").update(canonicalJson(knownResult)).digest("hex");
  const observationId = `pi-inkling-result:${resultDigest.slice(0, 32)}`;
  const completionPayload = {
    reservation_id: handoff.reservationId,
    reservation_generation: handoff.reservationGeneration,
    claim_generation: handoff.claimGeneration,
    operation_key: handoff.operationKey,
    graph_step_id: handoff.graphStepId,
    observation_id: observationId,
    result_digest: resultDigest,
  };
  const tokenDigest = createHash("sha256").update(canonicalJson(completionPayload)).digest("hex");
  try {
    await chmod(directory, 0o700);
    await writeFile(resultPath, JSON.stringify(knownResult), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const result = await runAiControl(
      pi,
      ["schedule", "external-effect", "complete", "--result", resultPath, ...commonArgs(handoff)],
      "external-effect-completed",
    );
    const token = result.completion_token;
    if (
      !isRecord(token) ||
      token.reservation_id !== handoff.reservationId ||
      token.reservation_generation !== handoff.reservationGeneration ||
      token.claim_generation !== handoff.claimGeneration ||
      token.operation_key !== handoff.operationKey ||
      token.graph_step_id !== handoff.graphStepId ||
      token.observation_id !== observationId ||
      token.result_digest !== resultDigest ||
      token.token_digest !== tokenDigest
    ) {
      throw new Error("scheduler completion response binding is mismatched");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function quarantineSchedulerHandoff(
  pi: ExtensionAPI,
  handoff: SchedulerHandoff,
  reason: string,
): Promise<void> {
  const result = await runAiControl(
    pi,
    [
      "schedule",
      "external-effect",
      "quarantine",
      "--handoff",
      handoff.handoffPath,
      "--resource-db",
      handoff.schedulerDb,
      "--reason",
      reason,
      "--apply",
    ],
    "outcome-unknown",
    [3],
  );
  if (
    result.handoff_digest !== handoff.handoffDigest ||
    result.claim_generation !== handoff.claimGeneration ||
    result.automatic_retry_authorized !== false ||
    result.automatic_release_authorized !== false ||
    result.automatic_reconcile_authorized !== false
  ) {
    throw new Error("scheduler quarantine response binding is mismatched");
  }
}

export async function clearSchedulerHandoff(handoff: SchedulerHandoff): Promise<void> {
  await rm(handoff.snapshotDirectory, { recursive: true, force: true });
}
