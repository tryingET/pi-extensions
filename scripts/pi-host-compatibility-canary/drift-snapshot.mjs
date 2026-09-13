import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { currentHostVersion } from "./host-contract.mjs";

export const POLICY_PATH = "policy/pi-host-compatibility-canary.json";
const REGULAR_MODES = new Set(["100644", "100755"]);

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseEntries(text, index) {
  const entries = new Map();
  for (const line of text.split("\0")) {
    if (!line) continue;
    const match = index
      ? /^(\d+) ([a-f0-9]+) ([0-3])\t([\s\S]+)$/u.exec(line)
      : /^(\d+) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/u.exec(line);
    if (!match) throw new Error("malformed Git snapshot entry");
    if (index && match[3] !== "0") throw new Error(`unmerged Git index entry: ${match[4]}`);
    const entry = { mode: match[1], oid: index ? match[2] : match[3], path: match[4] };
    if (entries.has(entry.path)) throw new Error(`duplicate Git snapshot path: ${entry.path}`);
    entries.set(entry.path, entry);
  }
  return entries;
}

function same(a, b) { return a?.mode === b?.mode && a?.oid === b?.oid; }
function manifests(entries) {
  return [...entries.keys()].filter(name => {
    const parts = name.split("/");
    return parts[0] === "packages" && parts.length >= 3 && parts.at(-1) === "package.json"
      && !parts.slice(1, -1).some(part => part === "node_modules" || part.startsWith("."));
  }).sort();
}
function nearest(file, candidates) {
  let dir = path.posix.dirname(file);
  while (true) {
    const manifest = path.posix.join(dir, "package.json");
    if (candidates.has(manifest)) return manifest;
    if (dir === ".") return undefined;
    dir = path.posix.dirname(dir);
  }
}

export function loadSnapshot({ repoRoot, staged, revision }) {
  const root = fs.realpathSync(repoRoot);
  const gitRoot = fs.realpathSync(git(root, "rev-parse", "--show-toplevel").trim());
  if (root !== gitRoot) throw new Error("--repo-root must identify the exact Git repository root");
  // Capture the index once; subsequent validation reads only these immutable blob ids.
  const tree = staged ? undefined
    : git(root, "rev-parse", "--verify", "--end-of-options", `${revision}^{tree}`).trim();
  const entries = staged
    ? parseEntries(git(root, "ls-files", "--stage", "-z"), true)
    : parseEntries(git(root, "ls-tree", "-r", "-z", "--full-tree", tree), false);
  const source = { kind: staged ? "index" : "revision", repoRoot: root,
    ...(staged ? {} : { ref: revision, tree }), entries: [] };
  const readEntries = new Map();
  function readJson(name) {
    const entry = entries.get(name);
    if (!entry) throw new Error(`missing snapshot file: ${name}`);
    if (!REGULAR_MODES.has(entry.mode)) throw new Error(`${name}: symlink or non-regular Git blob`);
    readEntries.set(name, entry);
    source.entries = [...readEntries.values()].sort((a, b) => a.path.localeCompare(b.path));
    return JSON.parse(git(root, "cat-file", "blob", entry.oid));
  }
  const expected = currentHostVersion(readJson(POLICY_PATH), POLICY_PATH);
  const fleet = manifests(entries);
  let selected = fleet;
  const offenders = [];
  const removedPackages = [];
  let scope = { kind: "fleet", reason: "revision" };
  if (staged) {
    const head = git(root, "rev-parse", "--verify", "HEAD^{tree}").trim();
    source.headTree = head;
    const previous = parseEntries(git(root, "ls-tree", "-r", "-z", "--full-tree", head), false);
    const changed = [...new Set([...entries.keys(), ...previous.keys()])]
      .filter(name => !same(entries.get(name), previous.get(name))).sort();
    source.changedPaths = changed;
    // A moved/added manifest is an admission target even outside default fleet
    // discovery (e.g. a hidden fixture path). Never approve retirement while
    // silently ignoring its newly changed destination.
    const changedManifests = changed.filter(name => name === "package.json" || name.endsWith("/package.json"));
    const priorManifests = new Set([...manifests(previous), ...changedManifests.filter(name => previous.has(name))]);
    const currentManifests = new Set([...fleet, ...changedManifests.filter(name => entries.has(name))]);
    const changedPackages = new Set();
    for (const name of changed) {
      for (const candidates of [priorManifests, currentManifests]) {
        const manifest = nearest(name, candidates);
        if (manifest) changedPackages.add(manifest);
      }
    }
    const policyChanged = changed.includes(POLICY_PATH);
    selected = policyChanged ? [...new Set([...fleet, ...changedPackages])].sort() : [...changedPackages].sort();
    scope = { kind: policyChanged ? "fleet" : "changed-packages",
      reason: policyChanged ? "root-policy-changed" : "index-vs-HEAD" };
    selected = selected.filter(manifest => {
      const dir = path.posix.dirname(manifest);
      if (!entries.has(manifest)) {
        // A retirement is proven by the captured index, never by workspace absence.
        // Include hidden files, nested packages, and a replacement entry at dir itself.
        const residual = dir === "." ? entries.size > 0
          : entries.has(dir) || [...entries.keys()].some(name => name.startsWith(`${dir}/`));
        if (!residual) {
          removedPackages.push(dir);
          return false;
        }
        offenders.push(`deleted selected package.json: ${manifest}`);
      }
      const lock = path.posix.join(dir, "package-lock.json");
      if (previous.has(lock) && !entries.has(lock)) offenders.push(`deleted selected package-lock.json: ${lock}`);
      return true;
    });
  }
  return { source, scope, expected, offenders, packageManifests: selected,
    removedPackages, fleetEmpty: fleet.length === 0,
    readJson, exists: name => entries.has(name),
    skip: staged && scope.kind === "changed-packages" && selected.length === 0 && removedPackages.length === 0 };
}
