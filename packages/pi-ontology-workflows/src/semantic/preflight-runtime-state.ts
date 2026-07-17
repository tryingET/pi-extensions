import path from "node:path";
import { performance } from "node:perf_hooks";
import type { ResolvedOntologyTarget } from "../core/contracts.ts";
import type { SemanticPreflightEnvelope } from "../core/semantic-preflight.ts";
import type { RocsPort } from "../ports/rocs-port.ts";
import type { WorkspacePort } from "../ports/workspace-port.ts";
import type { RuntimeContext } from "./preflight-runtime.ts";
import type { DiscoveryResult } from "./protocol.ts";
import type { RocsRunnerDescriptor } from "./runner.ts";

export const STATUS_KEY = "ontology-semantic-preflight";
const REQUIRED_CAPABILITIES = Object.freeze([
  "prompt.system.chain.v1",
  "session.lifecycle.reason.v1",
  "ui.mode.v1",
  "ui.confirm.timeout.v1",
  "session.shutdown.v1",
] as const);

export interface Orientation {
  cwd: string;
  target: ResolvedOntologyTarget;
}

export interface DevelopmentGrant {
  generation: number;
  cwd: string;
  hostKey: string;
  confirmedAt: number;
  expiresAt: number;
  descriptor: RocsRunnerDescriptor;
  rocs: RocsPort;
}

export interface PromptRun {
  key: string;
  bindings: Map<string, { corpusSnapshotDigest: string; documentDigest: string; profile: string }>;
  readback: SemanticPreflightEnvelope;
  packSelected: boolean;
}

export interface PreflightState {
  generation: number;
  controller: AbortController;
  requestEpoch: number;
  orientation?: Orientation;
  orientationInFlight?: Promise<Orientation>;
  grant?: DevelopmentGrant;
  discoveryInFlight?: {
    key: string;
    epoch: number;
    promise: Promise<{
      envelope: SemanticPreflightEnvelope;
      target?: ResolvedOntologyTarget;
      raw?: DiscoveryResult;
    }>;
  };
  promptRun?: PromptRun;
}

export function freshState(generation: number): PreflightState {
  return { generation, controller: new AbortController(), requestEpoch: 0 };
}

export function currentGrant(
  ctx: RuntimeContext,
  state: PreflightState,
  timestamp: number,
): { grant?: DevelopmentGrant; stale: boolean } {
  const grant = state.grant;
  if (!grant) return { stale: false };
  const compatibility = hostCompatibility(ctx);
  const stale =
    grant.generation !== state.generation ||
    grant.cwd !== ctx.cwd ||
    !compatibility.ok ||
    grant.hostKey !== compatibility.key ||
    timestamp >= grant.expiresAt;
  return stale ? { stale: true } : { grant, stale: false };
}

export function hostCompatibility(ctx: RuntimeContext): {
  ok: boolean;
  key: string;
  reason: string;
} {
  if (ctx.mode !== "tui") return { ok: false, key: "", reason: "TUI mode required" };
  const host = ctx.hostCapabilities;
  if (!host || !Object.isFrozen(host) || !Object.isFrozen(host.capabilities))
    return { ok: false, key: "", reason: "immutable host capabilities unavailable" };
  if (
    Object.keys(host).sort().join(",") !==
    "capabilities,extension_api_version,host_package,host_version"
  )
    return { ok: false, key: "", reason: "host capability shape incompatible" };
  if (host.extension_api_version !== "1.0.0")
    return { ok: false, key: "", reason: "extension API incompatible" };
  if (
    typeof host.host_package !== "string" ||
    typeof host.host_version !== "string" ||
    !host.capabilities.every((item) => typeof item === "string") ||
    REQUIRED_CAPABILITIES.some((required) => !host.capabilities.includes(required))
  )
    return { ok: false, key: "", reason: "required host capabilities unavailable" };
  const capabilities = [...host.capabilities].sort();
  return {
    ok: true,
    key: JSON.stringify({
      host_package: host.host_package,
      host_version: host.host_version,
      extension_api_version: host.extension_api_version,
      capabilities,
    }),
    reason: "compatible",
  };
}

export function discoveryKey(
  generation: number,
  cwd: string,
  hostKey: string,
  prompt: string,
  grant: DevelopmentGrant,
): string {
  return JSON.stringify([
    generation,
    cwd,
    hostKey,
    grant.descriptor.manifestDigest,
    grant.expiresAt,
    prompt,
  ]);
}

export function updateReadback(ctx: RuntimeContext, prompt: PromptRun): void {
  const value = prompt.readback;
  ctx.ui.setStatus(
    STATUS_KEY,
    [
      `preflight=${value.outcome}`,
      `invocation=${value.invocation}`,
      `corpus=${prefix(value.corpus_snapshot_digest)}`,
      `result=${prefix(value.result_digest)}`,
      `candidates=${value.candidates.length}`,
      `pack=${prompt.packSelected ? "yes" : "no"}`,
    ].join(" "),
  );
}

export function reportStatus(ctx: RuntimeContext, state: PreflightState, timestamp: number): void {
  const compatibility = hostCompatibility(ctx);
  const grant = currentGrant(ctx, state, timestamp);
  const text = !compatibility.ok
    ? `Semantic preflight unavailable: ${compatibility.reason}.`
    : grant.grant
      ? `Development semantic preflight enabled; expires in ${Math.max(0, Math.ceil((grant.grant.expiresAt - timestamp) / 1000))}s.`
      : grant.stale
        ? "Development semantic preflight grant is stale or expired."
        : "Development semantic preflight is disabled.";
  ctx.ui.notify(text, compatibility.ok ? "info" : "warning");
}

export function visibleUnavailable(ctx: RuntimeContext, reason: string): void {
  ctx.ui.setStatus(STATUS_KEY, `semantic preflight: unavailable (${reason})`);
  ctx.ui.notify("Semantic preflight unavailable; continuing without semantic context.", "warning");
}

export function reportEnableFailure(ctx: RuntimeContext, reason: string): void {
  ctx.ui.setStatus(STATUS_KEY, `semantic preflight: unavailable (${reason})`);
  ctx.ui.notify(`Development semantic preflight not enabled: ${reason}.`, "warning");
}

function prefix(digest: string | null): string {
  return digest ? digest.slice("sha256:".length, "sha256:".length + 8) : "-";
}

export function legacyHint(
  prompt: string,
  systemPrompt: string,
): { systemPrompt: string } | undefined {
  if (
    ![
      /\bontology\b/i,
      /\bconcept\b/i,
      /\brelation\b/i,
      /\binvariant\b/i,
      /\bsystem4d\b/i,
      /\bsemantic\b/i,
      /\bmeaning\b/i,
      /\bbridge mapping\b/i,
    ].some((pattern) => pattern.test(prompt))
  )
    return undefined;
  return {
    systemPrompt:
      `${systemPrompt}\n\nOntology workflow hint:\n` +
      "- Use ontology_inspect before inventing or changing concepts, relations, invariants, system4d entries, or bridge mappings.\n" +
      "- Use ontology_proposal before ontology_change when ontology applicability is uncertain.\n" +
      "- Use ontology_change for ontology writes and keep repo/company/core placement explicit.",
  };
}

export async function resolveOrientationTarget(
  workspace: WorkspacePort,
  cwd: string,
): Promise<ResolvedOntologyTarget> {
  const detected = await workspace.detect(cwd);
  const relative = path.relative(detected.workspaceRoot, detected.currentRepoPath);
  const insideCore = relative === "core" || relative.startsWith(`core${path.sep}`);
  return workspace.resolveTarget({ cwd, scope: insideCore ? "core" : undefined });
}

export async function within<T>(promise: Promise<T> | undefined, deadline: number): Promise<T> {
  if (!promise) throw new Error("readiness unavailable");
  const milliseconds = Math.max(0, deadline - performance.now());
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("readiness timeout")), milliseconds);
      timer.unref();
    }),
  ]);
}
