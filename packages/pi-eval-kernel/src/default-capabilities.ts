import { spawn } from "node:child_process";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { abortError } from "./capability-registry.ts";
import type { CodeModeCapability } from "./types.ts";

const DEFAULT_READ_BYTES = 200_000;
const MAX_READ_BYTES = 1_000_000;
const DEFAULT_PROCESS_BYTES = 1_000_000;
const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;
const MAX_PROCESS_TIMEOUT_MS = 120_000;

export function createDefaultCapabilities(): CodeModeCapability[] {
  return [
    createReadTextCapability(),
    createListDirectoryCapability(),
    createRunProcessCapability(),
  ];
}

export function createReadTextCapability(): CodeModeCapability {
  return {
    name: "read_text",
    description:
      "Read a UTF-8 file inside the eval working directory with optional one-indexed offset and line limit.",
    effect: "read",
    async execute(input, context) {
      const params = asRecord(input, "read_text input");
      const requestedPath = requiredString(params.path, "read_text.path");
      const offset = optionalPositiveInteger(params.offset, "read_text.offset") ?? 1;
      const limit = optionalPositiveInteger(params.limit, "read_text.limit");
      const maxBytes = Math.min(
        optionalPositiveInteger(params.maxBytes, "read_text.maxBytes") ?? DEFAULT_READ_BYTES,
        MAX_READ_BYTES,
      );
      const resolved = await resolveExistingWithinCwd(context.cwd, requestedPath);
      const metadata = await stat(resolved);
      if (!metadata.isFile()) throw new Error(`read_text path is not a file: ${requestedPath}`);
      if (metadata.size > maxBytes) {
        throw new Error(`read_text file exceeds maxBytes (${metadata.size} > ${maxBytes}).`);
      }
      const text = await readFile(resolved, "utf8");
      const lines = text.split("\n");
      const selected = lines.slice(offset - 1, limit ? offset - 1 + limit : undefined);
      return {
        path: requestedPath,
        offset,
        lines: selected.length,
        totalLines: lines.length,
        text: selected.join("\n"),
      };
    },
  };
}

export function createListDirectoryCapability(): CodeModeCapability {
  return {
    name: "list_directory",
    description: "List direct children of a directory inside the eval working directory.",
    effect: "read",
    async execute(input, context) {
      const params = asRecord(input ?? {}, "list_directory input");
      const requestedPath = optionalString(params.path, "list_directory.path") ?? ".";
      const resolved = await resolveExistingWithinCwd(context.cwd, requestedPath);
      const metadata = await stat(resolved);
      if (!metadata.isDirectory()) {
        throw new Error(`list_directory path is not a directory: ${requestedPath}`);
      }
      const entries = await readdir(resolved, { withFileTypes: true });
      return entries
        .map((entry) => ({
          name: entry.name,
          kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
  };
}

export function createRunProcessCapability(): CodeModeCapability {
  return {
    name: "run_process",
    description:
      "Run one executable without a shell in the eval working directory. Arguments must be supplied separately.",
    effect: "process",
    async execute(input, context) {
      const params = asRecord(input, "run_process input");
      const command = requiredString(params.command, "run_process.command");
      const args = optionalStringArray(params.args, "run_process.args") ?? [];
      const requestedCwd = optionalString(params.cwd, "run_process.cwd") ?? ".";
      const cwd = await resolveExistingWithinCwd(context.cwd, requestedCwd);
      const timeoutMs = Math.min(
        optionalPositiveInteger(params.timeoutMs, "run_process.timeoutMs") ??
          DEFAULT_PROCESS_TIMEOUT_MS,
        MAX_PROCESS_TIMEOUT_MS,
      );
      return runProcess({ command, args, cwd, timeoutMs, signal: context.signal });
    },
  };
}

async function resolveExistingWithinCwd(cwd: string, requestedPath: string): Promise<string> {
  const root = await realpath(cwd);
  const candidate = await realpath(path.resolve(root, requestedPath));
  const relative = path.relative(root, candidate);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return candidate;
  }
  throw new Error(`Path escapes the eval working directory: ${requestedPath}`);
}

async function runProcess(options: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  if (options.signal?.aborted) throw abortError();

  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: process.env,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let forceTimer: NodeJS.Timeout | undefined;

    const collect = (target: Buffer[], chunk: Buffer, currentBytes: number): number => {
      const remaining = DEFAULT_PROCESS_BYTES - currentBytes;
      if (remaining > 0) target.push(chunk.subarray(0, remaining));
      return currentBytes + chunk.length;
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes = collect(stdout, chunk, stdoutBytes);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes = collect(stderr, chunk, stderrBytes);
    });

    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const terminate = () => {
      killProcessTree(child.pid, "SIGTERM", () => child.kill("SIGTERM"));
      forceTimer = setTimeout(
        () => killProcessTree(child.pid, "SIGKILL", () => child.kill("SIGKILL")),
        750,
      );
    };
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      if (forceTimer && !aborted && !timedOut) clearTimeout(forceTimer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", finishError);
    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (aborted) {
        reject(abortError());
        return;
      }
      resolve({
        command: options.command,
        args: options.args,
        exitCode,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdoutTruncated: stdoutBytes > DEFAULT_PROCESS_BYTES,
        stderrTruncated: stderrBytes > DEFAULT_PROCESS_BYTES,
      });
    });
  });
}

function killProcessTree(
  pid: number | undefined,
  signal: NodeJS.Signals,
  fallback: () => void,
): void {
  if (process.platform === "win32" || !pid) {
    fallback();
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    fallback();
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a string.`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value as string[];
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value as number;
}
