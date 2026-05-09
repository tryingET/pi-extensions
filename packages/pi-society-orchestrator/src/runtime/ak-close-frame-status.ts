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
  routePosture?: string;
  genericProceedAllowed?: boolean;
  activeTask?: AkCloseFrameActiveTaskSummary;
  closeoutReady?: boolean;
  readyForOperatorGate?: boolean;
  closeFrameApplySupported?: boolean;
  closeFrameBlockers: string[];
  nonActions: string[];
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

function routePostureFromOpenFrame(payload: Record<string, unknown>) {
  const routeGuidance = isRecord(payload.route_guidance) ? payload.route_guidance : undefined;
  return asString(routeGuidance?.posture);
}

function genericProceedAllowedFromOpenFrame(payload: Record<string, unknown>) {
  const routeWait = isRecord(payload.route_wait_context) ? payload.route_wait_context : undefined;
  return asBoolean(routeWait?.generic_proceed_allowed);
}

function closeoutReadyFromOpenFrame(payload: Record<string, unknown>) {
  const closeout = isRecord(payload.closeout_status) ? payload.closeout_status : undefined;
  return {
    closeoutReady: asBoolean(closeout?.closeout_ready),
    readyForOperatorGate: asBoolean(closeout?.ready_for_operator_gate),
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
    closeFrameBlockers: [],
    nonActions: [],
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
  if (!implementationWave) {
    return {
      ...base,
      strategicFrame,
      errors: [`expected exactly one active implementation wave under ${strategicFrame}`],
    };
  }

  const openFrame = await runJsonRead(
    params,
    [
      "strategy",
      "open-frame-status",
      "--repo",
      params.cwd,
      strategicFrame,
      "--implementation-wave",
      implementationWave,
      "-F",
      "json",
    ],
    "ak strategy open-frame-status",
  );
  if (!openFrame.ok) {
    return { ...base, strategicFrame, implementationWave, errors: [openFrame.error] };
  }

  const closeFrame = await runJsonRead(
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
  );
  if (!closeFrame.ok) {
    return { ...base, strategicFrame, implementationWave, errors: [closeFrame.error] };
  }

  const closeout = closeoutReadyFromOpenFrame(openFrame.value);
  const routeGuidance = isRecord(openFrame.value.route_guidance)
    ? openFrame.value.route_guidance
    : undefined;

  return {
    status: "available",
    repo: params.cwd,
    strategicFrame,
    implementationWave,
    routePosture: routePostureFromOpenFrame(openFrame.value),
    genericProceedAllowed: genericProceedAllowedFromOpenFrame(openFrame.value),
    activeTask: activeTaskFromOpenFrame(openFrame.value),
    closeoutReady: closeout.closeoutReady,
    readyForOperatorGate: closeout.readyForOperatorGate,
    closeFrameApplySupported: asBoolean(closeFrame.value.apply_supported),
    closeFrameBlockers: stringArray(closeFrame.value.blockers),
    nonActions: stringArray(closeFrame.value.non_actions),
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

  return [
    "## AK close-frame/readiness",
    "- status: available (read-only)",
    `- repo: \`${snapshot.repo}\``,
    `- frame/wave: \`${snapshot.strategicFrame}\` / \`${snapshot.implementationWave}\``,
    `- route posture: \`${snapshot.routePosture || "unknown"}\``,
    `- generic proceed allowed: ${formatBool(snapshot.genericProceedAllowed)}`,
    `- active task: ${taskText}`,
    `- closeout ready: ${formatBool(snapshot.closeoutReady)}`,
    `- ready for operator gate: ${formatBool(snapshot.readyForOperatorGate)}`,
    `- close-frame apply supported: ${formatBool(snapshot.closeFrameApplySupported)}`,
    `- blockers: ${formatList(snapshot.closeFrameBlockers)}`,
    `- non-actions: ${formatList(snapshot.nonActions)}`,
    snapshot.safeReadCommands.length > 0
      ? `- safe read commands: ${snapshot.safeReadCommands.map((command) => `\`${command}\``).join(", ")}`
      : "- safe read commands: none reported",
    "- writes: none; Pi only displays AK readbacks in this slice",
  ].join("\n");
}
