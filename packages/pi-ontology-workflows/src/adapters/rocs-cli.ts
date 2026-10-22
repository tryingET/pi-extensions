// summary: "adapts ontology workflow operations to rocs cli processes and normalized results."
// read_when:
//   - "changing rocs runner discovery, command arguments, process errors, or json result mapping."

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ValidationFinding } from "../core/contracts.ts";
import { withInspectionOutput } from "./inspection-output.ts";
import { runInspectionProcess } from "./inspection-process.ts";

export type { RocsRunnerDescriptor } from "../semantic/runner.ts";
export {
  buildClosedRunnerEnv,
  buildDiscoveryArgv,
  createDevelopmentRocsRunnerDescriptor,
  createVerifiedDevelopmentRocsPort,
} from "../semantic/runner.ts";

import type {
  RocsBuildResult,
  RocsCommandContext,
  RocsPackResult,
  RocsPort,
  RocsSummaryResult,
  RocsValidateResult,
} from "../ports/rocs-port.ts";

const execFileAsync = promisify(execFile);
const DEFAULT_ROCS_PROJECT = path.join(homedir(), "ai-society", "core", "rocs-cli");
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type JsonObject = Record<string, unknown>;

interface Runner {
  command: string;
  baseArgs: string[];
}

export function createRocsCliPort(): RocsPort {
  return createPort();
}

function createPort(outputRoot?: string): RocsPort {
  return {
    withInspectionOutput(repoPath, operation) {
      return withInspectionOutput(repoPath, (root) => operation(createPort(root)));
    },
    async summary(repoPath: string, context: RocsCommandContext): Promise<RocsSummaryResult> {
      const payload = await runJsonCommand(
        ["summary", "--repo", repoPath, ...buildSharedArgs(context), "--json"],
        context,
        outputRoot,
      );
      const counts = asRecord(payload.counts);
      return {
        layers: Array.isArray(payload.layers)
          ? payload.layers.filter(isRecord).map((layer) => ({
              name: String(layer.name ?? ""),
              origin: String(layer.origin ?? ""),
              src_root: String(layer.src_root ?? ""),
              kind: String(layer.kind ?? ""),
              source: String(layer.source ?? ""),
            }))
          : [],
        counts: {
          concepts: Number(counts?.concepts ?? 0),
          relations: Number(counts?.relations ?? 0),
        },
      };
    },

    async validate(repoPath: string, context: RocsCommandContext): Promise<RocsValidateResult> {
      const payload = await runJsonCommand(
        ["validate", "--repo", repoPath, ...buildSharedArgs(context), "--json"],
        context,
        outputRoot,
      );
      return {
        ok: Boolean(payload.ok),
        findings: normalizeFindings(payload.findings),
      };
    },

    async build(repoPath: string, context: RocsCommandContext): Promise<RocsBuildResult> {
      const payload = await runJsonCommand(
        ["build", "--repo", repoPath, ...buildSharedArgs(context), "--json"],
        context,
        outputRoot,
      );
      if (payload.ok === false) {
        throw new Error(formatRocsFailure(payload));
      }

      const dist = asRecord(payload.dist);
      const files = asRecord(dist?.files);
      return {
        ok: true,
        transientRoot: outputRoot,
        dist: {
          dir: String(dist?.dir ?? ""),
          files: {
            resolve: asOptionalString(files?.resolve),
            summary: asOptionalString(files?.summary),
            id_index: asOptionalString(files?.id_index),
            authority_receipt: asOptionalString(files?.authority_receipt),
            authority_receipt_command: asOptionalString(files?.authority_receipt_command),
          },
        },
      };
    },

    async pack(
      repoPath: string,
      ontId: string,
      context: RocsCommandContext,
      options?: { depth?: number; maxDocs?: number },
    ): Promise<RocsPackResult> {
      const args = ["pack", ontId, "--repo", repoPath, ...buildSharedArgs(context)];
      if (typeof options?.depth === "number") args.push("--depth", String(options.depth));
      if (typeof options?.maxDocs === "number") args.push("--max-docs", String(options.maxDocs));
      const stdout = await runTextCommand(args, context, outputRoot);
      return { text: stdout.trim() };
    },
  };
}

function buildSharedArgs(context: RocsCommandContext): string[] {
  const args: string[] = [];
  if (context.resolveRefs) {
    args.push(
      "--resolve-refs",
      "--workspace-root",
      context.workspaceRoot,
      "--workspace-ref-mode",
      context.workspaceRefMode,
    );
  }
  return args;
}

async function runJsonCommand(
  args: string[],
  context: RocsCommandContext,
  outputRoot?: string,
): Promise<JsonObject> {
  const stdout = await runTextCommand(args, context, outputRoot);
  try {
    const parsed = JSON.parse(stdout);
    if (!isRecord(parsed)) {
      throw new Error("rocs output was not a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `failed to parse rocs JSON output: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function runTextCommand(
  args: string[],
  context: RocsCommandContext,
  outputRoot?: string,
): Promise<string> {
  const runner = resolveRunner();
  try {
    if (outputRoot) {
      const timeout =
        context.deadline === undefined
          ? 120_000
          : Math.min(120_000, Math.ceil(context.deadline - performance.now()));
      if (timeout <= 0) throw new Error("ROCS inspection deadline exceeded");
      return await runInspectionProcess(
        runner.command,
        [...runner.baseArgs, "--no-index-cache", ...args],
        {
          cwd: PACKAGE_ROOT,
          timeout,
          signal: context.signal,
          // Never mutate process.env: inspections and mutation workflows may coexist.
          env: {
            ...process.env,
            // ROCS requires an empty/marked managed root; snapshot caches must be siblings.
            ROCS_OUTPUT_ROOT: path.join(outputRoot, "artifacts"),
            ROCS_CACHE_DIR: path.join(outputRoot, "cache"),
            GIT_OPTIONAL_LOCKS: "0",
            PYTHONDONTWRITEBYTECODE: "1",
          },
        },
      );
    }
    // Preserve the mutation workflow runner and its ambient output binding.
    const { stdout } = await execFileAsync(runner.command, [...runner.baseArgs, ...args], {
      cwd: PACKAGE_ROOT,
      timeout: 120_000,
      env: process.env,
      maxBuffer: 1024 * 1024 * 8,
    });
    return stdout;
  } catch (error) {
    throw new Error(formatProcessError(error));
  }
}

function resolveRunner(): Runner {
  const direct = process.env.PI_ONTOLOGY_ROCS_BIN?.trim() || process.env.ROCS_BIN?.trim();
  if (direct) {
    return { command: direct, baseArgs: [] };
  }

  const script = findUpwardScript(PACKAGE_ROOT);
  if (script) {
    return { command: "bash", baseArgs: [script] };
  }

  if (existsSync(path.join(DEFAULT_ROCS_PROJECT, "pyproject.toml"))) {
    return {
      command: "uv",
      baseArgs: ["--project", DEFAULT_ROCS_PROJECT, "run", "rocs"],
    };
  }

  return { command: "rocs", baseArgs: [] };
}

function findUpwardScript(start: string): string | undefined {
  let current = path.resolve(start);
  while (true) {
    const candidate = path.join(current, "scripts", "rocs.sh");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function formatProcessError(error: unknown): string {
  if (!isExecError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const stdout = String(error.stdout ?? "").trim();
  const stderr = String(error.stderr ?? "").trim();
  const combined = stdout || stderr;

  if (combined) {
    try {
      const parsed = JSON.parse(combined);
      if (isRecord(parsed)) return formatRocsFailure(parsed);
    } catch {
      return combined;
    }
  }

  return error.message || "rocs invocation failed";
}

function formatRocsFailure(payload: JsonObject): string {
  const error = asRecord(payload.error);
  if (error?.message) return String(error.message);
  if (Array.isArray(payload.findings) && payload.findings.length > 0) {
    return payload.findings
      .filter(isRecord)
      .map((finding) => String(finding.message ?? finding.rule_id ?? "finding"))
      .join("; ");
  }
  return String(payload.message ?? payload.error ?? "rocs command failed");
}

function normalizeFindings(input: unknown): ValidationFinding[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is ValidationFinding => typeof entry === "object" && entry !== null,
  );
}

function asRecord(value: unknown): JsonObject | undefined {
  return isRecord(value) ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

function isExecError(error: unknown): error is Error & { stdout?: string; stderr?: string } {
  return typeof error === "object" && error !== null && "message" in error;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
