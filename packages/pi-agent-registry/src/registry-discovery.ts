// ---
// summary: streaming bounded one-repo-per-agent discovery shared by runtime registry loading and aggregate fleet lint.
// read_when:
//   - changing fleet roots, zero-match behavior, missing-manifest visibility, discovery depth, or duplicate roots.
// ---

import { lstat, opendir, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { AGENT_MANIFEST_FILENAME, globToRegExp } from "./manifest.ts";

const DISCOVERY_SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".cache",
  "dist",
  "build",
]);

export interface DiscoveredAgentRepository {
  root: string;
  manifestPath: string;
  manifestPresent: boolean;
}

export interface FailedAgentRepositoryDiscovery {
  root: string;
  code: "repository.resolve_failed";
}

export class RegistryDiscoveryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RegistryDiscoveryError";
    this.code = code;
  }
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function heapUp(paths: string[], start: number): void {
  let index = start;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (comparePaths(paths[parent], paths[index]) >= 0) return;
    [paths[parent], paths[index]] = [paths[index], paths[parent]];
    index = parent;
  }
}

function heapDown(paths: string[], start: number): void {
  let index = start;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let largest = index;
    if (left < paths.length && comparePaths(paths[left], paths[largest]) > 0) largest = left;
    if (right < paths.length && comparePaths(paths[right], paths[largest]) > 0) largest = right;
    if (largest === index) return;
    [paths[index], paths[largest]] = [paths[largest], paths[index]];
    index = largest;
  }
}

function insertBounded(
  paths: string[],
  included: Set<string>,
  candidate: string,
  maxRepositories: number,
): boolean {
  if (included.has(candidate)) {
    throw new RegistryDiscoveryError(
      "fleet.duplicate_candidate",
      "one agent repository was matched more than once by configured roots",
    );
  }
  if (paths.length < maxRepositories) {
    paths.push(candidate);
    included.add(candidate);
    heapUp(paths, paths.length - 1);
    return true;
  }
  if (comparePaths(candidate, paths[0]) >= 0) return false;
  included.delete(paths[0]);
  paths[0] = candidate;
  included.add(candidate);
  heapDown(paths, 0);
  return true;
}

export async function discoverAgentRepositories(
  roots: string[],
  strictMissingRoot: boolean,
  maxRepositories = 5_000,
): Promise<{
  repositories: DiscoveredAgentRepository[];
  failures: FailedAgentRepositoryDiscovery[];
  omittedCount: number;
}> {
  if (!Number.isSafeInteger(maxRepositories) || maxRepositories <= 0) {
    throw new RegistryDiscoveryError(
      "fleet.repository_bound_invalid",
      "maxRepositories must be a positive safe integer",
    );
  }
  if (new Set(roots).size !== roots.length) {
    throw new RegistryDiscoveryError(
      "fleet.duplicate_roots",
      "configured agent registry roots contain duplicates",
    );
  }

  const candidateHeap: string[] = [];
  const includedCandidates = new Set<string>();
  let totalMatches = 0;
  for (const configuredRoot of roots) {
    const leafGlob = /[*?[]/u.test(configuredRoot);
    if (!leafGlob) {
      const info = await lstat(configuredRoot).catch(() => undefined);
      if (!info?.isDirectory() || info.isSymbolicLink()) {
        if (strictMissingRoot) {
          throw new RegistryDiscoveryError(
            "fleet.root_invalid",
            "configured agent registry root is not one non-symlink directory",
          );
        }
        continue;
      }
      totalMatches += 1;
      insertBounded(candidateHeap, includedCandidates, configuredRoot, maxRepositories);
      continue;
    }

    const scanDir = dirname(configuredRoot);
    const directory = await opendir(scanDir).catch(() => undefined);
    if (!directory) {
      if (strictMissingRoot) {
        throw new RegistryDiscoveryError(
          "fleet.root_missing",
          "configured agent registry root does not exist",
        );
      }
      continue;
    }
    const leafPattern = globToRegExp(basename(configuredRoot));
    let rootMatches = 0;
    for await (const entry of directory) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(".") ||
        DISCOVERY_SKIP_DIRS.has(entry.name) ||
        !leafPattern.test(entry.name)
      ) {
        continue;
      }
      rootMatches += 1;
      totalMatches += 1;
      insertBounded(candidateHeap, includedCandidates, join(scanDir, entry.name), maxRepositories);
    }
    if (strictMissingRoot && rootMatches === 0) {
      throw new RegistryDiscoveryError(
        "fleet.root_zero_match",
        "configured agent registry pattern matched no repositories",
      );
    }
  }

  const repositories: DiscoveredAgentRepository[] = [];
  const failures: FailedAgentRepositoryDiscovery[] = [];
  const candidates = candidateHeap.sort(comparePaths);
  const physicalOwners = new Map<string, string>();
  for (const candidate of candidates) {
    const physical = await realpath(candidate).catch(() => undefined);
    if (!physical) {
      failures.push({ root: candidate, code: "repository.resolve_failed" });
      continue;
    }
    const existing = physicalOwners.get(physical);
    if (existing && existing !== candidate) {
      throw new RegistryDiscoveryError(
        "fleet.duplicate_physical_repository",
        "one physical agent repository was configured through multiple logical roots",
      );
    }
    physicalOwners.set(physical, candidate);
    const manifestPath = join(physical, AGENT_MANIFEST_FILENAME);
    const manifestInfo = await lstat(manifestPath).catch(() => undefined);
    repositories.push({
      root: physical,
      manifestPath,
      manifestPresent: Boolean(manifestInfo?.isFile() || manifestInfo?.isSymbolicLink()),
    });
  }

  return {
    repositories,
    failures,
    omittedCount: Math.max(0, totalMatches - repositories.length - failures.length),
  };
}

export async function discoverAgentManifestPaths(
  roots: string[],
  strictMissingRoot: boolean,
): Promise<string[]> {
  const discovered = await discoverAgentRepositories(roots, strictMissingRoot);
  if (discovered.failures.length > 0) {
    throw new RegistryDiscoveryError(
      "registry.repository_resolve_failed",
      "one configured agent repository could not be resolved",
    );
  }
  if (discovered.omittedCount > 0) {
    throw new RegistryDiscoveryError(
      "registry.repository_bound_exceeded",
      "agent registry discovery exceeded its repository bound",
    );
  }
  return discovered.repositories
    .filter((entry) => entry.manifestPresent)
    .map((entry) => entry.manifestPath);
}
