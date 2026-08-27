// summary: normalizes Ghostty launch results and preserves visible-peer titles, failures, and operator-facing mode labels.
// read_when:
//   - changing launch result semantics, title summaries, model arguments, or fallback messages.

import {
  type ExecResult,
  type ExecRunner,
  isGhosttySession,
  type LaunchMode,
  type LaunchResult,
} from "./sidequestGhostty.ts";

const GHOSTTY_LAUNCH_TIMEOUT_MS = 15000;
const TITLE_MAX_LEN = 48;
type ModelLike = { provider: string; id: string };

export function summarizePrompt(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (singleLine.length <= TITLE_MAX_LEN) return singleLine;
  return `${singleLine.slice(0, TITLE_MAX_LEN - 1)}…`;
}

export function buildTitle(prompt: string, prefix = "Sidequest"): string {
  return `${prefix}: ${summarizePrompt(prompt)}`;
}

export function buildModelArgs(model: ModelLike | undefined, thinkingLevel: string): string[] {
  if (!model?.provider || !model.id) return [];

  const args = ["--model", `${model.provider}/${model.id}`];
  if (thinkingLevel) {
    args.push("--thinking", thinkingLevel);
  }
  return args;
}

function normalizeExecResult(result: ExecResult): LaunchResult {
  const killed = Boolean(result.killed);
  // An awaited launcher can dispatch the embedded command before exiting nonzero. Without the
  // detached-window handshake, every non-success result is indeterminate and must not be retried.
  const effectDisposition = !killed && result.code === 0 ? "settled" : "effect_indeterminate";
  return {
    ok: effectDisposition === "settled",
    effectDisposition,
    code: result.code,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    killed,
  };
}

export async function runGhosttyLaunch(
  execRunner: ExecRunner,
  ghosttyBin: string,
  ghosttyArgs: string[],
  cwd: string,
): Promise<LaunchResult> {
  try {
    const result = await execRunner(ghosttyBin, ghosttyArgs, {
      cwd,
      timeout: GHOSTTY_LAUNCH_TIMEOUT_MS,
    });
    return normalizeExecResult(result);
  } catch (error) {
    return {
      ok: false,
      effectDisposition: "effect_indeterminate",
      code: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      killed: false,
    };
  }
}

export function describeWindowFallback({
  supportsNewTab,
  env,
}: {
  supportsNewTab: boolean;
  env: NodeJS.ProcessEnv;
}): string | undefined {
  if (process.platform !== "linux") {
    return "same-window tab launch requires Linux Ghostty support";
  }
  if (!isGhosttySession(env)) {
    return "same-window tab launch only works from an active Ghostty session";
  }
  if (!supportsNewTab) {
    return "current Ghostty binary does not support +new-tab";
  }
  return undefined;
}

export function summarizeLaunchFailure(result: LaunchResult): string {
  const detail = result.stderr || result.stdout;
  const normalizedDetail = detail.replace(/\s+/g, " ").trim();
  if (result.effectDisposition === "effect_indeterminate") {
    const prefix = "Ghostty launch effect is indeterminate; do not retry automatically";
    const message = normalizedDetail ? `${prefix}: ${normalizedDetail}` : prefix;
    return message.length <= 180 ? message : `${message.slice(0, 179)}…`;
  }
  if (!normalizedDetail) {
    if (result.code >= 0) return `exit ${result.code}`;
    return "unknown launch failure";
  }

  if (normalizedDetail.length <= 180) return normalizedDetail;
  return `${normalizedDetail.slice(0, 179)}…`;
}

export function joinLaunchNotes(...notes: (string | undefined)[]): string | undefined {
  const normalized = notes
    .map((note) => note?.trim())
    .filter((note): note is string => Boolean(note));
  return normalized.length > 0 ? normalized.join("; ") : undefined;
}

export function formatLaunchModeLabel(launchMode: LaunchMode, launchNote?: string): string {
  if (launchMode === "window") return "new Ghostty window";
  if (launchNote?.includes("post-launch placement mismatch")) {
    return "different Ghostty window after current-tab request";
  }
  return "current Ghostty tab";
}
