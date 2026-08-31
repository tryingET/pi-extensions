// ---
// summary: per-repository immutable manifest/profile/prompt/provenance/lifecycle diagnostics for aggregate fleet lint.
// read_when:
//   - changing one-agent lint semantics, committed prompt freshness, profile references, or revision currentness.
// ---

import { basename } from "node:path";
import type { EcProfileSource } from "./ec-profiles.ts";
import {
  type CapturedGitFile,
  captureFleetGitSnapshot,
  type FleetGitSnapshot,
} from "./fleet-git-snapshot.ts";
import { inspectTemplateProvenance } from "./fleet-lint-provenance.ts";
import { checkFleetSkills } from "./fleet-lint-skills.ts";
import type { FleetLintDiagnostic, FleetLintRepositoryResult } from "./fleet-lint-types.ts";
import {
  addFleetDiagnostic,
  fleetSha256,
  logicalFleetRepo,
  sortFleetDiagnostics,
  stableFleetValue,
} from "./fleet-lint-utils.ts";
import { compileFleetSystemPrompt, FLEET_COMPILED_PROMPT_PATH } from "./fleet-prompt-compiler.ts";
import {
  AGENT_CREATION_TASK_PATTERN,
  AGENT_MANIFEST_TOP_LEVEL_KEYS,
  type AgentManifest,
  validateAgentManifest,
} from "./manifest.ts";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_PROMPT_INPUT_BYTES = 512 * 1024;

function containsPhysicalPath(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.includes("~");
}

function lifecycleSignal(
  latestActivityAt: string | undefined,
  observedAt: Date,
  staleAfterDays: number,
): FleetLintRepositoryResult["lifecycle"] {
  if (!latestActivityAt) return { signal: "unknown", authorityEffect: "none" };
  const parsed = Date.parse(latestActivityAt);
  if (!Number.isFinite(parsed)) return { signal: "unknown", authorityEffect: "none" };
  const stale = observedAt.getTime() - parsed > staleAfterDays * 24 * 60 * 60 * 1000;
  return {
    signal: stale ? "stale_candidate" : "recent_activity",
    latestActivityAt,
    authorityEffect: "none",
  };
}

async function finalizeRepositorySnapshot(params: {
  snapshot: FleetGitSnapshot;
  revision: FleetLintRepositoryResult["revision"];
  diagnostics: FleetLintDiagnostic[];
  repo: string;
}): Promise<void> {
  try {
    const finished = await params.snapshot.finish();
    if (!finished.stable) {
      params.revision.status = "concurrent_change";
      addFleetDiagnostic(
        params.diagnostics,
        params.repo,
        "revision.concurrent_change",
        "error",
        "repository HEAD or worktree status changed during fleet capture",
      );
    }
  } catch {
    params.revision.status = "invalid";
    addFleetDiagnostic(
      params.diagnostics,
      params.repo,
      "revision.finalize_failed",
      "error",
      "repository endpoint stability could not be verified after bounded capture",
    );
  }
}

export function invalidFleetRepositoryResult(
  root: string,
  manifestPresent: boolean,
  diagnostics: FleetLintDiagnostic[],
): FleetLintRepositoryResult {
  return {
    repo: logicalFleetRepo(root),
    repoName: basename(root),
    revision: { status: "invalid" },
    manifest: { present: manifestPresent },
    prompt: { status: "unverifiable", compilerContract: "ai-society.agent-prompt-compiler/1" },
    template: { mode: "unknown", provenanceStatus: "unbound" },
    lifecycle: { signal: "unknown", authorityEffect: "none" },
    diagnostics,
  };
}

export async function lintFleetRepository(params: {
  root: string;
  manifestPresent: boolean;
  ec: EcProfileSource;
  ecSnapshot?: FleetGitSnapshot;
  observedAt: Date;
  staleAfterDays: number;
}): Promise<FleetLintRepositoryResult> {
  const repo = logicalFleetRepo(params.root);
  const diagnostics: FleetLintDiagnostic[] = [];
  let snapshot: FleetGitSnapshot;
  try {
    snapshot = await captureFleetGitSnapshot(params.root);
  } catch {
    addFleetDiagnostic(
      diagnostics,
      repo,
      "revision.invalid",
      "error",
      "repository Git snapshot could not be captured",
    );
    return invalidFleetRepositoryResult(params.root, params.manifestPresent, diagnostics);
  }

  const revision: FleetLintRepositoryResult["revision"] = {
    commit: snapshot.commit,
    treeOid: snapshot.treeOid,
    status: snapshot.status,
    statusSha256: snapshot.statusSha256,
  };
  if (snapshot.status === "dirty") {
    addFleetDiagnostic(
      diagnostics,
      repo,
      "revision.worktree_dirty",
      "error",
      "runtime worktree differs from the immutable committed snapshot",
    );
  }
  const lifecycle = lifecycleSignal(
    snapshot.latestActivityAt,
    params.observedAt,
    params.staleAfterDays,
  );
  if (lifecycle.signal === "stale_candidate") {
    addFleetDiagnostic(
      diagnostics,
      repo,
      "lifecycle.stale_candidate",
      "warning",
      `no committed diary or learning activity observed within ${params.staleAfterDays} days`,
    );
  } else if (lifecycle.signal === "unknown") {
    addFleetDiagnostic(
      diagnostics,
      repo,
      "lifecycle.activity_unknown",
      "warning",
      "no committed diary or learning activity signal was found; lifecycle remains owner-dispositioned",
    );
  }

  let provenance: Awaited<ReturnType<typeof inspectTemplateProvenance>>;
  try {
    provenance = await inspectTemplateProvenance({ snapshot, repoName: repo });
    diagnostics.push(...provenance.diagnostics);
  } catch {
    provenance = {
      template: { mode: "unknown", provenanceStatus: "invalid" },
      diagnostics: [],
    };
    addFleetDiagnostic(
      diagnostics,
      repo,
      "template.capture_failed",
      "error",
      "template provenance capture failed unexpectedly",
    );
  }

  let manifestFile: CapturedGitFile | undefined;
  let manifestCaptureFailed = false;
  try {
    manifestFile = await snapshot.readFile("agent.json", MAX_MANIFEST_BYTES);
  } catch {
    manifestCaptureFailed = true;
    addFleetDiagnostic(
      diagnostics,
      repo,
      "manifest.capture_failed",
      "error",
      "committed agent.json bytes could not be captured within the lint bound",
      "agent.json",
    );
  }
  if (!manifestFile) {
    if (!manifestCaptureFailed) {
      addFleetDiagnostic(
        diagnostics,
        repo,
        params.manifestPresent ? "manifest.committed_blob_invalid" : "fleet.manifest_missing",
        "error",
        params.manifestPresent
          ? "root agent.json is not one committed non-symlink regular file"
          : "canonical agent repository has no committed root agent.json",
        "agent.json",
        "backfill additively under one exact owner-authorized AK task; preserve persona bytes",
      );
    }
    await finalizeRepositorySnapshot({ snapshot, revision, diagnostics, repo });
    revision.snapshotSha256 = fleetSha256(
      JSON.stringify(
        stableFleetValue({
          commit: snapshot.commit,
          tree: snapshot.treeOid,
          status: snapshot.statusSha256,
        }),
      ),
    );
    return {
      repo,
      repoName: basename(params.root),
      revision,
      manifest: { present: params.manifestPresent },
      prompt: { status: "unverifiable", compilerContract: "ai-society.agent-prompt-compiler/1" },
      template: provenance.template,
      lifecycle,
      diagnostics: sortFleetDiagnostics(diagnostics),
    };
  }

  let rawManifest: Record<string, unknown> | undefined;
  let manifest: AgentManifest | undefined;
  try {
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(manifestFile.bytes),
    );
    rawManifest =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : undefined;
    manifest = validateAgentManifest(parsed, snapshot.root, `${repo}/agent.json`);
  } catch {
    addFleetDiagnostic(
      diagnostics,
      repo,
      "manifest.invalid",
      "error",
      "committed agent.json does not satisfy strict UTF-8 and runtime schema requirements",
      "agent.json",
    );
  }

  if (rawManifest) {
    for (const key of Object.keys(rawManifest)
      .filter((key) => !AGENT_MANIFEST_TOP_LEVEL_KEYS.has(key))
      .sort()) {
      addFleetDiagnostic(
        diagnostics,
        repo,
        "manifest.additive_field_ignored",
        "warning",
        `schema-1 additive field is ignored by runtime normalization (key sha256=${fleetSha256(key)})`,
        "agent.json",
      );
    }
  }
  const nestedFields: Array<[string, ReadonlySet<string>]> = [
    ["skills", new Set(["profile", "extra"])],
    ["defaults", new Set(["model", "thinking"])],
    ["scope", new Set(["repos", "forbidden", "note"])],
  ];
  for (const [section, known] of nestedFields) {
    const value = rawManifest?.[section];
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    for (const key of Object.keys(value as Record<string, unknown>)
      .filter((key) => !known.has(key))
      .sort()) {
      addFleetDiagnostic(
        diagnostics,
        repo,
        "manifest.additive_field_ignored",
        "warning",
        `schema-1 additive field is ignored by runtime normalization (key sha256=${fleetSha256(`${section}.${key}`)})`,
        "agent.json",
      );
    }
  }
  let fleetRole: string | undefined;
  if (manifest) {
    if (manifest.name !== basename(params.root)) {
      addFleetDiagnostic(
        diagnostics,
        repo,
        "manifest.name_repo_mismatch",
        "error",
        `manifest name ${manifest.name} does not match repository ${basename(params.root)}`,
        "agent.json",
      );
    }
    if (!manifest.role) {
      addFleetDiagnostic(
        diagnostics,
        repo,
        "manifest.role_missing",
        "error",
        "manifest has no canonical role binding",
        "agent.json",
      );
    } else if (containsPhysicalPath(manifest.role)) {
      addFleetDiagnostic(
        diagnostics,
        repo,
        "manifest.role_not_reportable",
        "error",
        "manifest role contains a physical-path-shaped value and was omitted from the report",
        "agent.json",
      );
    } else {
      fleetRole = manifest.role;
    }
    if (!manifest.creation_task) {
      addFleetDiagnostic(
        diagnostics,
        repo,
        "manifest.creation_task_missing",
        "error",
        "manifest has no exact AK creation-task provenance",
        "agent.json",
      );
    } else if (!AGENT_CREATION_TASK_PATTERN.test(manifest.creation_task)) {
      addFleetDiagnostic(
        diagnostics,
        repo,
        "manifest.creation_task_invalid",
        "error",
        "creation_task must match AK-<positive integer>",
        "agent.json",
      );
    }
  }

  const profile = manifest
    ? await checkFleetSkills({
        manifest,
        ec: params.ec,
        ecSnapshot: params.ecSnapshot,
        agentSnapshot: snapshot,
        diagnostics,
        repo,
      })
    : undefined;
  let prompt: FleetLintRepositoryResult["prompt"] = {
    status: "unverifiable",
    compilerContract: "ai-society.agent-prompt-compiler/1",
  };
  if (manifest && manifest.system_prompt_file !== FLEET_COMPILED_PROMPT_PATH) {
    addFleetDiagnostic(
      diagnostics,
      repo,
      "manifest.system_prompt_file_noncanonical",
      "error",
      `v2 fleet lint requires ${FLEET_COMPILED_PROMPT_PATH}; runtime declares a noncanonical path`,
      "agent.json",
    );
  } else if (rawManifest) {
    try {
      const compiled = await compileFleetSystemPrompt({
        manifestBytes: manifestFile.bytes,
        readFile: async (path) => (await snapshot.readFile(path, MAX_PROMPT_INPUT_BYTES))?.bytes,
      });
      const actual = await snapshot.readFile(FLEET_COMPILED_PROMPT_PATH, MAX_PROMPT_INPUT_BYTES);
      prompt = {
        status: !actual
          ? "missing"
          : actual.sha256 === compiled.expectedSha256
            ? "current"
            : "stale",
        ...(actual ? { actualSha256: actual.sha256 } : {}),
        expectedSha256: compiled.expectedSha256,
        inputSha256: compiled.inputSha256,
        compilerContract: "ai-society.agent-prompt-compiler/1",
      };
      if (!actual) {
        addFleetDiagnostic(
          diagnostics,
          repo,
          "prompt.compiled_missing",
          "error",
          "compiled system prompt is missing",
          FLEET_COMPILED_PROMPT_PATH,
        );
      } else if (prompt.status === "stale") {
        addFleetDiagnostic(
          diagnostics,
          repo,
          "prompt.compiled_stale",
          "error",
          "compiled system prompt does not match canonical manifest/persona inputs",
          FLEET_COMPILED_PROMPT_PATH,
        );
      }
    } catch {
      addFleetDiagnostic(
        diagnostics,
        repo,
        "prompt.freshness_unproven",
        "error",
        "compiled prompt freshness could not be proven from bounded canonical inputs",
        FLEET_COMPILED_PROMPT_PATH,
      );
    }
  }

  await finalizeRepositorySnapshot({ snapshot, revision, diagnostics, repo });
  revision.snapshotSha256 = fleetSha256(
    JSON.stringify(
      stableFleetValue({
        commit: snapshot.commit,
        treeOid: snapshot.treeOid,
        statusSha256: snapshot.statusSha256,
        manifestSha256: manifestFile.sha256,
        profileSha256: params.ec.rawSha256,
        promptActual: prompt.actualSha256 ?? null,
        promptExpected: prompt.expectedSha256 ?? null,
        templateAnswers: provenance.template.answersSha256 ?? null,
        templateOwnership: provenance.template.ownershipSha256 ?? null,
      }),
    ),
  );
  return {
    repo,
    repoName: basename(params.root),
    revision,
    manifest: {
      present: true,
      ...(manifest ? { schema: manifest.schema, name: manifest.name } : {}),
      ...(fleetRole ? { role: fleetRole } : {}),
      ...(manifest?.creation_task ? { creationTask: manifest.creation_task } : {}),
      blobOid: manifestFile.blobOid,
      sha256: manifestFile.sha256,
    },
    ...(profile ? { profile } : {}),
    prompt,
    template: provenance.template,
    lifecycle,
    diagnostics: sortFleetDiagnostics(diagnostics),
  };
}
