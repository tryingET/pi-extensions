import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { createExtensionRuntime, type ResourceLoader } from "@earendil-works/pi-coding-agent";
import { commonGit } from "./classify.js";
import { bytesDigest, digest, refuse } from "./json.js";
export interface LiteralFile {
  path: string;
  content: string;
  sha256: string;
}
export interface Resources {
  context: LiteralFile[];
  system: LiteralFile | null;
  append: LiteralFile | null;
  explicit: LiteralFile[];
  digest: string;
}
const names = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
function readLiteral(path: string): LiteralFile {
  const s = lstatSync(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) refuse("resource_invalid");
  const bytes = readFileSync(path);
  const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (content.charCodeAt(0) === 0xfeff || content.includes("\0"))
    refuse("resource_decoding_ambiguous");
  return { path, content, sha256: bytesDigest(bytes) };
}
function select(dir: string, candidates = names): LiteralFile | null {
  for (const name of candidates) {
    const path = join(dir, name);
    try {
      lstatSync(path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw e;
    }
    return readLiteral(path);
  }
  return null;
}
/** No DefaultResourceLoader, package manager, executable factories or implicit skills. */
export function captureResources(
  cwd: string,
  agentDir: string,
  explicitPaths: string[] = [],
): Resources {
  if (realpathSync(cwd) !== cwd || realpathSync(agentDir) !== agentDir)
    refuse("resource_path_alias");
  const context: LiteralFile[] = [];
  const global = select(agentDir);
  if (global) context.push(global);
  const ancestors: string[] = [];
  for (let p = cwd; ; p = dirname(p)) {
    ancestors.unshift(p);
    if (dirname(p) === p) break;
  }
  // Match pinned 0.84.4 nested linked-worktree same-scope shadowing (not arbitrary projection).
  let shadow: string | undefined;
  for (let p = cwd; ; p = dirname(p)) {
    if (existsSync(join(p, ".git"))) {
      const common = commonGit(p);
      const main = dirname(common);
      const leaf = select(p);
      if (p.startsWith(main + sep) && common === join(main, ".git") && leaf)
        shadow = join(main, leaf.path.slice(p.length + 1));
      break;
    }
    if (dirname(p) === p) break;
  }
  for (const dir of ancestors) {
    const f = select(dir);
    if (f && f.path !== shadow && !context.some((c) => c.path === f.path)) context.push(f);
  }
  const system = select(join(cwd, ".pi"), ["SYSTEM.md"]) ?? select(agentDir, ["SYSTEM.md"]);
  const append =
    select(join(cwd, ".pi"), ["APPEND_SYSTEM.md"]) ?? select(agentDir, ["APPEND_SYSTEM.md"]);
  const explicit = explicitPaths.map(readLiteral);
  const fields = { context, system, append, explicit };
  if (Buffer.byteLength(JSON.stringify(fields)) > 524288) refuse("resource_budget_exceeded");
  return { ...fields, digest: digest(fields) };
}
export function literalLoader(snapshot: Resources): ResourceLoader {
  const r = structuredClone(snapshot);
  if (
    digest({ context: r.context, system: r.system, append: r.append, explicit: r.explicit }) !==
    r.digest
  )
    refuse("resources_digest_mismatch");
  const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
  return Object.freeze({
    getExtensions: () => extensions,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({
      agentsFiles: [...r.context, ...r.explicit].map(({ path, content }) => ({ path, content })),
    }),
    getSystemPrompt: () => r.system?.content,
    getSystemPromptSource: () => (r.system ? { path: r.system.path } : undefined),
    getAppendSystemPrompt: () => (r.append ? [r.append.content] : []),
    getAppendSystemPromptSources: () => (r.append ? [{ path: r.append.path }] : []),
    extendResources: () => refuse("resources_sealed"),
    reload: async () => refuse("resources_sealed"),
  });
}
