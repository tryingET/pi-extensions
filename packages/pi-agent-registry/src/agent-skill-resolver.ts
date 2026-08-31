// ---
// summary: registry-owned ExtraSkillProfileResolver mapping standing-agent names onto materialized skill selections.
// read_when:
//   - changing how ASC resolves pi-agent-registry agent names as skill profiles.
// ---

import type { ExtraSkillProfileResolver } from "@tryinget/pi-autonomous-session-control/execution";
import { materializeSkillDirs, planSkillSelection } from "./ec-profiles.ts";
import type { AgentRegistry } from "./registry.ts";

export const AGENT_SKILL_REGISTRY_LABEL = "pi-agent-registry" as const;

/**
 * Fleet Phase-2 skill seam: the registry resolves its own agent names for the
 * ASC runtime's extraSkillProfileResolver hook. ASC consults this only after
 * its built-in skill-librarian registry misses, and ASC owns cleanup of the
 * materialized selection once the dispatched child settles.
 *
 * Returning undefined declines the profile so ASC fails closed with its own
 * diagnostics; SubagentSkillSelectionError marks registry-owned fail-closed
 * paths (unknown extra skill, unknown EC profile, filesystem failure).
 */
export function createAgentSkillProfileResolver(
  registry: AgentRegistry,
): ExtraSkillProfileResolver {
  return async (profile) => {
    const manifest = registry.get(profile);
    if (!manifest) {
      return undefined;
    }
    const selection = planSkillSelection({
      ...(manifest.skills?.profile !== undefined ? { profile: manifest.skills.profile } : {}),
      ...(manifest.skills?.extra ? { extra: manifest.skills.extra } : {}),
      ec: registry.ec,
      manifestRoot: manifest.root,
      userSkillsRoot: registry.userSkillsRoot,
    });
    const materialized = await materializeSkillDirs(selection, manifest.name);
    return {
      noSkills: true,
      skillSources: [materialized.dir],
      skillProfile: manifest.name,
      loadedSkills: materialized.skills,
      librarySkills: [],
      skillWarnings: [],
      skillRegistry: AGENT_SKILL_REGISTRY_LABEL,
      cleanup: materialized.cleanup,
    };
  };
}
