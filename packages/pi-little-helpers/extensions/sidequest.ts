import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const DEFAULT_PI_BIN = process.env.PI_SIDEQUEST_PI_BIN || "pi";
const GHOSTTY_PROBE_TIMEOUT_MS = 4000;
const TITLE_MAX_LEN = 48;
const LOCAL_GHOSTTY_WRAPPER = join(homedir(), ".local", "bin", "ghostty-sidequest");
const LOCAL_GHOSTTY_BIN = join(homedir(), ".local", "opt", "ghostty-sidequest", "bin", "ghostty");

type LaunchMode = "tab" | "window";

type ModelLike = {
  provider: string;
  id: string;
};

function getGhosttySurfaceId(): string | undefined {
  const value = process.env.GHOSTTY_SURFACE_ID?.trim();
  if (!value) return undefined;
  return /^\d+$/.test(value) || /^0x[0-9a-f]+$/i.test(value) ? value : undefined;
}

function getPrompt(args?: string): string | undefined {
  const prompt = args?.trim();
  return prompt ? prompt : undefined;
}

function summarizePrompt(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (singleLine.length <= TITLE_MAX_LEN) return singleLine;
  return `${singleLine.slice(0, TITLE_MAX_LEN - 1)}…`;
}

function buildTitle(prompt: string): string {
  return `Sidequest: ${summarizePrompt(prompt)}`;
}

function buildModelArgs(model: ModelLike | undefined, thinkingLevel: string): string[] {
  if (!model?.provider || !model.id) return [];

  const args = ["--model", `${model.provider}/${model.id}`];
  if (thinkingLevel) {
    args.push("--thinking", thinkingLevel);
  }
  return args;
}

function buildPiShellCommand(): string {
  return [
    'cmd="$1"',
    "shift",
    '"$cmd" "$@"',
    "status=$?",
    'if [ "$status" -ne 0 ]; then echo; echo "[sidequest] pi exited with status $status"; echo "[sidequest] leaving an interactive shell open for debugging"; exec "$' +
      '{SHELL:-/bin/bash}" -i; fi',
  ].join("; ");
}

function resolveGhosttyBin(): string {
  if (process.env.PI_SIDEQUEST_GHOSTTY_BIN) {
    return process.env.PI_SIDEQUEST_GHOSTTY_BIN;
  }
  if (existsSync(LOCAL_GHOSTTY_BIN)) {
    return LOCAL_GHOSTTY_BIN;
  }
  if (existsSync(LOCAL_GHOSTTY_WRAPPER)) {
    return LOCAL_GHOSTTY_WRAPPER;
  }
  return "ghostty";
}

async function supportsGhosttyNewTab(pi: ExtensionAPI, ghosttyBin: string): Promise<boolean> {
  try {
    const result = await pi.exec(ghosttyBin, ["+help"], {
      timeout: GHOSTTY_PROBE_TIMEOUT_MS,
    });
    return result.code === 0 && result.stdout.includes("+new-tab");
  } catch {
    return false;
  }
}

async function spawnDetached(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    try {
      const child = spawn(command, args, {
        cwd,
        detached: true,
        stdio: "ignore",
      });

      let settled = false;
      const settle =
        <T>(callback: (value: T) => void) =>
        (value: T) => {
          if (settled) return;
          settled = true;
          callback(value);
        };

      child.once(
        "error",
        settle((error: unknown) => {
          rejectPromise(error instanceof Error ? error : new Error(String(error)));
        }),
      );
      child.once(
        "spawn",
        settle(() => {
          child.unref();
          resolvePromise();
        }),
      );
    } catch (error) {
      rejectPromise(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export default function sidequestExtension(pi: ExtensionAPI) {
  pi.registerCommand("sidequest", {
    description: "Fork the current Pi session into a new Ghostty tab/window with a new prompt",
    handler: async (args, ctx) => {
      const prompt = getPrompt(args);
      if (!prompt) {
        if (ctx.hasUI) {
          ctx.ui.notify('Usage: /sidequest "what you want to explore"', "warning");
        }
        return;
      }

      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "sidequest needs a saved Pi session. Current session looks ephemeral/no-session.",
            "error",
          );
        }
        return;
      }

      const ghosttyBin = resolveGhosttyBin();
      const piBin = DEFAULT_PI_BIN;
      const thinkingLevel = pi.getThinkingLevel();
      const modelArgs = buildModelArgs(ctx.model as ModelLike | undefined, thinkingLevel);
      const title = buildTitle(prompt);

      const launchMode: LaunchMode =
        process.platform === "linux" && (await supportsGhosttyNewTab(pi, ghosttyBin))
          ? "tab"
          : "window";

      const piArgs = [piBin, "--fork", sessionFile, ...modelArgs, prompt];
      const ghosttyArgs = [launchMode === "tab" ? "+new-tab" : "+new-window"];
      const surfaceId = launchMode === "tab" ? getGhosttySurfaceId() : undefined;
      if (surfaceId) {
        ghosttyArgs.push(`--surface-id=${surfaceId}`);
      }
      ghosttyArgs.push(
        `--working-directory=${ctx.cwd}`,
        `--title=${title}`,
        "-e",
        "/bin/sh",
        "-lc",
        buildPiShellCommand(),
        "sidequest-pi",
        ...piArgs,
      );

      try {
        await spawnDetached(ghosttyBin, ghosttyArgs, ctx.cwd);
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Opened sidequest in Ghostty ${launchMode}: ${summarizePrompt(prompt)}`,
            "success",
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (ctx.hasUI) {
          ctx.ui.notify(`sidequest failed to launch Ghostty: ${message}`, "error");
        }
      }
    },
  });
}
