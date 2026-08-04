/**
summary: "Tests release component inventory plus stable, prerelease, JSON, and environment tag resolution."
read_when:
  - "Changing release component discovery, component tag syntax, or npm dist-tag projection."
*/
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildReleasePleaseConfig,
  buildReleasePleaseManifest,
} from "./release-components.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-components.mjs");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "publish.yml");
const RELEASE_CHECK_WORKFLOW_PATH = path.join(
  ROOT,
  ".github",
  "workflows",
  "release-check.yml",
);
const COMPATIBILITY_WORKFLOW_PATH = path.join(
  ROOT,
  ".github",
  "workflows",
  "compatibility-canary.yml",
);
const RELEASE_PLEASE_WORKFLOW_PATH = path.join(
  ROOT,
  ".github",
  "workflows",
  "release-please.yml",
);
const RUNBOOK_PATH = path.join(
  ROOT,
  "packages",
  "pi-snapshot-edit",
  "docs",
  "project",
  "trusted-publishing.md",
);

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function workflowRunBlock(workflow, name) {
  const step = workflowStep(workflow, name);
  const marker = "        run: |\n";
  const start = step.indexOf(marker);
  assert.notEqual(start, -1, `multiline run block not found: ${name}`);
  return step.slice(start + marker.length).replace(/^ {10}/gm, "");
}

function resolveTag(tag) {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, "resolve-tag", tag, "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
    }),
  );
}

function resolveTagEnv(tag) {
  return execFileSync(process.execPath, [SCRIPT, "resolve-tag", tag, "--env"], {
    cwd: ROOT,
    encoding: "utf-8",
  });
}

function listComponents() {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, "list", "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
    }),
  );
}

function releaseProjection(command) {
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, command, "--json"], {
      cwd: ROOT,
      encoding: "utf-8",
    }),
  );
}

test("list reports pi-model-selection as a top-level support package", () => {
  const components = listComponents();
  const component = components.find((entry) => entry.component === "pi-model-selection");
  assert.equal(component?.packagePath, "packages/pi-model-selection");
  assert.equal(component?.packageName, "@tryinget/pi-model-selection");
});

test("code-mode release projection matches its current lifecycle marker", () => {
  const packagePath = "packages/pi-code-mode";
  const components = listComponents();
  const component = components.find((entry) => entry.component === "pi-code-mode");
  assert.ok(component);

  const config = releaseProjection("config");
  const manifest = releaseProjection("manifest");
  if (component.initialVersion) {
    assert.equal(component.version, component.initialVersion);
    assert.equal(config.packages[packagePath]["initial-version"], component.initialVersion);
    assert.equal(manifest[packagePath], "0.0.0");
  } else {
    assert.equal(config.packages[packagePath]["initial-version"], undefined);
    assert.equal(manifest[packagePath], component.version);
  }
});

test("initial release bootstrap metadata is a one-way manifest gate", () => {
  const packagePath = "packages/example";
  const bootstrap = {
    component: "example",
    packagePath,
    packageName: "@tryinget/example",
    version: "0.1.0",
    initialVersion: "0.1.0",
    changelogPath: `${packagePath}/CHANGELOG.md`,
  };

  const config = buildReleasePleaseConfig([bootstrap]);
  assert.equal(config.packages[packagePath]["initial-version"], "0.1.0");
  assert.deepEqual(buildReleasePleaseManifest([bootstrap], { [packagePath]: "0.0.0" }), {
    [packagePath]: "0.0.0",
  });

  for (const manifest of [
    {},
    { [packagePath]: "0.0.1" },
    { [packagePath]: "0.1.0" },
    { [packagePath]: "9.9.9" },
  ]) {
    assert.throws(() => buildReleasePleaseManifest([bootstrap], manifest));
  }
  assert.throws(() =>
    buildReleasePleaseManifest(
      [{ ...bootstrap, version: "0.2.0" }],
      { [packagePath]: "0.0.0" },
    ),
  );

  const released = { ...bootstrap, initialVersion: undefined };
  for (const manifest of [
    {},
    { [packagePath]: "0.0.0" },
    { [packagePath]: "0.1.0" },
    { [packagePath]: "9.9.9" },
  ]) {
    assert.deepEqual(buildReleasePleaseManifest([released], manifest), {
      [packagePath]: "0.1.0",
    });
  }
  assert.deepEqual(
    buildReleasePleaseManifest([{ ...released, version: "0.2.0" }], {
      [packagePath]: "0.1.0",
    }),
    { [packagePath]: "0.2.0" },
  );
});

test("list reports pi-modes as a managed release component", () => {
  const components = listComponents();
  const component = components.find((entry) => entry.component === "pi-modes");
  assert.equal(component?.packagePath, "packages/pi-modes");
  assert.equal(component?.packageName, "@tryinget/pi-modes");
  assert.equal(component?.changelogPath, "packages/pi-modes/CHANGELOG.md");
});

test("snapshot-edit component resolves to its public npm package and changelog", () => {
  const components = listComponents();
  const component = components.find((entry) => entry.component === "pi-snapshot-edit");
  assert.equal(component?.packagePath, "packages/pi-snapshot-edit");
  assert.equal(component?.packageName, "@tryinget/pi-snapshot-edit");
  assert.equal(component?.changelogPath, "packages/pi-snapshot-edit/CHANGELOG.md");
  assert.match(component?.version ?? "", /^\d+\.\d+\.\d+$/);
  const resolved = resolveTag("pi-snapshot-edit-v0.2.0");
  assert.equal(resolved.packagePath, "packages/pi-snapshot-edit");
  assert.equal(resolved.packageName, "@tryinget/pi-snapshot-edit");
  assert.equal(resolved.tagVersion, "0.2.0");
});

test("resolve-tag reports latest dist-tag for stable versions", () => {
  const result = resolveTag("pi-society-orchestrator-v0.1.0");
  assert.equal(result.packageName, "@tryinget/pi-society-orchestrator");
  assert.equal(result.tagVersion, "0.1.0");
  assert.equal(result.npmDistTag, "latest");
});

test("resolve-tag derives prerelease dist-tags from prerelease identifiers", () => {
  const result = resolveTag("pi-society-orchestrator-v0.1.0-beta.2");
  assert.equal(result.npmDistTag, "beta");
});

test("resolve-tag env output exports RELEASE_NPM_DIST_TAG", () => {
  const output = resolveTagEnv("pi-vault-client-v0.1.0-rc.1");
  assert.match(output, /RELEASE_NPM_DIST_TAG=rc/);
});

test("release quality gate disables machine-local engineering-core smoke", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const step = workflowStep(workflow, "Run package quality gate");
  assert.match(step, /PI_ENGINEERING_SMOKE: "0"/);
  assert.match(step, /run: npm run check/);
});

test("release-please serializes release creation and dispatches created tags to publish", () => {
  const workflow = fs.readFileSync(RELEASE_PLEASE_WORKFLOW_PATH, "utf8");
  assert.match(workflow, /group: release-please-main/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /actions: write/);
  assert.match(workflowStep(workflow, "Run release-please"), /id: release/);
  const dispatch = workflowStep(workflow, "Dispatch npm publication for created releases");
  assert.match(dispatch, /steps\.release\.outputs\.releases_created == 'true'/);
  assert.match(dispatch, /PATHS_RELEASED: \$\{\{ steps\.release\.outputs\.paths_released \}\}/);
  assert.match(dispatch, /gh release view "\$tag"/);
  assert.match(dispatch, /gh workflow run publish\.yml[\s\S]*-f "tag=\$tag"/);
});

test("resolve-tag workflow guard sources same-step output and rejects a mismatched tag", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const step = workflowStep(workflow, "Resolve release tag to component");
  assert.match(step, /set -euo pipefail/);
  assert.match(step, /resolve-tag "\$RELEASE_TAG" --env > "\$resolver_env"/);
  assert.match(step, /cat "\$resolver_env" >> "\$GITHUB_ENV"/);
  assert.match(step, /source "\$resolver_env"/);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "release-tag-guard-"));
  try {
    const env = {
      ...process.env,
      GITHUB_ENV: path.join(fixture, "github-env"),
      RELEASE_TAG: "pi-snapshot-edit-v9.9.9",
      RUNNER_TEMP: fixture,
    };
    delete env.RELEASE_PACKAGE_VERSION;
    delete env.RELEASE_TAG_VERSION;
    const result = spawnSync("bash", ["-c", workflowRunBlock(workflow, "Resolve release tag to component")], {
      cwd: ROOT,
      encoding: "utf8",
      env,
    });
    assert.notEqual(result.status, 0, "mismatched package/tag versions must fail");
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Resolved package version \(.+\) does not match release tag version \(9\.9\.9\)/,
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("snapshot-edit and pi-modes retain, verify, upload, and publish one exact tarball", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  for (const name of [
    "Create immutable retained release tarball",
    "Verify retained tarball after release checks",
    "Upload retained release tarball",
    "Publish retained tarball to npm (OIDC + provenance)",
  ]) {
    const step = workflowStep(workflow, name);
    assert.match(step, /env\.RELEASE_COMPONENT == 'pi-snapshot-edit'/);
    assert.match(step, /env\.RELEASE_COMPONENT == 'pi-modes'/);
  }

  assert.match(
    workflowStep(workflow, "Run snapshot-edit release checks against retained tarball"),
    /npm run release:check:quick -- "\$RELEASE_TARBALL_PATH"/,
  );
  assert.match(
    workflowStep(workflow, "Run pi-modes release checks against retained tarball"),
    /npm run release:check:ci -- "\$RELEASE_TARBALL_PATH"/,
  );

  const packMatches = workflow.match(/npm pack\b/g) ?? [];
  assert.equal(packMatches.length, 1, "retained-artifact paths must create the tarball exactly once");
  assert.match(workflow, /RELEASE_TARBALL_PATH=\$tarball_path/);
  assert.match(workflow, /RELEASE_TARBALL_BASENAME=\$tarball_basename/);
  assert.match(workflow, /RELEASE_TARBALL_SHA256=\$tarball_sha256/);
  const upload = workflow.indexOf("uses: actions/upload-artifact@v7");
  const publish = workflow.indexOf('npm publish "$RELEASE_TARBALL_PATH" --provenance');
  assert.ok(upload >= 0 && publish > upload, "upload must precede exact-path publication");
  assert.ok((workflow.match(/sha256sum --check --status/g) ?? []).length >= 2);
});

test("generic publish path preserves directory-based release check and publish", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const check = workflowStep(workflow, "Run generic package release checks (artifact-only)");
  const publish = workflowStep(
    workflow,
    "Publish generic package directory to npm (OIDC + provenance)",
  );
  for (const step of [check, publish]) {
    assert.match(step, /env\.RELEASE_COMPONENT != 'pi-snapshot-edit'/);
    assert.match(step, /env\.RELEASE_COMPONENT != 'pi-modes'/);
    assert.doesNotMatch(step, /RELEASE_TARBALL/);
  }
  assert.match(check, /run: npm run release:check:quick\n/);
  assert.match(publish, /run: npm publish --provenance --access public --tag "\$RELEASE_NPM_DIST_TAG"/);
  assert.ok(workflow.indexOf(check) < workflow.indexOf(publish), "generic check must precede publish");
});

test("release-check CI runs pi-modes credential-free installed-artifact smoke", () => {
  const workflow = fs.readFileSync(RELEASE_CHECK_WORKFLOW_PATH, "utf8");
  const modes = workflowStep(workflow, "Run pi-modes credential-free installed-artifact checks");
  assert.match(modes, /if: matrix\.component == 'pi-modes'/);
  assert.match(modes, /run: npm run release:check:ci/);
  const generic = workflowStep(workflow, "Run generic release checks (artifact-only)");
  assert.match(generic, /if: matrix\.component != 'pi-modes'/);
  assert.match(generic, /run: npm run release:check:quick/);
});

test("clean consumer installs prepare the linked ASC source runtime first", () => {
  const contracts = [
    {
      path: RELEASE_CHECK_WORKFLOW_PATH,
      condition: /if: matrix\.component == 'pi-society-orchestrator'/,
      installStep: "Install package dependencies",
    },
    {
      path: COMPATIBILITY_WORKFLOW_PATH,
      condition: /if: matrix\.cwd == 'packages\/pi-society-orchestrator'/,
      installStep: "Install scenario dependencies",
    },
    {
      path: WORKFLOW_PATH,
      condition: /if: env\.RELEASE_COMPONENT == 'pi-society-orchestrator'/,
      installStep: "Install package dependencies",
    },
  ];

  for (const contract of contracts) {
    const workflow = fs.readFileSync(contract.path, "utf8");
    const prepare = workflowStep(workflow, "Prepare linked ASC source runtime");
    assert.match(prepare, contract.condition);
    assert.match(prepare, /run: bash \.\/scripts\/prepare-asc-source-build-owner\.sh/);
    assert.ok(
      workflow.indexOf(prepare) < workflow.indexOf(workflowStep(workflow, contract.installStep)),
      `ASC source preparation must precede the consumer install in ${contract.path}`,
    );
  }

  const helperPath = path.join(ROOT, "scripts", "prepare-asc-source-build-owner.sh");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "asc-source-build-owner-"));
  try {
    const binDir = path.join(fixture, "bin");
    const callLog = path.join(fixture, "npm-calls.log");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(
      path.join(binDir, "npm"),
      '#!/usr/bin/env bash\nprintf \'%s\\t%s\\n\' "$PWD" "$*" >> "$ASC_PREPARE_LOG"\n',
      { mode: 0o755 },
    );
    const result = spawnSync("bash", [helperPath], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ASC_PREPARE_LOG: callLog,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const ascRoot = path.join(ROOT, "packages", "pi-autonomous-session-control");
    assert.deepEqual(fs.readFileSync(callLog, "utf8").trim().split("\n"), [
      `${ascRoot}\tci --include=dev --omit=peer --ignore-scripts --no-audit --no-fund`,
      `${ascRoot}\trun build:runtime`,
    ]);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  const governedCanary = fs.readFileSync(
    path.join(ROOT, "scripts", "governed-deep-review-canary.mjs"),
    "utf8",
  );
  const prepareCall = governedCanary.indexOf("prepareLocalBuildOwners(identity.sourceRoot);");
  const runtimeInstallLoop = governedCanary.indexOf("for (const packagePath of PACKAGES)");
  const deferBuildOwner = governedCanary.indexOf("if (packagePath === LOCAL_BUILD_OWNER) continue;");
  const missingTypeboxProof = governedCanary.indexOf(
    "assertMissingTypeboxFailureBeforePeerRepair(identity.sourceRoot)",
  );
  const alignConsumers = governedCanary.indexOf("alignExceptionalLocalOwners(identity.sourceRoot);");
  const pruneBuildOwner = governedCanary.indexOf(
    "npmCi(resolve(identity.sourceRoot, LOCAL_BUILD_OWNER));",
  );
  const peerClosure = governedCanary.indexOf("materializePeerLayer(identity.sourceRoot)");
  const graphProof = governedCanary.indexOf("resolveRuntimeGraph(identity.sourceRoot)");
  const typeboxProof = governedCanary.indexOf("verifyTypebox(identity.sourceRoot, typeboxRoot)");
  const hostPeerProof = governedCanary.indexOf("verifyGovernedRuntimeHostPeers(identity.sourceRoot)");
  assert.ok(
    prepareCall >= 0 &&
      runtimeInstallLoop > prepareCall &&
      deferBuildOwner > runtimeInstallLoop &&
      missingTypeboxProof > deferBuildOwner &&
      alignConsumers > missingTypeboxProof &&
      pruneBuildOwner > alignConsumers &&
      peerClosure > pruneBuildOwner &&
      graphProof > peerClosure &&
      typeboxProof > graphProof &&
      hostPeerProof > typeboxProof,
  );
});

test("manual bootstrap requires run identity and verifies run/tag commit before artifact use", () => {
  const runbook = fs.readFileSync(RUNBOOK_PATH, "utf8");
  const scriptStart = runbook.indexOf("set -euo pipefail", runbook.indexOf("Failed-run artifact"));
  const scriptEnd = runbook.indexOf("\n```", scriptStart);
  assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, "bootstrap shell block must exist");
  const script = runbook.slice(scriptStart, scriptEnd);

  for (const [envOverrides, expectedError] of [
    [{}, /EXPECTED_TAG is required/],
    [{ EXPECTED_TAG: "pi-snapshot-edit-v0.2.0" }, /RUN_ID is required/],
  ]) {
    const env = { ...process.env, ...envOverrides };
    delete env.RUN_ID;
    if (!("EXPECTED_TAG" in envOverrides)) delete env.EXPECTED_TAG;
    const result = spawnSync("bash", ["-c", script], { cwd: ROOT, encoding: "utf8", env });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, expectedError);
  }

  assert.match(runbook, /"\$RUN_ID" =~ \^\[0-9\]\+\$/);
  assert.match(runbook, /gh run view "\$RUN_ID"[\s\S]*--json name,event,conclusion,headBranch,headSha/);
  assert.match(runbook, /run\.name !== "publish"/);
  assert.match(runbook, /run\.event !== "release"/);
  assert.match(runbook, /run\.conclusion !== "failure"/);
  assert.match(runbook, /run\.headBranch !== expected/);
  assert.match(runbook, /git -C "\$workdir\/tag-check" fetch/);
  assert.match(runbook, /rev-parse "\$EXPECTED_TAG\^\{commit\}"/);
  assert.match(runbook, /"\$tag_commit" == "\$run_head_sha"/);
  assert.match(runbook, /sha256sum --check/);
  assert.match(runbook, /npm publish "\$tarball"/);
  assert.ok(
    runbook.indexOf("gh run view") < runbook.indexOf("gh run download"),
    "run metadata must be checked before artifact download",
  );
  assert.ok(
    runbook.indexOf("sha256sum --check") < runbook.indexOf('npm publish "$tarball"'),
    "artifact checksum must be checked before exact-path publish",
  );
});

test("snapshot release check fails closed on retained tarball SHA drift", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-release-sha-"));
  try {
    const tarball = path.join(fixture, "release.tgz");
    fs.writeFileSync(tarball, "changed artifact");
    const result = spawnSync(
      "bash",
      [path.join(ROOT, "packages", "pi-snapshot-edit", "scripts", "release-check.sh"), tarball],
      {
        cwd: path.join(ROOT, "packages", "pi-snapshot-edit"),
        encoding: "utf8",
        env: { ...process.env, RELEASE_TARBALL_SHA256: "0".repeat(64), SKIP_PI_SMOKE: "1" },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Release tarball SHA-256 changed/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /== npm pack/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("snapshot supplied-tarball contract requires exact artifact operations", () => {
  const script = fs.readFileSync(
    path.join(ROOT, "packages", "pi-snapshot-edit", "scripts", "release-check.sh"),
    "utf8",
  );
  assert.match(script, /Supplied release tarball path must be absolute/);
  assert.match(script, /RELEASE_TARBALL_SHA256 is required/);
  assert.match(script, /npm publish \"\$TARBALL_PATH\" --dry-run/);
  assert.match(script, /PACKAGE_SPEC=\"npm:\$TARBALL_PATH\"/);
  assert.match(script, /Tarball identity mismatch/);
});
