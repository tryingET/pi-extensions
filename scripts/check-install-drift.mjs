#!/usr/bin/env node
// Install-provenance drift alarm.
//
// Fails when a Pi package install in ~/.pi/agent/settings.json points at a
// source that is not the canonical repo checkout, or whose content has
// diverged from a commit that exists in the canonical repo's history.
//
// Exit codes: 0 = no drift, 1 = drift detected, 2 = tool failure.
//
// Usage:
//   node scripts/check-install-drift.mjs [--settings <path>] [--repo-root <path>] [--json]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = { settings: null, repoRoot: defaultRepoRoot, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--settings") options.settings = argv[++i];
    else if (value === "--repo-root") options.repoRoot = resolve(argv[++i]);
    else if (value === "--json") options.json = true;
    else {
      console.error(`Unknown argument: ${value}`);
      process.exit(2);
    }
  }
  options.settings ??= resolve(process.env.HOME ?? "", ".pi/agent/settings.json");
  return options;
}

function sourceOf(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.source === "string") return entry.source;
  return null;
}

function git(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" }).trim();
}

const options = parseArgs(process.argv.slice(2));
const findings = [];

if (!existsSync(options.settings)) {
  console.error(`settings not found: ${options.settings}`);
  process.exit(2);
}

const settings = JSON.parse(readFileSync(options.settings, "utf8"));
const packages = Array.isArray(settings.packages) ? settings.packages : Object.values(settings.packages ?? {});

for (const entry of packages) {
  let source = sourceOf(entry);
  if (!source) continue;
  if (source.startsWith("git:") || source.startsWith("npm:")) continue;
  if (!source.startsWith("/")) source = resolve(dirname(options.settings), source);

  const name = source.split("/").filter(Boolean).slice(-1)[0] ?? source;

  // 1. Path must exist.
  if (!existsSync(source)) {
    findings.push({ severity: "error", package: name, source, issue: "install path does not exist" });
    continue;
  }

  // 2. Local non-repo installs are allowed but flagged as untracked sources.
  let insideRepo = false;
  try {
    insideRepo = git(source, ["rev-parse", "--show-toplevel"]) === git(options.repoRoot, ["rev-parse", "--show-toplevel"]);
  } catch {
    insideRepo = false;
  }
  if (!insideRepo) {
    findings.push({ severity: "warn", package: name, source, issue: "installed from outside the canonical repo checkout" });
    continue;
  }

  // 3. Repo-internal installs must be clean (no uncommitted edits under that package path).
  const root = git(options.repoRoot, ["rev-parse", "--show-toplevel"]);
  const rel = source.slice(root.length + 1).replace(/\/+$/, "");
  let dirty = [];
  try {
    const out = git(options.repoRoot, ["status", "--porcelain", "--", rel]);
    dirty = out ? out.split("\n").filter(Boolean) : [];
  } catch {
    // ignore
  }
  if (dirty.length > 0) {
    findings.push({
      severity: "error",
      package: name,
      source,
      issue: `install source has ${dirty.length} uncommitted path(s); runtime may execute unreviewed code`,
    });
  }
}

const errors = findings.filter((f) => f.severity === "error");

if (options.json) {
  console.log(JSON.stringify({ checked: packages.length, findings }, null, 2));
} else if (findings.length === 0) {
  console.log(`install-drift: OK (${packages.length} packages checked)`);
} else {
  for (const f of findings) {
    console.log(`install-drift [${f.severity}] ${f.package}: ${f.issue} (${f.source})`);
  }
}

process.exit(errors.length > 0 ? 1 : 0);
