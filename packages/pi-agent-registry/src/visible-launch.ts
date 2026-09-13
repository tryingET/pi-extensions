// summary: exact-task read-only visible admission composition; transport stays little-helpers-owned.
import { realpath } from "node:fs/promises";
import { AkAuthorizationError, authorizeExactTask, readAkTask } from "./dispatch-authorization.ts";
import { DISPATCH_CHILD_PROVENANCE_ENV } from "./dispatch-contract.ts";
import { canonicalJsonString, sha256Hex } from "./dispatch-receipt.ts";
import { captureFleetGitSnapshot, resolveGitRepoRoot } from "./fleet-git-snapshot.ts";
import { reserveVisibleLaunchPair } from "./visible-launch-admission.ts";
import { resolveTrustedVisibleLaunchBootstrap } from "./visible-launch-bootstrap.ts";
import {
  checkParentPeerTarget,
  composeStandingAgentArgv,
  composeStandingAgentModelArgs,
  composeStandingAgentSpawnPrompt,
  createStandingAgentRunId,
  manifestToolsAreLaunchEligible,
  redactArgvForReceipt,
  standingAgentTitle,
  systemPromptWithinArgvBound,
} from "./visible-launch-compose.ts";
import {
  type StandingAgentSpawnDeps,
  type StandingAgentSpawnFailure,
  type StandingAgentSpawnOutcome,
  type StandingAgentSpawnRequest,
  VISIBLE_LAUNCH_CHILD_PROVENANCE_ENV,
  VISIBLE_LAUNCH_PHASE,
  type VisibleLaunchCtx,
  type VisibleLaunchFailureReason,
  type VisibleLaunchTransport,
} from "./visible-launch-contract.ts";
import { verifyVisibleLaunchInputs } from "./visible-launch-inputs.ts";
import {
  buildVisibleLaunchReceiptInput,
  writeImmutableVisibleLaunchReceipt,
} from "./visible-launch-receipt.ts";
import {
  createVisibleLaunchDispatchGuard,
  loadVisibleLaunchTransport,
} from "./visible-launch-transport.ts";

export type {
  StandingAgentSpawnDeps,
  StandingAgentSpawnOutcome,
  VisibleLaunchCtx,
} from "./visible-launch-contract.ts";

/** Admission is NOT session-start proof, ACK evidence, task consumption/completion or claimant authentication. */
export async function spawnStandingAgentVisible(
  request: StandingAgentSpawnRequest,
  deps: StandingAgentSpawnDeps,
  ctx: VisibleLaunchCtx,
  signal?: AbortSignal,
): Promise<StandingAgentSpawnOutcome> {
  const fail = (
    reason: VisibleLaunchFailureReason,
    message: string,
    extra: Partial<
      Pick<
        StandingAgentSpawnFailure,
        "effectDisposition" | "spawnAttempted" | "receipt" | "receiptPath" | "runId"
      >
    > = {},
  ): StandingAgentSpawnFailure => ({
    ok: false,
    phase: VISIBLE_LAUNCH_PHASE,
    reason,
    message,
    effectDisposition: "confirmed_no_effects",
    spawnAttempted: false,
    ...extra,
  });
  if (
    !request ||
    typeof request.agent !== "string" ||
    !/^[a-z][a-z0-9-]{0,63}$/u.test(request.agent) ||
    !Number.isSafeInteger(request.task) ||
    request.task <= 0 ||
    typeof request.objective !== "string" ||
    !request.objective.trim() ||
    Buffer.byteLength(request.objective, "utf8") > 32 * 1024 ||
    !systemPromptWithinArgvBound(request.objective) ||
    (request.cwd !== undefined &&
      (typeof request.cwd !== "string" ||
        !request.cwd.trim() ||
        !systemPromptWithinArgvBound(request.cwd))) ||
    (request.parentPeerTarget !== undefined && typeof request.parentPeerTarget !== "string") ||
    (request.reportBack !== undefined &&
      !["intercom", "manual", "none"].includes(request.reportBack))
  ) {
    return fail(
      "invalid_request",
      "Require safe agent, exact positive AK task, and nonblank bounded UTF-8 read-only objective (32 KiB maximum).",
    );
  }
  if (signal?.aborted) return fail("cancelled", "Cancelled before launch admission.");
  const reportBack = request.reportBack ?? "intercom";
  const target = checkParentPeerTarget(request.parentPeerTarget);
  if (reportBack === "intercom" && !target.ok)
    return fail(
      "invalid_parent_peer_target",
      "Intercom report-back requires the exact controller session id.",
    );
  const parentPeerTarget = reportBack === "intercom" && target.ok ? target.target : undefined;
  if (
    process.env[VISIBLE_LAUNCH_CHILD_PROVENANCE_ENV] ||
    process.env[DISPATCH_CHILD_PROVENANCE_ENV]
  ) {
    return fail(
      "recursive_launch",
      "Standing-agent children cannot launch another standing agent.",
    );
  }
  const transport =
    deps.transport === null ? undefined : (deps.transport ?? (await loadVisibleLaunchTransport()));
  if (!transport)
    return fail(
      "visible_transport_unavailable",
      "Version-1 little-helpers standing-agent transport is unavailable; fail closed.",
    );
  const cached = deps.registry.get(request.agent);
  if (!cached) return fail("unknown_agent", "Agent is not registered.");
  const manifest = structuredClone(cached);
  if (!manifestToolsAreLaunchEligible(manifest))
    return fail(
      "agent_not_read_only",
      "Declared tools must be a nonempty subset of read,bash; read-only posture is advisory, not a sandbox.",
    );
  if (manifest.extensions.length)
    return fail(
      "manifest_extensions_unapproved",
      "Manifest extensions are not approved in this phase.",
    );
  const parentRoot = await resolveGitRepoRoot(ctx.cwd)
    .then((path) => realpath(path))
    .catch(() => undefined);
  const parentSnapshot = parentRoot
    ? await captureFleetGitSnapshot(parentRoot).catch(() => undefined)
    : undefined;
  if (!parentRoot || !parentSnapshot)
    return fail(
      "parent_repo_unobservable",
      "Origin must be one observable Git repository for exact-task authorization.",
    );
  const cwd = await realpath(request.cwd ?? parentRoot).catch(() => undefined);
  const childRoot = cwd
    ? await resolveGitRepoRoot(cwd)
        .then((path) => realpath(path))
        .catch(() => undefined)
    : undefined;
  if (!cwd || childRoot !== parentRoot)
    return fail(
      "task_repo_mismatch",
      "Child cwd must remain in the exact task's origin repository.",
    );
  let task: Awaited<ReturnType<typeof readAkTask>>;
  try {
    task = await readAkTask(request.task, { akBinary: deps.akBinary });
  } catch (error) {
    return fail(
      error instanceof AkAuthorizationError ? error.code : "ak_unavailable",
      "Exact AK task authorization is unavailable.",
    );
  }
  const authorization = authorizeExactTask(task, parentRoot);
  if (!authorization.ok)
    return fail(authorization.code, "Exact task requires a live claim in the origin repository.");
  const agentSnapshot = await captureFleetGitSnapshot(manifest.root).catch(() => undefined);
  if (!agentSnapshot) return fail("agent_repo_drift", "Agent repository could not be captured.");
  if (agentSnapshot.status !== "clean_observed")
    return fail(
      "agent_repo_dirty",
      "Agent repository is dirty; committed launch inputs cannot be proven.",
    );
  if (!(await verifyVisibleLaunchInputs(manifest, deps.registry, agentSnapshot)))
    return fail("agent_repo_drift", "Cached, committed and current agent inputs differ.");
  const committedManifest = await agentSnapshot.readFile("agent.json");
  const committedPrompt = await agentSnapshot.readFile(manifest.system_prompt_file);
  if (!committedManifest || !committedPrompt)
    return fail("agent_repo_drift", "Committed launch inputs unavailable.");
  let launch: Awaited<ReturnType<StandingAgentSpawnDeps["registry"]["resolve"]>>;
  try {
    launch = await deps.registry.resolve(request.agent);
  } catch {
    return fail("agent_resolution_failed", "Agent composition failed; no launch attempted.");
  }
  const cleanup = () => launch.cleanup().catch(() => undefined);
  const reject = async (reason: VisibleLaunchFailureReason, message: string, runId?: string) => {
    await cleanup();
    return fail(reason, message, runId ? { runId } : {});
  };
  const modelArgs = composeStandingAgentModelArgs({ launch, controllerModel: ctx.model });
  const model = modelArgs[modelArgs.indexOf("--model") + 1];
  const bootstrap = modelArgs.includes("--model")
    ? await (deps.resolveTrustedBootstrap ?? resolveTrustedVisibleLaunchBootstrap)(model).catch(
        () => undefined,
      )
    : undefined;
  if (!bootstrap || !bootstrap.extensions.length || !bootstrap.bindings.length)
    return reject(
      "bootstrap_unavailable",
      "Trusted ACK/presence/provider bootstrap unavailable. Owner approval required; ambient extensions are never inherited.",
    );
  const runId = createStandingAgentRunId();
  const objective = request.objective.trim();
  const prompt = composeStandingAgentSpawnPrompt({
    manifest,
    runId,
    task: task.id,
    reportBack,
    parentPeerTarget,
    objective,
    cwd,
  });
  const argv = composeStandingAgentArgv({
    launch,
    prompt,
    trustedExtensions: bootstrap.extensions,
  });
  const title = standingAgentTitle(manifest);
  const childProvenanceEnv = {
    [VISIBLE_LAUNCH_CHILD_PROVENANCE_ENV]: `${runId}:ak-${task.id}:${manifest.name}`,
  };
  const composedArgs = [
    "pi",
    ...modelArgs,
    ...argv.extraPiArgs,
    prompt,
    cwd,
    title,
    ...Object.entries(childProvenanceEnv).map(([key, value]) => `${key}=${value}`),
  ];
  if (
    composedArgs.length > 900 ||
    !composedArgs.every(systemPromptWithinArgvBound) ||
    composedArgs.reduce((n, value) => n + Buffer.byteLength(value, "utf8") + 1, 0) > 240 * 1024
  ) {
    return reject(
      "invalid_argv",
      "Composed arguments violate UTF-8/NUL or transport byte bounds.",
      runId,
    );
  }
  const composedArgvSha256 = sha256Hex(canonicalJsonString(composedArgs));
  if (!(await verifyVisibleLaunchInputs(manifest, deps.registry, agentSnapshot, launch)))
    return reject(
      "agent_repo_drift",
      "Resolved launch differs from immutable agent inputs.",
      runId,
    );
  if (signal?.aborted) return reject("cancelled", "Cancelled before reservation.", runId);
  try {
    const reservation = await reserveVisibleLaunchPair(
      {
        agent: manifest.name,
        task: task.id,
        runId,
        requestSha256: sha256Hex(
          canonicalJsonString({
            task,
            composedArgvSha256,
            manifestSha256: committedManifest.sha256,
            bootstrap: bootstrap.bindings,
          }),
        ),
      },
      deps.receiptsDir,
    );
    if (!reservation.reserved)
      return reject(
        "launch_already_reserved",
        "This agent/task pair is reserved or admitted. No automatic retry; explicit owner disposition required.",
        reservation.runId,
      );
  } catch {
    return reject(
      "reservation_failed",
      "Could not durably reserve agent/task pair; no launch attempted.",
      runId,
    );
  }
  // Last awaited gates before transport. The reservation deliberately survives cancellation/drift/crashes.
  let latestTask: typeof task | undefined;
  try {
    latestTask = await readAkTask(request.task, { akBinary: deps.akBinary });
  } catch {
    /* fail closed */
  }
  if (
    !latestTask ||
    canonicalJsonString(latestTask) !== canonicalJsonString(task) ||
    !authorizeExactTask(latestTask, parentRoot).ok
  ) {
    return reject(
      "ak_unavailable",
      "Exact task claim changed or became unverifiable before transport.",
      runId,
    );
  }
  const [preInputs, preBootstrap] = await Promise.all([
    verifyVisibleLaunchInputs(manifest, deps.registry, agentSnapshot, launch),
    bootstrap.verify().catch(() => false),
  ]);
  const [preAgent, preOrigin] = await Promise.all([
    agentSnapshot.finish().catch(() => undefined),
    parentSnapshot.finish().catch(() => undefined),
  ]);
  if (
    !preAgent?.stable ||
    !preOrigin?.stable ||
    !preInputs ||
    !preBootstrap ||
    !authorizeExactTask(task, parentRoot).ok
  )
    return reject(
      "agent_repo_drift",
      "Launch inputs or origin drifted immediately before transport; reservation retained.",
      runId,
    );
  if (signal?.aborted)
    return reject(
      "cancelled",
      "Cancelled immediately before transport; reservation retained.",
      runId,
    );
  let transportResult: Awaited<ReturnType<VisibleLaunchTransport["launchPiQuestSession"]>>;
  try {
    transportResult = await transport.launchPiQuestSession({
      // Additive guarded transport fields; production loader rejects older version-1 modules.
      ...createVisibleLaunchDispatchGuard(task, parentRoot, deps.akBinary),
      pi: deps.pi,
      ctx: { cwd: ctx.cwd },
      options: {},
      defaultPiBin: "pi",
      prompt,
      titlePrompt: title,
      titlePrefix: "Standing",
      cwd,
      modelArgs,
      extraPiArgs: argv.extraPiArgs,
      childProvenanceEnv,
      signal,
    });
  } catch {
    // A thrown transport can already have admitted a child. Keep skills and the reservation.
    transportResult = {
      ok: false,
      effectDisposition: "effect_indeterminate",
      launchMode: "unknown",
      sessionMode: "clean",
      cwd,
      titleBase: title,
      promptSummary: "",
      failure: "transport_threw",
    };
  }
  const disposition = transportResult?.effectDisposition;
  const effectDisposition: StandingAgentSpawnFailure["effectDisposition"] =
    transportResult?.ok === true && disposition === "settled"
      ? "settled"
      : transportResult?.ok === false && disposition === "confirmed_no_effects"
        ? "confirmed_no_effects"
        : "effect_indeterminate";
  const admitted = transportResult?.ok === true && effectDisposition === "settled";
  const noEffects = transportResult?.ok === false && effectDisposition === "confirmed_no_effects";
  if (noEffects) await cleanup();
  const [postInputs, postBootstrap] = await Promise.all([
    verifyVisibleLaunchInputs(manifest, deps.registry, agentSnapshot, launch),
    bootstrap.verify().catch(() => false),
  ]);
  const [postAgent, postOrigin] = await Promise.all([
    agentSnapshot.finish().catch(() => undefined),
    parentSnapshot.finish().catch(() => undefined),
  ]);
  const stable =
    postAgent?.stable === true && postOrigin?.stable === true && postInputs && postBootstrap;
  const receiptInput = buildVisibleLaunchReceiptInput({
    agent: {
      name: manifest.name,
      ...(manifest.role ? { role: manifest.role } : {}),
      ...(manifest.creation_task ? { creation_task: manifest.creation_task } : {}),
      declaredTools: manifest.tools,
      effectiveTools: argv.effectiveTools,
      thinking: launch.thinking,
      model: launch.model,
      ...(manifest.skills?.profile ? { skillProfile: manifest.skills.profile } : {}),
      loadedSkills: launch.loadedSkills,
      manifestSha256: committedManifest.sha256,
      manifestBlobOid: committedManifest.blobOid,
      systemPromptSha256: committedPrompt.sha256,
      systemPromptBlobOid: committedPrompt.blobOid,
      composedSystemPromptSha256: argv.systemPromptSha256,
      agentRepo: {
        commit: agentSnapshot.commit,
        treeOid: agentSnapshot.treeOid,
        statusSha256: agentSnapshot.statusSha256,
      },
    },
    task,
    bootstrap: bootstrap.bindings,
    observation: {
      agentRevisionStable: postAgent?.stable === true,
      originRevisionStable: postOrigin?.stable === true,
      inputsStable: postInputs,
      bootstrapStable: postBootstrap,
      parentRepoRoot: parentRoot,
      parentCommit: parentSnapshot.commit,
      parentStatusSha256: parentSnapshot.statusSha256,
      boundary:
        "Bounded launch-window HEAD/worktree observations only, not lifetime read-only proof. Ignored files, .git internals, outside surfaces and modify-and-restore intervals are unobserved. No child startup, ACK or task completion evidence is inferred.",
    },
    launch: {
      runId,
      sessionMode: "clean",
      objective,
      objectiveSha256: sha256Hex(objective),
      mutationPolicy: "read_only",
      composedArgvSha256,
      admission: admitted ? "transport_admitted" : noEffects ? "not_admitted" : "unproven",
      sessionStarted: "unproven",
      ack: "unproven",
      taskCompletion: "unproven",
      reportBack,
      ...(parentPeerTarget ? { parentPeerTarget } : {}),
      cwd,
      title,
      promptSha256: argv.promptSha256,
      argvFlags: redactArgvForReceipt(argv.extraPiArgs),
      argvCount: argv.extraPiArgs.length,
      skillDirCount: launch.skillDirs.length,
    },
    transport: {
      owner: "pi-little-helpers",
      launchMode: ["tab", "window"].includes(transportResult?.launchMode)
        ? transportResult.launchMode
        : "unknown",
      effectDisposition,
      ok: admitted,
      ...(!admitted ? { failure: "transport_not_proven_admitted" } : {}),
    },
    recordedAt: new Date().toISOString(),
  });
  let written: Awaited<ReturnType<typeof writeImmutableVisibleLaunchReceipt>>;
  try {
    written = await (deps.writeReceipt ?? writeImmutableVisibleLaunchReceipt)(receiptInput, {
      dir: deps.receiptsDir,
    });
  } catch {
    return fail(
      "receipt_write_failed",
      "Transport observation retained, but receipt publication failed. Supervise runId; never retry automatically.",
      { effectDisposition, spawnAttempted: true, runId },
    );
  }
  const observed = {
    effectDisposition,
    spawnAttempted: true,
    runId,
    receipt: written.receipt,
    receiptPath: written.receiptPath,
  };
  if (!stable)
    return fail(
      "launch_indeterminate",
      "Post-transport input/origin drift: clean observation unproven. Transport admission is recorded separately; supervise runId.",
      { ...observed, effectDisposition: "effect_indeterminate" },
    );
  if (!admitted)
    return fail(
      noEffects ? "launch_failed" : "launch_indeterminate",
      "Transport did not prove admission; reservation and receipt retained. No automatic retry.",
      observed,
    );
  return {
    ok: true,
    phase: VISIBLE_LAUNCH_PHASE,
    admission: "transport_admitted",
    receipt: written.receipt,
    receiptPath: written.receiptPath,
    runId,
    launchMode: written.receipt.transport.launchMode,
  };
}
