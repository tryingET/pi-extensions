// ---
// summary: immutable engineering-core profile and extra-skill binding diagnostics for fleet lint.
// read_when:
//   - changing fleet profile conformance, profile-member capture, or committed extra-skill binding.
// ---

import type { EcProfileSource } from "./ec-profiles.ts";
import type { CapturedGitFile, FleetGitSnapshot } from "./fleet-git-snapshot.ts";
import type { FleetLintDiagnostic, FleetLintRepositoryResult } from "./fleet-lint-types.ts";
import { addFleetDiagnostic } from "./fleet-lint-utils.ts";
import type { AgentManifest } from "./manifest.ts";

const MAX_SKILL_INPUT_BYTES = 512 * 1024;

export async function checkFleetSkills(params: {
  manifest: AgentManifest;
  ec: EcProfileSource;
  ecSnapshot?: FleetGitSnapshot;
  agentSnapshot: FleetGitSnapshot;
  diagnostics: FleetLintDiagnostic[];
  repo: string;
}): Promise<FleetLintRepositoryResult["profile"]> {
  const requested = params.manifest.skills?.profile;
  let resolved: string | undefined;
  let status: NonNullable<FleetLintRepositoryResult["profile"]>["status"] = "none";
  let members: string[] = [];
  if (!requested) {
    addFleetDiagnostic(
      params.diagnostics,
      params.repo,
      "profile.missing",
      "error",
      "fleet lint requires one non-empty engineering-core skills.profile",
      "agent.json",
      "runtime may inspect a profile-less legacy manifest; current fleet conformance may not",
    );
  }
  if (requested) {
    resolved = params.ec.deprecatedAliases.get(requested) ?? requested;
    members = params.ec.profiles.get(resolved) ?? [];
    if (params.ec.profiles.has(requested)) status = "canonical";
    else if (params.ec.deprecatedAliases.has(requested)) {
      status = "deprecated_alias";
      addFleetDiagnostic(
        params.diagnostics,
        params.repo,
        "profile.deprecated_alias",
        "warning",
        `profile ${requested} is a deprecated alias for ${resolved}`,
        "agent.json",
      );
    } else {
      status = "unknown";
      addFleetDiagnostic(
        params.diagnostics,
        params.repo,
        "profile.unknown",
        "error",
        "manifest references an unknown engineering-core profile",
        "agent.json",
      );
    }
  }

  for (const skill of members) {
    const path = `skills/${skill}/SKILL.md`;
    let captured: CapturedGitFile | undefined;
    try {
      captured = params.ecSnapshot
        ? await params.ecSnapshot.readFile(path, MAX_SKILL_INPUT_BYTES)
        : undefined;
    } catch {
      addFleetDiagnostic(
        params.diagnostics,
        params.repo,
        "profile.member_capture_failed",
        "error",
        "a committed profile member could not be captured within the lint bound",
        path,
      );
      continue;
    }
    if (!captured) {
      addFleetDiagnostic(
        params.diagnostics,
        params.repo,
        "profile.member_missing",
        "error",
        `profile ${requested} references missing committed skill ${skill}`,
        path,
      );
    }
  }
  for (const skill of params.manifest.skills?.extra ?? []) {
    const agentPath = `.pi/skills/${skill}/SKILL.md`;
    const ecPath = `skills/${skill}/SKILL.md`;
    let bound: CapturedGitFile | undefined;
    try {
      bound =
        (await params.agentSnapshot.readFile(agentPath, MAX_SKILL_INPUT_BYTES)) ??
        (params.ecSnapshot
          ? await params.ecSnapshot.readFile(ecPath, MAX_SKILL_INPUT_BYTES)
          : undefined);
    } catch {
      addFleetDiagnostic(
        params.diagnostics,
        params.repo,
        "skill.extra_capture_failed",
        "error",
        "a committed extra-skill source could not be captured within the lint bound",
        "agent.json",
      );
      continue;
    }
    if (!bound) {
      addFleetDiagnostic(
        params.diagnostics,
        params.repo,
        "skill.extra_revision_unbound",
        "error",
        `extra skill ${skill} is not bound in the committed agent or engineering-core snapshot`,
        "agent.json",
      );
    }
  }
  return {
    ...(requested && status !== "unknown" ? { requested } : {}),
    ...(resolved && status !== "unknown" ? { resolved } : {}),
    status,
  };
}
