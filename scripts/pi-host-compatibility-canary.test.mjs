// ---
// summary: "Tests Pi host canary manifest contracts, scenario inventory, host resolution, dry runs, and npm isolation."
// read_when:
//   - "Changing host compatibility profiles, canary scenarios, package roots, or neutral npm handling."
// ---
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

function runJsonFailure(args, env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args, "--json"], {
    cwd: ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      ...env,
    },
  });
  assert.notEqual(result.status, 0, `Expected command to fail: ${args.join(" ")}`);
  return JSON.parse(result.stdout);
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

test("compatibility canary restores temporary node_modules states with neutral fake npm", () => {
  const tempDir = mkdtempSync(path.join(ROOT, ".pi-host-compat-restoration-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const fakeBin = path.join(tempDir, "fake-bin");
  const fakeNpmPath = path.join(fakeBin, "npm");
  const hostPackages = [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
  ];
  const lockedVersion = "0.81.4";
  const targetVersion = "0.83.0";

  function writeInstalledHostVersions(packageDir, version) {
    for (const packageName of hostPackages) {
      const installedPackageDir = path.join(
        packageDir,
        "node_modules",
        ...packageName.split("/"),
      );
      mkdirSync(installedPackageDir, { recursive: true });
      writeFileSync(
        path.join(installedPackageDir, "package.json"),
        JSON.stringify({ name: packageName, version }),
      );
    }
  }

  function createScenarioPackage(name, nodeModulesPresent, lockedHostVersion) {
    const packageDir = path.join(tempDir, name);
    const packagePath = path.relative(ROOT, packageDir);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({ name: `canary-${name}`, version: "1.0.0" }),
    );
    writeFileSync(
      path.join(packageDir, "package-lock.json"),
      JSON.stringify({
        name: `canary-${name}`,
        version: "1.0.0",
        lockfileVersion: 3,
        packages: Object.fromEntries([
          ["", { name: `canary-${name}`, version: "1.0.0" }],
          ...hostPackages.map((packageName) => [
            `node_modules/${packageName}`,
            { version: lockedHostVersion },
          ]),
        ]),
      }),
    );

    if (nodeModulesPresent) {
      writeInstalledHostVersions(packageDir, "0.79.7");
      writeFileSync(
        path.join(packageDir, "node_modules", "unrelated-sentinel.txt"),
        "preserve me\n",
      );
    }

    return { packageDir, packagePath };
  }

  function fakeNpmEnv(logPath, extra = {}) {
    writeFileSync(logPath, "");
    return {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      FAKE_NPM_LOG: logPath,
      npm_config_before: "2026-07-03T00:00:00Z",
      NPM_CONFIG_MIN_RELEASE_AGE: "999999",
      ...extra,
    };
  }

  function fakeNpmCalls(logPath) {
    const contents = readFileSync(logPath, "utf8").trim();
    return contents.length === 0
      ? []
      : contents.split("\n").map((line) => JSON.parse(line));
  }

  const neutralEnvAssertion = [
    'const { readFileSync } = require("node:fs")',
    'for (const key of ["npm_config_before", "NPM_CONFIG_BEFORE", "npm_config_min_release_age", "NPM_CONFIG_MIN_RELEASE_AGE"]) if (process.env[key]) process.exit(81)',
    'for (const key of ["NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG", "npm_config_userconfig", "npm_config_globalconfig"]) if (!process.env[key] || readFileSync(process.env[key], "utf8") !== "") process.exit(82)',
  ].join("; ");
  const cases = [
    { id: "absent-success", nodeModulesPresent: false, scenarioFails: false },
    { id: "absent-scenario-failure", nodeModulesPresent: false, scenarioFails: true },
    { id: "absent-alignment-failure", nodeModulesPresent: false, scenarioFails: false },
    { id: "present-success", nodeModulesPresent: true, scenarioFails: false },
    {
      id: "present-alignment-failure",
      nodeModulesPresent: true,
      scenarioFails: false,
      lockedHostVersion: targetVersion,
    },
  ].map((entry) => ({
    ...entry,
    ...createScenarioPackage(
      entry.id,
      entry.nodeModulesPresent,
      entry.lockedHostVersion ?? lockedVersion,
    ),
  }));

  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(
    fakeNpmPath,
    `#!/usr/bin/env node
const { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const path = require("node:path");
for (const key of ["npm_config_before", "NPM_CONFIG_BEFORE", "npm_config_min_release_age", "NPM_CONFIG_MIN_RELEASE_AGE"]) {
  if (process.env[key]) process.exit(91);
}
for (const key of ["NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG", "npm_config_userconfig", "npm_config_globalconfig"]) {
  if (!process.env[key] || readFileSync(process.env[key], "utf8") !== "") process.exit(92);
}
const [operation, ...args] = process.argv.slice(2);
appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ cwd: process.cwd(), operation, args, neutral: true }) + "\\n");
const packageArgs = args.filter((arg) => !arg.startsWith("--"));
if (operation === "install") {
  for (const specifier of packageArgs) {
    const versionSeparator = specifier.lastIndexOf("@");
    const packageName = specifier.slice(0, versionSeparator);
    const version = specifier.slice(versionSeparator + 1);
    const installedPackageDir = path.join(process.cwd(), "node_modules", ...packageName.split("/"));
    mkdirSync(installedPackageDir, { recursive: true });
    writeFileSync(path.join(installedPackageDir, "package.json"), JSON.stringify({ name: packageName, version }));
    if (process.env.FAKE_NPM_FAIL_ONCE_MARKER && !existsSync(process.env.FAKE_NPM_FAIL_ONCE_MARKER)) {
      writeFileSync(process.env.FAKE_NPM_FAIL_ONCE_MARKER, "failed once");
      process.exit(93);
    }
  }
  if (process.env.FAKE_NPM_FAIL_AFTER_INSTALL === "1") process.exit(94);
} else if (operation === "uninstall") {
  for (const packageName of packageArgs) {
    rmSync(path.join(process.cwd(), "node_modules", ...packageName.split("/")), { recursive: true, force: true });
  }
} else {
  process.exit(95);
}
`,
  );
  chmodSync(fakeNpmPath, 0o755);

  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      hostPackage: hostPackages[0],
      hostCompanionPackages: hostPackages.slice(1),
      trackedChangelog: "https://example.test/pi-changelog",
      defaultProfile: "current",
      profiles: {
        current: {
          description: "Test deterministic node_modules restoration.",
          host: {
            version: targetVersion,
            reviewAnchor: `npm:${hostPackages[0]}@${targetVersion}`,
          },
        },
      },
      scenarios: cases.map((entry) => ({
        id: entry.id,
        title: entry.id,
        owner: "monorepo-root",
        why: "Canary cleanup must restore the package target state.",
        profiles: ["current"],
        packages: [entry.packagePath],
        upstreamSurfaces: ["node_modules restoration", "npm configuration isolation"],
        cwd: entry.packagePath,
        command: [
          process.execPath,
          "-e",
          `${neutralEnvAssertion}${entry.scenarioFails ? "; process.exit(23)" : ""}`,
        ],
      })),
    }),
  );

  try {
    for (const entry of cases.filter((candidate) => !candidate.nodeModulesPresent)) {
      const logPath = path.join(tempDir, `${entry.id}.jsonl`);
      const env = fakeNpmEnv(
        logPath,
        entry.id === "absent-alignment-failure"
          ? { FAKE_NPM_FAIL_AFTER_INSTALL: "1" }
          : {},
      );
      const args = ["run", "--manifest", manifestPath, "--scenario", entry.id];
      const result = entry.id === "absent-success"
        ? runJson(args, env)
        : runJsonFailure(args, env);

      assert.equal(result.results[0].host.preparation.packages[0].nodeModulesExistedBefore, false);
      assert.equal(result.results[0].host.restoration.status, "restored");
      assert.equal(
        result.results[0].host.restoration.packages[0].nodeModulesPresentAfter,
        false,
      );
      assert.equal(existsSync(path.join(entry.packageDir, "node_modules")), false);
      const calls = fakeNpmCalls(logPath);
      assert.deepEqual(
        calls.map((call) => [call.operation, call.neutral]),
        [["install", true]],
      );
      assert.ok(calls.every((call) => call.cwd === entry.packageDir));
    }

    const presentCase = cases.find((entry) => entry.id === "present-success");
    assert.ok(presentCase);
    const presentLogPath = path.join(tempDir, "present-success.jsonl");
    const presentResult = runJson(
      ["run", "--manifest", manifestPath, "--scenario", presentCase.id],
      fakeNpmEnv(presentLogPath),
    );
    assert.equal(presentResult.summary.passed, 1);
    assert.equal(
      presentResult.results[0].host.preparation.packages[0].nodeModulesExistedBefore,
      true,
    );
    assert.equal(presentResult.results[0].host.restoration.status, "restored");
    assert.equal(
      readFileSync(
        path.join(presentCase.packageDir, "node_modules", "unrelated-sentinel.txt"),
        "utf8",
      ),
      "preserve me\n",
    );
    for (const packageName of hostPackages) {
      const restoredPackageJson = JSON.parse(
        readFileSync(
          path.join(
            presentCase.packageDir,
            "node_modules",
            ...packageName.split("/"),
            "package.json",
          ),
          "utf8",
        ),
      );
      assert.equal(restoredPackageJson.version, lockedVersion);
    }
    const presentCalls = fakeNpmCalls(presentLogPath);
    assert.deepEqual(
      presentCalls.map((call) => [call.operation, call.neutral]),
      [
        ["install", true],
        ["install", true],
      ],
    );
    assert.ok(presentCalls.every((call) => call.cwd === presentCase.packageDir));

    const failedPresentCase = cases.find(
      (entry) => entry.id === "present-alignment-failure",
    );
    assert.ok(failedPresentCase);
    const failedPresentLogPath = path.join(tempDir, "present-alignment-failure.jsonl");
    const failedPresentResult = runJsonFailure(
      ["run", "--manifest", manifestPath, "--scenario", failedPresentCase.id],
      fakeNpmEnv(failedPresentLogPath, {
        FAKE_NPM_FAIL_ONCE_MARKER: path.join(tempDir, "failed-once.marker"),
      }),
    );
    assert.equal(
      failedPresentResult.results[0].host.preparation.packages[0].needsRestore,
      false,
    );
    assert.equal(failedPresentResult.results[0].host.restoration.status, "restored");
    assert.equal(
      readFileSync(
        path.join(failedPresentCase.packageDir, "node_modules", "unrelated-sentinel.txt"),
        "utf8",
      ),
      "preserve me\n",
    );
    for (const packageName of hostPackages) {
      const restoredPackageJson = JSON.parse(
        readFileSync(
          path.join(
            failedPresentCase.packageDir,
            "node_modules",
            ...packageName.split("/"),
            "package.json",
          ),
          "utf8",
        ),
      );
      assert.equal(restoredPackageJson.version, targetVersion);
    }
    const failedPresentCalls = fakeNpmCalls(failedPresentLogPath);
    assert.deepEqual(
      failedPresentCalls.map((call) => [call.operation, call.neutral]),
      [
        ["install", true],
        ["install", true],
      ],
    );
    assert.ok(failedPresentCalls.every((call) => call.cwd === failedPresentCase.packageDir));
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
