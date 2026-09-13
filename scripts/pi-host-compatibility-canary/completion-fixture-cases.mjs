// Exact finite scenario source/argv and generated paths; no generic Node -e route.
import assert from "node:assert/strict";
import path from "node:path";
import { checkedChild, canonicalPath } from "./completion-fixture-closure.mjs";
export const EXISTING_CASES = Object.freeze([
  "receipt-proxy", "group-proxy", "boundary-proxy", "journal-hold-proxy", "journal-ready-hold-proxy",
  "upgrade-guard", "ordinary-success", "ordinary-failure", "metadata-success", "metadata-failure",
  "alignment-success", "alignment-failure",
]);
export const DIRECT_DENIAL_CASES = Object.freeze([
  "deny-bare-npm", "deny-bin-npm", "deny-absolute-npm", "deny-node-npm-cli", "deny-uninstall", "deny-arbitrary",
]);
export const BINDING_CASES = Object.freeze(["deny-alignment-binding", "deny-restoration-binding"]);
export const CASES = Object.freeze([...EXISTING_CASES, ...DIRECT_DENIAL_CASES, ...BINDING_CASES]);
export function assertCase(name) {
  assert.ok(CASES.includes(name), `unknown/unsafe completion case: ${String(name)}`);
  return name;
}
export function generatedPaths(root, name, absent = false) {
  assertCase(name);
  const options = { absent };
  const packageRelative = `package-${name}`;
  const packageDir = checkedChild(root, packageRelative, options);
  const hostMetadata = checkedChild(root, `${packageRelative}/node_modules/synthetic-host/package.json`, options);
  const consumerMetadata = checkedChild(root, `${packageRelative}/package.json`, options);
  return { packageRelative, packageDir, hostMetadata, consumerMetadata,
    target: name.startsWith("alignment") ? hostMetadata : consumerMetadata };
}
export function finiteCommand(root, name, executable) {
  assertCase(name);
  canonicalPath(root);
  canonicalPath(executable);
  if (!["ordinary-success", "ordinary-failure", "metadata-success", "metadata-failure",
    "alignment-success", "alignment-failure"].includes(name)) return [executable, "-e", "void 0"];
  const { target } = generatedPaths(root, name);
  const drift = name.startsWith("metadata") || name.startsWith("alignment");
  const code = `${drift ? `require('node:fs').writeFileSync(${JSON.stringify(target)}, JSON.stringify({name:'synthetic-host',version:'0.0.1'}));` : ""}console.log('finite-direct-command');process.exitCode=${name.endsWith("failure") ? 7 : 0};`;
  return [executable, "-e", code];
}
export function assertFiniteCommand(root, name, command, executable) {
  assert.deepEqual(command, finiteCommand(root, name, executable), "unreviewed complete command/code/argv");
}
export function assertRunEnvelope(manifest, options, root, name, executable) {
  assertCase(name);
  assert.ok(EXISTING_CASES.includes(name), "denial cases cannot use the scenario process route");
  assert.deepEqual(options, name === "upgrade-guard"
    ? { profile: "upgrade", json: true, ...(options.dryRun === true ? { dryRun: true } : {}) }
    : { profile: "current", json: true }, "unreviewed run options");
  const manifestPath = checkedChild(root, `manifest-${name}.json`);
  assert.ok(manifest.manifestPath === manifestPath || (name === "upgrade-guard" &&
    options.dryRun !== true && manifest.manifestPath === checkedChild(root, "does-not-exist", { absent: true })),
  "unreviewed manifest path");
  assert.equal(manifest.hostPackage, "synthetic-host");
  assert.deepEqual(manifest.hostCompanionPackages, []);
  assert.deepEqual(Object.keys(manifest.profiles).sort(), ["current", "upgrade"]);
  for (const profile of Object.values(manifest.profiles)) {
    assert.equal(profile.host.version, "0.84.3");
    assert.equal(profile.host.reviewAnchor, "synthetic-only");
    assert.equal(profile.host.versionFromEnv, undefined);
    assert.equal(profile.host.reviewAnchorFromEnv, undefined);
  }
  assert.deepEqual(manifest.scenarios.map(scenario => scenario.id), ["first", "next"]);
  const packages = /^(ordinary|metadata|alignment)-(success|failure)$/.test(name)
    ? [generatedPaths(root, name).packageRelative] : [];
  for (const scenario of manifest.scenarios) {
    assertFiniteCommand(root, name, scenario.command, executable);
    assert.equal(scenario.cwd, ".");
    assert.equal(scenario.cwdAbs, root);
    assert.deepEqual(scenario.profiles, ["current", "upgrade"]);
    assert.deepEqual(scenario.packages, packages);
  }
}
export function denialCommand(name, executable) {
  assert.ok(DIRECT_DENIAL_CASES.includes(name));
  // These are intent data ONLY, never allowed onto runPayload/process.mjs.
  return {
    "deny-bare-npm": ["npm", "install", "synthetic-host@0.84.3"],
    "deny-bin-npm": ["/bin/npm", "install", "synthetic-host@0.84.3"],
    "deny-absolute-npm": ["/review-only/another/npm", "install", "synthetic-host@0.84.3"],
    "deny-node-npm-cli": [executable, "/review-only/npm/bin/npm-cli.js", "install", "synthetic-host@0.84.3"],
    "deny-uninstall": ["npm", "uninstall", "--no-save", "synthetic-host"],
    "deny-arbitrary": ["/review-only/arbitrary-command", "not-npm"],
  }[name];
}
export const INTENT_HEADER_KIND = "completion-fixture-denied-intents-v1";
export function intentHeader(root, name) {
  assertCase(name);
  return { kind: INTENT_HEADER_KIND, case: name, root };
}
export function expectedIntents(root, name, executable) {
  assertCase(name);
  let command;
  let cwd = root;
  if (DIRECT_DENIAL_CASES.includes(name)) command = denialCommand(name, executable);
  else if (BINDING_CASES.includes(name)) {
    command = ["npm", "install", "--no-save", "--package-lock=false", "synthetic-host@0.84.3"];
    cwd = path.join(root, `package-${name}`);
  } else return [];
  return [{ kind: "denied-lifecycle-intent", sequence: 1, command: command[0], args: command.slice(1), cwd }];
}
// Refuse unrepresentable evidence before the first fixture can launch.
export function assertIntentPathBudget(scratch, executable) {
  for (const name of CASES) {
    for (const intent of expectedIntents(path.join(scratch, name, "repo"), name, executable)) {
      for (const value of [intent.command, ...intent.args, intent.cwd]) {
        assert.ok(typeof value === "string" && value.length <= 256, "fixture intent path/argument exceeds 256 characters");
      }
    }
  }
}

