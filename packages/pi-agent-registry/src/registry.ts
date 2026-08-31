// ---
// summary: agent manifest discovery across roots, fail-closed name indexing, and name -> composed launch resolution.
// read_when:
//   - changing manifest discovery depth, registry roots configuration, or the resolution contract.
// ---

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  type EcProfileSource,
  knownEcProfiles,
  loadEcProfiles,
  materializeSkillDirs,
  planSkillSelection,
} from "./ec-profiles.ts";
import {
  type AgentManifest,
  assertAgentExtensionsExist,
  defaultUserSkillsRoot,
  expandAgentActivities,
  loadAgentManifest,
  readAgentSystemPrompt,
  resolveAgentExtensions,
} from "./manifest.ts";
import { discoverAgentManifestPaths } from "./registry-discovery.ts";

export const AGENT_REGISTRY_ROOTS_ENV = "PI_AGENT_REGISTRY_ROOTS";
export class AgentRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRegistryError";
  }
}

export interface AgentRegistryOptions {
  /** Discovery roots (agent-repo patterns or explicit dirs; default: fleet patterns / PI_AGENT_REGISTRY_ROOTS). */
  roots?: string[];
  /** Explicit engineering-core profiles source (default: resolved from env or home). */
  ec?: EcProfileSource;
  /** Overrides the user-level skills root for `skills.extra` resolution. */
  userSkillsRoot?: string;
}

export interface AgentListing {
  name: string;
  display_name?: string;
  version?: string;
  role?: string;
  creation_task?: string;
  tools: string[];
  skills: { profile?: string; extra?: string[] };
  extensions: string[];
  defaults: { model: string | null; thinking: string };
  activities: string[];
  manifestPath: string;
}

export interface ResolvedAgentLaunch {
  name: string;
  /** Composed system prompt: system_prompt_file contents + rendered advisory scope. */
  role?: string;
  creation_task?: string;
  systemPrompt: string;
  /** Comma-separated tool allowlist for the ASC custom profile (read-only default: read). */
  tools: string;
  thinking: string;
  /** null = inherit parent session model. */
  model: string | null;
  /** Resolved child extension allowlist entries. */
  extensions: string[];
  /** Materialized child skill dirs (empty when the agent declares no skills). */
  skillDirs: string[];
  /** Skill names materialized into skillDirs. */
  loadedSkills: string[];
  /** Declared activity template paths (relative to the agent repo root, globs expanded). */
  activities: string[];
  /** Advisory repo scope rendered into the system prompt. */
  scopeRepos: string[];
  /** Advisory forbidden paths rendered into the system prompt. */
  scopeForbidden: string[];
  /** Operator scope note rendered into the system prompt. */
  scopeNote?: string;
  /** Removes materialized skill dirs; ASC owns cleanup once dispatched. */
  cleanup: () => Promise<void>;
}

export interface AgentRegistry {
  /** Configured discovery roots (agent-repo patterns or explicit dirs). */
  roots: string[];
  ec: EcProfileSource;
  /** Configured user-level skills root used for `skills.extra` resolution. */
  userSkillsRoot: string;
  agents: Map<string, AgentManifest>;
  list(): AgentListing[];
  get(name: string): AgentManifest | undefined;
  resolve(name: string): Promise<ResolvedAgentLaunch>;
}

/**
 * Fleet layout: ONE STANDALONE REPO PER AGENT. The canonical fleet home is
 * the workspace-level `~/ai-society/agents/agent-*` directory (conventions
 * owner: softwareco-agents/docs/agent-registry.md). Company/lane agent homes
 * may exist later as forward-compatible extras; PI_AGENT_REGISTRY_ROOTS
 * overrides discovery entirely. No nesting inside product repos ever —
 * an agent.json is only read at an agent-repo root.
 */
const DEFAULT_AGENT_REPO_PATTERNS: readonly string[] = [
  "~/ai-society/agents/agent-*",
  "~/ai-society/core/agent-*",
  "~/ai-society/holdingco/agent-*",
  "~/ai-society/teachingco/agent-*",
  "~/ai-society/healthco/agent-*",
  "~/ai-society/softwareco/owned/agent-*",
  "~/ai-society/softwareco/infra/agent-*",
  "~/ai-society/softwareco/contrib/agent-*",
  "~/ai-society/softwareco/agents/agent-*",
  "~/ai-society/softwareco/fork/agent-*",
];

export function expandTildePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return resolve(value);
}

/** Discovery roots: PI_AGENT_REGISTRY_ROOTS (colon-separated patterns) or the fleet defaults. */
export function defaultRegistryRoots(): string[] {
  const raw = process.env[AGENT_REGISTRY_ROOTS_ENV]?.trim();
  if (raw) {
    return raw
      .split(":")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map(expandTildePath);
  }
  return DEFAULT_AGENT_REPO_PATTERNS.map(expandTildePath);
}

export async function createAgentRegistry(options?: AgentRegistryOptions): Promise<AgentRegistry> {
  const roots = options?.roots ?? defaultRegistryRoots();
  const ec = options?.ec ?? (await loadEcProfiles());
  const userSkillsRoot = options?.userSkillsRoot ?? defaultUserSkillsRoot();

  const envConfigured =
    options?.roots !== undefined || Boolean(process.env[AGENT_REGISTRY_ROOTS_ENV]?.trim());
  const manifestPaths = await discoverAgentManifestPaths(roots, envConfigured).catch((error) => {
    throw new AgentRegistryError(error instanceof Error ? error.message : String(error));
  });
  const agents = new Map<string, AgentManifest>();
  for (const manifestPath of manifestPaths) {
    const manifest = await loadAgentManifest(dirname(manifestPath), {
      ecProfiles: knownEcProfiles(ec),
    });
    const existing = agents.get(manifest.name);
    if (existing) {
      throw new AgentRegistryError(
        `duplicate agent name "${manifest.name}" declared by both ${existing.manifestPath} and ${manifest.manifestPath}`,
      );
    }
    agents.set(manifest.name, manifest);
  }

  return {
    roots,
    ec,
    userSkillsRoot,
    agents,
    list() {
      return [...agents.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (manifest): AgentListing => ({
            name: manifest.name,
            ...(manifest.display_name ? { display_name: manifest.display_name } : {}),
            ...(manifest.version ? { version: manifest.version } : {}),
            ...(manifest.role ? { role: manifest.role } : {}),
            ...(manifest.creation_task ? { creation_task: manifest.creation_task } : {}),
            tools: [...manifest.tools],
            skills: manifest.skills
              ? {
                  ...(manifest.skills.profile ? { profile: manifest.skills.profile } : {}),
                  ...(manifest.skills.extra ? { extra: [...manifest.skills.extra] } : {}),
                }
              : {},
            extensions: resolveAgentExtensions(manifest),
            defaults: { ...manifest.defaults },
            activities: [...manifest.activities],
            manifestPath: manifest.manifestPath,
          }),
        );
    },
    get(name: string) {
      return agents.get(name);
    },
    async resolve(name: string): Promise<ResolvedAgentLaunch> {
      const manifest = agents.get(name);
      if (!manifest) {
        throw new AgentRegistryError(
          `unknown agent: ${name} (registered: ${[...agents.keys()].sort().join(", ") || "none"})`,
        );
      }

      const [systemPromptContents, expandedActivities] = await Promise.all([
        readAgentSystemPrompt(manifest),
        expandAgentActivities(manifest),
        assertAgentExtensionsExist(manifest),
      ]);

      let skillDirs: string[] = [];
      let loadedSkills: string[] = [];
      let cleanup: () => Promise<void> = async () => {};
      if (manifest.skills?.profile !== undefined || (manifest.skills?.extra?.length ?? 0) > 0) {
        const selection = planSkillSelection({
          ...(manifest.skills?.profile !== undefined ? { profile: manifest.skills.profile } : {}),
          ...(manifest.skills?.extra ? { extra: manifest.skills.extra } : {}),
          ec,
          manifestRoot: manifest.root,
          userSkillsRoot,
        });
        const materialized = await materializeSkillDirs(selection, manifest.name);
        skillDirs = [materialized.dir];
        loadedSkills = materialized.skills;
        cleanup = materialized.cleanup;
      }

      const scopeSection = renderScopeSection(manifest);
      const systemPrompt = scopeSection
        ? `${systemPromptContents.replace(/\s+$/u, "")}\n\n---\n\n${scopeSection}`
        : systemPromptContents;

      return {
        name: manifest.name,
        systemPrompt,
        ...(manifest.role ? { role: manifest.role } : {}),
        ...(manifest.creation_task ? { creation_task: manifest.creation_task } : {}),
        tools: manifest.tools.join(","),
        thinking: manifest.defaults.thinking,
        model: manifest.defaults.model,
        extensions: resolveAgentExtensions(manifest),
        skillDirs,
        loadedSkills,
        activities: expandedActivities,
        scopeRepos: [...(manifest.scope?.repos ?? [])],
        scopeForbidden: [...(manifest.scope?.forbidden ?? [])],
        ...(manifest.scope?.note ? { scopeNote: manifest.scope.note } : {}),
        cleanup,
      };
    },
  };
}

/** Render the advisory operating-territory section appended to the system prompt. */
export function renderScopeSection(manifest: AgentManifest): string {
  const repos = manifest.scope?.repos ?? [];
  const forbidden = manifest.scope?.forbidden ?? [];
  const note = manifest.scope?.note;
  if (repos.length === 0 && forbidden.length === 0 && !note) {
    return "";
  }
  const lines: string[] = ["## Operating territory (advisory scope)", ""];
  if (note) {
    lines.push(note, "");
  }
  if (repos.length > 0) {
    lines.push("Repository scope (advisory, not a sandbox):");
    for (const repo of repos) {
      lines.push(`- ${repo}`);
    }
  }
  if (forbidden.length > 0) {
    if (repos.length > 0) {
      lines.push("");
    }
    lines.push("Forbidden paths:");
    for (const entry of forbidden) {
      lines.push(`- ${entry}`);
    }
  }
  return lines.join("\n");
}
