// summary: "starts direct Ghostty windows independently of controller lifetime and confirms command admission through a private handshake"
// read_when:
//   - "changing direct Ghostty window process lifetime, launch handshakes, or indeterminate launch classification"

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LaunchResult } from "./sidequestGhostty.ts";

const DEFAULT_STARTUP_TIMEOUT_MS = 4_000;
const HANDSHAKE_POLL_MS = 25;
const DIAGNOSTIC_TAIL_MAX_BYTES = 16 * 1024;

export type GhosttyWindowLaunchHandshake = {
  path: string;
  token: string;
};

export type DetachedGhosttyWindowLaunchRequest = {
  command: string;
  cwd: string;
  buildArgs: (handshake: GhosttyWindowLaunchHandshake) => string[];
  startupTimeoutMs?: number;
  scratchRoot?: string;
  spawnProcess?: typeof spawn;
};

function readDiagnosticTail(path: string): string {
  let fd: number | undefined;
  try {
    const size = statSync(path).size;
    const length = Math.min(size, DIAGNOSTIC_TAIL_MAX_BYTES);
    if (length <= 0) return "";
    const buffer = Buffer.alloc(length);
    fd = openSync(path, "r");
    const bytesRead = readSync(fd, buffer, 0, length, Math.max(0, size - length));
    return buffer.subarray(0, bytesRead).toString("utf8").trim();
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Best-effort diagnostic cleanup only.
      }
    }
  }
}

function handshakeMatches(handshake: GhosttyWindowLaunchHandshake): boolean {
  try {
    return readFileSync(handshake.path, "utf8") === `${handshake.token}\n`;
  } catch {
    return false;
  }
}

function launchResult(
  effectDisposition: LaunchResult["effectDisposition"],
  options: { code: number; stderr?: string; killed?: boolean },
): LaunchResult {
  return {
    ok: effectDisposition === "settled",
    effectDisposition,
    code: options.code,
    stdout: "",
    stderr: options.stderr ?? "",
    killed: options.killed ?? false,
  };
}

/**
 * Direct Ghostty windows may be the long-lived GUI process (not a short activation client).
 * Detach that process from Pi's command timeout, but do not call OS-level spawn acceptance success:
 * the terminal shell must first write an exact private token immediately before invoking Pi.
 */
export async function launchDetachedGhosttyWindow(
  request: DetachedGhosttyWindowLaunchRequest,
): Promise<LaunchResult> {
  const startupTimeoutMs = Math.max(1, request.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS);
  let scratch: string;
  try {
    scratch = mkdtempSync(join(request.scratchRoot ?? tmpdir(), "pi-ghostty-window-"));
  } catch (error) {
    return launchResult("confirmed_no_effects", {
      code: -1,
      stderr: error instanceof Error ? error.message : String(error),
    });
  }
  const handshake: GhosttyWindowLaunchHandshake = {
    path: join(scratch, "command-admitted"),
    token: randomBytes(24).toString("hex"),
  };
  const diagnosticPath = join(scratch, "ghostty.log");
  let diagnosticFd: number | undefined;
  let child: ChildProcess | undefined;

  try {
    diagnosticFd = openSync(diagnosticPath, "wx", 0o600);
    const spawnProcess = request.spawnProcess ?? spawn;
    const args = request.buildArgs(handshake);

    return await new Promise<LaunchResult>((resolveLaunch) => {
      let settled = false;
      let spawned = false;
      let exitCode: number | null | undefined;
      let exitSignal: NodeJS.Signals | null | undefined;
      let pollTimer: NodeJS.Timeout | undefined;
      let deadlineTimer: NodeJS.Timeout | undefined;

      const finish = (result: LaunchResult) => {
        if (settled) return;
        settled = true;
        if (pollTimer) clearTimeout(pollTimer);
        if (deadlineTimer) clearTimeout(deadlineTimer);
        resolveLaunch(result);
      };

      const inspect = () => {
        if (settled) return;
        if (handshakeMatches(handshake)) {
          finish(launchResult("settled", { code: 0 }));
          return;
        }
        if (exitSignal) {
          finish(
            launchResult("effect_indeterminate", {
              code: exitCode ?? -1,
              stderr:
                readDiagnosticTail(diagnosticPath) ||
                `Ghostty exited on signal ${exitSignal} before the launch handshake`,
            }),
          );
          return;
        }
        if (exitCode !== undefined && exitCode !== null && exitCode !== 0) {
          finish(
            launchResult("effect_indeterminate", {
              code: exitCode,
              stderr:
                readDiagnosticTail(diagnosticPath) ||
                `Ghostty exited ${exitCode} after spawn without a settled launch handshake`,
            }),
          );
          return;
        }
        pollTimer = setTimeout(inspect, HANDSHAKE_POLL_MS);
      };

      try {
        child = spawnProcess(request.command, args, {
          cwd: request.cwd,
          detached: true,
          stdio: ["ignore", diagnosticFd as number, diagnosticFd as number],
        });
      } catch (error) {
        finish(
          launchResult("confirmed_no_effects", {
            code: -1,
            stderr: error instanceof Error ? error.message : String(error),
          }),
        );
        return;
      } finally {
        if (diagnosticFd !== undefined) {
          try {
            closeSync(diagnosticFd);
          } catch {
            // The child owns its duplicate after spawn.
          }
          diagnosticFd = undefined;
        }
      }

      child.once("spawn", () => {
        spawned = true;
        child?.unref();
      });
      child.once("error", (error) => {
        if (!spawned) {
          finish(
            launchResult("confirmed_no_effects", {
              code: -1,
              stderr: error.message,
            }),
          );
          return;
        }
        finish(
          launchResult("effect_indeterminate", {
            code: -1,
            stderr: error.message,
          }),
        );
      });
      child.once("exit", (code, signal) => {
        exitCode = code;
        exitSignal = signal;
      });

      deadlineTimer = setTimeout(() => {
        if (handshakeMatches(handshake)) {
          finish(launchResult("settled", { code: 0 }));
          return;
        }
        finish(
          launchResult("effect_indeterminate", {
            code: exitCode ?? -1,
            stderr:
              readDiagnosticTail(diagnosticPath) ||
              `Ghostty command admission was not observed within ${startupTimeoutMs}ms`,
          }),
        );
      }, startupTimeoutMs);
      pollTimer = setTimeout(inspect, 0);
    });
  } catch (error) {
    return launchResult("confirmed_no_effects", {
      code: -1,
      stderr: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (diagnosticFd !== undefined) {
      try {
        closeSync(diagnosticFd);
      } catch {
        // Best-effort descriptor cleanup only.
      }
    }
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // Cleanup cannot rewrite a settled/indeterminate launch disposition. The private directory
      // remains owner-only, and indeterminate callers are already forbidden from retrying.
    }
  }
}
