// summary: generates one conversation-grounded handoff and transports it into a fresh clean Ghostty Pi session.
// read_when:
//   - changing /fresh-handoff, fresh_handoff_spawn, bounded Git/AK readback, or clean-session launch semantics.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  generateSessionCompactionHandoffPrompt,
  type SessionCompactionHandoffGenerationContext,
} from "@tryinget/pi-session-compaction/handoff-generation";
import type { PiToolContext } from "./sidequestContracts.ts";
import type { ExecRunner } from "./sidequestGhostty.ts";
import {
  launchPiQuestSession,
  type SidequestLaunchOptions,
  type SidequestLaunchOutcome,
} from "./sidequestLaunch.ts";
import { formatLaunchModeLabel } from "./sidequestLaunchResult.ts";

const DEFAULT_HANDOFF_GOAL =
  "Continue the current session's unfinished operator-directed work from the verified next legal step.";
const HANDOFF_RUNTIME_READ_TIMEOUT_MS = 6000;
const HANDOFF_RUNTIME_READ_MAX_BYTES = 12 * 1024;

type PiCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

export type SidequestCommandHandlerOptions = SidequestLaunchOptions & {
  generateHandoffPrompt?: typeof generateSessionCompactionHandoffPrompt;
};

export type FreshHandoffOutcome =
  | {
      ok: true;
      goal: string;
      cwd: string;
      launch: Extract<SidequestLaunchOutcome, { ok: true }>;
    }
  | {
      ok: false;
      goal: string;
      cwd: string;
      error: "generation_failed" | "launch_failed";
      message: string;
      launch?: Extract<SidequestLaunchOutcome, { ok: false }>;
    };

export type FreshHandoffExecutor = (
  goal: string | undefined,
  ctx: PiCommandContext | PiToolContext,
  cwdOverride?: string,
  notifyOperator?: boolean,
) => Promise<FreshHandoffOutcome>;

function normalizedGoal(value?: string): string | undefined {
  const goal = value?.trim();
  return goal || undefined;
}

function boundRuntimeReadback(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= HANDOFF_RUNTIME_READ_MAX_BYTES) return value;
  return `${bytes.subarray(0, HANDOFF_RUNTIME_READ_MAX_BYTES).toString("utf8")}\n[truncated]`;
}

async function collectRuntimeContext({
  pi,
  options,
  cwd,
}: {
  pi: ExtensionAPI;
  options: SidequestCommandHandlerOptions;
  cwd: string;
}): Promise<string> {
  const execRunner: ExecRunner =
    options.exec ?? ((command, args, execOptions) => pi.exec(command, args, execOptions));
  const specs = [
    { label: "Git HEAD", command: "git", args: ["rev-parse", "HEAD"] },
    { label: "Git status", command: "git", args: ["status", "--short", "--branch"] },
    {
      label: "AK claimed tasks",
      command: "ak",
      args: ["task", "list", "--status", "claimed", "-F", "json"],
    },
    { label: "AK ready tasks", command: "ak", args: ["task", "ready", "-F", "json"] },
  ] as const;
  const results = await Promise.all(
    specs.map(async (spec) => {
      try {
        const result = await execRunner(spec.command, [...spec.args], {
          cwd,
          timeout: HANDOFF_RUNTIME_READ_TIMEOUT_MS,
        });
        if (result.code === 0 && !result.killed) {
          const output = String(result.stdout || "").trim() || "<empty>";
          return `${spec.label} (${spec.command} ${spec.args.join(" ")}):\n${boundRuntimeReadback(output)}`;
        }
        const detail = String(result.stderr || result.stdout || "no output")
          .replace(/\s+/g, " ")
          .trim();
        return `${spec.label}: unavailable (${result.killed ? "timed out" : `exit ${result.code}`}: ${detail.slice(0, 500)})`;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return `${spec.label}: unavailable (${detail.slice(0, 500)})`;
      }
    }),
  );
  return results.join("\n\n");
}

export function createFreshHandoffExecutor({
  pi,
  options,
  defaultPiBin,
}: {
  pi: ExtensionAPI;
  options: SidequestCommandHandlerOptions;
  defaultPiBin: string;
}): FreshHandoffExecutor {
  return async (rawGoal, ctx, cwdOverride, notifyOperator = true) => {
    const goal = normalizedGoal(rawGoal) ?? DEFAULT_HANDOFF_GOAL;
    const cwd = cwdOverride?.trim() || ctx.cwd || process.cwd();
    const commandContext = ctx as PiCommandContext;
    const notify = (message: string, type: "error" | "info") => {
      if (notifyOperator && commandContext.hasUI) commandContext.ui.notify(message, type);
    };
    const runtimeContext = await collectRuntimeContext({ pi, options, cwd });
    const generator = options.generateHandoffPrompt ?? generateSessionCompactionHandoffPrompt;
    let prompt: string;
    try {
      prompt = await generator({
        ctx: ctx as unknown as SessionCompactionHandoffGenerationContext,
        goal,
        runtimeContext,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = `fresh-handoff could not generate a handoff: ${detail}`;
      notify(message, "error");
      return { ok: false, goal, cwd, error: "generation_failed", message };
    }

    const launch = await launchPiQuestSession({
      pi,
      ctx,
      options,
      defaultPiBin,
      prompt,
      titlePrompt: goal,
      titlePrefix: "Fresh handoff",
      cwd,
    });
    if (!launch.ok) {
      const message = `fresh-handoff failed to launch Ghostty: ${launch.failure}`;
      notify(message, "error");
      return { ok: false, goal, cwd, error: "launch_failed", message, launch };
    }

    const modeLabel = formatLaunchModeLabel(launch.launchMode, launch.launchNote);
    const suffix = launch.launchNote ? ` (${launch.launchNote})` : "";
    notify(
      `Opened a clean Pi session in ${modeLabel} and auto-submitted one generated handoff${suffix}`,
      "info",
    );
    return { ok: true, goal, cwd, launch };
  };
}
