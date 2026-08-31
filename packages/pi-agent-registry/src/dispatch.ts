// ---
// summary: Fleet Phase-2 exact-task read-only standing-agent dispatch through the ASC-owned execution runtime.
// read_when:
//   - changing the dispatch_agent pipeline, eligibility gates, or effect classification.
// ---

import type {
  AscExecutionRuntime,
  DispatchSubagentExecutionUpdate,
  SubagentModelContext,
} from "@tryinget/pi-autonomous-session-control/execution";
import { loadAscExecutionSurface } from "./asc-execution-surface.ts";
import {
  AkAuthorizationError,
  authorizeExactTask,
  buildDispatchEvidenceDetails,
  readAkTask,
  recordDispatchEvidence,
} from "./dispatch-authorization.ts";
import {
  DISPATCH_CHILD_PROVENANCE_ENV,
  DISPATCH_EXECUTION_TIMEOUT_SECONDS,
  DISPATCH_PHASE,
  DISPATCH_RECEIPT_SCHEMA,
  DISPATCH_STARTUP_TIMEOUT_SECONDS,
  type DispatchAgentRequest,
  type DispatchFailureReason,
  MAX_DISPATCH_ATTEMPTS_PER_PAIR,
  READ_ONLY_DISPATCH_TOOLS,
} from "./dispatch-contract.ts";
import {
  buildDispatchReceiptInput,
  type DispatchReceipt,
  readDispatchAttemptLedger,
  sha256Hex,
  writeImmutableDispatchReceipt,
} from "./dispatch-receipt.ts";
import {
  composeDispatchSubagentRequest,
  createPhase2AscRuntime,
  type DispatchRequestInputs,
  type DispatchRuntimeFactory,
  dispatchEffectCorrelationId,
} from "./dispatch-request.ts";
import { captureFleetGitSnapshot, resolveGitRepoRoot } from "./fleet-git-snapshot.ts";
import type { AgentRegistry } from "./registry.ts";

export class AgentDispatchError extends Error {
  readonly reason: DispatchFailureReason;
  readonly effectDisposition: "confirmed_no_effects" | "settled" | "effect_indeterminate";
  readonly spawnAttempted: boolean;

  constructor(
    reason: DispatchFailureReason,
    message: string,
    options?: {
      effectDisposition?: "confirmed_no_effects" | "settled" | "effect_indeterminate";
      spawnAttempted?: boolean;
    },
  ) {
    super(message);
    this.name = "AgentDispatchError";
    this.reason = reason;
    this.effectDisposition = options?.effectDisposition ?? "confirmed_no_effects";
    this.spawnAttempted = options?.spawnAttempted ?? false;
  }
}

export interface DispatchAgentDependencies {
  registry: AgentRegistry;
  /** AK CLI binary (default: ak). */
  akBinary?: string;
  /** Explicit receipts directory override (tests / isolated runs). */
  receiptsDir?: string;
  /** Execution-runtime factory; defaults to the ASC-owned runtime. */
  createRuntime?: DispatchRuntimeFactory;
}

export interface DispatchAgentSuccess {
  ok: true;
  receipt: DispatchReceipt;
  receiptPath: string;
  evidenceId?: number;
  output: string;
}

export interface DispatchAgentFailure {
  ok: false;
  reason: DispatchFailureReason;
  message: string;
  effectDisposition: "confirmed_no_effects" | "settled" | "effect_indeterminate";
  spawnAttempted: boolean;
  receipt?: DispatchReceipt;
  receiptPath?: string;
  output?: string;
}

export type DispatchAgentOutcome = DispatchAgentSuccess | DispatchAgentFailure;

/**
 * Fleet Phase-2 dispatch: exactly one read-only standing-agent execution bound
 * to one exact claimed AK task, one immutable receipt, and at most one typed
 * AK evidence row. Every gate fails closed before any ASC identity, capacity,
 * session, or spawn effect exists; ASC owns all execution machinery.
 */
export async function dispatchAgent(
  request: DispatchAgentRequest,
  deps: DispatchAgentDependencies,
  ctx: SubagentModelContext & { cwd: string },
  onUpdate?: (update: DispatchSubagentExecutionUpdate) => void,
  signal?: AbortSignal,
): Promise<DispatchAgentOutcome> {
  const fail = (
    reason: DispatchFailureReason,
    message: string,
    extra?: Partial<
      Pick<
        DispatchAgentFailure,
        "effectDisposition" | "spawnAttempted" | "receipt" | "receiptPath" | "output"
      >
    >,
  ): DispatchAgentFailure => ({
    ok: false,
    reason,
    message,
    effectDisposition: extra?.effectDisposition ?? "confirmed_no_effects",
    spawnAttempted: extra?.spawnAttempted ?? false,
    ...(extra?.receipt ? { receipt: extra.receipt } : {}),
    ...(extra?.receiptPath ? { receiptPath: extra.receiptPath } : {}),
    ...(extra?.output ? { output: extra.output } : {}),
  });

  if (
    typeof request.agent !== "string" ||
    !request.agent.trim() ||
    !Number.isInteger(request.task) ||
    request.task <= 0 ||
    typeof request.objective !== "string" ||
    !request.objective.trim()
  ) {
    return fail(
      "invalid_request",
      "dispatch_agent requires agent, task (exact AK id), and objective",
    );
  }
  if (process.env[DISPATCH_CHILD_PROVENANCE_ENV]) {
    return fail(
      "recursive_dispatch",
      "standing-agent dispatch is one level deep; this session is already a dispatched standing-agent child",
    );
  }
  const surface = await loadAscExecutionSurface();
  if (!surface) {
    return fail(
      "asc_execution_unavailable",
      "the installed ASC package does not export the execution surface (createAscExecutionRuntime, resolveSubagentSessionsDir, resolveSubagentModelSelection); dispatch fails closed",
    );
  }

  const manifest = deps.registry.get(request.agent);
  if (!manifest) {
    return fail(
      "unknown_agent",
      `unknown agent: ${request.agent} (registered: ${[...deps.registry.agents.keys()].sort().join(", ") || "none"})`,
    );
  }

  const ledger = await readDispatchAttemptLedger(request.agent, request.task, {
    dir: deps.receiptsDir,
  });
  if (ledger.settled) {
    return fail(
      "dispatch_already_recorded",
      `one settled dispatch per (agent, exact task) pair: ak-${request.task}/${request.agent} settled with receipt sha256 ${ledger.settled.receipt.receiptSha256}`,
    );
  }
  if (ledger.nextAttemptIndex > MAX_DISPATCH_ATTEMPTS_PER_PAIR) {
    return fail(
      "dispatch_attempts_exhausted",
      `ak-${request.task}/${request.agent} already consumed ${MAX_DISPATCH_ATTEMPTS_PER_PAIR} bounded attempts without a settled read-only dispatch; further attempts require explicit owner disposition`,
    );
  }

  const parentRoot = await resolveGitRepoRoot(ctx.cwd).catch(() => undefined);
  if (!parentRoot) {
    return fail(
      "parent_repo_unobservable",
      `dispatch origin ${ctx.cwd} is not one observable Git repository; exact-task binding is impossible`,
    );
  }
  const parentPre = await captureFleetGitSnapshot(parentRoot).catch(() => undefined);
  if (!parentPre) {
    return fail(
      "parent_repo_unobservable",
      `dispatch-origin repository ${parentRoot} cannot be captured`,
    );
  }

  let task: Awaited<ReturnType<typeof readAkTask>>;
  try {
    task = await readAkTask(request.task, { akBinary: deps.akBinary });
  } catch (error) {
    if (error instanceof AkAuthorizationError) {
      return fail(error.code, error.message);
    }
    return fail(
      "ak_unavailable",
      `AK task read failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const authorization = authorizeExactTask(task, parentRoot);
  if (!authorization.ok) {
    return fail(authorization.code, authorization.message);
  }

  const declaredTools = [...manifest.tools];
  if (
    declaredTools.length === 0 ||
    declaredTools.some((tool) => !READ_ONLY_DISPATCH_TOOLS.includes(tool))
  ) {
    return fail(
      "agent_not_read_only",
      `agent ${manifest.name} declares tools [${declaredTools.join(", ")}]; Fleet Phase-2 read-only dispatch requires a non-empty subset of [${READ_ONLY_DISPATCH_TOOLS.join(", ")}]`,
    );
  }

  const agentSnapshot = await captureFleetGitSnapshot(manifest.root).catch(() => undefined);
  if (!agentSnapshot) {
    return fail(
      "agent_repo_drift",
      `agent repository ${manifest.root} cannot be captured immutably`,
    );
  }
  if (agentSnapshot.status !== "clean_observed") {
    return fail(
      "agent_repo_dirty",
      `agent repository ${manifest.name} worktree is dirty; dispatched bytes could not bind to an immutable revision`,
    );
  }
  const committedManifest = await agentSnapshot.readFile("agent.json").catch(() => undefined);
  const committedPrompt = await agentSnapshot
    .readFile(manifest.system_prompt_file)
    .catch(() => undefined);
  if (!committedManifest || !committedPrompt) {
    return fail(
      "agent_repo_drift",
      `agent repository ${manifest.name} is missing committed agent.json or ${manifest.system_prompt_file}`,
    );
  }

  let launch: Awaited<ReturnType<AgentRegistry["resolve"]>>;
  try {
    launch = await deps.registry.resolve(request.agent);
  } catch (error) {
    return fail(
      "agent_resolution_failed",
      `agent ${request.agent} failed read-only launch resolution: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const requestInputs: DispatchRequestInputs = {
    manifest,
    launch,
    task,
    objective: request.objective,
    parentRoot,
    manifestSha256: committedManifest.sha256,
  };
  const effectCorrelationId = dispatchEffectCorrelationId(requestInputs);
  const allowedPaths =
    manifest.scope?.repos && manifest.scope.repos.length > 0
      ? [...manifest.scope.repos]
      : [parentRoot];
  const forbiddenPaths = [...(manifest.scope?.forbidden ?? []), ".git", "node_modules"];
  const runtime = createPhase2AscRuntime(
    surface,
    deps.registry,
    launch,
    { cwd: ctx.cwd },
    deps.createRuntime,
  );

  let result: Awaited<ReturnType<AscExecutionRuntime["execute"]>>;
  try {
    result = await runtime.execute(
      composeDispatchSubagentRequest(requestInputs),
      ctx,
      onUpdate,
      signal,
    );
  } catch (error) {
    await launch.cleanup().catch(() => undefined);
    return fail(
      "dispatch_failed",
      `ASC runtime rejected the dispatch (effect classification is indeterminate; ASC's own effect-receipt path remains authoritative): ${error instanceof Error ? error.message : String(error)}`,
      { effectDisposition: "effect_indeterminate" },
    );
  }
  await launch.cleanup().catch(() => undefined);

  const ascDetails = result.details;
  // ASC's owner-issued effect receipt is the effect-truth surface; the raw
  // details field is absent on terminal results (ASC's own observation layer
  // derives disposition from the receipt the same way).
  const effectDisposition =
    ascDetails.effectReceipt?.disposition ?? ascDetails.effectDisposition ?? "effect_indeterminate";
  const finish = await agentSnapshot.finish().catch(() => undefined);
  const revisionStable = finish?.stable === true;
  const parentPost = await captureFleetGitSnapshot(parentRoot).catch(() => undefined);
  if (!parentPost) {
    return fail(
      "parent_repo_unobservable",
      `dispatch-origin repository ${parentRoot} could not be re-observed after execution; the read-only claim is unproven`,
      {
        effectDisposition,
        spawnAttempted: true,
        output: result.text,
      },
    );
  }
  const headStable = parentPost.commit === parentPre.commit;
  const noMutationObserved =
    headStable && parentPost.statusSha256 === parentPre.statusSha256 && revisionStable;

  const receiptInput = buildDispatchReceiptInput({
    agent: {
      name: manifest.name,
      ...(manifest.role ? { role: manifest.role } : {}),
      ...(manifest.creation_task ? { creation_task: manifest.creation_task } : {}),
      tools: declaredTools,
      thinking: launch.thinking,
      model: launch.model,
      ...(manifest.skills?.profile ? { skillProfile: manifest.skills.profile } : {}),
      loadedSkills: launch.loadedSkills,
      manifestSha256: committedManifest.sha256,
      manifestBlobOid: committedManifest.blobOid,
      systemPromptSha256: committedPrompt.sha256,
      agentRepo: {
        commit: agentSnapshot.commit,
        treeOid: agentSnapshot.treeOid,
        status: "clean_observed",
        statusSha256: agentSnapshot.statusSha256,
        revisionStable,
      },
    },
    task: {
      id: task.id,
      repo: task.repo,
      title: task.title,
      status: task.status,
      claimedBy: task.claimed_by ?? "",
      leaseExpiresAt: task.lease_expires_at,
    },
    dispatch: {
      attemptIndex: ledger.nextAttemptIndex,
      settlement: "not_settled",
      objective: request.objective,
      objectiveSha256: sha256Hex(request.objective),
      mutationPolicy: "read_only",
      allowedPaths,
      forbiddenPaths,
      effectCorrelationId,
      executionTimeoutSeconds: DISPATCH_EXECUTION_TIMEOUT_SECONDS,
      startupTimeoutSeconds: DISPATCH_STARTUP_TIMEOUT_SECONDS,
      asc: {
        dispatchId: ascDetails.dispatchId ?? "",
        attemptId: ascDetails.attemptId ?? "",
        sessionName: ascDetails.sessionName ?? "",
        sessionFile: ascDetails.sessionFile ?? "",
        status: ascDetails.status ?? "error",
        ...(typeof ascDetails.exitCode === "number" ? { exitCode: ascDetails.exitCode } : {}),
        effectDisposition,
        ...(ascDetails.effectReceipt?.receiptPath
          ? { effectReceiptPath: ascDetails.effectReceipt.receiptPath }
          : {}),
        ...(ascDetails.requestedModel ? { requestedModel: ascDetails.requestedModel } : {}),
        ...(ascDetails.effectiveModel ? { effectiveModel: ascDetails.effectiveModel } : {}),
        ...(ascDetails.usage
          ? { usage: ascDetails.usage as unknown as Record<string, unknown> }
          : {}),
      },
      outputSha256: sha256Hex(result.text),
      outputChars: result.text.length,
    },
    observation: {
      parentRepoRoot: parentRoot,
      parentHead: parentPre.commit,
      preStatusSha256: parentPre.statusSha256,
      postStatusSha256: parentPost.statusSha256,
      headStable,
      noMutationObserved,
      boundary:
        "Bounded observation of the dispatch-origin repository and agent repository across the dispatch window (HEAD plus porcelain-tracked worktree state); git-ignored files, .git internals, and surfaces outside those two repositories are not observed, and an undetectable modify-and-restore interval is not claimed absent.",
    },
    recordedAt: new Date().toISOString(),
  });

  const settledIdentityComplete = Boolean(
    ascDetails.dispatchId &&
      ascDetails.attemptId &&
      ascDetails.sessionName &&
      ascDetails.sessionFile &&
      ascDetails.effectReceipt?.receiptPath &&
      ascDetails.effectReceipt.consumerCorrelationId,
  );
  const settledCorrelationEcho =
    ascDetails.effectReceipt?.consumerCorrelationId === effectCorrelationId;
  const settled =
    result.ok &&
    ascDetails.status === "done" &&
    noMutationObserved &&
    revisionStable &&
    effectDisposition === "settled" &&
    settledIdentityComplete &&
    settledCorrelationEcho;
  receiptInput.dispatch.settlement = settled ? "settled" : "not_settled";

  let written: Awaited<ReturnType<typeof writeImmutableDispatchReceipt>>;
  try {
    written = await writeImmutableDispatchReceipt(receiptInput, { dir: deps.receiptsDir });
  } catch (error) {
    return fail(
      "receipt_write_failed",
      `immutable dispatch receipt could not be published: ${error instanceof Error ? error.message : String(error)}`,
      {
        effectDisposition,
        spawnAttempted: true,
        output: result.text,
      },
    );
  }

  if (!settled) {
    const reason: DispatchFailureReason = !result.ok
      ? "dispatch_failed"
      : !noMutationObserved
        ? "read_only_violation_observed"
        : !revisionStable
          ? "agent_repo_drift"
          : !settledIdentityComplete || !settledCorrelationEcho
            ? "dispatch_failed"
            : "dispatch_failed";
    return {
      ok: false,
      reason,
      message: `dispatch executed but did not settle as a proven read-only observation (status=${ascDetails.status ?? "error"}, revisionStable=${revisionStable}, noMutationObserved=${noMutationObserved}, effectDisposition=${effectDisposition}); the immutable receipt remains the record of truth`,
      effectDisposition,
      spawnAttempted: true,
      receipt: written.receipt,
      receiptPath: written.receiptPath,
      output: result.text,
    };
  }

  try {
    const evidence = await recordDispatchEvidence(
      {
        taskId: task.id,
        details: buildDispatchEvidenceDetails({
          agent: manifest.name,
          agentRepoCommit: agentSnapshot.commit,
          manifestSha256: committedManifest.sha256,
          task: task.id,
          attemptIndex: ledger.nextAttemptIndex,
          dispatchId: ascDetails.dispatchId ?? "",
          attemptId: ascDetails.attemptId ?? "",
          sessionName: ascDetails.sessionName ?? "",
          effectDisposition,
          effectCorrelationId,
          effectCorrelationEchoVerified: settledCorrelationEcho,
          noMutationObserved,
          outputSha256: sha256Hex(result.text),
          receiptSha256: written.receiptSha256,
          receiptName: written.receiptPath.split("/").pop(),
        }),
      },
      { akBinary: deps.akBinary },
    );
    return {
      ok: true,
      receipt: written.receipt,
      receiptPath: written.receiptPath,
      evidenceId: evidence.evidenceId,
      output: result.text,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "evidence_record_failed",
      message: `dispatch settled and the immutable receipt was published, but AK evidence recording failed: ${error instanceof Error ? error.message : String(error)} (record it from the receipt digest manually)`,
      effectDisposition: "settled",
      spawnAttempted: true,
      receipt: written.receipt,
      receiptPath: written.receiptPath,
      output: result.text,
    };
  }
}
