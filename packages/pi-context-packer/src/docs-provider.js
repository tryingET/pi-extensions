import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  hasControlCharacter,
  repoRelativePathSafetyIssue,
  subprocessFailureDetail,
} from "./context-intake-safety.js";

const execFileAsync = promisify(execFile);
const DOCS_LIST_MAX_BUFFER = 64_000;
const DOCS_LIST_TIMEOUT_MS = 8_000;
const DEFAULT_TOP = 8;

const candidateScripts = (env = {}) =>
  [
    env.docsListScript,
    env.PI_CONTEXT_PACKER_DOCS_LIST,
    process.env.PI_CONTEXT_PACKER_DOCS_LIST,
    process.env.HOME
      ? join(process.env.HOME, "ai-society/core/agent-scripts/scripts/docs-list.mjs")
      : undefined,
  ].filter(Boolean);

const firstExistingScript = async (env = {}) => {
  for (const candidate of candidateScripts(env)) {
    try {
      const candidateStat = await stat(candidate);
      if (candidateStat.isFile()) return candidate;
    } catch {
      // Try the next configured candidate.
    }
  }
  return undefined;
};

const normalizeOutputPaths = (stdout) => {
  const paths = [];
  const omissions = [];
  const lines = stdout
    .split(/\r?\n/u)
    .filter(
      (line) =>
        line.trim() && !line.trim().startsWith("Docs ") && !line.trim().startsWith("Showing "),
    );

  for (const rawLine of lines) {
    const candidate = rawLine.trim();
    const mentionsMarkdownPath = candidate.toLowerCase().includes(".md");
    if (!mentionsMarkdownPath) continue;

    const issue =
      hasControlCharacter(rawLine) || rawLine !== candidate
        ? "docs-list path contains control characters or surrounding whitespace"
        : repoRelativePathSafetyIssue(candidate, "docs-list path") ||
          (!/\.md$/iu.test(candidate) ? "docs-list path is not a Markdown file path" : undefined);
    if (issue) {
      omissions.push({
        provider: "docs",
        reason: "unsafe_path",
        detail: `docs-list output omitted: ${issue}`,
      });
    } else {
      paths.push(candidate);
    }
  }
  return { paths, omissions };
};

export const discoverDocsSeeds = async ({ repoRoot, objective, env = {}, top = DEFAULT_TOP }) => {
  const script = await firstExistingScript(env);
  if (!script) {
    return {
      seeds: [],
      omissions: [
        {
          provider: "docs",
          reason: "unavailable",
          detail: "docs-list script unavailable; only caller-seeded Markdown docs can be used",
        },
      ],
    };
  }

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        script,
        "--docs",
        repoRoot,
        "--task",
        objective,
        "--top",
        String(top),
        "--paths-only",
        "--repo-relative",
      ],
      { cwd: repoRoot, timeout: DOCS_LIST_TIMEOUT_MS, maxBuffer: DOCS_LIST_MAX_BUFFER },
    );
    const discovered = normalizeOutputPaths(stdout);
    const seeds = discovered.paths.map((value) => ({
      kind: "path",
      value,
      note: "docs-list ranked Markdown context",
    }));
    return { seeds, omissions: discovered.omissions };
  } catch (error) {
    return {
      seeds: [],
      omissions: [
        {
          provider: "docs",
          reason: "unavailable",
          detail: subprocessFailureDetail("docs-list", error, "discovery"),
        },
      ],
    };
  }
};
