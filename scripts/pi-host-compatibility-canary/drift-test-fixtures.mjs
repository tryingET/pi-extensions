import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CHECKER = fileURLToPath(new URL("./check-dev-pin-drift.mjs", import.meta.url));
export const POLICY = "policy/pi-host-compatibility-canary.json";
export const AI = "@earendil-works/pi-ai";
export const VERSION = "0.83.0";
export function policy(version = VERSION) {
  return {
    schemaVersion: 1, hostPackage: "@earendil-works/pi-coding-agent",
    hostCompanionPackages: [AI, "@earendil-works/pi-tui"],
    trackedChangelog: "https://example.test/changelog", defaultProfile: "current",
    profiles: { current: { description: "Fixture", host: {
      version, reviewAnchor: `npm:@earendil-works/pi-coding-agent@${version}`,
    } } },
    scenarios: [{ id: "fixture", title: "Fixture", owner: "root", why: "Fixture",
      profiles: ["current"], packages: [], upstreamSurfaces: ["fixture"], cwd: ".",
      command: ["node", "--version"] }],
  };
}
export const pkg = (version = VERSION) => ({ name: "fixture", devDependencies: { [AI]: version } });
export const lock = (version = VERSION) => ({ lockfileVersion: 3, packages: {
  "": pkg(version), [`node_modules/${AI}`]: { version },
} });
export function put(root, name, value) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value));
}
export function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test",
    GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test",
  } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fingerprint(root) {
  const hash = createHash("sha256");
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const target = path.join(dir, name);
      const stat = fs.lstatSync(target, { bigint: true });
      hash.update(`${target}:${stat.mode}:${stat.mtimeNs}:${stat.ctimeNs}:`);
      if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(target));
      else if (stat.isDirectory()) walk(target);
      else hash.update(fs.readFileSync(target));
    }
  }
  walk(root);
  return hash.digest("hex");
}
export function fixture(t, snapshot = false) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "pi-host-drift-bdd-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, POLICY, policy());
  put(root, "packages/a/package.json", pkg());
  put(root, "packages/a/src.ts", "// original\n");
  put(root, "packages/b/package.json", pkg());
  if (snapshot) {
    git(root, "init", "-q");
    // Commits may launch detached maintenance that races the exhaustive no-write
    // fingerprint. Keep disposable fixtures quiescent before the first commit;
    // never exclude Git state or swallow filesystem errors in the assertion.
    git(root, "config", "--local", "maintenance.auto", "false");
    git(root, "config", "--local", "gc.auto", "0");
    git(root, "add", ".");
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture baseline");
  }
  return {
    root,
    put: (name, value) => put(root, name, value),
    git: (...args) => git(root, ...args),
    run: (...args) => {
      const before = fingerprint(root);
      const result = spawnSync(process.execPath, [CHECKER, "--repo-root", root,
        ...(snapshot ? [] : ["--manifest", path.join(root, POLICY)]), ...args], {
        encoding: "utf8",
      });
      assert.equal(fingerprint(root), before, "Then checker must not write repository or Git state");
      return result;
    },
  };
}
export function pass(result) { assert.equal(result.status, 0, result.stderr || result.stdout); }
export function fail(result, message) {
  assert.notEqual(result.status, 0, result.stdout);
  if (message) assert.match(result.stderr || result.stdout, message);
}
export function report(result) {
  assert.ok(result.stdout.trim(), result.stderr);
  return JSON.parse(result.stdout);
}
