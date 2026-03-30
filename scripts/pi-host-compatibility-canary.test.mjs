import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "pi-host-compatibility-canary.mjs");

function runJson(args, env = {}) {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, ...args, "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        ...env,
      },
    }),
  );
}

test("compatibility canary manifest validates", () => {
  const result = runJson(["validate"]);
  assert.equal(result.ok, true);
  assert.equal(result.defaultProfile, "current");
  assert.equal(result.hostPackage, "@mariozechner/pi-coding-agent");
  assert.ok(result.hostCompanionPackages.includes("@mariozechner/pi-ai"));
  assert.ok(result.scenarioCount >= 3);
  assert.ok(result.profiles.includes("upgrade"));
});

test("compatibility canary resolves the exact current host contract", () => {
  const result = runJson(["resolve-host", "--profile", "current"]);
  assert.equal(result.profile, "current");
  assert.equal(result.host.packageName, "@mariozechner/pi-coding-agent");
  assert.equal(result.host.version, "0.58.4");
  assert.equal(result.host.reviewAnchor, "npm:@mariozechner/pi-coding-agent@0.58.4");
  assert.ok(result.host.companionPackages.includes("@mariozechner/pi-tui"));
});

test("compatibility canary list resolves upgrade scenarios against explicit host inputs", () => {
  const result = runJson(
    ["list", "--profile", "upgrade"],
    {
      PI_HOST_COMPAT_HOST_VERSION: "0.61.0",
      PI_HOST_COMPAT_CHANGELOG_REF: "https://example.test/pi-mono/compare/v0.60.0...v0.61.0",
    },
  );
  assert.equal(result.profile, "upgrade");
  assert.equal(result.host.version, "0.61.0");
  assert.equal(
    result.host.reviewAnchor,
    "https://example.test/pi-mono/compare/v0.60.0...v0.61.0",
  );
  assert.ok(result.scenarios.some((scenario) => scenario.id === "parallel-tool-event-correlation"));
  assert.ok(result.scenarios.some((scenario) => scenario.id === "interaction-runtime-coexistence"));
});

test("compatibility canary list uses explicit leaf package roots from the manifest", () => {
  const result = runJson(["list", "--profile", "current"]);
  const interactionScenario = result.scenarios.find(
    (scenario) => scenario.id === "interaction-runtime-coexistence",
  );

  assert.ok(interactionScenario);
  assert.ok(Array.isArray(interactionScenario.packageRoots));
  assert.deepEqual(
    interactionScenario.packageRoots.map((entry) => entry.packagePath),
    [
      "packages/pi-interaction/pi-editor-registry",
      "packages/pi-interaction/pi-interaction",
      "packages/pi-interaction/pi-interaction-kit",
      "packages/pi-interaction/pi-runtime-registry",
      "packages/pi-interaction/pi-trigger-adapter",
      "packages/pi-prompt-template-accelerator",
    ],
  );
});

test("compatibility canary dry-run can target a single scenario with package-set host preparation details", () => {
  const result = runJson([
    "run",
    "--dry-run",
    "--profile",
    "current",
    "--scenario",
    "vault-live-trigger-contract",
  ]);

  assert.equal(result.profile, "current");
  assert.equal(result.host.version, "0.58.4");
  assert.equal(result.summary.selected, 1);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.results[0].id, "vault-live-trigger-contract");
  assert.equal(result.results[0].status, "dry-run");
  assert.deepEqual(result.results[0].command, [
    "npm",
    "run",
    "test:compat:live-trigger-contract",
  ]);
  assert.ok(Array.isArray(result.results[0].host.preparation.packages));
  assert.equal(result.results[0].host.preparation.packages.length, 4);
  for (const entry of result.results[0].host.preparation.packages) {
    assert.deepEqual(entry.command, [
      "npm",
      "install",
      "--no-save",
      "--package-lock=false",
      "@mariozechner/pi-coding-agent@0.58.4",
      "@mariozechner/pi-ai@0.58.4",
      "@mariozechner/pi-tui@0.58.4",
    ]);
  }
  assert.ok(["dry-run", "ready"].includes(result.results[0].host.preparation.status));
  assert.equal(result.results[0].host.restoration.status, "not-run");
});
