// summary: compare cached, freshly parsed, committed and worktree persona inputs without altering Phase 2.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonString } from "./dispatch-receipt.ts";
import { knownEcProfiles } from "./ec-profiles.ts";
import type { FleetGitSnapshot } from "./fleet-git-snapshot.ts";
import {
  type AgentManifest,
  loadAgentManifest,
  readAgentSystemPrompt,
  validateAgentManifest,
} from "./manifest.ts";
import { type AgentRegistry, type ResolvedAgentLaunch, renderScopeSection } from "./registry.ts";

export async function verifyVisibleLaunchInputs(
  manifest: AgentManifest,
  registry: AgentRegistry,
  snapshot: FleetGitSnapshot,
  launch?: ResolvedAgentLaunch,
): Promise<boolean> {
  try {
    const committed = await snapshot.readFile("agent.json", 64 * 1024);
    const persona = await snapshot.readFile(manifest.system_prompt_file, 512 * 1024);
    if (!committed || !persona) return false;
    const options = { ecProfiles: knownEcProfiles(registry.ec) };
    const parsed = validateAgentManifest(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(committed.bytes)),
      snapshot.root,
      join(snapshot.root, "agent.json"),
      options,
    );
    const fresh = await loadAgentManifest(snapshot.root, options);
    const normalized = canonicalJsonString(parsed);
    if (
      normalized !== canonicalJsonString(manifest) ||
      normalized !== canonicalJsonString(fresh) ||
      normalized !== canonicalJsonString(registry.get(manifest.name))
    )
      return false;
    if (!(await readFile(parsed.manifestPath)).equals(committed.bytes)) return false;
    const prompt = await readAgentSystemPrompt(parsed);
    if (!Buffer.from(prompt, "utf8").equals(persona.bytes)) return false;
    const scope = renderScopeSection(parsed);
    const composed = scope ? `${prompt.replace(/\s+$/u, "")}\n\n---\n\n${scope}` : prompt;
    return (
      !launch ||
      (launch.systemPrompt === composed &&
        launch.name === parsed.name &&
        launch.tools === parsed.tools.join(",") &&
        launch.model === parsed.defaults.model &&
        launch.thinking === parsed.defaults.thinking &&
        launch.extensions.length === 0)
    );
  } catch {
    return false;
  }
}
