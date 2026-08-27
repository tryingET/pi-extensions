// ---
// summary: agent manifest discovery across roots, fail-closed name indexing, and name -> composed launch resolution.
// read_when:
//   - changing manifest discovery depth, registry roots configuration, or the resolution contract.
// ---

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  type EcProfileSource,
  knownEcProfiles,
  loadEcProfiles,
  materializeSkillDirs,
  planSkillSelection,
} from "./ec-profiles.ts";
import {
  AGENT_MANIFEST_FILENAME,
  type AgentManifest,
  assertAgentExtensionsExist,
  defaultUserSkillsRoot,
  expandAgentActivities,
  globToRegExp,
  loadAgentManifest,
  readAgentSystemPrompt,
  resolveAgentExtensions,
} from "./manifest.ts";

export const AGENT_REGISTRY_ROOTS_ENV = "PI_AGENT_REGISTRY_ROOTS";
const DISCOVERY_SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".cache",
  "dist",
  "build",
]);

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

  const envConfigured = Boolean(process.env[AGENT_REGISTRY_ROOTS_ENV]?.trim());
  const manifestPaths = await discoverAgentManifestPaths(roots, envConfigured);
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
    agents,
    list() {
      return [...agents.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (manifest): AgentListing => ({
            name: manifest.name,
            ...(manifest.display_name ? { display_name: manifest.display_name } : {}),
            ...(manifest.version ? { version: manifest.version } : {}),
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
        tools: manifest.tools.length > 0 ? manifest.tools.join(",") : "read",
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

/**
 * Discover agent.json manifests under the configured roots.
 *
 * Fleet rule: ONE STANDALONE REPO PER AGENT. A root is either
 *   - a glob pattern whose last segment matches agent-repo directory names
 *     (for example `.../core/agent-*`), expanded against its parent dir, or
 *   - an explicit agent-repo directory whose root holds agent.json directly.
 * There is no recursion into children and no nesting: an agent.json is only
 * ever read at an agent-repo root, never inside a product repo.
 */
async function discoverAgentManifestPaths(
  roots: string[],
  envConfigured: boolean,
): Promise<string[]> {
  const paths = new Set<string>();
  for (const root of roots) {
    const leafGlob = /[*?[]/u.test(root);
    const scanDir = leafGlob ? dirname(root) : root;
    const entries = await readdir(scanDir, { withFileTypes: true }).catch(() => undefined);
    if (entries === undefined) {
      if (envConfigured) {
        throw new AgentRegistryError(`configured agent registry root does not exist: ${root}`);
      }
      continue;
    }

    if (!leafGlob) {
      const manifestPath = join(root, AGENT_MANIFEST_FILENAME);
      if (
        await stat(manifestPath)
          .then((s) => s.isFile())
          .catch(() => false)
      ) {
        paths.add(manifestPath);
      }
      continue;
    }

    const leafPattern = globToRegExp(basename(root));
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        DISCOVERY_SKIP_DIRS.has(entry.name) ||
        !leafPattern.test(entry.name)
      ) {
        continue;
      }
      const manifestPath = join(scanDir, entry.name, AGENT_MANIFEST_FILENAME);
      if (
        await stat(manifestPath)
          .then((s) => s.isFile())
          .catch(() => false)
      ) {
        paths.add(manifestPath);
      }
    }
  }
  return [...paths].sort();
}
