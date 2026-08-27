import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = path.join(REPO_ROOT, "scripts/release-sandbox.sh");
const MANAGED_TMP = process.env.TMPDIR;

function makeHarness() {
  assert.ok(MANAGED_TMP && fs.statSync(MANAGED_TMP).isDirectory(), "test requires managed TMPDIR");
  const root = fs.mkdtempSync(path.join(MANAGED_TMP, "release-sandbox-test."));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const probe = `#!/usr/bin/env node
const keys = [
  "HOME", "TMPDIR", "PI_CODING_AGENT_DIR", "NPM_CONFIG_USERCONFIG",
  "NPM_CONFIG_GLOBALCONFIG", "NPM_CONFIG_PREFIX", "NPM_CONFIG_CACHE",
  "NPM_TOKEN", "NODE_AUTH_TOKEN", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY"
];
console.log(JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null]))));
`;
  for (const command of ["npm", "pi"]) {
    const target = path.join(bin, command);
    fs.writeFileSync(target, probe, { mode: 0o755 });
  }
  return { root, bin };
}

function run(script, env = {}) {
  return spawnSync("bash", ["-c", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NPM_TOKEN: "SHOULD_NOT_CROSS",
      NODE_AUTH_TOKEN: "SHOULD_NOT_CROSS",
      OPENAI_API_KEY: "SHOULD_NOT_CROSS",
      AWS_SECRET_ACCESS_KEY: "SHOULD_NOT_CROSS",
      ...env,
    },
  });
}

function assertNoCredentials(record) {
  for (const key of ["NPM_TOKEN", "NODE_AUTH_TOKEN", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY"]) {
    assert.equal(record[key], null, `${key} crossed the release sandbox`);
  }
}

test("isolated npm receives only managed release configuration", () => {
  const harness = makeHarness();
  try {
    const result = run(
      `source ${JSON.stringify(HELPER)}
PATH=${JSON.stringify(`${harness.bin}:${process.env.PATH}`)}
release_sandbox_npm probe`,
    );
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout.trim());
    assertNoCredentials(record);
    assert.ok(record.HOME.startsWith(MANAGED_TMP));
    assert.equal(record.TMPDIR, MANAGED_TMP);
    assert.ok(record.NPM_CONFIG_USERCONFIG.startsWith(record.HOME));
    assert.ok(record.NPM_CONFIG_GLOBALCONFIG.startsWith(record.HOME));
    assert.ok(record.NPM_CONFIG_CACHE.startsWith(record.HOME));
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

test("isolated Pi runtime receives no ambient provider or npm credentials", () => {
  const harness = makeHarness();
  const agentDir = path.join(harness.root, "agent");
  const prefix = path.join(harness.root, "prefix");
  const cache = path.join(harness.root, "cache");
  try {
    const result = run(
      `source ${JSON.stringify(HELPER)}
PATH=${JSON.stringify(`${harness.bin}:${process.env.PATH}`)}
release_sandbox_prepare_runtime ${JSON.stringify(agentDir)} ${JSON.stringify(prefix)} ${JSON.stringify(cache)}
release_sandbox_exec ${JSON.stringify(agentDir)} ${JSON.stringify(prefix)} ${JSON.stringify(cache)} pi probe`,
    );
    assert.equal(result.status, 0, result.stderr);
    const record = JSON.parse(result.stdout.trim());
    assertNoCredentials(record);
    assert.equal(record.PI_CODING_AGENT_DIR, agentDir);
    assert.equal(record.NPM_CONFIG_PREFIX, prefix);
    assert.equal(record.NPM_CONFIG_CACHE, cache);
    assert.ok(record.NPM_CONFIG_USERCONFIG.startsWith(agentDir));
    assert.ok(record.NPM_CONFIG_GLOBALCONFIG.startsWith(agentDir));
    const settings = JSON.parse(fs.readFileSync(path.join(agentDir, "settings.json"), "utf8"));
    assert.deepEqual(settings, { extensions: [], packages: [] });
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

test("system /tmp is rejected before effects", () => {
  const result = run(`source ${JSON.stringify(HELPER)}
release_sandbox_require_tmpdir`, { TMPDIR: "/tmp" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refuses system \/tmp/);
});

const migratedReleaseChecks = [
  "packages/pi-activity-strip/scripts/release-check.sh",
  "packages/pi-agent-vent/scripts/release-check.sh",
  "packages/pi-autonomous-session-control/scripts/release-check.sh",
  "packages/pi-autoresearch/scripts/release-check.sh",
  "packages/pi-better-openai/scripts/release-check.sh",
  "packages/pi-context-overlay/scripts/release-check.sh",
  "packages/pi-context-packer/scripts/release-check.sh",
  "packages/pi-designmd-foundry/scripts/release-check.sh",
  "packages/pi-eval-kernel/scripts/release-check.sh",
  "packages/pi-evalset-lab/scripts/release-check.sh",
  "packages/pi-evidence-review/scripts/release-check.sh",
  "packages/pi-interaction/pi-interaction/scripts/release-check.sh",
  "packages/pi-little-helpers/scripts/release-check.sh",
  "packages/pi-ontology-workflows/scripts/release-check.sh",
  "packages/pi-peer-messaging/scripts/release-check.sh",
  "packages/pi-prompt-template-accelerator/scripts/release-check.sh",
  "packages/pi-provenance/scripts/release-check.sh",
  "packages/pi-society-startup-context/scripts/release-check.sh",
  "packages/pi-telemetry/scripts/release-check.sh",
  "packages/pi-toolbox-discovery/scripts/release-check.sh",
  "packages/pi-workstation-inference-provider/scripts/release-check.sh",
];

test("migrated package release checks use the root credential membrane", () => {
  for (const relativePath of migratedReleaseChecks) {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
    assert.match(source, /scripts\/release-sandbox\.sh/, `${relativePath} does not source the sandbox`);
    assert.match(source, /release_sandbox_npm/, `${relativePath} bypasses isolated npm`);
    assert.doesNotMatch(source, /\$HOME\/\.pi\/agent\/auth\.json/, `${relativePath} reads Pi auth`);
    assert.doesNotMatch(source, /PACK_JSON(?:_RAW)?="\$\(npm /, `${relativePath} captures ambient npm pack output`);
    assert.doesNotMatch(source, /PUBLISH_DRY_RUN_OUTPUT="\$\(npm /, `${relativePath} runs ambient npm publish`);
  }
});

test("all tracked package release checks reject copied Pi authentication", () => {
  const listed = spawnSync(
    "git",
    ["ls-files", "packages/*/scripts/release-check.sh", "packages/*/*/scripts/release-check.sh"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  assert.equal(listed.status, 0, listed.stderr);
  for (const relativePath of listed.stdout.trim().split(/\r?\n/).filter(Boolean)) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    const source = fs.readFileSync(absolutePath, "utf8");
    assert.doesNotMatch(source, /cp\s+"?\$HOME\/\.pi\/agent\/auth\.json/, `${relativePath} copies Pi auth`);
  }
});

test("activity-strip and eval-kernel packed smokes are provider-free", () => {
  for (const relativePath of [
    "packages/pi-activity-strip/scripts/release-smoke.sh",
    "packages/pi-eval-kernel/scripts/release-smoke.sh",
  ]) {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
    assert.doesNotMatch(source, /\bpi\s+(?:--[^\n]+\s+)*-p\s+/, `${relativePath} still delegates to a model`);
    assert.doesNotMatch(source, /OPENAI_API_KEY|PI_TEST_DEFAULT_MODEL|auth\.json/);
  }
});
