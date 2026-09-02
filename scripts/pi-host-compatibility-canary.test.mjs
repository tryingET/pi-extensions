// ---
// summary: "Tests Pi host canary manifest contracts, scenario inventory, host resolution, dry runs, and npm isolation."
// read_when:
//   - "Changing host compatibility profiles, canary scenarios, package roots, or neutral npm handling."
// ---
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); const SCRIPT = path.join(ROOT, "scripts", "pi-host-compatibility-canary.mjs"); const CHECKOUT_LOCK = path.join(ROOT, ".pi-host-compatibility-canary.lock");
function runJson(args, env = process.env) {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, ...args, "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
      env,
    }),
  );
}
function runJsonFailure(args, env = process.env) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args, "--json"], {
    cwd: ROOT,
    encoding: "utf-8",
    env,
  });
  assert.notEqual(result.status, 0, `Expected command to fail: ${args.join(" ")}`); rmSync(CHECKOUT_LOCK, { force: true });
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

test("zero-package read-only scenario completes its mutation session and leaves recovery clean", () => {
  const tempDir = mkdtempSync(path.join(ROOT, ".pi-host-zero-package-"));
  try {
    const manifestPath = path.join(tempDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(minimalManifest(".", []))}\n`);
    const run = runJson(["run", "--manifest", manifestPath, "--scenario", "path-containment"]);
    assert.equal(run.summary.passed, 1, JSON.stringify(run.summary));
    const status = runJson(["status", "--manifest", manifestPath]);
    assert.equal(status.status, "clean");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("compatibility canary manifest validates", () => {
  const result = runJson(["validate"]);
  assert.equal(result.ok, true);
  assert.equal(result.defaultProfile, "current");
  assert.equal(result.hostPackage, "@earendil-works/pi-coding-agent");
  assert.ok(result.hostCompanionPackages.includes("@earendil-works/pi-ai"));
  assert.ok(result.scenarioCount >= 11, `expected the drift-guard scenario, count=${result.scenarioCount}`);
  assert.ok(result.profiles.includes("upgrade"));
});

test("dev-pin drift guard passes on the real repository and reports aligned declarations", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "pi-host-compatibility-canary", "check-dev-pin-drift.mjs")],
    { cwd: ROOT, encoding: "utf-8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok: pi host contract pins \(\d+ declaration\(s\)\/lock entries at \d+\.\d+\.\d+\)\n?$/);
});

test("dev-pin drift guard fails closed on drift and refuses vacuous passes", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "pi-host-dev-pin-drift-"));
  try {
    const alignedRoot = path.join(tempDir, "aligned");
    const driftedRoot = path.join(tempDir, "drifted");
    const emptyRoot = path.join(tempDir, "empty");
    for (const root of [alignedRoot, driftedRoot, emptyRoot]) {
      mkdirSync(path.join(root, "packages", "sample-a"), { recursive: true });
    }
    const alignedManifest = {
      name: "sample-a",
      devDependencies: {
        "@earendil-works/pi-ai": "0.83.0",
        "@earendil-works/pi-coding-agent": "0.83.0",
      },
    };
    writeFileSync(
      path.join(alignedRoot, "packages", "sample-a", "package.json"),
      `${JSON.stringify(alignedManifest)}\n`,
    );
    const driftedManifest = {
      ...alignedManifest,
      devDependencies: { "@earendil-works/pi-ai": "0.82.0" },
    };
    writeFileSync(
      path.join(driftedRoot, "packages", "sample-a", "package.json"),
      `${JSON.stringify(driftedManifest)}\n`,
    );
    const checker = path.join(ROOT, "scripts", "pi-host-compatibility-canary", "check-dev-pin-drift.mjs");
    const fixtureManifestPath = path.join(tempDir, "manifest.json");
    writeFileSync(fixtureManifestPath, `${JSON.stringify(minimalManifest(".", []))}\n`);
    const checkerArgs = ["--manifest", fixtureManifestPath];

    const aligned = spawnSync(process.execPath, [checker, ...checkerArgs, "--repo-root", alignedRoot], {
      encoding: "utf-8",
    });
    assert.equal(aligned.status, 0, aligned.stderr);
    assert.match(aligned.stdout, /2 declaration/);

    const drifted = spawnSync(process.execPath, [checker, ...checkerArgs, "--repo-root", driftedRoot], {
      encoding: "utf-8",
    });
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /packages\/sample-a\/package\.json: devDependencies\.@earendil-works\/pi-ai=0\.82\.0 \(expected 0\.83\.0\)/);

    const vacuous = spawnSync(process.execPath, [checker, ...checkerArgs, "--repo-root", path.join(emptyRoot, "nowhere")], {
      encoding: "utf-8",
    });
    assert.notEqual(vacuous.status, 0);
    assert.match(vacuous.stderr, /refusing to pass vacuously/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
test("compatibility canary resolves the exact current host contract", () => {
  const result = runJson(["resolve-host", "--profile", "current"]);
  assert.equal(result.profile, "current");
  assert.equal(result.host.packageName, "@earendil-works/pi-coding-agent");
  assert.equal(result.host.version, "0.84.3");
  assert.equal(result.host.reviewAnchor, "npm:@earendil-works/pi-coding-agent@0.84.3");
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
test("compatibility canary executes pi-session-compaction against the real host registry", () => {
  const result = runJson(["list", "--profile", "current"]);
  const scenario = result.scenarios.find(
    (entry) => entry.id === "session-compaction-model-registry-contract",
  );

  assert.ok(scenario);
  assert.equal(scenario.owner, "pi-session-compaction");
  assert.deepEqual(scenario.packages, ["packages/pi-session-compaction"]);
  assert.ok(scenario.upstreamSurfaces.includes("ModelRegistry.complete public completion seam"));
  assert.ok(
    scenario.upstreamSurfaces.includes("normalized thinking to API-specific public options"),
  );
  assert.ok(scenario.upstreamSurfaces.includes("fail-closed unknown API option mapping"));
  assert.equal(scenario.cwd, "packages/pi-session-compaction");
  assert.deepEqual(scenario.command, [
    "node",
    "--test",
    "tests/host-completion.test.mjs",
  ]);
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
  const hostPackages = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-tui"];
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

  function assertInstalledHostVersions(packageDir, version) {
    for (const packageName of hostPackages) {
      const file = path.join(packageDir, "node_modules", ...packageName.split("/"), "package.json");
      assert.equal(JSON.parse(readFileSync(file, "utf8")).version, version);
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

  const observedLogPaths = [];
  const testStateRoot = path.join(process.env.HOME, ".local", "state", `pi-host-canary-tests-${path.basename(tempDir)}`);
  function fakeNpmEnv(logPath, extra = {}) {
    observedLogPaths.push(logPath);
    writeFileSync(logPath, "");
    const stateHome = path.join(testStateRoot, path.basename(logPath));
    mkdirSync(stateHome, { recursive: true, mode: 0o700 });
    const ambient = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("FAKE_NPM_")));
    return {
      ...ambient,
      XDG_STATE_HOME: stateHome,
      PATH: `${fakeBin}${path.delimiter}${ambient.PATH ?? ""}`,
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
const { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require("node:fs");
const path = require("node:path");
for (const key of ["npm_config_before", "NPM_CONFIG_BEFORE", "npm_config_min_release_age", "NPM_CONFIG_MIN_RELEASE_AGE"]) if (process.env[key]) process.exit(91);
for (const key of ["NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG", "npm_config_userconfig", "npm_config_globalconfig"]) if (!process.env[key] || readFileSync(process.env[key], "utf8") !== "") process.exit(92);
const [operation, ...args] = process.argv.slice(2);
appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ cwd: process.cwd(), operation, args, neutral: true }) + "\\n");
const packageArgs = args.filter((arg) => !arg.startsWith("--"));
const failRestoreCwds = JSON.parse(process.env.FAKE_NPM_FAIL_RESTORE_CWDS || "[]");
let installedVersion;
if (operation === "install") {
  for (const specifier of packageArgs) {
    const versionSeparator = specifier.lastIndexOf("@");
    const packageName = specifier.slice(0, versionSeparator);
    const version = specifier.slice(versionSeparator + 1);
    installedVersion = version;
    const installedPackageDir = path.join(process.cwd(), "node_modules", ...packageName.split("/"));
    mkdirSync(installedPackageDir, { recursive: true });
    writeFileSync(path.join(installedPackageDir, "package.json"), JSON.stringify({ name: packageName, version }));
    if (process.env.FAKE_NPM_FAIL_ONCE_MARKER && !existsSync(process.env.FAKE_NPM_FAIL_ONCE_MARKER)) {
      writeFileSync(process.env.FAKE_NPM_FAIL_ONCE_MARKER, "failed once"); process.exit(93);
    }
  }
  if (process.env.FAKE_NPM_MALFORMED_AFTER_INSTALL === "1" && packageArgs.length > 0 && (!process.env.FAKE_NPM_MALFORMED_MARKER || !existsSync(process.env.FAKE_NPM_MALFORMED_MARKER))) {
    const first = packageArgs[0];
    const packageName = first.slice(0, first.lastIndexOf("@"));
    if (process.env.FAKE_NPM_MALFORMED_MARKER) writeFileSync(process.env.FAKE_NPM_MALFORMED_MARKER, "malformed once");
    writeFileSync(path.join(process.cwd(), "node_modules", ...packageName.split("/"), "package.json"), "{");
  }
  if (process.cwd() === process.env.FAKE_NPM_SWAP_TRIGGER_CWD) {
    renameSync(process.env.FAKE_NPM_SWAP_SOURCE, process.env.FAKE_NPM_SWAP_BACKUP); renameSync(process.env.FAKE_NPM_SWAP_VICTIM, process.env.FAKE_NPM_SWAP_SOURCE);
  }
  if (process.cwd() === process.env.FAKE_NPM_REMOVE_TRIGGER_CWD) rmSync(process.env.FAKE_NPM_REMOVE_TARGET, { recursive: true, force: true });
  if (process.cwd() === process.env.FAKE_NPM_MUTATE_TRIGGER_CWD && (!process.env.FAKE_NPM_MUTATE_ON_VERSION || installedVersion === process.env.FAKE_NPM_MUTATE_ON_VERSION)) {
    const packageName = process.env.FAKE_NPM_MUTATE_OTHER_PACKAGE;
    const packageJson = path.join(process.env.FAKE_NPM_MUTATE_OTHER_TARGET, ...packageName.split("/"), "package.json");
    writeFileSync(packageJson, JSON.stringify({ name: packageName, version: "0.0.0" }));
  }
  if (process.cwd() === process.env.FAKE_NPM_SWAP_NODE_MODULES_CWD && installedVersion === process.env.FAKE_NPM_SWAP_NODE_MODULES_ON_VERSION) {
    const root = path.join(process.cwd(), "node_modules");
    renameSync(root, process.env.FAKE_NPM_SWAP_NODE_MODULES_BACKUP);
    renameSync(process.env.FAKE_NPM_SWAP_NODE_MODULES_VICTIM, root);
  }
  if (installedVersion === process.env.FAKE_NPM_TOUCH_OTHER_ON_VERSION && process.env.FAKE_NPM_TOUCH_OTHER_TARGET) {
    mkdirSync(process.env.FAKE_NPM_TOUCH_OTHER_TARGET, { recursive: true }); writeFileSync(path.join(process.env.FAKE_NPM_TOUCH_OTHER_TARGET, "unexpected.txt"), "created");
  }
  if (process.env.FAKE_NPM_SWAP_SANDBOX_VICTIM) {
    const sandbox = path.dirname(process.env.NPM_CONFIG_USERCONFIG);
    const moved = sandbox + ".moved";
    renameSync(sandbox, moved); renameSync(process.env.FAKE_NPM_SWAP_SANDBOX_VICTIM, sandbox);
    writeFileSync(process.env.FAKE_NPM_SWAP_SANDBOX_MARKER, JSON.stringify({ sandbox, moved }));
  }
  if (process.env.FAKE_NPM_FAIL_AFTER_INSTALL === "1") process.exit(94);
  if (failRestoreCwds.includes(process.cwd()) && installedVersion === process.env.FAKE_NPM_FAIL_VERSION) process.exit(96);
} else if (operation === "uninstall") {
  for (const packageName of packageArgs) rmSync(path.join(process.cwd(), "node_modules", ...packageName.split("/")), { recursive: true, force: true });
} else {
  process.exit(95);
}
`,
  );
  chmodSync(fakeNpmPath, 0o755);

  function scenarioDefinition(id, packages, cwd, command) {
    return {
      id,
      title: id,
      owner: "monorepo-root",
      why: "Canary cleanup must restore the package target state.",
      profiles: ["current"],
      packages,
      upstreamSurfaces: ["node_modules restoration", "npm configuration isolation"],
      cwd,
      command,
    };
  }

  function writeManifest(scenarios) {
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
        scenarios,
      }),
    );
  }

  writeManifest(
    cases.map((entry) =>
      scenarioDefinition(
        entry.id,
        [entry.packagePath],
        entry.packagePath,
        [
          process.execPath,
          "-e",
          `${neutralEnvAssertion}${entry.scenarioFails ? "; process.exit(23)" : ""}`,
        ],
      ),
    ),
  );

  const hostileVictim = mkdtempSync(path.join(tmpdir(), "pi-host-compat-hostile-env-"));
  writeFileSync(path.join(hostileVictim, "sentinel.txt"), "outside\n");
  const hostileAmbient = { FAKE_NPM_FAIL_AFTER_INSTALL: "1", FAKE_NPM_SWAP_SANDBOX_VICTIM: hostileVictim };
  const previousAmbient = Object.fromEntries(Object.keys(hostileAmbient).map((name) => [name, process.env[name]])); Object.assign(process.env, hostileAmbient);
  try {
    for (const entry of cases.filter((candidate) => !candidate.nodeModulesPresent)) {
      const logPath = path.join(tempDir, `${entry.id}.jsonl`);
      const env = fakeNpmEnv(
        logPath,
        entry.id === "absent-alignment-failure"
          ? { FAKE_NPM_FAIL_AFTER_INSTALL: "1" }
          : {},
      );
      if (entry.id === "absent-success") {
        assert.equal(env.FAKE_NPM_FAIL_AFTER_INSTALL, undefined);
        assert.equal(env.FAKE_NPM_SWAP_SANDBOX_VICTIM, undefined);
      }
      const args = ["run", "--manifest", manifestPath, "--scenario", entry.id];
      const result = entry.id === "absent-success"
        ? runJson(args, env)
        : runJsonFailure(args, env);
      if (entry.id === "absent-success") assert.equal(result.summary.passed, 1);

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
    assert.equal(readFileSync(path.join(hostileVictim, "sentinel.txt"), "utf8"), "outside\n");

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
    assertInstalledHostVersions(presentCase.packageDir, lockedVersion);
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
    assertInstalledHostVersions(failedPresentCase.packageDir, targetVersion);
    const failedPresentCalls = fakeNpmCalls(failedPresentLogPath);
    assert.deepEqual(
      failedPresentCalls.map((call) => [call.operation, call.neutral]),
      [
        ["install", true],
        ["install", true],
      ],
    );
    assert.ok(failedPresentCalls.every((call) => call.cwd === failedPresentCase.packageDir));

    const multiPresent = createScenarioPackage("multi-present", true, lockedVersion);
    const multiAbsent = createScenarioPackage("multi-absent", false, lockedVersion);
    writeManifest([
      scenarioDefinition(
        "multi-target-restore-failure",
        [multiPresent.packagePath, multiAbsent.packagePath],
        multiPresent.packagePath,
        [process.execPath, "-e", neutralEnvAssertion],
      ),
    ]);
    const multiLog = path.join(tempDir, "multi-target.jsonl");
    const multiResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(multiLog, {
        FAKE_NPM_FAIL_RESTORE_CWDS: JSON.stringify([multiPresent.packageDir]),
        FAKE_NPM_FAIL_VERSION: lockedVersion,
      }),
    );
    assert.equal(multiResult.aborted, true);
    assert.equal(multiResult.abortReason, "restoration-failed");
    assert.equal(existsSync(path.join(multiAbsent.packageDir, "node_modules")), false);
    assert.equal(multiResult.results[0].host.restoration.packages.length, 2);
    assert.equal(multiResult.results[0].host.restoration.errors.length, 1);

    const lateAbsent = createScenarioPackage("late-absent", false, lockedVersion);
    const latePresent = createScenarioPackage("late-present", true, lockedVersion);
    writeManifest([scenarioDefinition(
      "late-cross-target-cleanup", [lateAbsent.packagePath, latePresent.packagePath],
      latePresent.packagePath, [process.execPath, "-e", neutralEnvAssertion],
    )]);
    const lateResult = runJson(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "late-cleanup.jsonl"), {
        FAKE_NPM_TOUCH_OTHER_ON_VERSION: lockedVersion,
        FAKE_NPM_TOUCH_OTHER_TARGET: path.join(lateAbsent.packageDir, "node_modules"),
      }),
    );
    assert.equal(lateResult.results[0].host.restoration.status, "restored");
    assert.equal(existsSync(path.join(lateAbsent.packageDir, "node_modules")), false);

    const barrierA = createScenarioPackage("barrier-a", true, lockedVersion);
    const barrierB = createScenarioPackage("barrier-b", true, lockedVersion);
    writeManifest([scenarioDefinition(
      "final-all-target-barrier", [barrierA.packagePath, barrierB.packagePath],
      barrierA.packagePath, [process.execPath, "-e", neutralEnvAssertion],
    )]);
    const barrierResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "final-barrier.jsonl"), {
        FAKE_NPM_MUTATE_TRIGGER_CWD: barrierA.packageDir,
        FAKE_NPM_MUTATE_ON_VERSION: lockedVersion,
        FAKE_NPM_MUTATE_OTHER_TARGET: path.join(barrierB.packageDir, "node_modules"),
        FAKE_NPM_MUTATE_OTHER_PACKAGE: hostPackages[0],
      }),
    );
    assert.equal(barrierResult.abortReason, "restoration-failed");
    assert.ok(barrierResult.results[0].host.restoration.errors.some(
      (entry) => entry.phase === "final-barrier" && entry.packagePath === barrierB.packagePath,
    ));

    const dualA = createScenarioPackage("dual-a", true, lockedVersion);
    const dualB = createScenarioPackage("dual-b", true, lockedVersion);
    writeManifest([scenarioDefinition(
      "dual-restore-failure", [dualA.packagePath, dualB.packagePath], dualA.packagePath,
      [process.execPath, "-e", neutralEnvAssertion],
    )]);
    const dualResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "dual.jsonl"), {
        FAKE_NPM_FAIL_RESTORE_CWDS: JSON.stringify([dualA.packageDir, dualB.packageDir]),
        FAKE_NPM_FAIL_VERSION: lockedVersion,
      }),
    );
    assert.equal(
      dualResult.results[0].host.restoration.errors.filter(
        (entry) => entry.phase === "restore-command",
      ).length,
      2,
    );

    const combined = createScenarioPackage("combined-failure", true, lockedVersion);
    writeManifest([scenarioDefinition(
      "scenario-and-restore-failure", [combined.packagePath], combined.packagePath,
      [process.execPath, "-e", `${neutralEnvAssertion}; process.stdout.write("scenario-out"); process.stderr.write("scenario-err"); process.exit(23)`],
    )]);
    const combinedResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "combined.jsonl"), {
        FAKE_NPM_FAIL_RESTORE_CWDS: JSON.stringify([combined.packageDir]),
        FAKE_NPM_FAIL_VERSION: lockedVersion,
      }),
    );
    assert.equal(combinedResult.results[0].exitCode, 23);
    assert.equal(combinedResult.results[0].lifecycleErrors.scenario.exitCode, 23);
    assert.equal(combinedResult.results[0].stdout, "scenario-out");
    assert.equal(combinedResult.results[0].stderr, "scenario-err");
    assert.ok(combinedResult.results[0].lifecycleErrors.restoration.length > 0);

    const abortFirst = createScenarioPackage("abort-first", true, lockedVersion);
    const abortSecond = createScenarioPackage("abort-second", false, lockedVersion);
    const secondMarker = path.join(tempDir, "second-scenario-ran.marker");
    writeManifest([
      scenarioDefinition("abort-first", [abortFirst.packagePath], abortFirst.packagePath,
        [process.execPath, "-e", neutralEnvAssertion]),
      scenarioDefinition("must-not-run", [abortSecond.packagePath], abortSecond.packagePath,
        [process.execPath, "-e", `require("node:fs").writeFileSync(${JSON.stringify(secondMarker)}, "ran")`]),
    ]);
    const abortedResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "abort.jsonl"), {
        FAKE_NPM_FAIL_RESTORE_CWDS: JSON.stringify([abortFirst.packageDir]),
        FAKE_NPM_FAIL_VERSION: lockedVersion,
      }),
    );
    assert.equal(abortedResult.summary.selected, 1);
    assert.equal(abortedResult.aborted, true);
    assert.equal(existsSync(secondMarker), false);

    for (const initiallyPresent of [false, true]) {
      const id = `malformed-${initiallyPresent ? "present" : "absent"}`;
      const malformed = createScenarioPackage(id, initiallyPresent, lockedVersion);
      writeManifest([scenarioDefinition(
        id, [malformed.packagePath], malformed.packagePath,
        [process.execPath, "-e", neutralEnvAssertion],
      )]);
      const malformedResult = runJsonFailure(
        ["run", "--manifest", manifestPath],
        fakeNpmEnv(path.join(tempDir, `${id}.jsonl`), {
          FAKE_NPM_MALFORMED_AFTER_INSTALL: "1",
          FAKE_NPM_MALFORMED_MARKER: path.join(tempDir, `${id}.marker`),
        }),
      );
      assert.match(malformedResult.results[0].lifecycleErrors.preparation, /JSON|Unexpected/);
      if (initiallyPresent) assertInstalledHostVersions(malformed.packageDir, lockedVersion);
      else assert.equal(existsSync(path.join(malformed.packageDir, "node_modules")), false);
    }

    const mixed = createScenarioPackage("mixed-restore", true, lockedVersion);
    const mixedLockPath = path.join(mixed.packageDir, "package-lock.json");
    const mixedLock = JSON.parse(readFileSync(mixedLockPath, "utf8"));
    delete mixedLock.packages[`node_modules/${hostPackages[2]}`];
    writeFileSync(mixedLockPath, JSON.stringify(mixedLock));
    const mixedVictim = path.join(tempDir, "mixed-victim");
    mkdirSync(mixedVictim);
    writeFileSync(path.join(mixedVictim, "sentinel.txt"), "safe\n");
    writeManifest([scenarioDefinition(
      "mixed-restore", [mixed.packagePath], mixed.packagePath,
      [process.execPath, "-e", neutralEnvAssertion],
    )]);
    const mixedLog = path.join(tempDir, "mixed-restore.jsonl");
    const mixedResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(mixedLog, {
        FAKE_NPM_SWAP_NODE_MODULES_CWD: mixed.packageDir,
        FAKE_NPM_SWAP_NODE_MODULES_ON_VERSION: lockedVersion,
        FAKE_NPM_SWAP_NODE_MODULES_BACKUP: path.join(tempDir, "mixed-original-node-modules"),
        FAKE_NPM_SWAP_NODE_MODULES_VICTIM: mixedVictim,
      }),
    );
    assert.equal(mixedResult.abortReason, "restoration-failed");
    assert.deepEqual(fakeNpmCalls(mixedLog).map((call) => call.operation), ["install", "install"]);
    assert.equal(readFileSync(path.join(mixed.packageDir, "node_modules", "sentinel.txt"), "utf8"), "safe\n");

    const sandboxSwap = createScenarioPackage("sandbox-swap", false, lockedVersion);
    const sandboxVictim = path.join(tempDir, "sandbox-victim");
    const sandboxMarker = path.join(tempDir, "sandbox-swap.marker.json");
    mkdirSync(sandboxVictim);
    writeFileSync(path.join(sandboxVictim, "sentinel.txt"), "safe\n");
    writeManifest([scenarioDefinition(
      "sandbox-swap", [sandboxSwap.packagePath], sandboxSwap.packagePath,
      [process.execPath, "-e", neutralEnvAssertion],
    )]);
    let sandboxRecord;
    try {
      const sandboxResult = runJsonFailure(
        ["run", "--manifest", manifestPath],
        fakeNpmEnv(path.join(tempDir, "sandbox-swap.jsonl"), {
          FAKE_NPM_SWAP_SANDBOX_VICTIM: sandboxVictim,
          FAKE_NPM_SWAP_SANDBOX_MARKER: sandboxMarker,
        }),
      );
      assert.equal(sandboxResult.abortReason, "integrity-failed");
      sandboxRecord = JSON.parse(readFileSync(sandboxMarker, "utf8"));
      assert.equal(readFileSync(path.join(sandboxRecord.sandbox, "sentinel.txt"), "utf8"), "safe\n");
    } finally {
      if (!sandboxRecord && existsSync(sandboxMarker)) sandboxRecord = JSON.parse(readFileSync(sandboxMarker, "utf8"));
      if (sandboxRecord?.sandbox && existsSync(sandboxRecord.sandbox)) renameSync(sandboxRecord.sandbox, sandboxVictim);
      if (sandboxRecord?.moved) rmSync(sandboxRecord.moved, { recursive: true, force: true });
    }
    assert.equal(readFileSync(path.join(sandboxVictim, "sentinel.txt"), "utf8"), "safe\n");

    for (const dangling of [false, true]) {
      const linked = createScenarioPackage(`symlink-${dangling ? "dangling" : "valid"}`, false, lockedVersion);
      const linkTarget = path.join(tempDir, `symlink-target-${dangling}`);
      if (!dangling) {
        mkdirSync(linkTarget);
        writeFileSync(path.join(linkTarget, "sentinel.txt"), "untouched\n");
      }
      symlinkSync(linkTarget, path.join(linked.packageDir, "node_modules"), "dir");
      writeManifest([
        scenarioDefinition(
          `symlink-${dangling}`,
          [linked.packagePath],
          linked.packagePath,
          [process.execPath, "-e", neutralEnvAssertion],
        ),
      ]);
      const linkLog = path.join(tempDir, `symlink-${dangling}.jsonl`);
      const linkResult = runJsonFailure(
        ["run", "--manifest", manifestPath],
        fakeNpmEnv(linkLog),
      );
      assert.match(linkResult.results[0].lifecycleErrors.preparation, /symlink/);
      assert.equal(fakeNpmCalls(linkLog).length, 0);
      assert.equal(lstatSync(path.join(linked.packageDir, "node_modules")).isSymbolicLink(), true);
      if (!dangling) {
        assert.equal(readFileSync(path.join(linkTarget, "sentinel.txt"), "utf8"), "untouched\n");
      }
    }

    const preflightEarly = createScenarioPackage("preflight-early", false, lockedVersion);
    const preflightInvalid = createScenarioPackage("preflight-invalid", false, lockedVersion);
    const preflightTarget = path.join(tempDir, "preflight-invalid-target");
    mkdirSync(preflightTarget);
    symlinkSync(preflightTarget, path.join(preflightInvalid.packageDir, "node_modules"), "dir");
    writeManifest([scenarioDefinition(
      "all-target-preflight", [preflightEarly.packagePath, preflightInvalid.packagePath],
      preflightEarly.packagePath, [process.execPath, "-e", neutralEnvAssertion],
    )]);
    const preflightLog = path.join(tempDir, "all-target-preflight.jsonl");
    const preflightResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(preflightLog),
    );
    assert.equal(preflightResult.aborted, true);
    assert.equal(preflightResult.abortReason, "integrity-failed");
    assert.equal(fakeNpmCalls(preflightLog).length, 0);
    assert.equal(existsSync(path.join(preflightEarly.packageDir, "node_modules")), false);

    const npmSwapEarly = createScenarioPackage("npm-swap-early", false, lockedVersion);
    const npmSwapLater = createScenarioPackage("npm-swap-later", true, lockedVersion);
    const npmSwapVictim = createScenarioPackage("npm-swap-victim", true, lockedVersion);
    const npmSwapBackup = path.join(tempDir, "npm-swap-original");
    writeFileSync(path.join(npmSwapVictim.packageDir, "node_modules", "victim.txt"), "safe\n");
    writeManifest([scenarioDefinition(
      "pre-effect-target-swap", [npmSwapEarly.packagePath, npmSwapLater.packagePath],
      npmSwapEarly.packagePath, [process.execPath, "-e", neutralEnvAssertion],
    )]);
    const npmSwapLog = path.join(tempDir, "pre-effect-target-swap.jsonl");
    const npmSwapResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(npmSwapLog, {
        FAKE_NPM_SWAP_TRIGGER_CWD: npmSwapEarly.packageDir,
        FAKE_NPM_SWAP_SOURCE: npmSwapLater.packageDir,
        FAKE_NPM_SWAP_BACKUP: npmSwapBackup,
        FAKE_NPM_SWAP_VICTIM: npmSwapVictim.packageDir,
      }),
    );
    assert.equal(npmSwapResult.aborted, true);
    assert.equal(npmSwapResult.abortReason, "integrity-failed");
    assert.equal(fakeNpmCalls(npmSwapLog).length, 1);
    assert.equal(existsSync(path.join(npmSwapEarly.packageDir, "node_modules")), false);

    const removedTargetEarly = createScenarioPackage("removed-target-early", false, lockedVersion);
    const removedTargetLater = createScenarioPackage("removed-target-later", true, lockedVersion);
    writeManifest([scenarioDefinition(
      "removed-target-integrity", [removedTargetEarly.packagePath, removedTargetLater.packagePath],
      removedTargetEarly.packagePath, [process.execPath, "-e", neutralEnvAssertion],
    )]);
    const removedTargetResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "removed-target.jsonl"), {
        FAKE_NPM_REMOVE_TRIGGER_CWD: removedTargetEarly.packageDir,
        FAKE_NPM_REMOVE_TARGET: removedTargetLater.packageDir,
      }),
    );
    assert.equal(removedTargetResult.abortReason, "integrity-failed");
    assert.equal(removedTargetResult.results[0].integrityFailed, true);
    assert.equal(existsSync(path.join(removedTargetEarly.packageDir, "node_modules")), false);
    assert.equal(
      readFileSync(path.join(npmSwapLater.packageDir, "node_modules", "victim.txt"), "utf8"),
      "safe\n",
    );

    const crossEarlier = createScenarioPackage("cross-earlier", true, lockedVersion);
    const crossLater = createScenarioPackage("cross-later", false, lockedVersion);
    writeInstalledHostVersions(crossEarlier.packageDir, targetVersion);
    const crossMarker = path.join(tempDir, "cross-scenario-ran.marker");
    writeManifest([scenarioDefinition(
      "cross-target-post-alignment", [crossEarlier.packagePath, crossLater.packagePath],
      crossLater.packagePath,
      [process.execPath, "-e", `require("node:fs").writeFileSync(${JSON.stringify(crossMarker)}, "ran")`],
    )]);
    const crossResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "cross-target.jsonl"), {
        FAKE_NPM_MUTATE_TRIGGER_CWD: crossLater.packageDir,
        FAKE_NPM_MUTATE_OTHER_TARGET: path.join(crossEarlier.packageDir, "node_modules"),
        FAKE_NPM_MUTATE_OTHER_PACKAGE: hostPackages[0],
      }),
    );
    assert.equal(crossResult.abortReason, "integrity-failed");
    assert.equal(crossResult.results[0].integrityFailed, true);
    assert.equal(existsSync(crossMarker), false);
    assertInstalledHostVersions(crossEarlier.packageDir, lockedVersion);
    assert.equal(existsSync(path.join(crossLater.packageDir, "node_modules")), false);

    const cwdSwapTarget = createScenarioPackage("cwd-swap-target", false, lockedVersion);
    const cwdSwapSource = createScenarioPackage("cwd-swap-source", true, lockedVersion);
    const cwdSwapVictim = createScenarioPackage("cwd-swap-victim", true, lockedVersion);
    const cwdSwapBackup = path.join(tempDir, "cwd-swap-original");
    const cwdMarker = path.join(tempDir, "cwd-scenario-ran.marker");
    writeFileSync(path.join(cwdSwapVictim.packageDir, "node_modules", "victim.txt"), "safe\n");
    writeManifest([
      scenarioDefinition(
        "pre-effect-cwd-swap",
        [cwdSwapTarget.packagePath],
        cwdSwapSource.packagePath,
        [process.execPath, "-e", `require("node:fs").writeFileSync(${JSON.stringify(cwdMarker)}, "ran")`],
      ),
    ]);
    const cwdSwapResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "pre-effect-cwd-swap.jsonl"), {
        FAKE_NPM_SWAP_TRIGGER_CWD: cwdSwapTarget.packageDir,
        FAKE_NPM_SWAP_SOURCE: cwdSwapSource.packageDir,
        FAKE_NPM_SWAP_BACKUP: cwdSwapBackup,
        FAKE_NPM_SWAP_VICTIM: cwdSwapVictim.packageDir,
      }),
    );
    assert.equal(cwdSwapResult.abortReason, "integrity-failed");
    assert.equal(cwdSwapResult.results[0].integrityFailed, true);
    assert.equal(existsSync(cwdMarker), false);
    assert.equal(
      readFileSync(path.join(cwdSwapSource.packageDir, "node_modules", "victim.txt"), "utf8"),
      "safe\n",
    );

    for (const replacementKind of ["symlink", "directory"]) {
      const cleanupSwap = createScenarioPackage(`cleanup-${replacementKind}`, false, lockedVersion);
      const cleanupVictim = path.join(tempDir, `cleanup-${replacementKind}-victim`);
      const cleanupNodeModules = path.join(cleanupSwap.packageDir, "node_modules");
      mkdirSync(cleanupVictim);
      writeFileSync(path.join(cleanupVictim, "sentinel.txt"), "safe\n");
      const replace = replacementKind === "symlink"
        ? `fs.symlinkSync(${JSON.stringify(cleanupVictim)}, ${JSON.stringify(cleanupNodeModules)}, "dir")`
        : `fs.renameSync(${JSON.stringify(cleanupVictim)}, ${JSON.stringify(cleanupNodeModules)})`;
      writeManifest([scenarioDefinition(
        `cleanup-${replacementKind}`, [cleanupSwap.packagePath], cleanupSwap.packagePath,
        [process.execPath, "-e", `const fs=require("node:fs"); fs.rmSync(${JSON.stringify(cleanupNodeModules)}, { recursive: true }); ${replace}`],
      )]);
      const cleanupResult = runJsonFailure(
        ["run", "--manifest", manifestPath],
        fakeNpmEnv(path.join(tempDir, `cleanup-${replacementKind}.jsonl`)),
      );
      assert.equal(cleanupResult.abortReason, "restoration-failed");
      assert.equal(readFileSync(path.join(cleanupNodeModules, "sentinel.txt"), "utf8"), "safe\n");
    }

    const swapSource = createScenarioPackage("swap-source", true, lockedVersion);
    const swapVictim = createScenarioPackage("swap-victim", true, lockedVersion);
    const swapBackup = path.join(tempDir, "swap-original");
    writeFileSync(path.join(swapVictim.packageDir, "node_modules", "victim.txt"), "survive\n");
    writeManifest([scenarioDefinition(
      "target-identity-swap", [swapSource.packagePath], swapSource.packagePath,
      [process.execPath, "-e", `const fs=require("node:fs"); fs.renameSync(${JSON.stringify(swapSource.packageDir)}, ${JSON.stringify(swapBackup)}); fs.renameSync(${JSON.stringify(swapVictim.packageDir)}, ${JSON.stringify(swapSource.packageDir)})`],
    )]);
    const swapResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "swap.jsonl")),
    );
    assert.equal(swapResult.results[0].host.restoration.errors[0].phase, "identity");
    assert.equal(
      readFileSync(path.join(swapSource.packageDir, "node_modules", "victim.txt"), "utf8"),
      "survive\n",
    );

    const removedPresent = createScenarioPackage("removed-present", true, lockedVersion);
    writeManifest([scenarioDefinition(
      "removed-present", [removedPresent.packagePath], removedPresent.packagePath,
      [process.execPath, "-e", `require("node:fs").rmSync(${JSON.stringify(path.join(removedPresent.packageDir, "node_modules"))}, { recursive: true, force: true })`],
    )]);
    const removedResult = runJsonFailure(
      ["run", "--manifest", manifestPath],
      fakeNpmEnv(path.join(tempDir, "removed-present.jsonl")),
    );
    assert.equal(removedResult.results[0].host.restoration.status, "failed");
    assert.match(removedResult.results[0].host.restoration.error, /disappeared/);
    assertInstalledHostVersions(removedPresent.packageDir, lockedVersion);

    for (const logPath of observedLogPaths) {
      assert.ok(
        fakeNpmCalls(logPath).every(
          (call) => call.cwd === tempDir || call.cwd.startsWith(`${tempDir}${path.sep}`),
        ),
      );
    }
  } finally {
    for (const [name, value] of Object.entries(previousAmbient)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(hostileVictim, { recursive: true, force: true });
    rmSync(testStateRoot, { recursive: true, force: true });
    rmSync(tempDir, { recursive: true, force: true });
  }
  assert.equal(existsSync(tempDir), false);
});
test("compatibility canary dry-run can target a single scenario with package-set host preparation details", () => {
  const result = runJson([
    "run", "--dry-run", "--profile", "current", "--scenario", "vault-live-trigger-contract",
  ]);

  assert.equal(result.profile, "current");
  assert.equal(result.host.version, "0.84.3");
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
      "@earendil-works/pi-coding-agent@0.84.3",
      "@earendil-works/pi-ai@0.84.3",
      "@earendil-works/pi-tui@0.84.3",
    ]);
  }
  assert.ok(["dry-run", "ready"].includes(result.results[0].host.preparation.status));
  assert.equal(result.results[0].host.restoration.status, "not-run");
});
