import { homedir } from "node:os";
import type { RocsCommandContext, RocsDevelopmentPort } from "../ports/rocs-port.ts";
import {
  type PreparedRuntimeLocation,
  type PreparedRuntimeManifest,
  parseStrictIJson,
  verifyPreparedRuntime,
} from "./prepared-runtime.ts";
import {
  type BoundPackResult,
  callerRequestDigest,
  type DiscoveryInvocation,
  type DiscoveryResult,
  mapRocsFailure,
  validateBoundPack,
  validateCapabilities,
  validateDiscoveryResult,
  validateErrorEnvelope,
} from "./protocol.ts";
import {
  type BoundedProcessOutput,
  consumeProcessOutput,
  invokePrepared,
  ProcessBoundaryError,
} from "./subprocess.ts";

const VERIFIED = Symbol("verified-development-rocs-runner");
const QUERY_CAP = 16_384;
const PACK_CAP = 262_144;
const UINT32_MAX = 4_294_967_295;

export interface RocsRunnerDescriptor {
  readonly kind: "development_runtime";
  readonly executable: string;
  readonly fixedArguments: readonly ["-B", "-m", "rocs_cli"];
  readonly cwd: string;
  readonly manifestDigest: string;
  readonly rocsCommit: string;
  readonly pythonVersion: string;
  readonly verificationEvidence: Readonly<{
    schema: "pi-rocs-prepared-runtime-verification.v0";
    complete: true;
  }>;
  readonly [VERIFIED]: PreparedRuntimeLocation;
}
export interface DiscoveryRequest {
  schema: "semantic-discovery-request.v0";
  query: string;
  identity_selector: { kind: "development_snapshot" };
  profile: string;
  algorithm: "rocs-lexical-v0";
  limits: {
    query_bytes: number;
    corpus_files: number;
    corpus_bytes: number;
    file_bytes: number;
    parser_depth: number;
    collection_items: number;
    candidates: number;
    result_bytes: number;
  };
}
export interface RunnerFailure {
  invocation: Exclude<DiscoveryInvocation, "ok">;
  message: string;
}

export async function createDevelopmentRocsRunnerDescriptor(
  location: PreparedRuntimeLocation,
): Promise<RocsRunnerDescriptor> {
  const manifest = await verifyPreparedRuntime(location);
  return descriptor(location, manifest);
}

export async function createVerifiedDevelopmentRocsPort(
  descriptorValue: RocsRunnerDescriptor,
): Promise<RocsDevelopmentPort> {
  requireDescriptor(descriptorValue);
  let negotiated = false;
  for (let attempt = 0; attempt < 2 && !negotiated; attempt++) {
    try {
      const caps = await invoke(
        descriptorValue,
        ["discover-capabilities", "--json"],
        undefined,
        closedEnv(descriptorValue, descriptorValue.cwd, "review"),
        { budgetMs: 5_000 },
      );
      consumeProcessOutput(caps, () => {
        strictUtf8(caps.stdout);
        strictUtf8(caps.stderr);
        if (caps.exitCode !== 0) throw new Error("ROCS capability negotiation failed");
        validateCapabilities(parseJson(caps.stdout));
      });
      negotiated = true;
    } catch (error) {
      if (!(error instanceof ProcessBoundaryError) || error.kind !== "timeout" || attempt > 0)
        throw error;
    }
  }
  if (!negotiated) throw new Error("ROCS capability negotiation failed");
  return Object.freeze({
    developmentDescriptor: descriptorValue,
    async discover(repoPath: string, query: string, profile: string, context: RocsCommandContext) {
      if (Buffer.byteLength(query) > QUERY_CAP)
        return { invocation: "resource_exhausted" as const, message: "query byte cap exceeded" };
      const request = defaultRequest(query, profile);
      const raw = Buffer.from(JSON.stringify(request), "utf8");
      return executeDiscovery(descriptorValue, repoPath, context, request, raw);
    },
    async boundPack(
      repoPath: string,
      ontId: string,
      profile: string,
      expectedSnapshotDigest: string,
      expectedDocumentDigest: string,
      context: RocsCommandContext,
      options?: { depth?: number; maxDocs?: number },
    ) {
      return executeBoundPack(
        descriptorValue,
        repoPath,
        ontId,
        profile,
        expectedSnapshotDigest,
        expectedDocumentDigest,
        context,
        options,
      );
    },
  });
}

export function isVerifiedDevelopmentDescriptor(value: unknown): value is RocsRunnerDescriptor {
  return typeof value === "object" && value !== null && VERIFIED in value && Object.isFrozen(value);
}

export function buildDiscoveryArgv(
  descriptorValue: RocsRunnerDescriptor,
  repoPath: string,
  context: RocsCommandContext,
): string[] {
  requireDescriptor(descriptorValue);
  return [
    ...descriptorValue.fixedArguments,
    "discover",
    "--repo",
    repoPath,
    "--request-json",
    "-",
    "--tool-kind",
    "development_runtime",
    "--tool-manifest-digest",
    descriptorValue.manifestDigest,
    "--resolve-refs",
    "--workspace-root",
    context.workspaceRoot,
    "--workspace-ref-mode",
    "strict",
    "--json",
    "--no-index-cache",
    "--no-env-file",
  ];
}

export function buildClosedRunnerEnv(
  descriptorValue: RocsRunnerDescriptor,
  workspaceRoot: string,
  profile: string,
): NodeJS.ProcessEnv {
  requireDescriptor(descriptorValue);
  return closedEnv(descriptorValue, workspaceRoot, profile);
}

async function executeDiscovery(
  descriptorValue: RocsRunnerDescriptor,
  repoPath: string,
  context: RocsCommandContext,
  request: DiscoveryRequest,
  raw: Buffer,
): Promise<{ invocation: "ok"; result: DiscoveryResult } | RunnerFailure> {
  try {
    const args = buildDiscoveryArgv(descriptorValue, repoPath, context).slice(
      descriptorValue.fixedArguments.length,
    );
    const output = await invoke(
      descriptorValue,
      args,
      raw,
      closedEnv(descriptorValue, context.workspaceRoot, request.profile),
      context,
    );
    return consumeProcessOutput(output, () => {
      strictUtf8(output.stdout);
      strictUtf8(output.stderr);
      const parsed = parseJson(output.stdout);
      if (output.exitCode !== 0) {
        const envelope = validateErrorEnvelope(parsed);
        if (envelope.error.caller_request_digest !== callerRequestDigest(request))
          throw new Error("ROCS error request identity mismatch");
        return {
          invocation: mapRocsFailure(parsed) as RunnerFailure["invocation"],
          message: safeMessage(parsed),
        };
      }
      return {
        invocation: "ok" as const,
        result: validateDiscoveryResult(parsed, {
          request,
          requestDigest: callerRequestDigest(request),
          manifestDigest: descriptorValue.manifestDigest,
          pythonVersion: descriptorValue.pythonVersion,
        }),
      };
    });
  } catch (error) {
    return processFailure(error);
  }
}

async function executeBoundPack(
  descriptorValue: RocsRunnerDescriptor,
  repoPath: string,
  ontId: string,
  profile: string,
  snapshot: string,
  document: string,
  context: RocsCommandContext,
  options?: { depth?: number; maxDocs?: number },
): Promise<{ invocation: "ok"; result: BoundPackResult } | RunnerFailure> {
  try {
    const args = [
      "pack",
      ontId,
      "--repo",
      repoPath,
      "--profile",
      profile,
      "--expected-snapshot-digest",
      snapshot,
      "--expected-document-digest",
      document,
      "--resolve-refs",
      "--workspace-root",
      context.workspaceRoot,
      "--workspace-ref-mode",
      "strict",
      "--json",
      "--no-index-cache",
      "--no-env-file",
      "--max-bytes",
      String(PACK_CAP),
    ];
    if (options?.depth !== undefined) args.push("--depth", String(options.depth));
    if (options?.maxDocs !== undefined) args.push("--max-docs", String(options.maxDocs));
    const output = await invoke(
      descriptorValue,
      args,
      undefined,
      closedEnv(descriptorValue, context.workspaceRoot, profile),
      context,
    );
    return consumeProcessOutput(output, () => {
      strictUtf8(output.stdout);
      strictUtf8(output.stderr);
      const parsed = parseJson(output.stdout);
      if (output.exitCode !== 0)
        return {
          invocation: mapRocsFailure(parsed) as RunnerFailure["invocation"],
          message: safeMessage(parsed),
        };
      return {
        invocation: "ok" as const,
        result: validateBoundPack(parsed, {
          snapshotDigest: snapshot,
          rootId: ontId,
          documentDigest: document,
          maxBytes: PACK_CAP,
          config: {
            max_depth: options?.depth ?? 0,
            rel_types: [],
            include_relation_defs: false,
            max_docs: options?.maxDocs ?? UINT32_MAX,
            max_bytes: PACK_CAP,
          },
        }),
      };
    });
  } catch (error) {
    return processFailure(error);
  }
}

async function invoke(
  d: RocsRunnerDescriptor,
  args: string[],
  stdin: Buffer | undefined,
  env: NodeJS.ProcessEnv,
  context?: Pick<RocsCommandContext, "deadline" | "signal"> & { budgetMs?: number },
): Promise<BoundedProcessOutput> {
  requireDescriptor(d);
  const output = await invokePrepared(
    {
      location: d[VERIFIED],
      executable: d.executable,
      cwd: d.cwd,
      fixedArguments: d.fixedArguments,
      manifestDigest: d.manifestDigest,
      rocsCommit: d.rocsCommit,
      pythonVersion: d.pythonVersion,
    },
    args,
    stdin,
    env,
    context,
  );
  return output;
}

class RunnerStateError extends Error {
  constructor(
    readonly invocation: RunnerFailure["invocation"],
    message: string,
  ) {
    super(message);
  }
}
function processFailure(error: unknown): RunnerFailure {
  if (error instanceof RunnerStateError)
    return { invocation: error.invocation, message: error.message };
  if (error instanceof ProcessBoundaryError)
    return { invocation: error.kind, message: error.message };
  const message = error instanceof Error ? error.message : "ROCS invocation failed";
  return {
    invocation: /UTF-8|JSON|protocol|manifest|descriptor|digest|mismatch|drift|I-JSON/.test(message)
      ? "incompatible"
      : "unavailable",
    message: message.slice(0, 4096),
  };
}
function descriptor(
  location: PreparedRuntimeLocation,
  manifest: PreparedRuntimeManifest,
): RocsRunnerDescriptor {
  return Object.freeze({
    kind: "development_runtime",
    executable: manifest.interpreter.path,
    fixedArguments: Object.freeze([
      "-B",
      "-m",
      "rocs_cli",
    ]) as RocsRunnerDescriptor["fixedArguments"],
    cwd: location.root,
    manifestDigest: manifest.manifest_digest,
    rocsCommit: manifest.rocs_commit,
    pythonVersion: manifest.interpreter.version,
    verificationEvidence: Object.freeze({
      schema: "pi-rocs-prepared-runtime-verification.v0",
      complete: true,
    }),
    [VERIFIED]: Object.freeze({ ...location }),
  });
}
function requireDescriptor(value: RocsRunnerDescriptor): void {
  if (!isVerifiedDevelopmentDescriptor(value) || value.kind !== "development_runtime")
    throw new Error("verified development ROCS descriptor required");
}
function closedEnv(
  _d: RocsRunnerDescriptor,
  workspaceRoot: string,
  _profile: string,
): NodeJS.ProcessEnv {
  return Object.freeze({
    HOME: homedir(),
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    ROCS_WORKSPACE_ROOT: workspaceRoot,
    ROCS_WORKSPACE_REF_MODE: "strict",
  });
}
function defaultRequest(query: string, profile: string): DiscoveryRequest {
  return {
    schema: "semantic-discovery-request.v0",
    query,
    identity_selector: { kind: "development_snapshot" },
    profile,
    algorithm: "rocs-lexical-v0",
    limits: {
      query_bytes: 16384,
      corpus_files: 5000,
      corpus_bytes: 33554432,
      file_bytes: 1048576,
      parser_depth: 32,
      collection_items: 10000,
      candidates: 12,
      result_bytes: 65536,
    },
  };
}
function parseJson(bytes: Uint8Array): unknown {
  return parseStrictIJson(bytes);
}
function strictUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("invalid UTF-8 from ROCS");
  }
}
function safeMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value) {
    const e = (value as { error?: { message?: unknown } }).error;
    if (typeof e?.message === "string") return e.message.slice(0, 4096);
  }
  return "ROCS invocation failed";
}
