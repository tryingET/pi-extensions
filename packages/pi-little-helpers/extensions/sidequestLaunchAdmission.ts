// summary: validates visible-launch inputs and gates the last dispatch boundary without relabeling attempted effects.
// read_when:
//   - changing pre-dispatch refusals, final owner authorization, lease deadlines, or launch result privacy.
import {
  prefixPiArgsWithCompanyContext,
  resolveChildCompanyContext,
} from "../src/companyContextProvenance.ts";
import type { LaunchMode, LaunchResult } from "./sidequestGhostty.ts";
import {
  buildModelArgs,
  buildTitle,
  type ModelLike,
  summarizeLaunchFailure,
} from "./sidequestLaunchResult.ts";

export type BeforeDispatch = () => Promise<boolean>;
export interface LaunchDispatchGuard {
  beforeDispatch?: BeforeDispatch;
  /** Original admitted lease deadline, checked synchronously after the final awaited guard. */
  dispatchDeadlineMs?: number;
  signal?: AbortSignal;
}
export type LaunchContext = {
  launchMode: LaunchMode;
  sessionMode: "fork" | "clean";
  cwd: string;
  sourceSessionFile?: string;
  titleBase: string;
  promptSummary: string;
  launchNote?: string;
};
export type SidequestLaunchOutcome = LaunchContext & (
  | { ok: true; effectDisposition: "settled" }
  | { ok: false; failure: string; effectDisposition: LaunchResult["effectDisposition"] }
);

class LaunchValidationError extends Error {
  constructor() {
    super("Visible launch request rejected before dispatch");
  }
}

/** Public assertion remains throwing. Internal expected failures become returned refusals. */
export function assertBoundedLaunchArgv(argv: readonly string[]): void {
  if (
    !Array.isArray(argv) ||
    argv.length > 1024 ||
    argv.some((arg) =>
      typeof arg !== "string" ||
      arg.includes("\0") ||
      Buffer.from(arg, "utf8").toString("utf8") !== arg ||
      Buffer.byteLength(arg, "utf8") >= 131_071,
    ) ||
    argv.reduce((bytes, arg) => bytes + Buffer.byteLength(arg, "utf8") + 1, 0) > 256 * 1024
  ) {
    throw new LaunchValidationError();
  }
}

export function validLaunchArgv(argv: readonly string[]): boolean {
  try {
    assertBoundedLaunchArgv(argv);
    return true;
  } catch (error) {
    if (error instanceof LaunchValidationError) return false;
    throw error;
  }
}

function assertGuardShape(guard: LaunchDispatchGuard): void {
  if (guard.beforeDispatch === undefined && guard.dispatchDeadlineMs === undefined) return;
  if (typeof guard.beforeDispatch !== "function" || !Number.isFinite(guard.dispatchDeadlineMs)) {
    throw new LaunchValidationError();
  }
}

/** Also used in the detached launcher's buildArgs, before its synchronous spawn call. */
export function assertDispatchWindow(guard: LaunchDispatchGuard): void {
  assertGuardShape(guard);
  if (
    guard.signal?.aborted ||
    (guard.dispatchDeadlineMs !== undefined && Date.now() >= guard.dispatchDeadlineMs)
  ) {
    throw new LaunchValidationError();
  }
}

export function invalidLaunchOutcome(fork: boolean): SidequestLaunchOutcome {
  // No rejected argv, cwd, provenance or prompt bytes are echoed into caller diagnostics.
  return {
    ok: false,
    effectDisposition: "confirmed_no_effects",
    failure: "Visible launch request rejected before dispatch",
    launchMode: "tab",
    sessionMode: fork ? "fork" : "clean",
    cwd: "",
    titleBase: "",
    promptSummary: "",
    launchNote: "No session/tab/window dispatch attempted; prior caller bookkeeping is retained.",
  };
}

export function prepareLaunchArguments(input: LaunchDispatchGuard & {
  env: NodeJS.ProcessEnv;
  parentCwd?: string;
  model?: ModelLike;
  thinkingLevel: string;
  defaultPiBin: string;
  prompt: string;
  titlePrompt: string;
  titlePrefix: string;
  cwd: string;
  sourceSessionFile?: string;
  command?: { command: string; args: string[] };
  modelArgs?: string[];
  extraPiArgs?: string[];
  childProvenanceEnv?: Record<string, string>;
}): { ok: true; title: string; piArgs: string[] } | { ok: false } {
  try {
    assertGuardShape(input);
    assertBoundedLaunchArgv(input.modelArgs ?? []);
    assertBoundedLaunchArgv(input.extraPiArgs ?? []);
    if (input.command) assertBoundedLaunchArgv(input.command.args);
    const provenance = Object.entries(input.childProvenanceEnv ?? {});
    if (provenance.some(([key, value]) =>
      !/^PI_PROVENANCE_[A-Z0-9_]+$/u.test(key) || typeof value !== "string",
    )) {
      throw new LaunchValidationError();
    }
    assertBoundedLaunchArgv([
      input.defaultPiBin, input.prompt, input.titlePrompt, input.titlePrefix, input.cwd,
      ...(input.sourceSessionFile === undefined ? [] : [input.sourceSessionFile]),
      ...(input.modelArgs ?? []), ...(input.extraPiArgs ?? []),
      ...provenance.map(([key, value]) => `${key}=${value}`),
      ...(input.command ? [input.command.command, ...input.command.args] : []),
    ]);
    const piBin = input.env.PI_SIDEQUEST_PI_BIN?.trim() || input.defaultPiBin;
    const modelArgs = input.modelArgs ?? buildModelArgs(input.model, input.thinkingLevel);
    const extraArgs = input.sourceSessionFile || input.command ? [] : (input.extraPiArgs ?? []);
    const raw = input.command
      ? [input.command.command, ...input.command.args]
      : input.sourceSessionFile
        ? [piBin, "--fork", input.sourceSessionFile, ...modelArgs, input.prompt]
        : [piBin, ...modelArgs, ...extraArgs, input.prompt];
    const company = input.command ? undefined : resolveChildCompanyContext({
      env: input.env,
      targetCwd: input.cwd,
      parentCwd: input.parentCwd,
    });
    const companyArgs = company && company.source !== "target_cwd"
      ? prefixPiArgsWithCompanyContext(raw, company) : raw;
    const piArgs = provenance.length
      ? ["env", ...provenance.map(([key, value]) => `${key}=${value}`), ...companyArgs]
      : companyArgs;
    assertBoundedLaunchArgv(piArgs);
    return { ok: true, piArgs, title: buildTitle(input.titlePrompt, input.titlePrefix) };
  } catch (error) {
    if (error instanceof LaunchValidationError) return { ok: false };
    throw error; // Not a blanket claim of no effects for arbitrary exceptions.
  }
}

function refused(): LaunchResult {
  return {
    ok: false,
    effectDisposition: "confirmed_no_effects",
    code: -1,
    stdout: "",
    stderr: "Visible launch request rejected before dispatch",
    killed: false,
  };
}
function indeterminate(): LaunchResult {
  return {
    ok: false,
    effectDisposition: "effect_indeterminate",
    code: -1,
    stdout: "",
    stderr: "Visible launch did not settle; supervise before retry",
    killed: false,
  };
}

/** Caller holds the FIFO slot through this final owner read. Never await after the deadline check. */
export async function runAdmittedLaunch(options: LaunchDispatchGuard & {
  argv: readonly string[];
  invoke: () => Promise<LaunchResult>;
  onInvoked?: () => void;
}): Promise<LaunchResult> {
  try {
    assertBoundedLaunchArgv(options.argv);
    assertDispatchWindow(options);
  } catch (error) {
    if (error instanceof LaunchValidationError) return refused();
    throw error;
  }
  try {
    if (options.beforeDispatch && (await options.beforeDispatch()) !== true) return refused();
  } catch {
    // Guard is a trusted read-only admission check, not a session transport invocation.
    return refused();
  }
  try {
    assertBoundedLaunchArgv(options.argv);
    assertDispatchWindow(options);
  } catch (error) {
    if (error instanceof LaunchValidationError) return refused();
    throw error;
  }
  let pending: Promise<LaunchResult>;
  try {
    try {
      pending = options.invoke();
    } finally {
      // Invocation (including a synchronous throw) owns the stagger timestamp, not guard refusal.
      options.onInvoked?.();
    }
    return await pending;
  } catch {
    // Nothing thrown after invoke starts can be newly labelled confirmed_no_effects here.
    return indeterminate();
  }
}

export function settleLaunchOutcome(
  result: LaunchResult,
  context: LaunchContext,
  redact: boolean,
): SidequestLaunchOutcome {
  if (result.ok) return { ...context, ok: true, effectDisposition: "settled" };
  return {
    ...context,
    ok: false,
    effectDisposition: result.effectDisposition,
    failure: redact
      ? "Visible launch did not settle; supervise before retry"
      : summarizeLaunchFailure(result),
  };
}
