#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const pkg = json("package.json");
const root = resolve("../..");
const host = json(`${root}/policy/pi-host-compatibility-canary.json`).profiles.current.host.version;
const contract = pkg["x-pi-template"].piHostContract;
assert.equal(pkg.name, "@tryinget/pi-obsidian-clipper");
assert.equal(contract.hostBaseline, host);
assert.equal(contract.devTestFloor, host);
for (const name of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent"]) {
  assert.equal(pkg.devDependencies[name], host);
  assert.equal(contract.peerCompatibility[name], "*");
  assert.equal(pkg.peerDependencies[name], contract.peerCompatibility[name]);
  assert.equal(pkg.dependencies?.[name], undefined);
  assert.equal(pkg.optionalDependencies?.[name], undefined);
}
const mapping = json(`${root}/.release-please-config.json`).packages[
  "packages/pi-obsidian-clipper"
];
assert.equal(mapping.component, pkg["x-pi-template"].releaseComponent);
assert.equal(mapping["release-type"], "node");
assert.equal(
  json(`${root}/.release-please-manifest.json`)["packages/pi-obsidian-clipper"],
  pkg.version,
);
for (const path of [
  ".copier-answers.yml",
  "AGENTS.md",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "tsconfig.json",
  "biome.jsonc",
  "scripts/release-check.sh",
  "scripts/quality-gate.sh",
  "docs/project/foundation.md",
  "docs/project/native-engine.md",
  "tests/pi-host-contract.test.mjs",
])
  assert.ok(existsSync(path), `Missing ${path}`);
for (const path of pkg.pi.extensions) assert.ok(existsSync(path));
assert.ok(pkg.files.includes("src"));
for (const path of pkg.files) assert.ok(existsSync(path));
assert.equal(pkg.dependencies?.typebox, undefined);
assert.equal(pkg.optionalDependencies?.typebox, undefined);
assert.equal(pkg.peerDependencies?.typebox, "*");
assert.equal(pkg.devDependencies?.typebox, "1.3.7");
assert.equal(pkg.pi.prompts, undefined);
assert.ok(!existsSync(".github") && !existsSync(".githooks"));
console.log("Package structure, root host adoption and release mapping passed.");
