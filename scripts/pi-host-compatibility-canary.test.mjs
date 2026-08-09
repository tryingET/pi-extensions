// ---
// summary: "Tests Pi host canary manifest contracts, scenario inventory, host resolution, dry runs, and npm isolation."
// read_when:
//   - "Changing host compatibility profiles, canary scenarios, package roots, or neutral npm handling."
// ---
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

function runFailure(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  assert.notEqual(result.status, 0, `Expected command to fail: ${args.join(" ")}`);
  return `${result.stdout}\n${result.stderr}`;
}

function minimalManifest(cwd, packages) {
  return {
    schemaVersion: 1,
    hostPackage: "@earendil-works/pi-coding-agent",
    hostCompanionPackages: ["@earendil-works/pi-ai", "@earendil-works/pi-tui"],
    trackedChangelog: "https://example.test/pi-changelog",
    defaultProfile: "current",
    profiles: {
      current: {
        description: "Test repository path containment.",
        host: {
          version: "0.83.0",
          reviewAnchor: "npm:@earendil-works/pi-coding-agent@0.83.0",
        },
      },
    },
    scenarios: [
      {
        id: "path-containment",
        title: "Path containment",
        owner: "monorepo-root",
        why: "Canary effects must stay inside the repository.",
        profiles: ["current"],
        packages,
        upstreamSurfaces: ["repository path containment"],
        cwd,
        command: [process.execPath, "-e", "void 0"],
      },
    ],
  };
}

test("compatibility canary manifest validates", () => {
  const result = runJson(["validate"]);
  assert.equal(result.ok, true);
  assert.equal(result.defaultProfile, "current");
  assert.equal(result.hostPackage, "@earendil-works/pi-coding-agent");
  assert.ok(result.hostCompanionPackages.includes("@earendil-works/pi-ai"));
  assert.ok(result.scenarioCount >= 3);
  assert.ok(result.profiles.includes("upgrade"));
});

test("compatibility canary resolves the exact current host contract", () => {
  const result = runJson(["resolve-host", "--profile", "current"]);
  assert.equal(result.profile, "current");
  assert.equal(result.host.packageName, "@earendil-works/pi-coding-agent");
  assert.equal(result.host.version, "0.83.0");
  assert.equal(result.host.reviewAnchor, "npm:@earendil-works/pi-coding-agent@0.83.0");
  assert.ok(result.host.companionPackages.includes("@earendil-works/pi-tui"));
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
  assert.ok(result.scenarios.some((scenario) => scenario.id === "asc-settlement-and-thinking-contract"));
  assert.ok(result.scenarios.some((scenario) => scenario.id === "interaction-runtime-coexistence"));
});

test("compatibility canary hydrates pi-eval-kernel before its exact extension-factory contract", () => {
  const result = runJson(["list", "--profile", "current"]);
  const scenario = result.scenarios.find(
    (entry) => entry.id === "code-mode-extension-factory-contract",
  );

  assert.ok(scenario);
  assert.equal(scenario.owner, "pi-eval-kernel");
  assert.deepEqual(scenario.packages, ["tools/pi-eval-kernel-host-contract-fixture"]);
  assert.ok(scenario.upstreamSurfaces.includes("ExtensionFactory and ExtensionAPI assignability"));
  assert.equal(scenario.cwd, "packages/pi-eval-kernel");
  assert.deepEqual(scenario.command, [
    "bash",
    "-c",
    "npm ci >/dev/null && npm run test:compat:pi-host",
  ]);
});

test("compatibility canary covers direct autoresearch runtime packet exports", () => {
  const result = runJson(["list", "--profile", "current"]);
  const scenario = result.scenarios.find(
    (entry) => entry.id === "autoresearch-runtime-packet-contract",
  );

  assert.ok(scenario);
  assert.equal(scenario.owner, "pi-autoresearch");
  assert.deepEqual(scenario.packages, ["packages/pi-autoresearch"]);
  assert.ok(scenario.upstreamSurfaces.includes("candidate-result packet export seam"));
  assert.ok(scenario.upstreamSurfaces.includes("learning packet export seam"));
  assert.deepEqual(scenario.command, [
    "node",
    "--import",
    "tsx",
    "--test",
    "--test-name-pattern",
    "segment closeout summarizes empirical decisions and candidate bindings|autoresearch_runtime_status can request closeout, setup, and finalize packets",
    "tests/runtime.test.ts",
  ]);
});

test("compatibility canary covers orchestrator start_campaign/status/closeout supervision", () => {
  const result = runJson(["list", "--profile", "current"]);
  const scenario = result.scenarios.find(
    (entry) => entry.id === "orchestrator-autoresearch-supervision-contract",
  );

  assert.ok(scenario);
  const expectedPackages = [
    "packages/pi-autonomous-session-control",
    "packages/pi-autoresearch",
    "packages/pi-society-orchestrator",
  ];
  assert.equal(scenario.owner, "pi-society-orchestrator");
  assert.deepEqual(scenario.packages, expectedPackages);
  assert.ok(scenario.upstreamSurfaces.includes("start_campaign/status/closeout supervision seam"));
  assert.equal(scenario.command[0], "bash");
  assert.match(scenario.command.join(" "), /npm --prefix \.\.\/pi-autoresearch ci/);
  assert.match(scenario.command.join(" "), /pi-autonomous-session-control/);
  assert.match(scenario.command.join(" "), /start_campaign delegates execution then supervises/);
  assert.match(scenario.command.join(" "), /review_matrix_campaign aggregates managed cell waves/);

  const matrixScenario = result.scenarios.find(
    (entry) => entry.id === "orchestrator-autoresearch-matrix-closeout",
  );
  assert.ok(matrixScenario);
  assert.deepEqual(matrixScenario.packages, expectedPackages);
  assert.match(matrixScenario.command.join(" "), /npm --prefix \.\.\/pi-autoresearch ci/);
  assert.match(matrixScenario.command.join(" "), /pi-autonomous-session-control/);
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

test("compatibility canary rejects cwd and package targets outside the repository", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pi-host-compat-path-containment-"));
  const manifestPath = path.join(tempDir, "manifest.json");

  try {
    writeFileSync(
      manifestPath,
      JSON.stringify(minimalManifest(tempDir, ["tools/pi-eval-kernel-host-contract-fixture"])),
    );
    assert.match(
      runFailure(["validate", "--manifest", manifestPath]),
      /cwd must stay within repository root/,
    );

    writeFileSync(
      manifestPath,
      JSON.stringify(minimalManifest("packages/pi-eval-kernel", [tempDir])),
    );
    assert.match(
      runFailure(["list", "--manifest", manifestPath]),
      /Scenario package target must stay within repository root/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("compatibility canary scenario commands ignore ambient npm release-age cutoffs", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pi-host-compat-neutral-env-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const envAssertion = [
    "if (process.env.npm_config_before || process.env.NPM_CONFIG_BEFORE) process.exit(2)",
    "if (process.env.npm_config_min_release_age || process.env.NPM_CONFIG_MIN_RELEASE_AGE) process.exit(3)",
  ].join("; ");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      hostPackage: "@earendil-works/pi-coding-agent",
      hostCompanionPackages: ["@earendil-works/pi-ai", "@earendil-works/pi-tui"],
      trackedChangelog: "https://example.test/pi-changelog",
      defaultProfile: "current",
      profiles: {
        current: {
          description: "Test the neutral scenario environment.",
          host: {
            version: "0.80.6",
            reviewAnchor: "npm:@earendil-works/pi-coding-agent@0.80.6",
          },
        },
      },
      scenarios: [
        {
          id: "neutral-npm-env",
          title: "Neutral npm environment",
          owner: "monorepo-root",
          why: "Exact host canaries must not inherit local package-age cutoffs.",
          profiles: ["current"],
          packages: ["packages/pi-autonomous-session-control"],
          upstreamSurfaces: ["npm configuration isolation"],
          cwd: "packages/pi-autonomous-session-control",
          command: [process.execPath, "-e", envAssertion],
        },
      ],
    }),
  );

  try {
    const result = runJson(
      ["run", "--manifest", manifestPath, "--scenario", "neutral-npm-env"],
      {
        npm_config_before: "2026-07-03T00:00:00Z",
        NPM_CONFIG_MIN_RELEASE_AGE: "999999",
      },
    );
    assert.equal(result.summary.passed, 1);
    assert.equal(result.summary.failed, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
  assert.equal(result.host.version, "0.83.0");
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
      "@earendil-works/pi-coding-agent@0.83.0",
      "@earendil-works/pi-ai@0.83.0",
      "@earendil-works/pi-tui@0.83.0",
    ]);
  }
  assert.ok(["dry-run", "ready"].includes(result.results[0].host.preparation.status));
  assert.equal(result.results[0].host.restoration.status, "not-run");
});
