import { performance } from "node:perf_hooks";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  appendSemanticPreflightBlock,
  renderSemanticPreflightBlock,
} from "../adapters/semantic-preflight-format.ts";
import type { OntologyInspectRequest, ResolvedOntologyTarget } from "../core/contracts.ts";
import type { DevelopmentInspectGate, InspectRuntime } from "../core/inspect.ts";
import {
  applicabilityForPrompt,
  projectDiscovery,
  type SemanticPreflightEnvelope,
  unavailableEnvelope,
} from "../core/semantic-preflight.ts";
import type { RocsDevelopmentPort, RocsPort } from "../ports/rocs-port.ts";
import type { WorkspacePort } from "../ports/workspace-port.ts";
import {
  currentGrant,
  type DevelopmentGrant,
  discoveryKey,
  freshState,
  hostCompatibility,
  legacyHint,
  type PreflightState,
  reportEnableFailure,
  reportStatus,
  resolveOrientationTarget,
  STATUS_KEY,
  updateReadback,
  visibleUnavailable,
  within,
} from "./preflight-runtime-state.ts";
import { type PreparedDevelopmentRuntime, prepareDevelopmentRuntime } from "./preparer.ts";
import {
  createDevelopmentRocsRunnerDescriptor,
  createVerifiedDevelopmentRocsPort,
  type RocsRunnerDescriptor,
} from "./runner.ts";

const CONFIRM_MS = 30_000;
const GRANT_MS = 600_000;
const PREFLIGHT_MS = 750;
const PROFILE = "review";

export interface PiHostCapabilities {
  readonly host_package: string;
  readonly host_version: string;
  readonly extension_api_version: string;
  readonly capabilities: readonly string[];
}

export interface RuntimeContext {
  cwd: string;
  mode: string;
  hasUI: boolean;
  hostCapabilities?: PiHostCapabilities;
  isIdle(): boolean;
  ui: {
    confirm(title: string, message: string, options?: { timeout?: number }): Promise<boolean>;
    notify(message: string, level?: "info" | "warning" | "error"): void;
    setStatus(id: string, value?: string): void;
  };
}

export interface SemanticPreflightRuntimeDeps {
  workspace: WorkspacePort;
  legacyRocs: RocsPort;
  now?: () => number;
  prepare?: () => Promise<PreparedDevelopmentRuntime>;
  activate?: (
    prepared: PreparedDevelopmentRuntime,
  ) => Promise<{ descriptor: RocsRunnerDescriptor; port: RocsDevelopmentPort }>;
}

export interface SemanticPreflightRuntime {
  register(pi: ExtensionAPI): void;
  inspectAccess(
    ctx: RuntimeContext,
    request: OntologyInspectRequest,
    toolSignal?: AbortSignal,
  ): {
    runtime: InspectRuntime;
    rocs: RocsPort;
    bound: boolean;
    isCurrent(): boolean;
  };
  noteInspect(ctx: RuntimeContext, request: OntologyInspectRequest, bound: boolean): void;
  snapshot(): Readonly<{
    generation: number;
    grant: boolean;
    promptBindings: number;
    inFlight: boolean;
  }>;
}

export function createSemanticPreflightRuntime(
  deps: SemanticPreflightRuntimeDeps,
): SemanticPreflightRuntime {
  const now = deps.now ?? Date.now;
  let state: PreflightState = freshState(0);

  const reset = () => {
    state.controller.abort();
    state = freshState(state.generation + 1);
  };

  const sessionStart = (ctx: RuntimeContext) => {
    reset();
    if (ctx.mode !== "tui") return;
    const compatibility = hostCompatibility(ctx);
    ctx.ui.setStatus(
      STATUS_KEY,
      compatibility.ok
        ? "semantic preflight: development disabled"
        : `semantic preflight: ${compatibility.reason}`,
    );
    const generation = state.generation;
    const signal = state.controller.signal;
    const readiness = resolveOrientationTarget(deps.workspace, ctx.cwd)
      .then((target) => {
        if (state.generation !== generation || signal.aborted) throw new Error("stale readiness");
        const orientation = { cwd: ctx.cwd, target };
        state.orientation = orientation;
        return orientation;
      })
      .catch((error) => {
        if (state.generation === generation && !signal.aborted && ctx.mode === "tui")
          ctx.ui.setStatus(STATUS_KEY, "semantic preflight: readiness unavailable");
        throw error;
      });
    // Session startup never waits for semantic validation, build, discovery, or slow readiness.
    state.orientationInFlight = readiness;
    void readiness.catch(() => undefined);
  };

  const disable = (ctx?: RuntimeContext) => {
    state.requestEpoch++;
    state.grant = undefined;
    state.promptRun = undefined;
    state.discoveryInFlight = undefined;
    if (ctx?.mode === "tui")
      ctx.ui.setStatus(STATUS_KEY, "semantic preflight: development disabled");
  };

  const register = (pi: ExtensionAPI) => {
    pi.registerCommand("ontology-preflight", {
      description: "Status, enable, or disable the TUI-only development semantic preflight",
      handler: async (args, rawCtx) => {
        const ctx = rawCtx as unknown as RuntimeContext;
        const action = args.trim() || "status";
        if (action === "status") {
          const observed = currentGrant(ctx, state, now());
          if (observed.stale) {
            disable(ctx);
            ctx.ui.notify(
              "Development semantic preflight grant was stale or expired and is now disabled.",
              "warning",
            );
            return;
          }
          reportStatus(ctx, state, now());
          return;
        }
        if (action === "disable") {
          disable(ctx);
          ctx.ui.notify(
            "Development semantic preflight disabled for this session generation.",
            "info",
          );
          return;
        }
        if (action !== "enable-development") {
          ctx.ui.notify("Usage: /ontology-preflight status|enable-development|disable", "error");
          return;
        }
        await enableDevelopment(ctx);
      },
    });

    pi.on("session_start", (_event, rawCtx) => sessionStart(rawCtx as unknown as RuntimeContext));
    pi.on("session_shutdown", (_event, rawCtx) => {
      reset();
      const ctx = rawCtx as unknown as RuntimeContext;
      if (ctx.mode === "tui") ctx.ui.setStatus(STATUS_KEY, undefined);
    });
    pi.on("agent_settled", () => {
      state.promptRun = undefined;
    });
    pi.on("before_agent_start", async (event, rawCtx) => {
      const ctx = rawCtx as unknown as RuntimeContext;
      if (ctx.mode !== "tui") return;
      state.promptRun = undefined;
      const grantState = currentGrant(ctx, state, now());
      if (!grantState.grant) {
        if (grantState.stale) {
          disable(ctx);
          visibleUnavailable(ctx, "stale development grant");
          return;
        }
        return legacyHint(event.prompt, event.systemPrompt);
      }

      const generation = state.generation;
      const hostKey = hostCompatibility(ctx).key;
      const key = discoveryKey(generation, ctx.cwd, hostKey, event.prompt, grantState.grant);
      let request = state.discoveryInFlight;
      if (!request || request.key !== key) {
        const promise = runPreflight(ctx, event.prompt, grantState.grant, generation);
        request = { key, epoch: ++state.requestEpoch, promise };
        state.discoveryInFlight = request;
        void promise.finally(() => {
          if (state.discoveryInFlight?.promise === promise) state.discoveryInFlight = undefined;
        });
      }
      const completed = await request.promise;
      const current = currentGrant(ctx, state, now());
      if (
        state.generation !== generation ||
        state.requestEpoch !== request.epoch ||
        !current.grant ||
        current.grant !== grantState.grant ||
        ctx.cwd !== grantState.grant.cwd
      ) {
        visibleUnavailable(ctx, "stale semantic preflight completion");
        return;
      }

      let envelope = completed.envelope;
      let block: string;
      try {
        block = renderSemanticPreflightBlock(envelope);
      } catch {
        envelope = unavailableEnvelope();
        block = renderSemanticPreflightBlock(envelope);
      }
      const bindings = new Map<
        string,
        { corpusSnapshotDigest: string; documentDigest: string; profile: string }
      >();
      if (envelope.invocation === "ok" && completed.target && completed.raw) {
        for (const candidate of completed.raw.candidates)
          bindings.set(candidate.ont_id, {
            corpusSnapshotDigest: completed.raw.corpus_snapshot_digest,
            documentDigest: candidate.document_digest,
            profile: PROFILE,
          });
      }
      state.promptRun = { key, bindings, readback: envelope, packSelected: false };
      updateReadback(ctx, state.promptRun);
      if (envelope.outcome === "unavailable")
        ctx.ui.notify(
          "Semantic preflight unavailable; continuing without semantic context.",
          "warning",
        );
      return { systemPrompt: appendSemanticPreflightBlock(event.systemPrompt, block) };
    });
  };

  async function runPreflight(
    ctx: RuntimeContext,
    prompt: string,
    grant: DevelopmentGrant,
    generation: number,
  ): Promise<{
    envelope: SemanticPreflightEnvelope;
    target?: ResolvedOntologyTarget;
    raw?: import("./protocol.ts").DiscoveryResult;
  }> {
    const applicability = applicabilityForPrompt(prompt);
    if (applicability === "not_applicable")
      return { envelope: projectDiscovery("ok", applicability) };
    const deadline = performance.now() + PREFLIGHT_MS;
    try {
      const orientation = state.orientation ?? (await within(state.orientationInFlight, deadline));
      if (
        state.generation !== generation ||
        state.controller.signal.aborted ||
        orientation.cwd !== ctx.cwd
      )
        return { envelope: unavailableEnvelope() };
      const discover = grant.rocs.discover;
      if (!discover) return { envelope: unavailableEnvelope() };
      const result = await discover(orientation.target.repoPath, prompt, PROFILE, {
        workspaceRoot: orientation.target.workspaceRoot,
        workspaceRefMode: "strict",
        resolveRefs: true,
        deadline,
        signal: state.controller.signal,
      });
      if (result.invocation !== "ok")
        return { envelope: projectDiscovery(result.invocation, applicability) };
      return {
        envelope: projectDiscovery("ok", applicability, result.result),
        target: orientation.target,
        raw: result.result,
      };
    } catch {
      return {
        envelope:
          performance.now() >= deadline
            ? projectDiscovery("timeout", applicability)
            : unavailableEnvelope(),
      };
    }
  }

  async function enableDevelopment(ctx: RuntimeContext): Promise<void> {
    const compatibility = hostCompatibility(ctx);
    if (ctx.mode !== "tui") return reportEnableFailure(ctx, "TUI mode is required");
    if (!compatibility.ok) return reportEnableFailure(ctx, compatibility.reason);
    if (!ctx.isIdle()) return reportEnableFailure(ctx, "Pi must be idle");
    const generation = state.generation;
    const cwd = ctx.cwd;
    const hostKey = compatibility.key;
    const confirmStarted = now();
    const confirmed = await ctx.ui.confirm(
      "Enable development semantic preflight?",
      "This writes a verified, content-addressed ROCS runtime to the extension cache and enables advisory preflight for 10 minutes. No network or shell is used.",
      { timeout: CONFIRM_MS },
    );
    const confirmedAt = now();
    if (!confirmed || confirmedAt - confirmStarted >= CONFIRM_MS)
      return reportEnableFailure(ctx, "confirmation cancelled or expired");
    if (!ctx.isIdle()) return reportEnableFailure(ctx, "Pi is no longer idle");
    if (!sameScope(ctx, generation, cwd, hostKey))
      return reportEnableFailure(ctx, "session, cwd, or host changed");

    ctx.ui.notify("Preparing ROCS in the extension-owned content-addressed cache…", "info");
    try {
      const prepared = await (deps.prepare ?? prepareDevelopmentRuntime)();
      const activated = deps.activate
        ? await deps.activate(prepared)
        : await defaultActivate(prepared);
      if (!ctx.isIdle() || !sameScope(ctx, generation, cwd, hostKey))
        return reportEnableFailure(ctx, "session, cwd, or host changed during preparation");
      if (now() >= confirmedAt + GRANT_MS)
        return reportEnableFailure(ctx, "development grant expired during preparation");
      const combined = Object.freeze({
        ...deps.legacyRocs,
        ...activated.port,
        developmentDescriptor: activated.descriptor,
      }) as RocsPort;
      state.grant = {
        generation,
        cwd,
        hostKey,
        confirmedAt,
        expiresAt: confirmedAt + GRANT_MS,
        descriptor: activated.descriptor,
        rocs: combined,
      };
      ctx.ui.setStatus(STATUS_KEY, "semantic preflight: development enabled (10m)");
      ctx.ui.notify(
        `${prepared.published ? "Published" : "Verified"} development ROCS runtime in ${prepared.cacheRoot}.`,
        "info",
      );
    } catch {
      disable(ctx);
      reportEnableFailure(ctx, "development runtime preparation failed");
    }
  }

  function inspectAccess(
    ctx: RuntimeContext,
    request: OntologyInspectRequest,
    toolSignal?: AbortSignal,
  ): {
    runtime: InspectRuntime;
    rocs: RocsPort;
    bound: boolean;
    isCurrent(): boolean;
  } {
    const observed = currentGrant(ctx, state, now());
    if (observed.stale) disable(ctx);
    const grant = observed.grant;
    const prompt = state.promptRun;
    const legacy = () => ({
      runtime: { cwd: ctx.cwd },
      rocs: deps.legacyRocs,
      bound: false,
      isCurrent: () => !toolSignal?.aborted,
    });
    if (!grant || !prompt) return legacy();
    const binding =
      request.kind === "pack" && request.ontId ? prompt.bindings.get(request.ontId) : undefined;
    const gate: DevelopmentInspectGate = {
      descriptor: grant.descriptor,
      profile: binding?.profile ?? PROFILE,
      boundSelection: binding
        ? {
            ontId: request.ontId as string,
            corpusSnapshotDigest: binding.corpusSnapshotDigest,
            documentDigest: binding.documentDigest,
          }
        : undefined,
    };
    const generation = state.generation;
    const signal = toolSignal
      ? AbortSignal.any([state.controller.signal, toolSignal])
      : state.controller.signal;
    const isCurrent = () => {
      const current = currentGrant(ctx, state, now());
      if (current.stale) {
        disable(ctx);
        return false;
      }
      return (
        !signal.aborted &&
        state.generation === generation &&
        current.grant === grant &&
        state.promptRun === prompt
      );
    };
    return {
      runtime: {
        cwd: ctx.cwd,
        developmentGate: gate,
        semanticBoundary: {
          deadline:
            performance.now() + Math.min(PREFLIGHT_MS, Math.max(0, grant.expiresAt - now())),
          signal,
        },
      },
      rocs: grant.rocs,
      bound: Boolean(binding),
      isCurrent,
    };
  }

  function noteInspect(ctx: RuntimeContext, request: OntologyInspectRequest, bound: boolean): void {
    if (request.kind !== "pack" || !bound || !state.promptRun) return;
    state.promptRun.packSelected = true;
    updateReadback(ctx, state.promptRun);
  }

  return {
    register,
    inspectAccess,
    noteInspect,
    snapshot: () => ({
      generation: state.generation,
      grant: Boolean(state.grant),
      promptBindings: state.promptRun?.bindings.size ?? 0,
      inFlight: Boolean(state.discoveryInFlight),
    }),
  };

  function sameScope(
    ctx: RuntimeContext,
    generation: number,
    cwd: string,
    hostKey: string,
  ): boolean {
    return (
      state.generation === generation &&
      !state.controller.signal.aborted &&
      ctx.cwd === cwd &&
      hostCompatibility(ctx).key === hostKey
    );
  }
}

async function defaultActivate(prepared: PreparedDevelopmentRuntime) {
  const descriptor = await createDevelopmentRocsRunnerDescriptor(prepared.location);
  const port = await createVerifiedDevelopmentRocsPort(descriptor);
  return { descriptor, port };
}
