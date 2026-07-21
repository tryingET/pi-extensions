import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { CandidatePeerRegistryRecord } from "./candidatePeerRegistry.ts";
import {
  CANDIDATE_LIFECYCLE_SCHEMA_VERSION,
  type CandidateInventoryResource,
  type CandidateLifecycleInventory,
  digestObject,
  safeRealpath,
  sha256,
} from "./candidatePeerLifecycleV2Core.ts";

function directorySize(path: string): number {
  let total = 0;
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = (() => {
      try {
        return readdirSync(current, { withFileTypes: true });
      } catch {
        return [];
      }
    })();
    for (const entry of entries) {
      const child = join(current, entry.name);
      try {
        const info = lstatSync(child);
        total += info.size;
        if (entry.isDirectory() && !entry.isSymbolicLink()) stack.push(child);
      } catch {
        // Inventory is observational; unreadable paths are represented by an anomaly later.
      }
    }
  }
  return total;
}

function readRegistryRecords(registryDir: string): CandidatePeerRegistryRecord[] {
  if (!existsSync(registryDir)) return [];
  return readdirSync(registryDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map(
      (name) =>
        JSON.parse(readFileSync(join(registryDir, name), "utf8")) as CandidatePeerRegistryRecord,
    );
}

export function inventoryCandidatePeerResources({
  registryDir,
  now = new Date().toISOString(),
  measureBytes = false,
}: {
  registryDir: string;
  now?: string;
  measureBytes?: boolean;
}): CandidateLifecycleInventory {
  const records = readRegistryRecords(registryDir);
  const groups = new Map<string, CandidatePeerRegistryRecord[]>();
  for (const record of records) {
    const key = resolve(record.worktreePath);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  const resources = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([worktreePath, aliases]) => {
      const aliasIds = [...new Set(aliases.map((record) => record.peerRunId))].sort();
      const repoRoots = [...new Set(aliases.map((record) => resolve(record.repoRoot)))].sort();
      const branchNames = [...new Set(aliases.map((record) => record.branchName))].sort();
      const recordedHeads = [
        ...new Set(aliases.map((record) => record.baseRef).filter(Boolean)),
      ].sort();
      const exists = existsSync(worktreePath);
      const worktreeRealPath = exists ? safeRealpath(worktreePath) : undefined;
      const identitySeed = `${repoRoots.join("\0")}\0${worktreePath}`;
      const generationSeed = `${identitySeed}\0${branchNames.join("\0")}`;
      const anomalies: string[] = [];
      if (repoRoots.length !== 1) anomalies.push("multiple_repo_roots");
      if (branchNames.length !== 1) anomalies.push("multiple_branch_names");
      if (exists && !worktreeRealPath) anomalies.push("unresolvable_worktree_realpath");
      return {
        resourceId: `cpr-${sha256(identitySeed).slice(0, 24)}`,
        generationId: `gen-v1-${sha256(generationSeed).slice(0, 20)}`,
        worktreePath,
        worktreeRealPath,
        exists,
        aliases: aliasIds,
        repoRoots,
        branchNames,
        recordedHeads,
        createdAt: aliases.map((record) => record.createdAt).sort()[0] ?? now,
        updatedAt:
          aliases
            .map((record) => record.updatedAt)
            .sort()
            .at(-1) ?? now,
        sizeBytes: exists && measureBytes ? directorySize(worktreePath) : undefined,
        anomalies,
      } satisfies CandidateInventoryResource;
    });
  const unsigned = {
    schemaVersion: CANDIDATE_LIFECYCLE_SCHEMA_VERSION,
    capturedAt: now,
    registryDir: resolve(registryDir),
    registryRecordCount: records.length,
    resourceCount: resources.length,
    existingResourceCount: resources.filter((item) => item.exists).length,
    missingResourceCount: resources.filter((item) => !item.exists).length,
    totalMeasuredBytes: resources.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
    resources,
  };
  return { ...unsigned, digest: digestObject(unsigned) };
}

export function resourceName(resource: CandidateInventoryResource): string {
  return basename(resource.worktreePath);
}
