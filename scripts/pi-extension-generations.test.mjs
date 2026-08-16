// ---
// summary: "Tests exact-commit generation publication, provenance, private activation, recovery, rollback, and host probing."
// read_when:
//   - "Changing immutable Pi extension generation behavior or root test coverage."
// ---
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  activateGeneration,
  initPrivateEnvironment,
  recoverActivation,
  rollbackActivation,
} from "./pi-extension-generations/activation.mjs";
import { canonical, JOURNAL_SCHEMA, run, sha256, stableJson } from "./pi-extension-generations/common.mjs";
import { acquireOwnedLock } from "./pi-extension-generations/lock.mjs";
import { materializePlan } from "./pi-extension-generations/materialize.mjs";
import { planGeneration, recomputePlanIdentity } from "./pi-extension-generations/plan.mjs";
import { probeFreshHost } from "./pi-extension-generations/probe.mjs";
import { generationStatus, verifyGeneration } from "./pi-extension-generations/verify.mjs";
import { runCli } from "./pi-extension-generations.mjs";

const PACKAGE_ROOT = "packages/pi-agent-interaction-canary";
const PACKAGE_NAME = "@tryinget/pi-agent-interaction-canary";

async function makeRemovable(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await makeRemovable(target);
    else if (!entry.isSymbolicLink()) await chmod(target, 0o600).catch(() => {});
  }
  await chmod(directory, 0o700).catch(() => {});
}

async function scratch(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-extension-generations-unit-"));
  await chmod(root, 0o700);
  t.after(async () => { await makeRemovable(root); await rm(root, { recursive: true, force: true }); });
  return root;
}

function manifest(overrides = {}) {
  return {
    name: PACKAGE_NAME,
    version: "1.0.0",
    private: true,
    type: "module",
    pi: { extensions: ["./extensions/canary.mjs"] },
    peerDependencies: { "@earendil-works/pi-coding-agent": "*" },
    ...overrides,
  };
}

function lockFor(packageManifest, extras = {}) {
  const root = { name: packageManifest.name, version: packageManifest.version };
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
    if (packageManifest[field]) root[field] = packageManifest[field];
  }
  return { name: packageManifest.name, version: packageManifest.version, lockfileVersion: 3, requires: true, packages: { "": root, ...(extras.packages ?? {}) } };
}

async function writePackage(repo, { source = "export const generation = 'G1';\n", packageManifest = manifest(), lock = null } = {}) {
  const packageDir = path.join(repo, PACKAGE_ROOT);
  await mkdir(path.join(packageDir, "extensions"), { recursive: true });
  await writeFile(path.join(packageDir, "extensions", "canary.mjs"), source);
  await writeFile(path.join(packageDir, "package.json"), `${JSON.stringify(packageManifest, null, 2)}\n`);
  await writeFile(path.join(packageDir, "package-lock.json"), `${JSON.stringify(lock ?? lockFor(packageManifest), null, 2)}\n`);
}

async function commit(repo, message) {
  await run("git", ["-C", repo, "add", "-A"]);
  await run("git", ["-C", repo, "commit", "-q", "-m", message]);
  return (await run("git", ["-C", repo, "rev-parse", "HEAD"])).stdout.toString("utf8").trim();
}

async function fixture(t) {
  const root = await scratch(t);
  const repo = path.join(root, "repo");
  const stateRoot = path.join(root, "state");
  await mkdir(repo);
  await run("git", ["-C", repo, "init", "-q"]);
  await run("git", ["-C", repo, "config", "user.email", "fixture@example.invalid"]);
  await run("git", ["-C", repo, "config", "user.name", "Generation Fixture"]);
  await writePackage(repo);
  const g1Commit = await commit(repo, "g1");
  return { root, repo, stateRoot, g1Commit };
}

function planOptions(value, commitValue = value.g1Commit) {
  return { repoRoot: value.repo, commit: commitValue, packageRoot: PACKAGE_ROOT, stateRoot: value.stateRoot };
}

async function twoGenerations(t) {
  const value = await fixture(t);
  const g1Plan = await planGeneration(planOptions(value));
  const g1 = await materializePlan(g1Plan);
  await writePackage(value.repo, { source: "export const generation = 'G2';\n" });
  const g2Commit = await commit(value.repo, "g2");
  const g2Plan = await planGeneration(planOptions(value, g2Commit));
  const g2 = await materializePlan(g2Plan);
  return { ...value, g1, g2, g1Plan, g2Plan };
}

async function waitForPath(target, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await stat(target); return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${target}`);
}

async function killAndWait(child) {
  const closed = new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
  child.kill("SIGKILL");
  const result = await closed;
  assert.equal(result.signal, "SIGKILL");
}

async function crashMaterializationAtMarkerTemporary(t, root, plan, label) {
  const planPath = path.join(root, `${label}-plan.json`);
  const readyPath = path.join(root, `${label}-marker-ready`);
  const childScript = path.join(root, `${label}-child.mjs`);
  await writeFile(planPath, JSON.stringify(plan));
  await writeFile(childScript, `import { writeFile } from "node:fs/promises"; import { readFileSync } from "node:fs"; import { materializePlan } from ${JSON.stringify(new URL("./pi-extension-generations/materialize.mjs", import.meta.url).href)}; const plan=JSON.parse(readFileSync(process.argv[2],"utf8")); await materializePlan(plan,{afterMarkerTemporary:async()=>{await writeFile(process.argv[3],"ready\\n"); await new Promise(()=>{setInterval(()=>{},1000);});}});`);
  const child = spawn(process.execPath, [childScript, planPath, readyPath], { stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  await waitForPath(readyPath);
  await killAndWait(child);
}

async function forgeStoredNoInstallClaimsAroundRuntimeDependency(published) {
  const oldDir = published.generationDir;
  const packageDir = published.packageDir;
  const manifestPath = path.join(packageDir, "package.json");
  const provenancePath = path.join(oldDir, "provenance.json");
  const verificationPath = path.join(oldDir, "verification.json");
  const markerPath = path.join(oldDir, "generation.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies = { forged: "1.0.0" };
  const manifestBytes = Buffer.from(stableJson(manifest));
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  const verification = JSON.parse(await readFile(verificationPath, "utf8"));
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  const plan = provenance.plan;
  plan.selection.manifest.sha256 = sha256(manifestBytes);
  plan.selection.packageFiles = plan.selection.packageFiles.map((file) => file.path === `${PACKAGE_ROOT}/package.json` ? { ...file, sha256: sha256(manifestBytes) } : file);
  plan.selection.packageDigest = sha256(canonical(plan.selection.packageFiles));
  const identity = recomputePlanIdentity(plan);
  const newDir = path.join(path.dirname(oldDir), identity.generationId);
  const newPackageDir = path.join(newDir, "repo", PACKAGE_ROOT);
  Object.assign(plan, identity, {
    paths: {
      stateRoot: plan.paths.stateRoot,
      generationDir: newDir,
      repoDir: path.join(newDir, "repo"),
      packageDir: newPackageDir,
      marker: path.join(newDir, "generation.json"),
    },
  });
  verification.generationId = identity.generationId;
  verification.packagePath = newPackageDir;
  verification.entrypoints = verification.entrypoints.map((entrypoint) => ({ ...entrypoint, absolutePath: path.join(newDir, "repo", entrypoint.path), baseDir: newPackageDir }));
  const provenanceBytes = Buffer.from(stableJson(provenance));
  const verificationBytes = Buffer.from(stableJson(verification));
  Object.assign(marker, {
    generationId: identity.generationId,
    inputDigest: identity.inputDigest,
    provenanceSha256: sha256(provenanceBytes),
    verificationSha256: sha256(verificationBytes),
  });
  await chmod(oldDir, 0o755);
  await chmod(packageDir, 0o755);
  await chmod(manifestPath, 0o644);
  await writeFile(manifestPath, manifestBytes);
  await chmod(manifestPath, 0o444);
  await chmod(packageDir, 0o555);
  for (const [target, bytes] of [[provenancePath, provenanceBytes], [verificationPath, verificationBytes], [markerPath, Buffer.from(stableJson(marker))]]) {
    await chmod(target, 0o644);
    await writeFile(target, bytes);
    await chmod(target, 0o444);
  }
  await chmod(oldDir, 0o555);
  await rename(oldDir, newDir);
  return newDir;
}

async function privateEnvironment(root, name = "private") {
  const sandboxRoot = path.join(root, name);
  const agentDir = path.join(sandboxRoot, "agent-dir");
  const projectDir = path.join(sandboxRoot, "empty-cwd");
  await mkdir(sandboxRoot, { mode: 0o700 });
  await chmod(sandboxRoot, 0o700);
  await initPrivateEnvironment({ sandboxRoot, agentDir, projectDir });
  return { sandboxRoot, agentDir, projectDir };
}

test("plan and publication use exact commit bytes, publish last, and never replace a generation", async (t) => {
  const value = await fixture(t);
  const first = await planGeneration(planOptions(value));
  const second = await planGeneration(planOptions(value));
  assert.deepEqual(second, first);
  await writeFile(path.join(value.repo, PACKAGE_ROOT, "extensions", "canary.mjs"), "export const generation = 'DIRTY';\n");
  const dirtyPlan = await planGeneration(planOptions(value));
  assert.equal(dirtyPlan.generationId, first.generationId);
  assert.equal(dirtyPlan.selection.entrypoints[0].sha256, first.selection.entrypoints[0].sha256);

  const published = await materializePlan(first);
  assert.match(await readFile(path.join(published.packageDir, "extensions", "canary.mjs"), "utf8"), /G1/u);
  const verified = await verifyGeneration(published.generationDir);
  assert.equal(verified.generationId, first.generationId);
  const markerBefore = await readFile(path.join(published.generationDir, "generation.json"));
  await assert.rejects(materializePlan(first), /will not be replaced/u);
  assert.deepEqual(await readFile(path.join(published.generationDir, "generation.json")), markerBefore);
  const status = await generationStatus(value.stateRoot);
  assert.equal(status.generations[0].status, "published-verified");
});

test("symlinked state roots are rejected before effects and no-install publications reject node_modules/write-bit drift", async (t) => {
  const linked = await fixture(t);
  const realState = path.join(linked.root, "real-state");
  await mkdir(realState, { mode: 0o700 });
  await writeFile(path.join(realState, "sentinel"), "unchanged\n", { mode: 0o600 });
  const linkedState = path.join(linked.root, "linked-state");
  await symlink(realState, linkedState);
  const linkedPlan = await planGeneration({ ...planOptions(linked), stateRoot: linkedState });
  await assert.rejects(materializePlan(linkedPlan), /must not be a symlink/u);
  assert.deepEqual((await readdir(realState)).sort(), ["sentinel"]);
  assert.equal((await stat(realState)).mode & 0o777, 0o700);

  const writable = await fixture(t);
  const writablePublished = await materializePlan(await planGeneration(planOptions(writable)));
  const untouchedEntrypoint = path.join(writablePublished.packageDir, "extensions", "canary.mjs");
  await chmod(untouchedEntrypoint, 0o644);
  await assert.rejects(verifyGeneration(writablePublished.generationDir), /read-only|write bits/u);

  const modules = await fixture(t);
  const modulesPublished = await materializePlan(await planGeneration(planOptions(modules)));
  await chmod(modulesPublished.packageDir, 0o755);
  await mkdir(path.join(modulesPublished.packageDir, "node_modules"), { mode: 0o555 });
  await chmod(modulesPublished.packageDir, 0o555);
  await assert.rejects(verifyGeneration(modulesPublished.generationDir), /node_modules must be absent/u);
});

test("failed candidates remain unpublished and provenance tampering fails verification", async (t) => {
  const failed = await fixture(t);
  const failedPlan = await planGeneration(planOptions(failed));
  await assert.rejects(materializePlan(failedPlan, { beforePublish() { throw new Error("injected pre-publication failure"); } }), /injected pre-publication/u);
  assert.deepEqual(await readdir(path.join(failed.stateRoot, "generations")), []);
  const candidates = await readdir(path.join(failed.stateRoot, "candidates"));
  assert.equal(candidates.length, 1);
  assert.match(await readFile(path.join(failed.stateRoot, "candidates", candidates[0], "failure.json"), "utf8"), /published": false/u);

  const markerCrash = await fixture(t);
  const markerCrashPlan = await planGeneration(planOptions(markerCrash));
  await assert.rejects(materializePlan(markerCrashPlan, { afterMarkerTemporary() { throw new Error("crash before marker link"); } }), /crash before marker link/u);
  await assert.rejects(readFile(markerCrashPlan.paths.marker), /ENOENT/u);
  const publicationTemps = await readdir(path.join(markerCrash.stateRoot, "publication-tmp"));
  assert.equal(publicationTemps.length, 1);
  assert.equal(JSON.parse(await readFile(path.join(markerCrash.stateRoot, "publication-tmp", publicationTemps[0]), "utf8")).status, "published");

  const linked = await fixture(t);
  const linkedPlan = await planGeneration(planOptions(linked));
  await assert.rejects(materializePlan(linkedPlan, { beforeMarkerDirectorySync() { throw new Error("injected marker directory sync failure"); } }), /injected marker directory sync failure/u);
  assert.equal(JSON.parse(await readFile(linkedPlan.paths.marker, "utf8")).status, "published");
  assert.deepEqual((await readdir(linkedPlan.paths.generationDir)).sort(), ["generation.json", "provenance.json", "repo", "verification.json"]);
  const linkedRecovery = await materializePlan(linkedPlan);
  assert.equal(linkedRecovery.recoveredPublication, true);
  assert.equal(linkedRecovery.verificationReceipt.ok, true);

  const tamperedRecovery = await fixture(t);
  const tamperedRecoveryPlan = await planGeneration(planOptions(tamperedRecovery));
  await crashMaterializationAtMarkerTemporary(t, tamperedRecovery.root, tamperedRecoveryPlan, "tampered-recovery");
  const retainedTemps = await readdir(path.join(tamperedRecovery.stateRoot, "publication-tmp"));
  assert.equal(retainedTemps.length, 1);
  const retainedMarkerPath = path.join(tamperedRecovery.stateRoot, "publication-tmp", retainedTemps[0]);
  const retainedMarker = JSON.parse(await readFile(retainedMarkerPath, "utf8"));
  retainedMarker.packageName = "@attacker/tampered";
  await chmod(retainedMarkerPath, 0o600);
  await writeFile(retainedMarkerPath, `${JSON.stringify(retainedMarker, null, 2)}\n`);
  await chmod(retainedMarkerPath, 0o444);
  await assert.rejects(materializePlan(tamperedRecoveryPlan), /complete binding mismatch/u);
  await assert.rejects(readFile(tamperedRecoveryPlan.paths.marker), /ENOENT/u);
  assert.ok(!(await readdir(tamperedRecoveryPlan.paths.generationDir)).includes("failure.json"));

  const routineMarker = await fixture(t);
  const routinePublished = await materializePlan(await planGeneration(planOptions(routineMarker)));
  const routineMarkerPath = path.join(routinePublished.generationDir, "generation.json");
  const routineMarkerValue = JSON.parse(await readFile(routineMarkerPath, "utf8"));
  routineMarkerValue.unexpected = true;
  await chmod(routinePublished.generationDir, 0o755);
  await chmod(routineMarkerPath, 0o644);
  await writeFile(routineMarkerPath, `${JSON.stringify(routineMarkerValue, null, 2)}\n`);
  await chmod(routineMarkerPath, 0o444);
  await chmod(routinePublished.generationDir, 0o555);
  await assert.rejects(verifyGeneration(routinePublished.generationDir), /marker keys are not exact/u);

  const invalidPublishedAt = await fixture(t);
  const invalidTimePublished = await materializePlan(await planGeneration(planOptions(invalidPublishedAt)));
  const invalidTimeMarkerPath = path.join(invalidTimePublished.generationDir, "generation.json");
  const invalidTimeMarker = JSON.parse(await readFile(invalidTimeMarkerPath, "utf8"));
  invalidTimeMarker.publishedAt = "not-an-iso-time";
  await chmod(invalidTimePublished.generationDir, 0o755);
  await chmod(invalidTimeMarkerPath, 0o644);
  await writeFile(invalidTimeMarkerPath, `${JSON.stringify(invalidTimeMarker, null, 2)}\n`);
  await chmod(invalidTimeMarkerPath, 0o444);
  await chmod(invalidTimePublished.generationDir, 0o555);
  await assert.rejects(verifyGeneration(invalidTimePublished.generationDir), /publishedAt is invalid/u);

  const forgedVerification = await fixture(t);
  const forgedPublished = await materializePlan(await planGeneration(planOptions(forgedVerification)));
  const forgedGenerationDir = await forgeStoredNoInstallClaimsAroundRuntimeDependency(forgedPublished);
  await assert.rejects(verifyGeneration(forgedGenerationDir), /exported package manifest dependencies must be empty/u);

  const value = await fixture(t);
  const published = await materializePlan(await planGeneration(planOptions(value)));
  const entrypoint = path.join(published.packageDir, "extensions", "canary.mjs");
  await chmod(entrypoint, 0o644);
  await writeFile(entrypoint, "export const generation = 'TAMPERED';\n");
  await assert.rejects(verifyGeneration(published.generationDir), /hash mismatch|read-only/u);
});

test("real SIGKILL owners leave recoverable atomic lock records for micro-window, activation, and materialization crashes while live/unknown owners fail closed", async (t) => {
  const microRoot = await scratch(t);
  const microLocks = path.join(microRoot, "locks");
  const microHistory = path.join(microRoot, "history");
  await mkdir(microLocks, { mode: 0o700 });
  await mkdir(microHistory, { mode: 0o700 });
  const microOptions = { lockPath: path.join(microLocks, "micro.lock"), historyDir: microHistory, schema: "test-lock.v1", binding: { root: microRoot } };
  const microOptionsPath = path.join(microRoot, "options.json");
  const microReady = path.join(microRoot, "temporary-ready");
  const microScript = path.join(microRoot, "micro-lock-child.mjs");
  await writeFile(microOptionsPath, JSON.stringify(microOptions));
  await writeFile(microScript, `import { writeFile } from "node:fs/promises"; import { readFileSync } from "node:fs"; import { acquireOwnedLock } from ${JSON.stringify(new URL("./pi-extension-generations/lock.mjs", import.meta.url).href)}; const options=JSON.parse(readFileSync(process.argv[2],"utf8")); await acquireOwnedLock({...options,hooks:{afterLockRecordTemporary:async()=>{await writeFile(process.argv[3],"ready\\n"); await new Promise(()=>{setInterval(()=>{},1000);});}}});`);
  const microChild = spawn(process.execPath, [microScript, microOptionsPath, microReady], { stdio: "ignore" });
  t.after(() => microChild.kill("SIGKILL"));
  await waitForPath(microReady);
  await killAndWait(microChild);
  await assert.rejects(readFile(microOptions.lockPath), /ENOENT/u);
  const recoveredMicroLock = await acquireOwnedLock(microOptions);
  assert.equal(JSON.parse(await readFile(microOptions.lockPath, "utf8")).schema, microOptions.schema);
  await recoveredMicroLock.release();
  assert.equal((await readdir(microHistory)).length, 1);

  const value = await twoGenerations(t);
  const environment = await privateEnvironment(value.root, "sigkill-activation");
  const activationOptions = { ...environment, generationDir: value.g1.generationDir };
  const activationOptionsPath = path.join(value.root, "activation-options.json");
  const activationReady = path.join(value.root, "activation-lock-ready");
  await writeFile(activationOptionsPath, JSON.stringify(activationOptions));
  const activationChildScript = path.join(value.root, "activation-lock-child.mjs");
  await writeFile(activationChildScript, `import { writeFile } from "node:fs/promises"; import { readFileSync } from "node:fs"; import { activateGeneration } from ${JSON.stringify(new URL("./pi-extension-generations/activation.mjs", import.meta.url).href)}; const options=JSON.parse(readFileSync(process.argv[2],"utf8")); await activateGeneration(options,{afterLock:async()=>{await writeFile(process.argv[3],"ready\\n"); await new Promise(()=>{setInterval(()=>{},1000);});}});`);
  const activationChild = spawn(process.execPath, [activationChildScript, activationOptionsPath, activationReady], { stdio: "ignore" });
  t.after(() => activationChild.kill("SIGKILL"));
  await waitForPath(activationReady);
  await assert.rejects(activateGeneration(activationOptions), /live process/u);
  await killAndWait(activationChild);
  await activateGeneration(activationOptions);
  assert.equal((await readdir(path.join(environment.agentDir, ".pi-extension-generations-lock-history"))).length, 1);
  await writeFile(path.join(environment.agentDir, ".pi-extension-generations-activation.lock"), "{}\n", { mode: 0o600 });
  await assert.rejects(activateGeneration({ ...environment, generationDir: value.g2.generationDir }), /lock owner|unknown|invalid/u);

  const materialize = await fixture(t);
  const plan = await planGeneration(planOptions(materialize));
  const planPath = path.join(materialize.root, "materialize-plan.json");
  const materializeReady = path.join(materialize.root, "materialize-lock-ready");
  await writeFile(planPath, JSON.stringify(plan));
  const materializeChildScript = path.join(materialize.root, "materialize-lock-child.mjs");
  await writeFile(materializeChildScript, `import { writeFile } from "node:fs/promises"; import { readFileSync } from "node:fs"; import { materializePlan } from ${JSON.stringify(new URL("./pi-extension-generations/materialize.mjs", import.meta.url).href)}; const plan=JSON.parse(readFileSync(process.argv[2],"utf8")); await materializePlan(plan,{afterMarkerTemporary:async()=>{await writeFile(process.argv[3],"ready\\n"); await new Promise(()=>{setInterval(()=>{},1000);});}});`);
  const materializeChild = spawn(process.execPath, [materializeChildScript, planPath, materializeReady], { stdio: "ignore" });
  t.after(() => materializeChild.kill("SIGKILL"));
  await waitForPath(materializeReady);
  await assert.rejects(materializePlan(plan), /live process/u);
  await killAndWait(materializeChild);
  const recoveredMaterialization = await materializePlan(plan);
  assert.equal(recoveredMaterialization.recoveredPublication, true);
  await verifyGeneration(recoveredMaterialization.generationDir);
  assert.equal((await readdir(path.join(materialize.stateRoot, "lock-history"))).length, 1);

  const unknown = await fixture(t);
  const unknownPlan = await planGeneration(planOptions(unknown));
  await assert.rejects(materializePlan(unknownPlan, { beforePublish() { throw new Error("initialize state only"); } }), /initialize state only/u);
  await writeFile(path.join(unknown.stateRoot, "locks", `${unknownPlan.generationId}.lock`), "{}\n", { mode: 0o600 });
  await assert.rejects(materializePlan(unknownPlan), /lock owner|unknown|invalid/u);
});

test("planner and CLI reject build/lifecycle recipes, all runtime dependencies, nested repo roots, lock drift, escaping symlinks, and surplus options", async (t) => {
  await assert.rejects(runCli(["verify", "--generation", "/not-used", "--host", "/surplus"]), /not valid for verify/u);
  await assert.rejects(runCli(["verify", "--generation", "/one", "--generation", "/two"]), /duplicate argument/u);
  await assert.rejects(runCli(["--help", "--repo", "/surplus"]), /cannot accompany top-level help/u);
  await assert.rejects(runCli(["plan", "--help", "--repo", "/surplus"]), /cannot accompany help/u);
  await assert.rejects(runCli(["plan", "--repo", "/surplus", "--help"]), /cannot accompany help/u);
  await assert.rejects(runCli(["plan", "--help", "--help"]), /duplicate argument/u);
  await assert.rejects(runCli(["bogus-command", "--help"]), /unknown command: bogus-command/u);
  const build = await fixture(t);
  const buildManifest = manifest({ scripts: { build: "node build.mjs" } });
  await writePackage(build.repo, { packageManifest: buildManifest });
  const buildCommit = await commit(build.repo, "build recipe");
  await assert.rejects(planGeneration(planOptions(build, buildCommit)), /unsupported lifecycle\/build recipe/u);

  const lifecycle = await fixture(t);
  const lifecycleEffect = path.join(lifecycle.root, "lifecycle-ran");
  const lifecycleManifest = manifest({ scripts: { postinstall: `node -e \"require('fs').writeFileSync(${JSON.stringify(lifecycleEffect)},'ran')\"` } });
  await writePackage(lifecycle.repo, { packageManifest: lifecycleManifest });
  const lifecycleCommit = await commit(lifecycle.repo, "adversarial lifecycle");
  await assert.rejects(planGeneration(planOptions(lifecycle, lifecycleCommit)), /unsupported lifecycle\/build recipe/u);
  await assert.rejects(readFile(lifecycleEffect), /ENOENT/u);

  const registryRuntime = await fixture(t);
  const registryManifest = manifest({ dependencies: { remote: "1.0.0" } });
  await writePackage(registryRuntime.repo, { packageManifest: registryManifest, lock: lockFor(registryManifest) });
  const registryCommit = await commit(registryRuntime.repo, "registry runtime dependency");
  await assert.rejects(planGeneration(planOptions(registryRuntime, registryCommit)), /runtime and optional dependencies are unsupported/u);

  const local = await fixture(t);
  const localManifest = manifest({ dependencies: { neighbor: "file:../neighbor" } });
  const localLock = lockFor(localManifest, { packages: { "../neighbor": { name: "neighbor", version: "1.0.0" }, "node_modules/neighbor": { resolved: "../neighbor", link: true } } });
  await writePackage(local.repo, { packageManifest: localManifest, lock: localLock });
  const localCommit = await commit(local.repo, "local runtime dependency");
  await assert.rejects(planGeneration(planOptions(local, localCommit)), /runtime and optional dependencies are unsupported/u);

  const optional = await fixture(t);
  const optionalManifest = manifest({ optionalDependencies: { optional: "2.0.0" } });
  await writePackage(optional.repo, { packageManifest: optionalManifest, lock: lockFor(optionalManifest) });
  const optionalCommit = await commit(optional.repo, "optional runtime dependency");
  await assert.rejects(planGeneration(planOptions(optional, optionalCommit)), /runtime and optional dependencies are unsupported/u);

  const noInstallOnly = await fixture(t);
  const noInstallPlan = await planGeneration(planOptions(noInstallOnly));
  const unsupportedInstallPlan = { ...noInstallPlan, closure: { ...noInstallPlan.closure, runtimeDependencies: [["remote", "1.0.0"]], install: "npm-ci-production" } };
  await assert.rejects(materializePlan(unsupportedInstallPlan), /fresh canonical reconstruction/u);
  await assert.rejects(stat(noInstallOnly.stateRoot), /ENOENT/u);

  const craftedPlanFixture = await fixture(t);
  const craftedPlan = structuredClone(await planGeneration(planOptions(craftedPlanFixture)));
  craftedPlan.selection.packageName = "@attacker/crafted-plan";
  Object.assign(craftedPlan, recomputePlanIdentity(craftedPlan));
  craftedPlan.paths.generationDir = path.join(craftedPlan.paths.stateRoot, "generations", craftedPlan.generationId);
  craftedPlan.paths.repoDir = path.join(craftedPlan.paths.generationDir, "repo");
  craftedPlan.paths.packageDir = path.join(craftedPlan.paths.repoDir, craftedPlan.selection.packageRoot);
  craftedPlan.paths.marker = path.join(craftedPlan.paths.generationDir, "generation.json");
  await assert.rejects(materializePlan(craftedPlan), /fresh canonical reconstruction/u);
  await assert.rejects(stat(craftedPlanFixture.stateRoot), /ENOENT/u);

  const nested = await fixture(t);
  const nestedRepoArgument = path.join(nested.repo, PACKAGE_ROOT);
  await assert.rejects(planGeneration({ ...planOptions(nested), repoRoot: nestedRepoArgument, stateRoot: path.join(nested.repo, "state-inside") }), /canonical Git top-level/u);
  await assert.rejects(stat(path.join(nested.repo, "state-inside")), /ENOENT/u);

  const drift = await fixture(t);
  const driftManifest = manifest({ devDependencies: { remote: "1.0.0" } });
  await writePackage(drift.repo, { packageManifest: driftManifest, lock: lockFor(manifest()) });
  const driftCommit = await commit(drift.repo, "lock drift");
  await assert.rejects(planGeneration(planOptions(drift, driftCommit)), /lock root devDependencies/u);

  const escape = await fixture(t);
  await symlink("../../../../outside", path.join(escape.repo, PACKAGE_ROOT, "extensions", "escape.mjs"));
  const packageManifest = manifest({ pi: { extensions: ["./extensions/escape.mjs"] } });
  await writeFile(path.join(escape.repo, PACKAGE_ROOT, "package.json"), `${JSON.stringify(packageManifest, null, 2)}\n`);
  await writeFile(path.join(escape.repo, PACKAGE_ROOT, "package-lock.json"), `${JSON.stringify(lockFor(packageManifest), null, 2)}\n`);
  const escapeCommit = await commit(escape.repo, "escaping symlink");
  await assert.rejects(planGeneration(planOptions(escape, escapeCommit)), /symlinks are unsupported|regular file/u);
});

test("private activation journals effects, recovers crashes, and conditionally restores exact G1 settings", async (t) => {
  const value = await twoGenerations(t);
  const environment = await privateEnvironment(value.root);
  await activateGeneration({ ...environment, generationDir: value.g1.generationDir });
  const g1Bytes = await readFile(path.join(environment.agentDir, "settings.json"));
  const g1Mode = (await stat(path.join(environment.agentDir, "settings.json"))).mode & 0o777;
  assert.equal(g1Mode, 0o600);
  await activateGeneration({ ...environment, generationDir: value.g2.generationDir });
  const rollback = await rollbackActivation(environment);
  assert.equal(rollback.restoredExists, true);
  assert.deepEqual(await readFile(path.join(environment.agentDir, "settings.json")), g1Bytes);
  assert.equal((await stat(path.join(environment.agentDir, "settings.json"))).mode & 0o777, g1Mode);

  await activateGeneration({ ...environment, generationDir: value.g2.generationDir });
  await writeFile(path.join(environment.agentDir, "settings.json"), `${JSON.stringify({ packages: [value.g2.packageDir], unrelated: true })}\n`, { mode: 0o600 });
  await assert.rejects(rollbackActivation(environment), /digest differs/u);

  const crash = await privateEnvironment(value.root, "crash");
  await assert.rejects(activateGeneration({ ...crash, generationDir: value.g1.generationDir }, { afterPrepared() { throw new Error("crash after prepare"); } }), /crash after prepare/u);
  await assert.rejects(activateGeneration({ ...crash, generationDir: value.g1.generationDir }), /journal is unresolved/u);
  const recovered = await recoverActivation(crash);
  assert.equal(recovered.phase, "aborted-before-effect");
  await activateGeneration({ ...crash, generationDir: value.g1.generationDir });

  const traversal = await privateEnvironment(value.root, "journal-traversal");
  const outsideTarget = path.join(traversal.sandboxRoot, "outside.json");
  await writeFile(path.join(traversal.agentDir, ".pi-extension-generations-activation.json"), stableJson({ schema: JOURNAL_SCHEMA, transactionId: "../../outside", phase: "completed" }), { mode: 0o600 });
  await assert.rejects(recoverActivation(traversal), /transactionId must be a canonical UUID/u);
  await assert.rejects(readFile(outsideTarget), /ENOENT/u);
  await assert.rejects(stat(path.join(traversal.agentDir, ".pi-extension-generations-journals")), /ENOENT/u);
});

test("activation rejects forged/operator-like dirs, unsafe settings, duplicate identity, cross-scope conflict, and a running host", async (t) => {
  const value = await twoGenerations(t);
  const forgedRoot = path.join(value.root, "forged");
  await mkdir(forgedRoot, { mode: 0o700 });
  const forged = { sandboxRoot: forgedRoot, agentDir: path.join(forgedRoot, "agent"), projectDir: path.join(forgedRoot, "cwd") };
  await mkdir(forged.agentDir, { mode: 0o700 });
  await mkdir(forged.projectDir, { mode: 0o700 });
  await assert.rejects(activateGeneration({ ...forged, generationDir: value.g1.generationDir }), /marker/u);

  const operatorSandbox = path.join(value.root, "operator-shape");
  await mkdir(path.join(operatorSandbox, ".pi"), { recursive: true, mode: 0o700 });
  await assert.rejects(initPrivateEnvironment({ sandboxRoot: operatorSandbox, agentDir: path.join(operatorSandbox, ".pi", "agent"), projectDir: path.join(operatorSandbox, "cwd") }), /operator-like/u);

  const unsafe = await privateEnvironment(value.root, "unsafe");
  await writeFile(path.join(unsafe.sandboxRoot, "outside-settings.json"), "{}\n");
  await symlink(path.join(unsafe.sandboxRoot, "outside-settings.json"), path.join(unsafe.agentDir, "settings.json"));
  await assert.rejects(activateGeneration({ ...unsafe, generationDir: value.g1.generationDir }), /regular non-symlink/u);

  const duplicate = await privateEnvironment(value.root, "duplicate");
  await writeFile(path.join(duplicate.agentDir, "settings.json"), `${JSON.stringify({ packages: [value.g1.packageDir, value.g2.packageDir] })}\n`, { mode: 0o600 });
  await chmod(path.join(duplicate.agentDir, "settings.json"), 0o600);
  await assert.rejects(activateGeneration({ ...duplicate, generationDir: value.g2.generationDir }), /duplicate logical/u);

  const crossScope = await privateEnvironment(value.root, "cross-scope");
  await mkdir(path.join(crossScope.projectDir, ".pi"), { mode: 0o700 });
  await writeFile(path.join(crossScope.projectDir, ".pi", "settings.json"), `${JSON.stringify({ packages: [value.g1.packageDir] })}\n`, { mode: 0o600 });
  await chmod(path.join(crossScope.projectDir, ".pi", "settings.json"), 0o600);
  await assert.rejects(activateGeneration({ ...crossScope, generationDir: value.g2.generationDir }), /cross-scope/u);

  const opaque = await privateEnvironment(value.root, "opaque");
  await writeFile(path.join(opaque.agentDir, "settings.json"), `${JSON.stringify({ packages: ["git:https://example.invalid/opaque.git"] })}\n`, { mode: 0o600 });
  await assert.rejects(activateGeneration({ ...opaque, generationDir: value.g1.generationDir }), /opaque git\/URL/u);

  const safeNpm = await privateEnvironment(value.root, "safe-npm");
  await writeFile(path.join(safeNpm.agentDir, "settings.json"), `${JSON.stringify({ packages: ["npm:provably-unrelated@1.0.0"] })}\n`, { mode: 0o600 });
  await activateGeneration({ ...safeNpm, generationDir: value.g1.generationDir });

  const busy = await privateEnvironment(value.root, "busy");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { env: { ...process.env, PI_CODING_AGENT_DIR: busy.agentDir }, stdio: "ignore" });
  t.after(() => child.kill("SIGTERM"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await assert.rejects(activateGeneration({ ...busy, generationDir: value.g1.generationDir }), /in use by process/u);
  child.kill("SIGTERM");
});

test("fresh-process probe uses sanitized private settings and exact G2 sourceInfo", async (t) => {
  const value = await twoGenerations(t);
  const environment = await privateEnvironment(value.root, "probe");
  await activateGeneration({ ...environment, generationDir: value.g2.generationDir });
  const inlineLlama = { name: "llama", source: "extension", sourceInfo: { path: "<inline:llama.cpp>", source: "inline", scope: "temporary", origin: "top-level" } };
  const fakeHostSource = ({ extraCommands = [inlineLlama], trailingExtensionError = null, trailingStderr = "" } = {}) => `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
if (process.argv.includes("--version")) { console.log("fake-pi 1.0.0"); process.exit(0); }
const settings = JSON.parse(readFileSync(path.join(process.env.PI_CODING_AGENT_DIR, "settings.json"), "utf8"));
const source = typeof settings.packages[0] === "string" ? settings.packages[0] : settings.packages[0].source;
const sourceInfo = { path: path.join(source, "extensions/canary.mjs"), baseDir: source, source, scope: "user", origin: "package" };
const extraCommands = ${JSON.stringify(extraCommands)};
const trailingExtensionError = ${JSON.stringify(trailingExtensionError)};
const trailingStderr = ${JSON.stringify(trailingStderr)};
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { buffer += chunk; let index; while ((index = buffer.indexOf("\\n")) >= 0) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); const request = JSON.parse(line); if (request.type === "get_commands") console.log(JSON.stringify({ id: request.id, type: "response", command: "get_commands", success: true, data: { commands: [{ name: "agent-interaction-canary", source: "extension", sourceInfo }, ...extraCommands] } })); else if (request.type === "prompt") { console.log(JSON.stringify({ type: "extension_ui_request", id: "notify", method: "notify", notifyType: "info", message: JSON.stringify({ ok: true, packageDir: source }) })); console.log(JSON.stringify({ id: request.id, type: "response", command: "prompt", success: true })); } } });
process.stdin.on("end", () => { if (trailingExtensionError) console.log(JSON.stringify(trailingExtensionError)); if (trailingStderr) process.stderr.write(trailingStderr); });
`;
  const host = path.join(environment.sandboxRoot, "fake-pi.mjs");
  await writeFile(host, fakeHostSource());
  await chmod(host, 0o755);
  const requestFile = path.join(environment.sandboxRoot, "request.json");
  await writeFile(requestFile, "{}\n", { mode: 0o600 });
  const probeOptions = { ...environment, generationDir: value.g2.generationDir, commandName: "agent-interaction-canary", expectedInlineCommands: ["llama"], requestFile };
  const receipt = await probeFreshHost({ ...probeOptions, hostExecutable: host });
  assert.equal(receipt.hostVersion, "fake-pi 1.0.0");
  assert.equal(receipt.sourceCommit, value.g2Plan.source.commit);
  assert.equal(receipt.selectedCommand.sourceInfo.baseDir, value.g2.packageDir);
  assert.equal(receipt.commandResult.packageDir, value.g2.packageDir);
  assert.ok(Number.isInteger(receipt.pid) && receipt.pid > 0);
  assert.equal(receipt.argv[0], host);
  assert.deepEqual(receipt.argv.slice(1, 3), ["--mode", "rpc"]);
  assert.equal(new Date(receipt.startedAt).toISOString(), receipt.startedAt);
  assert.equal(new Date(receipt.completedAt).toISOString(), receipt.completedAt);
  assert.ok(receipt.completedAt >= receipt.startedAt);
  assert.deepEqual(receipt.closeResult, { code: 0, signal: null });
  assert.equal(receipt.hostExecutableSha256, sha256(await readFile(host)));
  assert.deepEqual(receipt.expectedExtensionInventory.allowedInlineCommands.map((command) => command.name), ["llama"]);
  assert.equal(receipt.expectedExtensionInventory.exactCount, 2);
  assert.deepEqual(receipt.extensionErrors, []);

  const outsideCommand = { name: "old-editable", source: "extension", sourceInfo: { path: path.join(value.g1.packageDir, "extensions/canary.mjs"), baseDir: value.g1.packageDir, source: value.g1.packageDir, scope: "user", origin: "package" } };
  const mixedHost = path.join(environment.sandboxRoot, "fake-pi-mixed.mjs");
  await writeFile(mixedHost, fakeHostSource({ extraCommands: [inlineLlama, outsideCommand] }));
  await chmod(mixedHost, 0o755);
  await assert.rejects(probeFreshHost({ ...probeOptions, hostExecutable: mixedHost }), /unexpected extension command.*old-editable/u);

  const rogueInlineHost = path.join(environment.sandboxRoot, "fake-pi-rogue-inline.mjs");
  await writeFile(rogueInlineHost, fakeHostSource({ extraCommands: [inlineLlama, { ...inlineLlama, name: "rogue-inline" }] }));
  await chmod(rogueInlineHost, 0o755);
  await assert.rejects(probeFreshHost({ ...probeOptions, hostExecutable: rogueInlineHost }), /unexpected extension command.*rogue-inline/u);

  const wrongInlineHost = path.join(environment.sandboxRoot, "fake-pi-wrong-inline.mjs");
  await writeFile(wrongInlineHost, fakeHostSource({ extraCommands: [{ ...inlineLlama, sourceInfo: { ...inlineLlama.sourceInfo, path: "<inline:unexpected.cpp>" } }] }));
  await chmod(wrongInlineHost, 0o755);
  await assert.rejects(probeFreshHost({ ...probeOptions, hostExecutable: wrongInlineHost }), /exact allowed inline inventory/u);

  const trailingErrorHost = path.join(environment.sandboxRoot, "fake-pi-trailing-error.mjs");
  await writeFile(trailingErrorHost, fakeHostSource({ trailingExtensionError: { type: "extension_error", extensionPath: "trailing.mjs", error: "late diagnostic" } }));
  await chmod(trailingErrorHost, 0o755);
  await assert.rejects(probeFreshHost({ ...probeOptions, hostExecutable: trailingErrorHost }), /extension-load diagnostics.*late diagnostic/u);

  const trailingStderrHost = path.join(environment.sandboxRoot, "fake-pi-trailing-stderr.mjs");
  await writeFile(trailingStderrHost, fakeHostSource({ trailingStderr: "late zero-exit stderr diagnostic\\n" }));
  await chmod(trailingStderrHost, 0o755);
  await assert.rejects(probeFreshHost({ ...probeOptions, hostExecutable: trailingStderrHost }), /stderr diagnostics.*late zero-exit stderr diagnostic/u);
});
