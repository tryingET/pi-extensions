// ---
// summary: aggregate, immutable-observation fleet lint orchestration and deterministic report digest.
// read_when:
//   - changing agent_registry lint, fleet aggregation, profile baselines, collisions, or report identity.
// ---

import { basename, dirname, relative } from "node:path";
import { EC_PROFILE_SCHEMA, type EcProfileSource, loadEcProfiles } from "./ec-profiles.ts";
import { captureFleetGitSnapshot, type FleetGitSnapshot } from "./fleet-git-snapshot.ts";
import { normalizeFleetRole } from "./fleet-lint-provenance.ts";
import { invalidFleetRepositoryResult, lintFleetRepository } from "./fleet-lint-repository.ts";
import {
  AGENT_FLEET_LINT_SCHEMA,
  type AgentFleetLintReport,
  type FleetLintCollision,
  type FleetLintDiagnostic,
  type FleetLintRepositoryResult,
} from "./fleet-lint-types.ts";
import {
  addFleetDiagnostic,
  fleetSha256,
  logicalFleetRoot,
  sortFleetDiagnostics,
  stableFleetValue,
} from "./fleet-lint-utils.ts";
import { AGENT_REGISTRY_ROOTS_ENV, defaultRegistryRoots, expandTildePath } from "./registry.ts";
import { discoverAgentRepositories, RegistryDiscoveryError } from "./registry-discovery.ts";

const DEFAULT_STALE_AFTER_DAYS = 90;
const DEFAULT_MAX_REPOSITORIES = 5_000;
const RFC3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u;

export interface FleetLintOptions {
  roots?: string[];
  ec?: EcProfileSource;
  observedAt?: string;
  staleAfterDays?: number;
  maxRepositories?: number;
}

export class FleetLintInfrastructureError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FleetLintInfrastructureError";
    this.code = code;
  }
}

export function defaultFleetLintRoots(): string[] {
  return process.env[AGENT_REGISTRY_ROOTS_ENV]?.trim()
    ? defaultRegistryRoots()
    : [expandTildePath("~/ai-society/agents/agent-*")];
}

function digestValue(value: unknown): string {
  return fleetSha256(JSON.stringify(stableFleetValue(value)));
}

function canonicalObservedAt(value: string): { text: string; date: Date } {
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) {
    throw new FleetLintInfrastructureError(
      "fleet.options_invalid",
      "observedAt must be one RFC3339 timestamp",
    );
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zoneHour, zoneMinute] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const validFields =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (daysInMonth[month - 1] ?? 0) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (zoneHour === undefined || Number(zoneHour) <= 23) &&
    (zoneMinute === undefined || Number(zoneMinute) <= 59);
  const date = new Date(value);
  if (!validFields || !Number.isFinite(date.getTime())) {
    throw new FleetLintInfrastructureError(
      "fleet.options_invalid",
      "observedAt must be one valid RFC3339 timestamp",
    );
  }
  return { text: date.toISOString(), date };
}

function logicalProfileSourcePath(ec: EcProfileSource): string {
  const repository = basename(dirname(ec.skillsRoot)) || "root";
  const filename = basename(ec.path) || "profiles.json";
  return `${repository}/skills/${filename}`;
}

async function captureProfileSource(ec: EcProfileSource, diagnostics: FleetLintDiagnostic[]) {
  const repo = "engineering-core/skills-profiles";
  try {
    const snapshot = await captureFleetGitSnapshot(dirname(ec.skillsRoot));
    const profilePath = relative(snapshot.root, ec.path).split("\\").join("/");
    const file = await snapshot.readFile(profilePath, 2 * 1024 * 1024);
    if (!file) throw new Error(`committed profile source is missing: ${profilePath}`);
    const status =
      snapshot.status === "clean_observed" && file.sha256 === ec.rawSha256 ? "bound" : "dirty";
    if (status !== "bound") {
      addFleetDiagnostic(
        diagnostics,
        repo,
        status === "dirty" ? "profile.source_dirty" : "profile.source_unstable",
        "error",
        "engineering-core profile bytes are not one clean stable committed observation",
        profilePath,
      );
    }
    return {
      snapshot,
      profile: {
        path: logicalProfileSourcePath(ec),
        schema: ec.schema,
        rawSha256: ec.rawSha256,
        commit: snapshot.commit,
        blobOid: file.blobOid,
        committedSha256: file.sha256,
        status,
      } satisfies AgentFleetLintReport["profileSource"],
    };
  } catch {
    addFleetDiagnostic(
      diagnostics,
      repo,
      "profile.source_invalid",
      "error",
      "engineering-core profile bytes could not be bound to one committed Git snapshot",
      logicalProfileSourcePath(ec),
    );
    return {
      snapshot: undefined as FleetGitSnapshot | undefined,
      profile: {
        path: logicalProfileSourcePath(ec),
        schema: ec.schema,
        rawSha256: ec.rawSha256,
        status: "invalid",
      } satisfies AgentFleetLintReport["profileSource"],
    };
  }
}

function addCollisions(repositories: FleetLintRepositoryResult[]): FleetLintCollision[] {
  const collisions: FleetLintCollision[] = [];
  for (const [kind, values] of [
    ["name", repositories.map((entry) => [entry.manifest.name, entry] as const)],
    ["role", repositories.map((entry) => [entry.manifest.role, entry] as const)],
  ] as const) {
    const index = new Map<string, FleetLintRepositoryResult[]>();
    for (const [value, repository] of values) {
      if (!value) continue;
      const normalized = kind === "role" ? normalizeFleetRole(value) : value;
      index.set(normalized, [...(index.get(normalized) ?? []), repository]);
    }
    for (const [normalizedValue, matches] of index) {
      if (matches.length < 2) continue;
      const repos = matches.map((entry) => entry.repo).sort();
      collisions.push({ kind, normalizedValue, repositories: repos });
      for (const entry of matches) {
        addFleetDiagnostic(
          entry.diagnostics,
          entry.repo,
          `${kind}.exact_collision`,
          "error",
          `${kind} collides exactly after normalization across: ${repos.join(", ")}`,
          "agent.json",
          "semantic differentiation remains an owner review; lint proves only this exact collision",
        );
        sortFleetDiagnostics(entry.diagnostics);
      }
    }
  }
  return collisions.sort((a, b) => {
    const left = `${a.kind}\0${a.normalizedValue}`;
    const right = `${b.kind}\0${b.normalizedValue}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export async function lintAgentFleet(
  options: FleetLintOptions = {},
): Promise<AgentFleetLintReport> {
  const observation = canonicalObservedAt(options.observedAt ?? new Date().toISOString());
  const observedAt = observation.text;
  const observedDate = observation.date;
  const staleAfterDays = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  if (!Number.isSafeInteger(staleAfterDays) || staleAfterDays <= 0) {
    throw new FleetLintInfrastructureError(
      "fleet.options_invalid",
      "staleAfterDays must be a positive safe integer",
    );
  }
  const roots = options.roots ?? defaultFleetLintRoots();
  let ec: EcProfileSource;
  try {
    ec = options.ec ?? (await loadEcProfiles());
  } catch {
    throw new FleetLintInfrastructureError(
      "profile.source_load_failed",
      "engineering-core skill profile source could not be loaded",
    );
  }
  const diagnostics: FleetLintDiagnostic[] = [];
  if (ec.schema !== EC_PROFILE_SCHEMA) {
    addFleetDiagnostic(
      diagnostics,
      "engineering-core/skills-profiles",
      "profile.legacy_schema",
      "error",
      `fleet lint requires ${EC_PROFILE_SCHEMA}; legacy compatibility is runtime-only`,
      logicalProfileSourcePath(ec),
    );
  }
  const profileSource = await captureProfileSource(ec, diagnostics);
  let discovered: Awaited<ReturnType<typeof discoverAgentRepositories>>;
  try {
    discovered = await discoverAgentRepositories(
      roots,
      true,
      options.maxRepositories ?? DEFAULT_MAX_REPOSITORIES,
    );
  } catch (error) {
    if (error instanceof RegistryDiscoveryError) {
      throw new FleetLintInfrastructureError(error.code, error.message);
    }
    throw new FleetLintInfrastructureError(
      "fleet.discovery_failed",
      "fleet repository discovery failed unexpectedly",
    );
  }
  if (discovered.omittedCount > 0) {
    addFleetDiagnostic(
      diagnostics,
      "fleet",
      "fleet.repository_limit_exceeded",
      "error",
      `${discovered.omittedCount} candidate repositories were omitted by the bound`,
    );
  }

  const repositories: FleetLintRepositoryResult[] = [];
  for (const failure of discovered.failures) {
    const repo = logicalFleetRoot(failure.root);
    const repositoryDiagnostics: FleetLintDiagnostic[] = [];
    addFleetDiagnostic(
      repositoryDiagnostics,
      repo,
      failure.code,
      "error",
      "candidate repository could not be resolved after bounded discovery",
      undefined,
      "later fleet candidates were still inspected",
    );
    repositories.push(invalidFleetRepositoryResult(failure.root, false, repositoryDiagnostics));
  }
  for (const candidate of discovered.repositories) {
    try {
      repositories.push(
        await lintFleetRepository({
          root: candidate.root,
          manifestPresent: candidate.manifestPresent,
          ec,
          ecSnapshot: profileSource.snapshot,
          observedAt: observedDate,
          staleAfterDays,
        }),
      );
    } catch {
      const repositoryDiagnostics: FleetLintDiagnostic[] = [];
      const repo = logicalFleetRoot(candidate.root);
      addFleetDiagnostic(
        repositoryDiagnostics,
        repo,
        "repository.lint_failed",
        "error",
        "repository lint failed unexpectedly inside its aggregate isolation boundary",
        undefined,
        "one repository failed bounded capture; later fleet candidates were still inspected",
      );
      repositories.push(
        invalidFleetRepositoryResult(
          candidate.root,
          candidate.manifestPresent,
          repositoryDiagnostics,
        ),
      );
    }
  }
  if (profileSource.snapshot) {
    try {
      const finalProfileState = await profileSource.snapshot.finish();
      if (!finalProfileState.stable) {
        profileSource.profile.status = "invalid";
        addFleetDiagnostic(
          diagnostics,
          "engineering-core/skills-profiles",
          "profile.source_concurrent_change",
          "error",
          "engineering-core profile HEAD or worktree status changed during fleet capture",
          logicalProfileSourcePath(ec),
        );
      }
    } catch {
      profileSource.profile.status = "invalid";
      addFleetDiagnostic(
        diagnostics,
        "engineering-core/skills-profiles",
        "profile.source_finalize_failed",
        "error",
        "engineering-core profile endpoint stability could not be verified after fleet capture",
        logicalProfileSourcePath(ec),
      );
    }
  }
  repositories.sort((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0));
  const collisions = addCollisions(repositories);
  const allDiagnostics = sortFleetDiagnostics([
    ...diagnostics,
    ...repositories.flatMap((entry) => entry.diagnostics),
  ]);
  const count = (severity: FleetLintDiagnostic["severity"]) =>
    allDiagnostics.filter((entry) => entry.severity === severity).length;
  const state: Omit<AgentFleetLintReport, "reportSha256" | "stateSha256" | "observedAt"> = {
    schema: AGENT_FLEET_LINT_SCHEMA,
    kind: "immutable_observation",
    authorityEffect: "none",
    roots: roots.map(logicalFleetRoot),
    profileSource: profileSource.profile,
    policy: {
      staleAfterDays,
      lifecycleAuthority: "advisory_signal_only",
      dispatchPosture: "fleet_phase_0_disabled",
    },
    repositories,
    collisions,
    diagnostics: allDiagnostics,
    summary: {
      status: count("error") > 0 ? "unhealthy" : "healthy",
      candidateRepositories:
        discovered.repositories.length + discovered.failures.length + discovered.omittedCount,
      includedRepositories: repositories.length,
      omittedRepositories: discovered.omittedCount,
      manifests: repositories.filter((entry) => entry.manifest.present).length,
      errors: count("error"),
      warnings: count("warning"),
      infos: count("info"),
      recentActivitySignals: repositories.filter(
        (entry) => entry.lifecycle.signal === "recent_activity",
      ).length,
      staleCandidateSignals: repositories.filter(
        (entry) => entry.lifecycle.signal === "stale_candidate",
      ).length,
      unknownLifecycleSignals: repositories.filter((entry) => entry.lifecycle.signal === "unknown")
        .length,
    },
  };
  const stateSha256 = digestValue(state);
  const complete = { ...state, observedAt, stateSha256 };
  return { ...complete, reportSha256: digestValue(complete) };
}
