import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

const toPosixPath = (value) => value.split(sep).join("/");

const hasMarker = async (candidate, marker) => {
  try {
    const markerStat = await stat(join(candidate, marker));
    return markerStat.isFile() || markerStat.isDirectory();
  } catch {
    return false;
  }
};

const hasDiscoveryRootMarker = async (candidate) => {
  for (const marker of DISCOVERY_ROOT_MARKERS) {
    if (await hasMarker(candidate, marker)) return true;
  }
  return false;
};

const FIXTURE_ROOT_PARTS = new Set(["__fixtures__", "fixture", "fixtures", "sample", "samples"]);

const hasFixtureContainerPart = (outerRoot, innerRoot) => {
  const parts = relative(outerRoot, innerRoot).split(sep);
  return parts.slice(0, -1).some((part) => FIXTURE_ROOT_PARTS.has(part));
};

const docsDiscoveryRoot = async ({ repoRoot, cwd }) => {
  const root = resolve(repoRoot);
  let candidate = cwd ? resolve(cwd) : root;
  if (!isInside(root, candidate) || relative(root, candidate) === "") {
    return { root, omissions: [] };
  }

  const markedAncestors = [];
  while (isInside(root, candidate) && candidate !== root) {
    if (await hasDiscoveryRootMarker(candidate)) markedAncestors.push(candidate);
    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }

  const packageAncestors = [];
  for (const ancestor of markedAncestors) {
    if (await hasMarker(ancestor, "package.json")) packageAncestors.push(ancestor);
  }
  if (packageAncestors.length === 1 && hasFixtureContainerPart(root, packageAncestors[0])) {
    return {
      root,
      omissions: [
        {
          provider: "docs",
          reason: "ambiguous_root",
          detail:
            "nested fixture or sample package.json docs discovery root found inside the repo package root; using the repo package root to avoid silently narrowing docs-list coverage",
        },
      ],
    };
  }

  if (packageAncestors.length > 1) {
    const nearestPackageRoot = packageAncestors[0];
    const outerPackageRoot = packageAncestors.at(-1);
    const useOuterFixtureRoot = hasFixtureContainerPart(outerPackageRoot, nearestPackageRoot);
    return {
      root: useOuterFixtureRoot ? outerPackageRoot : nearestPackageRoot,
      omissions: [
        {
          provider: "docs",
          reason: "ambiguous_root",
          detail: useOuterFixtureRoot
            ? "multiple nested package.json docs discovery roots found; using the outermost package ancestor to avoid silently narrowing docs-list coverage to a fixture or sample package"
            : "multiple nested package.json docs discovery roots found; using the nearest package ancestor and surfacing ambiguity for review",
        },
      ],
    };
  }

  for (const marker of DISCOVERY_ROOT_MARKERS) {
    for (const ancestor of markedAncestors) {
      if (await hasMarker(ancestor, marker)) return { root: ancestor, omissions: [] };
    }
  }

  return { root: markedAncestors[0] ?? root, omissions: [] };
};

const customDocsListOverrideAllowed = (env = {}) =>
  env.allowCustomDocsListScript === true ||
  /^(1|true|yes)$/iu.test(process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST ?? "");

const candidateScripts = (env = {}) =>
  [
    env.docsListScript,
    env.PI_CONTEXT_PACKER_DOCS_LIST,
    ...(customDocsListOverrideAllowed(env)
      ? [process.env.PI_CONTEXT_PACKER_DOCS_LIST, process.env.DOCS_LIST_SCRIPT]
      : []),
    process.env.HOME
      ? join(process.env.HOME, "ai-society/core/agent-scripts/scripts/docs-list.mjs")
      : undefined,
  ].filter(Boolean);

const firstExistingScript = async (env = {}) => {
  const baseCwd = resolve(env.cwd || process.cwd());
  for (const candidate of candidateScripts(env)) {
    try {
      const scriptPath = isAbsolute(candidate) ? candidate : resolve(baseCwd, candidate);
      const candidateStat = await stat(scriptPath);
      if (candidateStat.isFile()) return scriptPath;
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
    if (!candidate) {
      omissions.push({
        provider: "docs",
        reason: "unsafe_path",
        detail: "docs-list output omitted: docs-list path is empty",
      });
      continue;
    }
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

const rebaseProviderPath = (rawPath, { repoRoot, providerRoot }) => {
  if (hasControlCharacter(rawPath) || rawPath !== rawPath.trim()) return rawPath;
  const root = resolve(repoRoot);
  const sourceRoot = resolve(providerRoot);
  if (sourceRoot === root) return rawPath;
  if (repoRelativePathSafetyIssue(rawPath, "docs-list path")) return rawPath;
  const sourceRootRelative = toPosixPath(relative(root, sourceRoot));
  if (
    sourceRootRelative &&
    (rawPath === sourceRootRelative || rawPath.startsWith(`${sourceRootRelative}/`))
  ) {
    return rawPath;
  }
  const rebased = toPosixPath(relative(root, resolve(sourceRoot, rawPath)));
  return rebased || rawPath;
};

const jsonPayloadRepoRootIssue = (value, { repoRoot }) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) return "docs-list JSON repoRoot was not a string";
  if (hasControlCharacter(value) || value !== value.trim()) {
    return "docs-list JSON repoRoot contained control characters or surrounding whitespace";
  }
  if (!isAbsolute(value)) return "docs-list JSON repoRoot was not absolute";
  const root = resolve(repoRoot);
  const payloadRoot = resolve(value);
  if (payloadRoot !== root && !isInside(root, payloadRoot)) {
    return "docs-list JSON repoRoot was outside the caller repoRoot";
  }
  return undefined;
};

const jsonItemPath = (item, { repoRoot, docsRoot, payloadRepoRoot }) => {
  if (typeof item?.repoPath === "string") {
    const payloadRoot = typeof payloadRepoRoot === "string" ? resolve(payloadRepoRoot) : undefined;
    if (payloadRoot && isInside(repoRoot, payloadRoot)) {
      return rebaseProviderPath(item.repoPath, { repoRoot, providerRoot: payloadRoot });
    }
    return item.repoPath;
  }
  if (typeof item?.path === "string") {
    return rebaseProviderPath(item.path, { repoRoot, providerRoot: docsRoot });
  }
  return undefined;
};

const normalizeJsonOutputPaths = (stdout, { repoRoot, docsRoot }) => {
  try {
    const payload = JSON.parse(stdout);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {
        paths: [],
        omissions: [
          {
            provider: "docs",
            reason: "schema_mismatch",
            detail: "docs-list JSON output was not an object; raw provider output omitted",
          },
        ],
        suppressNoResults: true,
      };
    }
    if (payload.ok === false) {
      return {
        paths: [],
        omissions: [
          {
            provider: "docs",
            reason: "unavailable",
            detail: "docs-list JSON output reported ok=false; raw provider error output omitted",
          },
        ],
        suppressNoResults: true,
      };
    }
    const repoRootIssue = jsonPayloadRepoRootIssue(payload.repoRoot, { repoRoot });
    if (repoRootIssue) {
      return {
        paths: [],
        omissions: [
          {
            provider: "docs",
            reason: "schema_mismatch",
            detail: `${repoRootIssue}; raw provider output omitted`,
          },
        ],
        suppressNoResults: true,
      };
    }
    const preferredItems = Object.hasOwn(payload, "rankedItems")
      ? payload.rankedItems
      : payload.items;
    if (!Array.isArray(preferredItems)) {
      return {
        paths: [],
        omissions: [
          {
            provider: "docs",
            reason: "schema_mismatch",
            detail:
              "docs-list JSON output did not include rankedItems or items arrays; raw provider output omitted",
          },
        ],
        suppressNoResults: true,
      };
    }
    const rawCandidatePaths = preferredItems.map((item) =>
      jsonItemPath(item, { repoRoot, docsRoot, payloadRepoRoot: payload.repoRoot }),
    );
    const unsupportedItemCount = rawCandidatePaths.filter((value) => value === undefined).length;
    const normalized = normalizeCandidatePaths(
      rawCandidatePaths.filter((value) => value !== undefined),
    );
    if (preferredItems.length > 0 && unsupportedItemCount === preferredItems.length) {
      return {
        paths: [],
        omissions: [
          {
            provider: "docs",
            reason: "schema_mismatch",
            detail:
              "docs-list JSON rankedItems/items entries did not include supported repoPath or path strings; raw provider output omitted",
          },
        ],
        suppressNoResults: true,
      };
    }
    if (unsupportedItemCount > 0) {
      normalized.omissions.push({
        provider: "docs",
        reason: "schema_mismatch",
        detail:
          "one or more docs-list JSON rankedItems/items entries did not include supported repoPath or path strings; raw provider output omitted",
      });
    }
    return {
      ...normalized,
      suppressNoResults: normalized.paths.length === 0 && normalized.omissions.length > 0,
    };
  } catch {
    return {
      paths: [],
      omissions: [
        {
          provider: "docs",
          reason: "schema_mismatch",
          detail: "docs-list JSON output was invalid; raw provider output omitted",
        },
      ],
      suppressNoResults: true,
    };
  }
};

export const discoverDocsSeeds = async ({
  repoRoot,
  cwd,
  objective,
  env = {},
  top = DEFAULT_TOP,
}) => {
  const discoveryRoot = await docsDiscoveryRoot({ repoRoot, cwd });
  const docsRoot = discoveryRoot.root;
  const script = await firstExistingScript(env);
  if (!script) {
    return {
      seeds: [],
      omissions: [
        ...discoveryRoot.omissions,
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
    const discovered = normalizeJsonOutputPaths(stdout, { repoRoot, docsRoot });
    const seeds = discovered.paths.map((value) => ({
      kind: "path",
      value,
      note: "docs-list ranked Markdown context",
    }));
    const omissions = [...discoveryRoot.omissions, ...discovered.omissions];
    if (seeds.length === 0 && !discovered.suppressNoResults) {
      omissions.push({
        provider: "docs",
        reason: "no_results",
        detail: "docs-list returned no safe Markdown candidates for this objective and workspace",
      });
    }
    return { seeds, omissions };
  } catch (error) {
    return {
      seeds: [],
      omissions: [
        ...discoveryRoot.omissions,
        {
          provider: "docs",
          reason: "unavailable",
          detail: subprocessFailureDetail("docs-list", error, "discovery"),
        },
      ],
    };
  }
};
