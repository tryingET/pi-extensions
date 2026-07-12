// ---
// summary: "Reads AK strategy, wave, route, task-close, and closeout state and formats a read-only readiness report."
// read_when:
//   - "Changing runtime-status AK close-frame queries, readiness interpretation, blockers, or displayed guidance."
// ---

import { type RunAkCommandParams, resolveAkPath, runAkCommandAsync } from "./ak.ts";

export type AkCloseFrameStatusAvailability = "available" | "unavailable";

export interface AkCloseFrameActiveTaskSummary {
  status?: string;
  taskId?: number | null;
  title?: string | null;
}

export interface AkCloseFrameStatusSnapshot {
  status: AkCloseFrameStatusAvailability;
  repo: string;
  strategicFrame?: string;
  implementationWave?: string;
  mode?: "frame_with_wave" | "frame_without_active_wave";
  nonExecutionWaves: string[];
  routePosture?: string;
  genericProceedRule?: string;
  genericProceedAllowed?: boolean;
  routePolicyStatus?: string;
  routePolicyStateMachine?: string;
  routePolicyRecommendedAction?: string;
  activeTask?: AkCloseFrameActiveTaskSummary;
  activeTaskCloseCheckReady?: boolean;
  activeTaskCloseCheckWarnings: string[];
  closeoutReady?: boolean;
  closeoutReadinessState?: string;
  readyForOperatorGate?: boolean;
  closeFrameApplySupported?: boolean;
  closeFrameBlockers: string[];
  closeoutBlockers: string[];
  nonActions: string[];
  nonAuthorizations: string[];
  safeReadCommands: string[];
  errors: string[];
}

export interface ReadAkCloseFrameStatusParams {
  cwd: string;
  societyDb: string;
  akPath?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  runAk?: (params: RunAkCommandParams) => Promise<{
    ok: boolean;
    stdout: string;
    stderr: string;
    aborted?: boolean;
    timedOut?: boolean;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === "string" && entry.trim() ? [entry] : []))
    : [];
}

function parseJsonObject(
  text: string,
  label: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) {
      return { ok: false, error: `${label} did not return a JSON object` };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `${label} JSON parse failed: ${message}` };
  }
}

function nodesFromList(payload: Record<string, unknown>) {
  return Array.isArray(payload.nodes) ? payload.nodes.filter(isRecord) : [];
}

function nodeKey(node: Record<string, unknown>) {
  return asString(node.key);
}

function nodeState(node: Record<string, unknown>) {
  return asString(node.state) || asString(node.state_detail);
}

function findSingleActiveStrategy(payload: Record<string, unknown>) {
  const active = nodesFromList(payload).filter((node) => nodeState(node) === "active");
  return active.length === 1 ? nodeKey(active[0]) : undefined;
}

function findSingleActiveWave(payload: Record<string, unknown>, strategicFrame: string) {
  const active = nodesFromList(payload).filter(
    (node) => nodeState(node) === "active" && asString(node.parent_key) === strategicFrame,
  );
  return active.length === 1 ? nodeKey(active[0]) : undefined;
}

function nonExecutionWavesUnderFrame(payload: Record<string, unknown>, strategicFrame: string) {
  return nodesFromList(payload).flatMap((node) => {
    if (asString(node.parent_key) !== strategicFrame || nodeState(node) === "active") return [];
    const key = nodeKey(node);
    if (!key) return [];
    const state = asString(node.state);
    const detail = asString(node.state_detail);
    return [`${key}${state ? `:${state}` : ""}${detail && detail !== state ? `/${detail}` : ""}`];
  });
}

async function runJsonRead(
  params: ReadAkCloseFrameStatusParams,
  args: string[],
  label: string,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const runAk = params.runAk || runAkCommandAsync;
  const result = await runAk({
    akPath: params.akPath || resolveAkPath({ cwd: params.cwd }),
    societyDb: params.societyDb,
    args,
    cwd: params.cwd,
    signal: params.signal,
    timeoutMs: params.timeoutMs,
  });

  if (!result.ok) {
    const suffix = result.timedOut ? " (timed out)" : result.aborted ? " (aborted)" : "";
    return {
      ok: false,
      error: `${label} failed${suffix}: ${(result.stderr || result.stdout || "unknown error").trim().slice(0, 240)}`,
    };
  }

  return parseJsonObject(result.stdout, label);
}

function activeTaskFromOpenFrame(
  payload: Record<string, unknown>,
): AkCloseFrameActiveTaskSummary | undefined {
  const task = payload.active_execution_task;
  if (!isRecord(task)) return undefined;
  return {
    status: asString(task.status),
    taskId: asNumber(task.task_id) ?? null,
    title: asString(task.title) ?? null,
  };
}

function closeCheckWarningSummary(payload: Record<string, unknown>) {
  const warnings = stringArray(payload.warnings);
  const missingOutcomes = stringArray(payload.missing_outcomes);
  const missingValidation = stringArray(payload.missing_validation);
  const missingEvidence = stringArray(payload.missing_evidence_classes);
  const summary = [
    ...warnings,
    ...missingOutcomes.map((entry) => `missing outcome: ${entry}`),
    ...missingValidation.map((entry) => `missing validation: ${entry}`),
    ...missingEvidence.map((entry) => `missing evidence: ${entry}`),
  ];
  return summary.length > 0
    ? summary
    : ["close-check false; inspect AK close-check before consuming task as a completed gate"];
}

async function readActiveTaskCloseCheck(
  params: ReadAkCloseFrameStatusParams,
  taskId: number | null | undefined,
): Promise<{ ready?: boolean; warnings: string[] }> {
  if (!taskId) return { warnings: [] };
  const closeCheck = await runJsonRead(
    params,
    ["task", "close-check", String(taskId), "-F", "json"],
    "ak task close-check",
  );
  if (!closeCheck.ok) return { warnings: [closeCheck.error] };
  const ready = asBoolean(closeCheck.value.ready_to_close);
  return {
    ready,
    warnings: ready === false ? closeCheckWarningSummary(closeCheck.value) : [],
  };
}

function routeGuidanceFromOpenFrame(payload: Record<string, unknown>) {
  return isRecord(payload.route_guidance) ? payload.route_guidance : undefined;
}

function routePolicyFromOpenFrame(payload: Record<string, unknown>) {
  return isRecord(payload.route_selection_policy) ? payload.route_selection_policy : undefined;
}

function routePostureFromOpenFrame(payload: Record<string, unknown>) {
  return asString(routeGuidanceFromOpenFrame(payload)?.posture);
}

function genericProceedRuleFromOpenFrame(payload: Record<string, unknown>) {
  return asString(routeGuidanceFromOpenFrame(payload)?.generic_proceed_rule);
}

function genericProceedAllowedFromOpenFrame(payload: Record<string, unknown>) {
  const routeWait = isRecord(payload.route_wait_context) ? payload.route_wait_context : undefined;
  return asBoolean(routeWait?.generic_proceed_allowed);
}

function closeoutReadyFromOpenFrame(payload: Record<string, unknown>) {
  const closeout = isRecord(payload.closeout_status) ? payload.closeout_status : undefined;
  return {
    closeoutReady: asBoolean(closeout?.closeout_ready),
    closeoutReadinessState: asString(closeout?.readiness_state),
    readyForOperatorGate: asBoolean(closeout?.ready_for_operator_gate),
    closeoutBlockers: Array.isArray(closeout?.blockers)
      ? closeout.blockers.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          const domain = asString(entry.domain);
          const reason = asString(entry.reason);
          return domain ? [`${domain}${reason ? ` (${reason})` : ""}`] : [];
        })
      : [],
  };
}

function formatBool(value: boolean | undefined) {
  return value === undefined ? "unknown" : value ? "true" : "false";
}

function formatList(value: string[]) {
  return value.length > 0 ? value.join(", ") : "none";
}

export async function readAkCloseFrameStatus(
  params: ReadAkCloseFrameStatusParams,
): Promise<AkCloseFrameStatusSnapshot> {
  const base: AkCloseFrameStatusSnapshot = {
    status: "unavailable",
    repo: params.cwd,
    mode: undefined,
    nonExecutionWaves: [],
    activeTaskCloseCheckWarnings: [],
    closeFrameBlockers: [],
    closeoutBlockers: [],
    nonActions: [],
    nonAuthorizations: [],
    safeReadCommands: [],
    errors: [],
  };

  const strategies = await runJsonRead(
    params,
    ["strategy", "list", "--repo", params.cwd, "-F", "json"],
    "ak strategy list",
  );
  if (!strategies.ok) return { ...base, errors: [strategies.error] };

  const strategicFrame = findSingleActiveStrategy(strategies.value);
  if (!strategicFrame) {
    return { ...base, errors: ["expected exactly one active strategic frame"] };
  }

  const waves = await runJsonRead(
    params,
    ["wave", "list", "--repo", params.cwd, "-F", "json"],
    "ak wave list",
  );
  if (!waves.ok) return { ...base, strategicFrame, errors: [waves.error] };

  const implementationWave = findSingleActiveWave(waves.value, strategicFrame);
  const nonExecutionWaves = nonExecutionWavesUnderFrame(waves.value, strategicFrame);
  const openFrameArgs = [
    "strategy",
    "open-frame-status",
    "--repo",
    params.cwd,
    strategicFrame,
    ...(implementationWave ? ["--implementation-wave", implementationWave] : []),
    "-F",
    "json",
  ];

  const openFrame = await runJsonRead(params, openFrameArgs, "ak strategy open-frame-status");
  if (!openFrame.ok) {
    return {
      ...base,
      strategicFrame,
      implementationWave,
      nonExecutionWaves,
      errors: [openFrame.error],
    };
  }

  const closeFrame = implementationWave
    ? await runJsonRead(
        params,
        [
          "strategy",
          "close-frame",
          "--repo",
          params.cwd,
          strategicFrame,
          "--implementation-wave",
          implementationWave,
          "--plan",
          "-F",
          "json",
        ],
        "ak strategy close-frame --plan",
      )
    : undefined;
  if (closeFrame && !closeFrame.ok) {
    return {
      ...base,
      strategicFrame,
      implementationWave,
      nonExecutionWaves,
      errors: [closeFrame.error],
    };
  }

  const closeout = closeoutReadyFromOpenFrame(openFrame.value);
  const routeGuidance = routeGuidanceFromOpenFrame(openFrame.value);
  const routePolicy = routePolicyFromOpenFrame(openFrame.value);
  const activeTask = activeTaskFromOpenFrame(openFrame.value);
  const activeTaskCloseCheck = await readActiveTaskCloseCheck(params, activeTask?.taskId);
  const noWaveNonActions = implementationWave
    ? []
    : [
        "no_implementation_wave_creation_from_runtime_status",
        "no_reserved_placeholder_activation_from_runtime_status",
      ];

  return {
    status: "available",
    repo: params.cwd,
    strategicFrame,
    implementationWave,
    mode: implementationWave ? "frame_with_wave" : "frame_without_active_wave",
    nonExecutionWaves,
    routePosture: routePostureFromOpenFrame(openFrame.value),
    genericProceedRule: genericProceedRuleFromOpenFrame(openFrame.value),
    genericProceedAllowed: genericProceedAllowedFromOpenFrame(openFrame.value),
    routePolicyStatus: asString(routePolicy?.status),
    routePolicyStateMachine: asString(routePolicy?.state_machine),
    routePolicyRecommendedAction: asString(routePolicy?.recommended_action),
    activeTask,
    activeTaskCloseCheckReady: activeTaskCloseCheck.ready,
    activeTaskCloseCheckWarnings: activeTaskCloseCheck.warnings,
    closeoutReady: closeout.closeoutReady,
    closeoutReadinessState: closeout.closeoutReadinessState,
    readyForOperatorGate: closeout.readyForOperatorGate,
    closeFrameApplySupported: implementationWave
      ? asBoolean(closeFrame?.value.apply_supported)
      : false,
    closeFrameBlockers: implementationWave
      ? stringArray(closeFrame?.value.blockers)
      : [
          "no active implementation wave; frame is in DiscoveryOrExecution/default-discovery posture",
        ],
    closeoutBlockers: closeout.closeoutBlockers,
    nonActions: [...noWaveNonActions, ...stringArray(closeFrame?.value.non_actions)],
    nonAuthorizations: stringArray(routeGuidance?.non_authorizations),
    safeReadCommands: stringArray(routeGuidance?.safe_commands),
    errors: [],
  };
}

export function formatAkCloseFrameStatusSection(snapshot: AkCloseFrameStatusSnapshot): string {
  if (snapshot.status !== "available") {
    return [
      "## AK close-frame/readiness",
      "- status: unavailable",
      `- repo: \`${snapshot.repo}\``,
      ...snapshot.errors.map((error) => `- error: ${error}`),
      "- writes: none; this section is read-only",
    ].join("\n");
  }

  const task = snapshot.activeTask;
  const taskText = task?.taskId
    ? `#${task.taskId}${task.title ? ` — ${task.title}` : ""}`
    : task?.status || "none";
  const frameWaveText = snapshot.implementationWave
    ? `\`${snapshot.strategicFrame}\` / \`${snapshot.implementationWave}\``
    : `\`${snapshot.strategicFrame}\` / no active implementation wave (DiscoveryOrExecution/default-discovery)`;

  return [
    "## AK close-frame/readiness",
    "- status: available (read-only)",
    `- repo: \`${snapshot.repo}\``,
    `- frame/wave: ${frameWaveText}`,
    snapshot.nonExecutionWaves.length > 0
      ? `- non-execution waves/placeholders: ${snapshot.nonExecutionWaves.map((wave) => `\`${wave}\``).join(", ")}`
      : "- non-execution waves/placeholders: none reported",
    `- route posture: \`${snapshot.routePosture || "unknown"}\``,
    `- common proceed: \`${snapshot.genericProceedRule || "unknown"}\``,
    `- generic proceed allowed: ${formatBool(snapshot.genericProceedAllowed)}`,
    `- route-policy: \`${snapshot.routePolicyStatus || "unknown"}\`${snapshot.routePolicyStateMachine ? ` (${snapshot.routePolicyStateMachine})` : ""}`,
    snapshot.routePolicyRecommendedAction
      ? `- recommended action: ${snapshot.routePolicyRecommendedAction}`
      : "- recommended action: unknown",
    `- active task: ${taskText}`,
    `- active task close-check ready: ${formatBool(snapshot.activeTaskCloseCheckReady)}`,
    `- active task close-check warnings: ${formatList(snapshot.activeTaskCloseCheckWarnings)}`,
    `- closeout ready: ${formatBool(snapshot.closeoutReady)}`,
    `- readiness state: \`${snapshot.closeoutReadinessState || "unknown"}\``,
    `- ready for operator gate: ${formatBool(snapshot.readyForOperatorGate)}`,
    `- close-frame apply supported: ${formatBool(snapshot.closeFrameApplySupported)}`,
    `- close-frame blockers: ${formatList(snapshot.closeFrameBlockers)}`,
    `- closeout blockers: ${formatList(snapshot.closeoutBlockers)}`,
    `- non-authorized: ${formatList(snapshot.nonAuthorizations)}`,
    `- non-actions: ${formatList(snapshot.nonActions)}`,
    snapshot.safeReadCommands.length > 0
      ? `- safe read commands: ${snapshot.safeReadCommands.map((command) => `\`${command}\``).join(", ")}`
      : "- safe read commands: none reported",
    "- writes: none; Pi only displays AK readbacks in this slice",
  ].join("\n");
}
