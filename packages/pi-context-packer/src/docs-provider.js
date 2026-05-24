import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  hasControlCharacter,
  repoRelativePathSafetyIssue,
  subprocessFailureDetail,
} from "./context-intake-safety.js";

const execFileAsync = promisify(execFile);
const DOCS_LIST_MAX_BUFFER = 512_000;
const DOCS_LIST_TIMEOUT_MS = 8_000;
const DEFAULT_TOP = 8;
const DISCOVERY_ROOT_MARKERS = ["package.json", "AGENTS.md", "README.md", "docs"];

const isInside = (root, candidate) => {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${sep}`)
  );
};

const hasDiscoveryRootMarker = async (candidate) => {
  for (const marker of DISCOVERY_ROOT_MARKERS) {
    try {
      const markerStat = await stat(join(candidate, marker));
      if (markerStat.isFile() || markerStat.isDirectory()) return true;
    } catch {
      // Try the next marker.
    }
  }
  return false;
};

const docsDiscoveryRoot = async ({ repoRoot, cwd }) => {
  const root = resolve(repoRoot);
  let candidate = cwd ? resolve(cwd) : root;
  if (!isInside(root, candidate) || relative(root, candidate) === "") return root;

  while (isInside(root, candidate) && candidate !== root) {
    if (await hasDiscoveryRootMarker(candidate)) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return root;
};

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

const normalizeCandidatePaths = (rawCandidates) => {
  const paths = [];
  const omissions = [];

  for (const rawValue of rawCandidates) {
    if (typeof rawValue !== "string") continue;
    const candidate = rawValue.trim();
    const mentionsMarkdownPath = candidate.toLowerCase().includes(".md");
    if (!mentionsMarkdownPath) continue;

    const issue =
      hasControlCharacter(rawValue) || rawValue !== candidate
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

const normalizeTextOutputPaths = (stdout) => {
  const lines = stdout
    .split(/\r?\n/u)
    .filter(
      (line) =>
        line.trim() && !line.trim().startsWith("Docs ") && !line.trim().startsWith("Showing "),
    );
  return normalizeCandidatePaths(lines);
};

const normalizeJsonOutputPaths = (stdout) => {
  try {
    const payload = JSON.parse(stdout);
    const preferredItems =
      Array.isArray(payload?.rankedItems) && payload.rankedItems.length
        ? payload.rankedItems
        : payload?.items;
    if (!Array.isArray(preferredItems)) return undefined;
    return normalizeCandidatePaths(
      preferredItems.map((item) => item?.repoPath ?? item?.path).filter(Boolean),
    );
  } catch {
    return undefined;
  }
};

export const discoverDocsSeeds = async ({
  repoRoot,
  cwd,
  objective,
  env = {},
  top = DEFAULT_TOP,
}) => {
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

  const docsRoot = await docsDiscoveryRoot({ repoRoot, cwd });

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        script,
        "--docs",
        docsRoot,
        "--task",
        objective,
        "--top",
        String(top),
        "--paths-only",
        "--repo-relative",
        "--json",
      ],
      { cwd: docsRoot, timeout: DOCS_LIST_TIMEOUT_MS, maxBuffer: DOCS_LIST_MAX_BUFFER },
    );
    const discovered = normalizeJsonOutputPaths(stdout) ?? normalizeTextOutputPaths(stdout);
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
