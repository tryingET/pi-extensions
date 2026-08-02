import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  canonicalJson,
  isRecord,
  type RecordValue,
  type SchedulerHandoff,
} from "./workstation-scheduler-contract.ts";

export {
  type GovernedAudioSend,
  LEGACY_SCHEDULER_HANDOFF_PROFILE_ID,
  parseGovernedAudioSendArgs,
  readSchedulerHandoff,
  type SchedulerHandoff,
} from "./workstation-scheduler-contract.ts";

const AI_CONTROL_ROOT_ENV = "PI_WORKSTATION_INFERENCE_AI_CONTROL_ROOT";
const DEFAULT_AI_CONTROL_ROOT = join(
  homedir(),
  "ai-society",
  "softwareco",
  "owned",
  "local-ai-control-plane",
);

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
