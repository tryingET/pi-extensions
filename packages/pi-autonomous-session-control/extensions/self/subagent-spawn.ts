import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { type SubagentState, writeSessionStatus } from "./subagent-session.ts";

export interface SubagentDef {
  name: string;
  objective: string;
  tools: string;
  systemPrompt?: string;
  sessionFile: string | null;
  timeout?: number; // milliseconds, 0 = no timeout
}

export interface SubagentResult {
  output: string;
  exitCode: number;
  elapsed: number;
  status: "done" | "error" | "timeout";
}

export type SubagentSpawner = (
  def: SubagentDef,
  model: string,
  ctx: { cwd: string },
  state: SubagentState,
) => Promise<SubagentResult>;

const DEFAULT_SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SUBAGENT_CLOSE_GRACE_MS = 250;

export function spawnSubagentWithSpawn(
  def: SubagentDef,
  model: string,
  ctx: { cwd: string },
  state: SubagentState,
  spawnImpl: typeof spawn = spawn,
): Promise<SubagentResult> {
  const startTime = Date.now();
  const timeout = def.timeout ?? DEFAULT_SUBAGENT_TIMEOUT_MS;

  const args = [
    "--mode",
    "json",
    "-p",
    "--no-extensions",
    "--model",
    model,
    "--tools",
    def.tools,
    "--thinking",
    "off",
    "--session",
    def.sessionFile || join(state.sessionsDir, `${def.name}.json`),
  ];

  if (def.systemPrompt) {
    args.push("--append-system-prompt", def.systemPrompt);
  }

  args.push(def.objective);

  const textChunks: string[] = [];
  const stderrChunks: string[] = [];

  return new Promise((resolve) => {
    const createdAt = new Date().toISOString();
    let proc: ChildProcessByStdio<null, Readable, Readable> | null = null;
    let buffer = "";
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let closeGraceHandle: ReturnType<typeof setTimeout> | null = null;
    let observedExitCode: number | null = null;

    const clearTimers = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (closeGraceHandle) {
        clearTimeout(closeGraceHandle);
        closeGraceHandle = null;
      }
    };

    const consumeBufferedJson = () => {
      if (!buffer.trim()) return;
      try {
        const event = JSON.parse(buffer);
        if (event.type === "message_update") {
          const delta = event.assistantMessageEvent;
          if (delta?.type === "text_delta") {
            textChunks.push(delta.delta || "");
          }
        }
      } catch {
        // Best-effort parsing only.
      }
      buffer = "";
    };

    const finalize = (result: SubagentResult) => {
      if (settled) return;
      settled = true;
      clearTimers();
      writeSessionStatus(state.sessionsDir, def.name, {
        status: result.status,
        pid: proc?.pid ?? process.pid,
        ppid: process.pid,
        createdAt,
        objective: def.objective,
        exitCode: result.exitCode,
        elapsed: result.elapsed,
      });
      state.activeCount = Math.max(0, state.activeCount - 1);
      state.completedCount++;
      resolve(result);
    };

    const finalizeFromExitCode = (exitCode: number | null) => {
      consumeBufferedJson();
      const stdoutOutput = textChunks.join("").trim();
      const stderrOutput = stderrChunks.join("").trim();
      const elapsed = Date.now() - startTime;
      const normalizedExitCode = exitCode ?? 1;
      const status = normalizedExitCode === 0 ? "done" : "error";
      const output =
        stdoutOutput.length > 0
          ? stdoutOutput
          : status === "error"
            ? stderrOutput || `Subagent exited with code ${normalizedExitCode} without output.`
            : "";

      finalize({
        output,
        exitCode: normalizedExitCode,
        elapsed,
        status,
      });
    };

    try {
      proc = spawnImpl("pi", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        cwd: ctx.cwd || process.cwd(),
      });
      writeSessionStatus(state.sessionsDir, def.name, {
        status: "running",
        pid: proc.pid ?? process.pid,
        ppid: process.pid,
        createdAt,
        objective: def.objective,
      });
      state.activeCount++;
    } catch (error) {
      finalize({
        output: `Error spawning subagent: ${error instanceof Error ? error.message : String(error)}`,
        exitCode: 1,
        elapsed: Date.now() - startTime,
        status: "error",
      });
      return;
    }

    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        proc?.kill("SIGTERM");
        finalize({
          output: `Subagent timed out after ${Math.round(timeout / 1000)}s`,
          exitCode: 124,
          elapsed: Date.now() - startTime,
          status: "timeout",
        });
      }, timeout);
      timeoutHandle.unref?.();
    }

    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "message_update") {
            const delta = event.assistantMessageEvent;
            if (delta?.type === "text_delta") {
              textChunks.push(delta.delta || "");
            }
          }
        } catch {
          // Best-effort parsing only.
        }
      }
    });

    proc.stderr?.setEncoding("utf-8");
    proc.stderr?.on("data", (chunk: string) => {
      stderrChunks.push(chunk);
      if (stderrChunks.length > 50) {
        stderrChunks.splice(0, stderrChunks.length - 50);
      }
    });

    proc.on("exit", (code) => {
      observedExitCode = code ?? 1;
      if (closeGraceHandle || settled) return;
      closeGraceHandle = setTimeout(() => {
        finalizeFromExitCode(observedExitCode);
      }, SUBAGENT_CLOSE_GRACE_MS);
      closeGraceHandle.unref?.();
    });

    proc.on("close", (code) => {
      observedExitCode = code ?? observedExitCode ?? 1;
      finalizeFromExitCode(observedExitCode);
    });

    proc.on("error", (err) => {
      finalize({
        output: `Error spawning subagent: ${err.message}`,
        exitCode: 1,
        elapsed: Date.now() - startTime,
        status: "error",
      });
    });
  });
}

export function spawnSubagent(
  def: SubagentDef,
  model: string,
  ctx: { cwd: string },
  state: SubagentState,
): Promise<SubagentResult> {
  return spawnSubagentWithSpawn(def, model, ctx, state, spawn);
}
