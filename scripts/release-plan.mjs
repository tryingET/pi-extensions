#!/usr/bin/env node
/**
summary: "Pure portfolio release graph, propagation closure, and readiness planning helpers."
read_when:
  - "Changing managed runtime edges, release-wave selection, version blockers, or registry classification."
*/
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, ".release-please-manifest.json");
const ROOT_MANIFEST_PATH = path.join(ROOT, "package.json");
const RUNTIME_DEPENDENCY_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"];
const DEFAULT_RELEASE_POLICY = {
  npmOwner: null,
  credentialMode: null,
  publicationApproval: null,
};

function validateUniqueIdentities(components) {
  for (const field of ["component", "packageName", "packagePath"]) {
    const seen = new Map();
    for (const entry of components) {
      const previous = seen.get(entry[field]);
      if (previous) {
        throw new Error(
          `Duplicate release ${field} detected: ${entry[field]} (${previous.packagePath}, ${entry.packagePath})`,
        );
      }
      seen.set(entry[field], entry);
    }
  }
}

function runtimeRangeIncludesVersion(range, version) {
  const normalized = String(range).trim();
  if (normalized.startsWith("file:") || normalized === "*") return true;
  const match = normalized.match(/^(?<operator>\^|~)?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<pre>[0-9A-Za-z.-]+))?$/u);
  if (!match?.groups) return false;
  const target = String(version).match(/^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<pre>[0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u);
  if (!target?.groups) return false;
  const declared = [match.groups.major, match.groups.minor, match.groups.patch].map(Number);
  const intended = [target.groups.major, target.groups.minor, target.groups.patch].map(Number);
  if (!match.groups.operator) {
    return declared.every((part, index) => part === intended[index]) && match.groups.pre === target.groups.pre;
  }
  if (intended[0] !== declared[0]) return false;
  if (match.groups.operator === "~") {
    return intended[1] === declared[1] && compareVersions(version, normalized.slice(1)) >= 0;
  }
  if (declared[0] > 0) return compareVersions(version, normalized.slice(1)) >= 0;
  if (intended[1] !== declared[1]) return false;
  if (declared[1] > 0) return compareVersions(version, normalized.slice(1)) >= 0;
  return intended[2] === declared[2] && compareVersions(version, normalized.slice(1)) >= 0;
}

function loadReleaseGraph(components) {
  const byName = new Map(components.map((entry) => [entry.packageName, entry]));
  const graph = new Map(components.map((entry) => [entry.component, []]));
  for (const component of components) {
    const manifestPath = path.join(ROOT, component.packagePath, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const internalFields = new Map();
    for (const field of RUNTIME_DEPENDENCY_FIELDS) {
      for (const [dependencyName, declaredRange] of Object.entries(manifest[field] ?? {})) {
        const dependency = byName.get(dependencyName);
        if (!dependency) continue;
        if (dependency.component === component.component) {
          throw new Error(`Self-referencing runtime edge: ${component.component} (${field})`);
        }
        if (internalFields.has(dependency.component)) {
          throw new Error(
            `Duplicate internal runtime edge for ${component.component} -> ${dependency.component}: ${internalFields.get(dependency.component)}, ${field}`,
          );
        }
        internalFields.set(dependency.component, field);
        if (String(declaredRange).startsWith("file:")) {
          const declaredPath = path.resolve(path.dirname(manifestPath), String(declaredRange).slice(5));
          const expectedPath = path.join(ROOT, dependency.packagePath);
          if (declaredPath !== expectedPath) {
            throw new Error(
              `Runtime edge path mismatch for ${component.component} -> ${dependency.component}: ${declaredRange}`,
            );
          }
        } else if (!runtimeRangeIncludesVersion(declaredRange, dependency.version)) {
          throw new Error(
            `Runtime edge range excludes intended version for ${component.component} -> ${dependency.component}: ${declaredRange} does not include ${dependency.version}`,
          );
        }
        graph.get(component.component).push({
          component: dependency.component,
          field,
          range: String(declaredRange),
        });
      }
    }
    graph.get(component.component).sort((a, b) =>
      a.component.localeCompare(b.component) || a.field.localeCompare(b.field),
    );
  }
  topologicalOrder(components, graph);
  return graph;
}

function topologicalOrder(components, graph) {
  const known = new Set(components.map((entry) => entry.component));
  const state = new Map();
  const order = [];
  function visit(id, lineage = []) {
    if (!known.has(id)) throw new Error(`Unknown release runtime dependency: ${id}`);
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      throw new Error(`Release runtime dependency cycle: ${[...lineage, id].join(" -> ")}`);
    }
    state.set(id, "visiting");
    for (const edge of graph.get(id) ?? []) visit(edge.component, [...lineage, id]);
    state.set(id, "done");
    order.push(id);
  }
  for (const entry of [...components].sort((a, b) => a.component.localeCompare(b.component))) {
    visit(entry.component);
  }
  return order;
}

function reverseDependentClosure(changed, components, graph) {
  const reverse = new Map(components.map((entry) => [entry.component, []]));
  for (const [consumer, edges] of graph) {
    for (const edge of edges) reverse.get(edge.component).push(consumer);
  }
  for (const values of reverse.values()) values.sort();
  const closure = new Set(changed);
  const reasonChains = new Map();
  const queue = [...changed].sort().map((id) => [id]);
  while (queue.length > 0) {
    queue.sort((a, b) => a.length - b.length || a.join("\0").localeCompare(b.join("\0")));
    const chain = queue.shift();
    const component = chain.at(-1);
    const existing = reasonChains.get(component) ?? [];
    const shortestLength = existing[0]?.length;
    if (shortestLength && chain.length > shortestLength) continue;
    if (!existing.some((entry) => entry.join("\0") === chain.join("\0"))) {
      reasonChains.set(component, [...existing, chain].sort((a, b) => a.join("\0").localeCompare(b.join("\0"))));
    }
    closure.add(component);
    for (const consumer of reverse.get(component) ?? []) queue.push([...chain, consumer]);
  }
  return { closure, reverse, reasonChains };
}

function gitRaw(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr).trim()}`);
  return String(result.stdout);
}

function git(args) {
  return gitRaw(args).trim();
}

function changedPaths(base, sourceCommit) {
  if (!base) return [];
  const baseCommit = git(["rev-parse", `${base}^{commit}`]);
  const output = git(["diff", "--name-only", `${baseCommit}...${sourceCommit}`]);
  return output ? output.split("\n").map((value) => value.replace(/\\/g, "/")).sort() : [];
}

function manifestAtCommit(commit) {
  if (!commit) return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  return JSON.parse(git(["show", `${commit}:.release-please-manifest.json`]));
}

function workingTreePaths() {
  const records = gitRaw(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0");
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    paths.push(record.slice(3).replace(/\\/g, "/"));
    if (/^[RC]/u.test(record) || /^[RC]/u.test(record.slice(1))) {
      const originalPath = records[index + 1];
      if (originalPath) paths.push(originalPath.replace(/\\/g, "/"));
      index += 1;
    }
  }
  return [...new Set(paths)].sort();
}

function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value).match(
      /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<pre>[0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u,
    );
    if (!match?.groups) throw new Error(`Invalid semantic version: ${value}`);
    return {
      core: [match.groups.major, match.groups.minor, match.groups.patch].map(Number),
      pre: match.groups.pre?.split(".") ?? [],
    };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  }
  if (a.pre.length === 0 || b.pre.length === 0) {
    if (a.pre.length === b.pre.length) return 0;
    return a.pre.length === 0 ? 1 : -1;
  }
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    if (a.pre[index] === undefined || b.pre[index] === undefined) return a.pre[index] === undefined ? -1 : 1;
    if (a.pre[index] === b.pre[index]) continue;
    const aNumeric = /^\d+$/u.test(a.pre[index]);
    const bNumeric = /^\d+$/u.test(b.pre[index]);
    if (aNumeric && bNumeric) return Number(a.pre[index]) < Number(b.pre[index]) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a.pre[index].localeCompare(b.pre[index]);
  }
  return 0;
}

function queryRegistryVersion(component, executable = process.env.NPM_EXECUTABLE ?? "npm") {
  const result = spawnSync(executable, ["view", `${component.packageName}@${component.version}`, "version", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" },
  });
  const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error) return { state: "unavailable", detail: result.error.message };
  if (result.status !== 0) {
    if (/\bE404\b/u.test(diagnostic)) return { state: "absent" };
    return { state: "unavailable", detail: diagnostic.trim().split("\n").slice(-1)[0] };
  }
  return { state: "exists", version: component.version };
}

function queryRegistryOwners(component, expectedOwner, executable = process.env.NPM_EXECUTABLE ?? "npm") {
  const result = spawnSync(executable, ["owner", "ls", component.packageName, "--parseable"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" },
  });
  const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error) return { state: "unavailable", owners: [], detail: result.error.message };
  if (result.status !== 0) {
    if (/\bE404\b/u.test(diagnostic)) return { state: "unclaimed", owners: [] };
    return { state: "unavailable", owners: [], detail: diagnostic.trim().split("\n").slice(-1)[0] };
  }
  const owners = String(result.stdout)
    .split("\n")
    .map((line) => line.trim().split(/\s+/u)[0])
    .filter(Boolean)
    .sort();
  return { state: owners.includes(expectedOwner) ? "current" : "legacy-owner", owners };
}

function componentsForPaths(paths, components) {
  const changed = new Set();
  const ownedPaths = new Map(components.map((entry) => [entry.component, []]));
  const unowned = [];
  const byDepth = [...components].sort((a, b) => b.packagePath.length - a.packagePath.length);
  for (const changedPath of paths) {
    const owner = byDepth.find(
      (entry) => changedPath === entry.packagePath || changedPath.startsWith(`${entry.packagePath}/`),
    );
    if (owner) {
      changed.add(owner.component);
      ownedPaths.get(owner.component).push(changedPath);
    } else unowned.push(changedPath);
  }
  return { changed, ownedPaths, unowned };
}

function buildReleasePlan(components, options = {}) {
  validateUniqueIdentities(components);
  const graph = options.graph ?? loadReleaseGraph(components);
  const sourceCommit = options.sourceCommit ?? git(["rev-parse", "HEAD^{commit}"]);
  const dirtyPaths = options.dirtyPaths ?? (options.sourceCommit ? [] : workingTreePaths());
  const baseCommit = options.base ? git(["rev-parse", `${options.base}^{commit}`]) : null;
  const paths = options.paths ?? changedPaths(options.base, sourceCommit);
  const classifiedPaths = componentsForPaths(paths, components);
  const explicitChanged = new Set(options.changed ?? []);
  const knownIds = new Set(components.map((entry) => entry.component));
  for (const id of explicitChanged) {
    if (!knownIds.has(id)) throw new Error(`Unknown changed release component: ${id}`);
  }
  const changed = options.all
    ? new Set(components.map((entry) => entry.component))
    : new Set([...classifiedPaths.changed, ...explicitChanged]);
  const { closure, reverse, reasonChains } = reverseDependentClosure(changed, components, graph);
  const order = topologicalOrder(components, graph).filter((id) => closure.has(id));
  const manifest = options.manifest ?? manifestAtCommit(baseCommit);
  const rootManifest = JSON.parse(fs.readFileSync(ROOT_MANIFEST_PATH, "utf8"));
  const releasePolicy = {
    ...DEFAULT_RELEASE_POLICY,
    ...(options.releasePolicy ?? rootManifest["x-pi-release-policy"] ?? {}),
  };
  if (!releasePolicy.npmOwner || !releasePolicy.credentialMode || !releasePolicy.publicationApproval) {
    throw new Error("Incomplete root x-pi-release-policy: npmOwner, credentialMode, and publicationApproval are required");
  }
  const planned = components.map((component) => {
    const currentVersion = manifest[component.packagePath] ?? null;
    const selected = closure.has(component.component);
    const selection = changed.has(component.component) ? "changed" : selected ? "propagation" : null;
    const blockers = [];
    if (selected && currentVersion && currentVersion !== "0.0.0") {
      const comparison = compareVersions(component.version, currentVersion);
      if (comparison < 0) blockers.push("intended-version-behind-current");
      if (comparison === 0) blockers.push("version-not-advanced");
    }
    const registry = options.registry && selected
      ? queryRegistryVersion(component, options.npmExecutable)
      : { state: "not-checked" };
    const ownership = options.registry && selected
      ? queryRegistryOwners(component, releasePolicy.npmOwner, options.npmExecutable)
      : { state: "not-checked", owners: [] };
    if (registry.state === "exists") blockers.push("registry-version-exists");
    if (registry.state === "unavailable") blockers.push("registry-state-unavailable");
    if (ownership.state === "legacy-owner") blockers.push("legacy-registry-owner");
    if (ownership.state === "unavailable") blockers.push("registry-owner-state-unavailable");
    const reasons = selection === "changed"
      ? [
          ...(classifiedPaths.ownedPaths.get(component.component) ?? []).map((changedPath) => ({
            kind: "changed-path",
            path: changedPath,
          })),
          ...(explicitChanged.has(component.component) ? [{ kind: "explicit-selection" }] : []),
          ...(options.all ? [{ kind: "inventory-selection" }] : []),
        ]
      : selection === "propagation"
        ? (reasonChains.get(component.component) ?? []).map((chain) => ({ kind: "runtime-dependent", chain }))
        : [];
    return {
      component: component.component,
      packageName: component.packageName,
      packagePath: component.packagePath,
      intendedVersion: component.version,
      currentVersion,
      sourceCommit,
      dependencies: (graph.get(component.component) ?? []).map((edge) => ({ ...edge })),
      dependents: reverse.get(component.component) ?? [],
      selection,
      reasons,
      registry,
      ownership,
      blockers,
    };
  });
  const blockers = planned
    .filter((entry) => entry.blockers.length > 0)
    .map((entry) => ({ component: entry.component, reasons: entry.blockers }));
  if (dirtyPaths.length > 0) blockers.unshift({ scope: "source", reasons: ["source-tree-dirty"] });
  const externalBlockers = order.flatMap((component) => [
    {
      component,
      kind: "credential",
      state: "external-gate",
      mode: releasePolicy.credentialMode,
      owner: "repository-admin",
      reopenTrigger: "trusted-publishing-or-id-token-failure",
    },
    {
      component,
      kind: "publication",
      state: "approval-required",
      mode: releasePolicy.publicationApproval,
      owner: "release-operator",
      reopenTrigger: "component-release-approved",
    },
  ]);
  return {
    schema: "pi.portfolio-release-plan.v1",
    source: { commit: sourceCommit, baseCommit, dirtyPaths },
    policy: releasePolicy,
    changedPaths: paths,
    unownedChangedPaths: classifiedPaths.unowned,
    changedComponents: [...changed].sort(),
    propagationRequiredComponents: order.filter((id) => !changed.has(id)),
    releaseOrder: order,
    status: blockers.length > 0 ? "blocked" : "ready",
    blockers,
    externalBlockers,
    components: planned,
  };
}

export {
  buildReleasePlan,
  loadReleaseGraph,
  reverseDependentClosure,
  runtimeRangeIncludesVersion,
  topologicalOrder,
  validateUniqueIdentities,
};
