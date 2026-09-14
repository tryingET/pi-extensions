// ---
// summary: "Tests Pi host canary manifest contracts, scenario inventory, host resolution, dry runs, and npm isolation."
// read_when:
//   - "Changing host compatibility profiles, canary scenarios, package roots, or neutral npm handling."
// ---
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ROOT, SCRIPT, runJson } from "./pi-host-compatibility-canary/restoration-fixture-commands.mjs";
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
  assert.equal(result.host.version, "0.84.4");
  assert.equal(result.host.reviewAnchor, "npm:@earendil-works/pi-coding-agent@0.84.4");
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
    "../../scripts/pi-host-compatibility-canary/selected-tests.mjs",
    "--cwd",
    ".",
    "--import",
    "tsx",
    "--case",
    "tests/runtime-closeout-adapters.test.ts",
    "segment closeout summarizes empirical decisions and candidate bindings",
    "--case",
    "tests/runtime-status-actions.test.ts",
    "autoresearch_runtime_status can request closeout, setup, and finalize packets",
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
  assert.equal(scenario.cwd, "packages/pi-society-orchestrator");
  assert.deepEqual(scenario.command, [
    "node",
    "../../scripts/pi-host-compatibility-canary/selected-tests.mjs",
    "--cwd",
    ".",
    "--case",
    "tests/live-control-plane/sessions-and-start-campaign.test.mjs",
    "autoresearch_live_supervision start/status/stop manages a live running session",
    "--case",
    "tests/live-control-plane/sessions-and-start-campaign.test.mjs",
    "autoresearch_live_supervision start_campaign delegates execution then supervises",
    "--case",
    "tests/live-control-plane/matrix-campaign-review.test.mjs",
    "autoresearch_live_supervision review_matrix_campaign aggregates managed cell waves",
  ]);
  assert.doesNotMatch(scenario.command.join(" "), /\b(?:npm|npx|bash|sh|tsx)\b|--import|--test-name-pattern|&&|[|*]/);
  assert.match(scenario.notes, /independently before baseline capture and candidate alignment/);
  assert.match(scenario.notes, /Missing dependencies fail; never install in the scenario/);
  assert.match(scenario.notes, /real synthetic benchmark and check scripts through pi-autoresearch/);
});

test("compatibility canary covers orchestrator matrix closeout with exact selected bodies", () => {
  const result = runJson(["list", "--profile", "current"]);
  const scenario = result.scenarios.find(
    (entry) => entry.id === "orchestrator-autoresearch-matrix-closeout",
  );

  assert.ok(scenario);
  assert.equal(scenario.owner, "monorepo-root");
  assert.deepEqual(scenario.packages, [
    "packages/pi-autonomous-session-control",
    "packages/pi-autoresearch",
    "packages/pi-society-orchestrator",
  ]);
  assert.equal(scenario.cwd, "packages/pi-society-orchestrator");
  assert.deepEqual(scenario.command, [
    "node",
    "../../scripts/pi-host-compatibility-canary/selected-tests.mjs",
    "--cwd",
    ".",
    "--case",
    "tests/live-control-plane/matrix-campaign.test.mjs",
    "autoresearch_live_supervision plan_matrix_campaign makes matrix cells the implementation-wave substrate",
    "--case",
    "tests/live-control-plane/matrix-campaign.test.mjs",
    "autoresearch_live_supervision plan_matrix_campaign fails closed against level-2 packet-only narrowing",
    "--case",
    "tests/live-control-plane/matrix-campaign-review.test.mjs",
    "autoresearch_live_supervision review_matrix_campaign aggregates managed cell waves",
    "--case",
    "tests/live-control-plane/matrix-campaign-review.test.mjs",
    "autoresearch_live_supervision review_matrix_campaign blocks proof-only review packet closure without downgrade",
    "--case",
    "tests/live-control-plane/candidate-wave-review.test.mjs",
    "autoresearch_live_supervision review_candidate_wave compares measured lanes for owner selection",
  ]);
  assert.doesNotMatch(scenario.command.join(" "), /\b(?:npm|npx|bash|sh|tsx)\b|--import|--test-name-pattern|&&|[|*]/);
  assert.match(scenario.notes, /independently before baseline capture and candidate alignment/);
  assert.match(scenario.notes, /Missing dependencies fail; never install in the scenario/);
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

// Import at the original registration point: one test, same checkout lock,
// sequential node:test execution; do not launch this file as a second worker.
await import("./pi-host-compatibility-canary/restoration.test.mjs");

test("compatibility canary root validation executes all 21 four-owner alignment tests", (t) => {
  // Keep this body in the already-listed root suite, not an imported test
  // registration: exact selection requires bodies defined in their entry file.
  // Preserve HOME/TMPDIR, but do not leak parent runner/loader/coverage controls.
  const env = { ...process.env };
  for (const key of ["NODE_TEST_CONTEXT", "NODE_OPTIONS", "NODE_PATH", "NODE_V8_COVERAGE"]) delete env[key];
  const result = spawnSync(process.execPath, [
    "--test", "--test-reporter=tap",
    path.join(ROOT, "scripts/pi-host-compatibility-canary/four-owner-alignment.test.mjs"),
  ], { cwd: ROOT, env, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + "\n" + result.stdout);
  // Trusted builtin-only suite: require one complete nonvacuous TAP summary,
  // its exact plan, and all 21 successful top-level results, not exit 0 alone.
  for (const [field, expected] of Object.entries({
    tests: 21, suites: 0, pass: 21, fail: 0, cancelled: 0, skipped: 0, todo: 0,
  })) {
    const matches = [...result.stdout.matchAll(new RegExp(`^# ${field} (\\d+)$`, "gm"))];
    assert.equal(matches.length, 1, `missing/duplicate child summary: ${field}\n${result.stdout}`);
    assert.equal(Number(matches[0][1]), expected, `child summary: ${field}`);
  }
  assert.deepEqual(result.stdout.match(/^1\.\.\d+$/gm), ["1..21"]);
  const passed = [...result.stdout.matchAll(/^ok (\d+) - /gm)].map((match) => Number(match[1]));
  assert.deepEqual(passed, Array.from({ length: 21 }, (_, index) => index + 1));
  assert.doesNotMatch(result.stdout, /^not ok |^(?:not )?ok .*# (?:SKIP|TODO)\b/im);
  t.diagnostic("four-owner child: tests=21 pass=21 fail=0 skipped=0 cancelled=0 todo=0");
});
test("compatibility canary rejects retired SDK flags before host resolution or effects", () => {
  for (const flag of ["--sdk-plan", "--sdk-plan-sha256"]) for (const values of [[], ["unused"]]) {
    const result = spawnSync(process.execPath, [SCRIPT, "run", "--profile", "upgrade", flag, ...values],
      { cwd: ROOT, encoding: "utf8", timeout: 10000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null); assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), `error: Unknown argument: ${flag}`);
  }
});
test("compatibility canary root validation executes all 31 selected-tests regressions", async (t) => {
  // Trusted builtin fixtures, including real abort/lifetime-pipe checks; not package qualification.
  const { assertCompleteTap, createSourceScratch, syntheticEnvironment } =
    await import("./pi-host-compatibility-canary/source-regression-harness.mjs");
  const scratch = createSourceScratch();
  const env = syntheticEnvironment(scratch);
  t.diagnostic(`selected-tests retained scratch: ${scratch}`);
  const result = spawnSync(process.execPath, ["--test-reporter=tap",
    path.join(ROOT, "scripts/pi-host-compatibility-canary/selected-tests.test.mjs")],
    { cwd: ROOT, env, encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
  writeFileSync(path.join(scratch, "selected-tests.receipt.json"), JSON.stringify({
    status: result.status, signal: result.signal, error: result.error?.message,
    stdout: result.stdout, stderr: result.stderr,
  }, null, 2), { flag: "wx", mode: 0o600 });
  assertCompleteTap(result, 31);
});
test("compatibility canary dry-run can target a single scenario with package-set host preparation details", () => {
  const result = runJson([
    "run", "--dry-run", "--profile", "current", "--scenario", "vault-live-trigger-contract",
  ]);

  assert.equal(result.profile, "current");
  assert.equal(result.host.version, "0.84.4");
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
      "@earendil-works/pi-coding-agent@0.84.4",
      "@earendil-works/pi-ai@0.84.4",
      "@earendil-works/pi-tui@0.84.4",
      "@earendil-works/pi-agent-core@0.84.4",
    ]);
  }
  assert.ok(["dry-run", "ready"].includes(result.results[0].host.preparation.status));
  assert.equal(result.results[0].host.restoration.status, "not-run");
});

test("compatibility workflow prepares orchestrator siblings before baseline and validates profiles", () => {
  // Source wiring only: no workflow, package manager or actual scenario runs.
  const workflow = readFileSync(path.join(ROOT, ".github/workflows/compatibility-canary.yml"), "utf8");
  const profileCheck = workflow.indexOf("name: Validate profile before dependency effects");
  const npmClient = workflow.indexOf("name: Install governed npm client");
  assert.ok(profileCheck >= 0 && profileCheck < npmClient);
  assert.ok(workflow.slice(profileCheck, npmClient).includes(
    "if (!['current', 'upgrade'].includes(profile)) throw new Error('Unknown canary profile');"));
  assert.doesNotMatch(workflow, /requireUpgradeCompletionIntegration|sdk-plan/);
  const build = workflow.indexOf("name: Prepare linked ASC source runtime");
  const linked = workflow.indexOf("name: Install linked source dependencies before baseline");
  const sibling = workflow.indexOf("name: Install autoresearch sibling dependencies before baseline");
  const install = workflow.indexOf("name: Install scenario dependencies");
  const bind = workflow.indexOf("name: Bind prepared local ASC before baseline");
  const run = workflow.indexOf("name: Run canary scenario against exact host contract");
  const validate = workflow.indexOf("name: Validate prepared local source closure before baseline");
  assert.ok(build >= 0 && build < linked && linked < sibling && sibling < install && install < bind && bind < validate && validate < run);
  assert.match(workflow, /run-scenario:\n\s+needs: discover/);
  const condition = "if: matrix.id == 'orchestrator-autoresearch-supervision-contract' || matrix.id == 'orchestrator-autoresearch-matrix-closeout'";
  const dependencies = workflow.slice(linked, sibling);
  assert.ok(dependencies.includes(condition));
  assert.ok(dependencies.includes("for package in packages/pi-interaction/pi-interaction-kit packages/pi-interaction/pi-trigger-adapter packages/pi-vault-client; do"));
  assert.ok(dependencies.includes('npm --prefix "$package" ci --include=dev --no-audit --no-fund'));
  const validation = workflow.slice(validate, run);
  assert.ok(validation.includes(condition));
  assert.ok(validation.includes("node ./scripts/validate-local-package-links.mjs --package packages/pi-society-orchestrator --package packages/pi-autonomous-session-control"));
  assert.ok(workflow.slice(sibling, install).includes(condition));
  assert.match(workflow.slice(sibling, install), /working-directory: packages\/pi-autoresearch\n\s+run: npm ci --include=dev --no-audit --no-fund/);
  const binding = workflow.slice(bind, validate);
  assert.ok(binding.includes(condition));
  assert.match(binding, /working-directory: packages\/pi-society-orchestrator/);
  assert.ok(binding.includes("npm install --no-save --package-lock=false --install-links=false --ignore-scripts --no-audit --no-fund ../pi-autonomous-session-control"));
  assert.ok(binding.includes("assert.equal(realpathSync('node_modules/@tryinget/pi-autonomous-session-control'), realpathSync('../pi-autonomous-session-control'))"));
});

test("compatibility canary root validation executes bounded completion regressions", async (t) => {
  // SOURCE-REGRESSION only: trusted caller/source, not external fixture admission,
  // SDK qualification, a sandbox, or authority to execute other effectful root tests.
  const { runSourceRegressionSuites } = await import("./pi-host-compatibility-canary/source-regression-harness.mjs");
  const result = runSourceRegressionSuites(path.join(ROOT, "scripts/pi-host-compatibility-canary"), ROOT);
  t.diagnostic(`${result.purpose}: ${result.suites.map(([file, count]) => `${file}=${count}`).join(", ")}; evidence=${result.scratch}`);
});
