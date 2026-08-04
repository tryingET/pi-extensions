#!/usr/bin/env node
// summary: materialize, verify, and canary the one-snapshot governed deep-review runtime.
// read_when:
//   - preparing the temporary governed-loop runtime or running its cross-package canary.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectGovernedRuntimePackageInputHashes,
  GOVERNED_RUNTIME_HOST_PEERS,
  GOVERNED_RUNTIME_HOST_VERSION,
  GOVERNED_RUNTIME_LOCAL_EDGES,
  GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH,
  GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA,
  GOVERNED_RUNTIME_PACKAGES,
  GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH,
  GOVERNED_RUNTIME_TYPEBOX_CONSUMERS,
  GOVERNED_RUNTIME_TYPEBOX_INTEGRITY,
  GOVERNED_RUNTIME_TYPEBOX_VERSION,
  inspectGovernedRuntimeCleanliness,
  resolveGovernedRuntimeGraph,
  verifyGovernedRuntimeHostPeers,
  verifyGovernedRuntimeMaterialization,
  verifyGovernedRuntimeTypebox,
} from "../packages/pi-society-orchestrator/src/runtime/governed-runtime-materialization.ts";

const SCRIPT_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const TYPEBOX_VERSION = GOVERNED_RUNTIME_TYPEBOX_VERSION;
const TYPEBOX_INTEGRITY = GOVERNED_RUNTIME_TYPEBOX_INTEGRITY;
const MANIFEST_SCHEMA = GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA;
const MANIFEST_RELATIVE_PATH = GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH;
const PEER_LAYER_RELATIVE_PATH = GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH;

const PACKAGES = GOVERNED_RUNTIME_PACKAGES;
const TYPEBOX_CONSUMERS = GOVERNED_RUNTIME_TYPEBOX_CONSUMERS;
const LOCAL_EDGES = GOVERNED_RUNTIME_LOCAL_EDGES;

function parseArgs(argv) {
  const [action = "help", ...rest] = argv;
  const options = {
    action,
    sourceRoot: SCRIPT_ROOT,
    expectedCommit: undefined,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--source-root") options.sourceRoot = resolve(rest[++index] ?? "");
    else if (value === "--expected-commit") options.expectedCommit = rest[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${String(result.status)}): ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return (result.stdout ?? "").trim();
}

function git(sourceRoot, args) {
  return run("git", ["-C", sourceRoot, ...args]);
}

function collectTrackedInputHashes(sourceRoot) {
  return collectGovernedRuntimePackageInputHashes(sourceRoot);
}

function sameObject(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertSourceIdentity(sourceRoot, expectedCommit) {
  const root = realpathSync(sourceRoot);
  const commit = git(root, ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error("Source HEAD is not a full commit hash.");
  if (expectedCommit && commit !== expectedCommit) {
    throw new Error(`Source HEAD ${commit} does not match expected commit ${expectedCommit}.`);
  }
  if (!root.toLowerCase().includes(commit.slice(0, 8))) {
    throw new Error(
      `Runtime source path must include immutable commit prefix ${commit.slice(0, 8)}: ${root}`,
    );
  }
  const cleanliness = inspectGovernedRuntimeCleanliness(root);
  if (!cleanliness.clean) {
    throw new Error(
      `Runtime source is not immutable-clean (tracked=${cleanliness.trackedChanges.length}, untracked=${cleanliness.untrackedSourcePaths.length}).`,
    );
  }
  return { sourceRoot: root, sourceCommit: commit, cleanliness };
}

function npmCi(packageRoot) {
  run("npm", ["ci", "--omit=dev", "--omit=peer", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: packageRoot,
    stdio: "inherit",
  });
}

function prepareLocalBuildOwners(sourceRoot) {
  run("bash", [resolve(sourceRoot, "scripts/prepare-asc-source-build-owner.sh")], {
    cwd: sourceRoot,
    stdio: "inherit",
  });
}

function assertMissingTypeboxFailureBeforePeerRepair(sourceRoot) {
  const consumer = "packages/pi-interaction/pi-trigger-adapter";
  const parentManifest = resolve(sourceRoot, consumer, "package.json");
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      `const { createRequire } = require("node:module");
try {
  const resolvedPath = createRequire(process.argv[1]).resolve("typebox");
  console.log(JSON.stringify({ ok: true, resolvedPath }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, code: error?.code, message: error?.message }));
  process.exitCode = 42;
}`,
      parentManifest,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  let observed;
  try {
    observed = JSON.parse((probe.stdout ?? "").trim());
  } catch {
    throw new Error(
      `Missing-peer probe produced invalid output: ${(probe.stderr || probe.stdout || "").trim()}`,
    );
  }
  if (probe.status === 0 && observed.ok === true) {
    throw new Error(
      `Missing-peer reproduction failed: trigger-adapter unexpectedly resolved typebox at ${observed.resolvedPath}.`,
    );
  }
  if (
    probe.status !== 42 ||
    observed.ok !== false ||
    observed.code !== "MODULE_NOT_FOUND" ||
    typeof observed.message !== "string" ||
    !observed.message.includes("Cannot find module 'typebox'")
  ) {
    throw new Error(
      `Missing-peer probe failed for an unexpected reason: ${observed.code ?? "unknown"} ${observed.message ?? probe.stderr ?? ""}`,
    );
  }
  return {
    consumer,
    specifier: "typebox",
    code: "MODULE_NOT_FOUND",
    phase: "before_peer_repair",
  };
}

function linkPackage(consumerRoot, packageName, ownerRoot) {
  const parts = packageName.split("/");
  const linkPath = resolve(consumerRoot, "node_modules", ...parts);
  mkdirSync(dirname(linkPath), { recursive: true });
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(ownerRoot, linkPath, "dir");
}

function materializePeerLayer(sourceRoot) {
  const peerLayer = resolve(sourceRoot, PEER_LAYER_RELATIVE_PATH);
  rmSync(peerLayer, { recursive: true, force: true });
  mkdirSync(peerLayer, { recursive: true });
  writeFileSync(
    resolve(peerLayer, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        dependencies: {
          typebox: TYPEBOX_VERSION,
          ...Object.fromEntries(
            Object.keys(GOVERNED_RUNTIME_HOST_PEERS).map((name) => [
              name,
              GOVERNED_RUNTIME_HOST_VERSION,
            ]),
          ),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  run(
    "npm",
    [
      "install",
      "--package-lock=false",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `typebox@${TYPEBOX_VERSION}`,
      ...Object.keys(GOVERNED_RUNTIME_HOST_PEERS).map(
        (name) => `${name}@${GOVERNED_RUNTIME_HOST_VERSION}`,
      ),
    ],
    { cwd: peerLayer, stdio: "inherit" },
  );
  const typeboxRoot = realpathSync(resolve(peerLayer, "node_modules/typebox"));
  const typeboxPackage = JSON.parse(readFileSync(resolve(typeboxRoot, "package.json"), "utf8"));
  if (typeboxPackage.version !== TYPEBOX_VERSION) {
    throw new Error(
      `Peer layer installed typebox ${typeboxPackage.version}, expected ${TYPEBOX_VERSION}.`,
    );
  }
  const hiddenLock = resolve(peerLayer, "node_modules/.package-lock.json");
  if (!existsSync(hiddenLock))
    throw new Error("Peer layer npm install produced no hidden lock evidence.");
  const lock = JSON.parse(readFileSync(hiddenLock, "utf8"));
  const locked = lock.packages?.["node_modules/typebox"];
  if (locked?.version !== TYPEBOX_VERSION || locked?.integrity !== TYPEBOX_INTEGRITY) {
    throw new Error(
      "Peer layer typebox version/integrity does not match the pinned runtime contract.",
    );
  }
  for (const consumer of TYPEBOX_CONSUMERS) {
    linkPackage(resolve(sourceRoot, consumer), "typebox", typeboxRoot);
  }
  for (const [packageName, contract] of Object.entries(GOVERNED_RUNTIME_HOST_PEERS)) {
    const packageRoot = realpathSync(resolve(peerLayer, "node_modules", ...packageName.split("/")));
    for (const consumer of contract.consumers) {
      linkPackage(resolve(sourceRoot, consumer), packageName, packageRoot);
    }
  }
  return typeboxRoot;
}

function alignExceptionalLocalOwners(sourceRoot) {
  const orchestrator = resolve(sourceRoot, "packages/pi-society-orchestrator");
  run(
    "npm",
    [
      "install",
      "--no-save",
      "--package-lock=false",
      "--omit=dev",
      "--omit=peer",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "../pi-autonomous-session-control",
    ],
    { cwd: orchestrator, stdio: "inherit" },
  );
  linkPackage(
    resolve(sourceRoot, "packages/pi-little-helpers"),
    "@tryinget/pi-peer-messaging",
    resolve(sourceRoot, "packages/pi-peer-messaging"),
  );
}

function resolveRuntimeGraph(sourceRoot) {
  return resolveGovernedRuntimeGraph(sourceRoot);
}

function verifyTypebox(sourceRoot, expectedRoot) {
  const proof = verifyGovernedRuntimeTypebox(sourceRoot);
  if (proof.root !== realpathSync(expectedRoot)) {
    throw new Error(`Pinned Typebox root drifted: ${proof.root} != ${realpathSync(expectedRoot)}.`);
  }
  return proof;
}

async function verifyAutoresearchTriggerSurface(sourceRoot) {
  const module = await import(
    pathToFileURL(
      resolve(sourceRoot, "packages/pi-autoresearch/extensions/pi-autoresearch/triggerPicker.ts"),
    ).href
  );
  const surface = await module.loadAutoresearchTriggerSurface();
  if (!surface || typeof surface.registerPickerInteraction !== "function") {
    throw new Error(
      "Autoresearch trigger surface is not functional after runtime materialization.",
    );
  }
}

function manifestPath(sourceRoot) {
  return resolve(sourceRoot, MANIFEST_RELATIVE_PATH);
}

function verifyCanaryProductionMaterialization(
  sourceRoot,
  selectedManifestPath = manifestPath(sourceRoot),
) {
  const sourceCommit = git(sourceRoot, ["rev-parse", "HEAD"]);
  return verifyGovernedRuntimeMaterialization(sourceRoot, sourceCommit, selectedManifestPath);
}

function requireExpectedCommit(options) {
  if (!/^[a-f0-9]{40}$/u.test(options.expectedCommit ?? "")) {
    throw new Error(
      "materialize/verify/canary requires --expected-commit with one full 40-character SHA.",
    );
  }
  return options.expectedCommit;
}

async function materialize(options) {
  const identity = assertSourceIdentity(options.sourceRoot, requireExpectedCommit(options));
  const beforeHashes = collectTrackedInputHashes(identity.sourceRoot);
  // Build linked source owners before runtime-only installs invoke their prepare lifecycle.
  prepareLocalBuildOwners(identity.sourceRoot);
  for (const packagePath of PACKAGES) {
    const packageRoot = resolve(identity.sourceRoot, packagePath);
    if (!existsSync(resolve(packageRoot, "package-lock.json"))) {
      throw new Error(`Selected runtime package has no lockfile: ${packagePath}.`);
    }
    npmCi(packageRoot);
  }
  const missingTypeboxFailure = assertMissingTypeboxFailureBeforePeerRepair(identity.sourceRoot);
  alignExceptionalLocalOwners(identity.sourceRoot);
  const typeboxRoot = materializePeerLayer(identity.sourceRoot);
  const afterHashes = collectTrackedInputHashes(identity.sourceRoot);
  if (!sameObject(beforeHashes, afterHashes)) {
    throw new Error("Materialization changed a tracked package manifest or lockfile.");
  }
  const graph = resolveRuntimeGraph(identity.sourceRoot);
  const typebox = verifyTypebox(identity.sourceRoot, typeboxRoot);
  const hostPeers = verifyGovernedRuntimeHostPeers(identity.sourceRoot);
  await verifyAutoresearchTriggerSurface(identity.sourceRoot);
  assertSourceIdentity(identity.sourceRoot, identity.sourceCommit);
  const manifest = {
    schema: MANIFEST_SCHEMA,
    sourceRoot: identity.sourceRoot,
    sourceCommit: identity.sourceCommit,
    cleanliness: identity.cleanliness,
    missingTypeboxFailure,
    packageInputs: afterHashes,
    packages: PACKAGES,
    typebox,
    hostPeers,
    resolutions: graph.resolutions,
    runtimeRegistryRoot: graph.runtimeRegistryRoot,
    materializedAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath(identity.sourceRoot), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(JSON.stringify({ ok: true, action: "materialize", manifest }, null, 2));
}

async function verify(options) {
  const identity = assertSourceIdentity(options.sourceRoot, requireExpectedCommit(options));
  const manifest = verifyGovernedRuntimeMaterialization(
    identity.sourceRoot,
    identity.sourceCommit,
    manifestPath(identity.sourceRoot),
  );
  await verifyAutoresearchTriggerSurface(identity.sourceRoot);
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "verify",
        sourceRoot: identity.sourceRoot,
        sourceCommit: identity.sourceCommit,
        runtimeRegistryRoot: manifest.runtimeRegistryRoot,
        resolutionCount: Object.keys(manifest.resolutions).length,
      },
      null,
      2,
    ),
  );
}

function createVaultFixture(root) {
  run("dolt", ["init", "-b", "main"], { cwd: root });
  const sql = [
    "CREATE TABLE schema_version (version INT PRIMARY KEY);",
    "INSERT INTO schema_version VALUES (9);",
    "CREATE TABLE executions (id INT PRIMARY KEY, entity_type VARCHAR(64), entity_id INT, entity_version INT, input_context TEXT, model VARCHAR(255), output_capture_mode VARCHAR(64), output_text TEXT, success BOOLEAN);",
    "CREATE TABLE feedback (execution_id INT, rating INT, notes TEXT, issues JSON);",
    "CREATE TABLE prompt_templates (",
    "id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, description TEXT, content TEXT,",
    "artifact_kind VARCHAR(32) NOT NULL, control_mode VARCHAR(32) NOT NULL,",
    "formalization_level VARCHAR(32) NOT NULL, owner_company VARCHAR(32) NOT NULL,",
    "visibility_companies JSON NOT NULL, controlled_vocabulary JSON,",
    "status VARCHAR(16) NOT NULL, export_to_pi BOOLEAN NOT NULL, version INT NOT NULL,",
    "UNIQUE KEY prompt_templates_name (name));",
    "INSERT INTO prompt_templates VALUES",
    "(1,'deep-review','Deep review','INERT DETERMINISTIC REVIEWER CANARY BYTES','cognitive','one_shot','workflow','core','[\"core\",\"software\"]',NULL,'active',true,2);",
  ].join(" ");
  run("dolt", ["sql", "-q", sql], { cwd: root });
}

function createPiHarness() {
  const tools = new Map();
  const commands = new Map();
  const events = new Map();
  const userMessages = [];
  let activeTools = ["read", "toolbox", "vault_dispatch_check", "dispatch_subagent"];
  let extensionPath = null;
  const pi = {
    registerTool(definition) {
      tools.set(definition.name, {
        ...definition,
        sourceInfo: {
          path: extensionPath,
          source: "extension",
          scope: "temporary",
          origin: "top-level",
        },
      });
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    on(name, handler) {
      const handlers = events.get(name) ?? [];
      handlers.push(handler);
      events.set(name, handlers);
    },
    getAllTools() {
      return [...tools.values()].map(({ execute: _execute, ...metadata }) => metadata);
    },
    getActiveTools() {
      return [...activeTools];
    },
    setActiveTools(next) {
      const registered = new Set(tools.keys());
      activeTools = [...new Set(next)].filter((name) => registered.has(name) || name === "read");
    },
    sendUserMessage(message, options) {
      userMessages.push({ message, options });
    },
  };
  return {
    pi,
    tools,
    commands,
    events,
    userMessages,
    activeTools: () => [...activeTools],
    load(path, extension, options) {
      extensionPath = realpathSync(path);
      try {
        extension(pi, options);
      } finally {
        extensionPath = null;
      }
    },
  };
}

function deterministicWorkflowExecutorFactory() {
  return {
    async execute(input) {
      assert.equal(input.request.mode, "chain");
      assert.equal(input.request.steps.length, 1);
      assert.equal(input.request.steps[0].agent, "reviewer");
      assert.match(input.cognitiveToolContent, /INERT DETERMINISTIC REVIEWER CANARY BYTES/);
      assert.match(input.contextBody, /Vault handoff:/);
      return {
        runId: "governed-canary-workflow-run",
        mode: "chain",
        status: "done",
        steps: [{ index: 0, agent: "reviewer", status: "done" }],
        groups: [],
        aggregatedOutput: "deterministic reviewer canary completed",
        worktreeSummary: null,
      };
    },
  };
}

async function runGovernedDeepReviewHarness(
  options,
  { action, requireMaterializationManifest },
) {
  if (!existsSync(run("sh", ["-lc", "command -v dolt"]))) {
    throw new Error("dolt is required for the governed deep-review canary.");
  }
  const sourceRoot = realpathSync(options.sourceRoot);
  const scratchParent = process.env.TMPDIR?.trim() || join(homedir(), ".local/state/pi-quests/tmp");
  mkdirSync(scratchParent, { recursive: true });
  const scratch = mkdtempSync(join(scratchParent, "governed-deep-review-canary-"));
  const vaultDir = resolve(scratch, "vault");
  const stateHome = resolve(scratch, "state");
  mkdirSync(vaultDir, { recursive: true });
  mkdirSync(stateHome, { recursive: true });
  const previous = {
    VAULT_DIR: process.env.VAULT_DIR,
    PI_COMPANY: process.env.PI_COMPANY,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
  };
  try {
    createVaultFixture(vaultDir);
    process.env.VAULT_DIR = vaultDir;
    process.env.PI_COMPANY = "software";
    process.env.XDG_STATE_HOME = stateHome;

    const harness = createPiHarness();
    const vaultExtensionPath = resolve(sourceRoot, "packages/pi-vault-client/extensions/vault.js");
    const ascExtensionPath = resolve(
      sourceRoot,
      "packages/pi-autonomous-session-control/extensions/self.ts",
    );
    const orchestratorExtensionPath = resolve(
      sourceRoot,
      "packages/pi-society-orchestrator/extensions/society-orchestrator.ts",
    );
    const toolboxExtensionPath = resolve(
      sourceRoot,
      "packages/pi-toolbox-discovery/extensions/toolbox.ts",
    );
    const vaultExtension = (await import(pathToFileURL(vaultExtensionPath).href)).default;
    const ascExtension = (await import(pathToFileURL(ascExtensionPath).href)).default;
    const orchestratorExtension = (await import(pathToFileURL(orchestratorExtensionPath).href))
      .default;
    const toolboxExtension = (await import(pathToFileURL(toolboxExtensionPath).href)).default;
    harness.load(vaultExtensionPath, vaultExtension);
    harness.load(ascExtensionPath, ascExtension);
    harness.load(orchestratorExtensionPath, orchestratorExtension, {
      workflowExecutorFactory: deterministicWorkflowExecutorFactory,
      governedDeepReviewPreflight: {
        requireMaterializationManifest,
        dispatchReceiptPath: resolve(scratch, "dispatch-handoffs.jsonl"),
      },
    });
    harness.load(toolboxExtensionPath, toolboxExtension);

    const toolbox = harness.tools.get("toolbox");
    assert.ok(toolbox, "real Toolbox owner tool did not register");
    const activation = await toolbox.execute(
      "canary-toolbox",
      {
        action: "activate",
        bundle: "orchestrator",
        profile: "orchestrator-gated",
        riskAcknowledged: true,
        riskJustification: "AK-4267 inert governed deep-review cross-package canary",
        autoContinue: false,
        pin: true,
      },
      undefined,
      undefined,
      { cwd: sourceRoot },
    );
    assert.equal(
      activation.details.ok,
      true,
      `${activation.content?.[0]?.text}\n${JSON.stringify(activation.details, null, 2)}`,
    );
    assert.ok(harness.activeTools().includes("vault_execute_template"));

    const visible = await import(
      pathToFileURL(resolve(sourceRoot, "packages/pi-little-helpers/src/visibleLoop.ts")).href
    );
    visible.resetVisibleLoopRuntimeForRecoveryTest();
    const executionBinding = {
      mode: "operator_objective",
      objective: "AK-4267 inert governed deep-review cross-package canary",
    };
    const config = visible.createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: sourceRoot,
      reportBack: "manual",
      commandName: "nexus-loop",
      runId: `ak-4267-canary-${Date.now().toString(36)}`,
      prompts: [visible.GOVERNED_DEEP_REVIEW_PROMPT, "nexus release canary"],
      executionBinding,
    });
    const configPath = visible.writeVisibleLoopRunConfig(config, process.env);
    const notifications = [];
    const ctx = {
      cwd: sourceRoot,
      model: { provider: "test", id: "deterministic" },
      ui: {
        notify(message, type) {
          notifications.push({ message, type });
        },
        setStatus() {},
        setWidget() {},
      },
      sessionManager: {
        getSessionId: () => "ak-4267-canary-session",
        getSessionFile: () => resolve(scratch, "session.jsonl"),
        getSessionName: () => "ak-4267-canary",
        getCwd: () => sourceRoot,
        getBranch: () => [],
      },
      hasPendingMessages: () => false,
    };

    await visible.startVisibleLoopChildRunner(configPath, harness.pi, ctx, process.env);
    assert.equal(harness.userMessages.length, 1, JSON.stringify(notifications));
    assert.match(harness.userMessages[0].message, /^EXECUTION BINDING — FAIL CLOSED/u);
    assert.match(harness.userMessages[0].message, /AK-4267 inert governed deep-review/u);
    assert.ok(harness.userMessages[0].message.endsWith(visible.GOVERNED_DEEP_REVIEW_PROMPT));
    visible.handleVisibleLoopMessageStart(
      { message: { role: "user", content: harness.userMessages[0].message } },
      harness.pi,
      ctx,
      process.env,
    );
    const objective = visible.GOVERNED_DEEP_REVIEW_OBJECTIVE;
    const tool = harness.tools.get("vault_execute_template");
    assert.ok(tool, "real orchestrator vault_execute_template tool did not register");
    visible.handleVisibleLoopToolExecutionStart(
      {
        toolCallId: "ak-4267-real-owner-call",
        toolName: "vault_execute_template",
        args: { template_name: "deep-review", objective },
      },
      harness.pi,
      ctx,
      process.env,
    );
    const result = await tool.execute(
      "ak-4267-real-owner-call",
      { template_name: "deep-review", objective },
      undefined,
      undefined,
      { cwd: sourceRoot, model: ctx.model },
    );
    assert.equal(result.details.ok, true, result.content?.[0]?.text);
    assert.equal(result.details.executionSurface, "workflow_execute");
    assert.equal(result.details.status, "done");
    assert.ok(result.details.handoffId);
    assert.ok(result.details.preflightNonce);
    assert.ok(result.details.preflightReceiptDigest);
    visible.handleVisibleLoopToolExecutionEnd(
      {
        toolCallId: "ak-4267-real-owner-call",
        toolName: "vault_execute_template",
        isError: false,
        result,
      },
      harness.pi,
      ctx,
      process.env,
    );
    visible.handleVisibleLoopAgentSettled(harness.pi, ctx, process.env);
    assert.equal(harness.userMessages.length, 2, "Nexus frontier must release exactly once");
    assert.match(harness.userMessages[1].message, /^EXECUTION BINDING — FAIL CLOSED/u);
    assert.ok(harness.userMessages[1].message.endsWith("nexus release canary"));
    visible.handleVisibleLoopAgentSettled(harness.pi, ctx, process.env);
    assert.equal(
      harness.userMessages.length,
      2,
      "duplicate settlement must not release Nexus twice",
    );

    const status = readFileSync(visible.getVisibleLoopStatusPath(config, process.env), "utf8");
    const preflightIndex = status.indexOf("governed_deep_review_preflight_succeeded");
    const childIndex = status.indexOf('"event":"child_started"');
    const promptIndex = status.indexOf('"event":"prompt_submitted"');
    assert.ok(preflightIndex >= 0 && childIndex > preflightIndex && promptIndex > childIndex);
    assert.match(status, /governed_deep_review_succeeded/);
    console.log(
      JSON.stringify(
        {
          ok: true,
          action,
          ownerExecution: true,
          syntheticToolReceipt: false,
          productionMaterializationManifestEnforced: requireMaterializationManifest,
          handoffId: result.details.handoffId,
          preflightNonce: result.details.preflightNonce,
          registryId: result.details.preflightRegistryId,
          nexusReleaseCount: 1,
        },
        null,
        2,
      ),
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function canary(options) {
  const sourceRoot = realpathSync(options.sourceRoot);
  assertSourceIdentity(sourceRoot, requireExpectedCommit(options));
  verifyCanaryProductionMaterialization(sourceRoot);
  return runGovernedDeepReviewHarness(options, {
    action: "canary",
    requireMaterializationManifest: true,
  });
}

async function test(options) {
  assert.equal(PACKAGES.length, 14);
  assert.equal(TYPEBOX_CONSUMERS.includes("packages/pi-interaction/pi-trigger-adapter"), true);
  assert.equal(run(process.execPath, ["-e", ""], { stdio: "inherit" }), "");
  assert.equal(
    LOCAL_EDGES.some(
      ({ consumer, specifier }) =>
        consumer === "packages/pi-society-orchestrator" &&
        specifier === "@tryinget/pi-vault-client/dispatch-runtime",
    ),
    true,
  );
  const missingManifestPath = resolve(
    process.env.TMPDIR?.trim() || join(homedir(), ".local/state/pi-quests/tmp"),
    `missing-governed-runtime-${process.pid}-${Date.now()}.json`,
  );
  assert.throws(
    () => verifyCanaryProductionMaterialization(realpathSync(options.sourceRoot), missingManifestPath),
    (error) => error?.failureClass === "materialization_manifest_missing",
  );
  await runGovernedDeepReviewHarness(options, {
    action: "development-test",
    requireMaterializationManifest: false,
  });
}

function help() {
  console.log(`Usage:
  node scripts/governed-deep-review-canary.mjs materialize --source-root <clean-immutable-worktree> --expected-commit <full-sha>
  node scripts/governed-deep-review-canary.mjs verify --source-root <materialized-worktree> --expected-commit <full-sha>
  node scripts/governed-deep-review-canary.mjs canary --source-root <materialized-worktree> --expected-commit <full-sha>
  node scripts/governed-deep-review-canary.mjs test [--source-root <root>]

materialize/verify never edit Pi settings, install Pi packages, reload Pi, or clean old worktrees.`);
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.action === "materialize") await materialize(options);
  else if (options.action === "verify") await verify(options);
  else if (options.action === "canary") await canary(options);
  else if (options.action === "test") await test(options);
  else help();
} catch (error) {
  console.error(
    `governed-deep-review-canary: ${error instanceof Error ? error.stack || error.message : String(error)}`,
  );
  process.exitCode = 1;
}
