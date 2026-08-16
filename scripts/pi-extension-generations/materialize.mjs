// ---
// summary: "Exports, verifies, and atomically publish-last materializes immutable Pi extension generations."
// read_when:
//   - "Changing generation locking, exact-commit export, isolated npm install, or publication ordering."
// ---
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, link, lstat, mkdir, readFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import {
  GENERATION_SCHEMA,
  PROVENANCE_SCHEMA,
  VERIFICATION_SCHEMA,
  assertRegularFile,
  canonical,
  fail,
  makeTreeReadOnly,
  run,
  sha256,
  stableJson,
  syncDirectory,
  writeExclusive,
} from "./common.mjs";
import { verifyPackageInventory, verifyReadOnlyTree } from "./inventory.mjs";
import { acquireOwnedLock } from "./lock.mjs";
import { planGeneration, validateCommitTree } from "./plan.mjs";
import { createOwnedRoot, ensureOwnedDirectory } from "./roots.mjs";
import { verifyGeneration } from "./verify.mjs";

const STATE_SCHEMA = "pi-extension-generations-state-root.v1";
const STATE_MARKER = ".pi-extension-generations-state.json";
const LOCK_SCHEMA = "pi-extension-generation-materialization-lock.v2";

async function ensureStateLayout(stateRoot) {
  const marker = await createOwnedRoot({
    root: stateRoot,
    markerName: STATE_MARKER,
    schema: STATE_SCHEMA,
    label: "generation state root",
    binding: { purpose: "immutable-pi-extension-generations" },
  });
  const directories = {};
  for (const name of ["locks", "lock-history", "candidates", "generations", "publication-tmp"]) {
    directories[name] = await ensureOwnedDirectory(stateRoot, name, `state ${name} directory`);
  }
  return { marker, directories };
}

async function exportCommit(plan, destination) {
  await mkdir(destination, { mode: 0o700 });
  const git = spawn("git", ["-C", plan.source.repoRoot, "archive", "--format=tar", plan.source.commit], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tar = spawn("tar", ["-x", "-f", "-", "-C", destination, "--no-same-owner", "--no-same-permissions"], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  git.stdout.pipe(tar.stdin);
  const gitError = [];
  const tarError = [];
  git.stderr.on("data", (chunk) => gitError.push(chunk));
  tar.stderr.on("data", (chunk) => tarError.push(chunk));
  const wait = (child) => new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  const [gitResult, tarResult] = await Promise.all([wait(git), wait(tar)]);
  if (gitResult.code !== 0 || tarResult.code !== 0) {
    fail(`exact-commit export failed: git=${gitResult.code ?? gitResult.signal} tar=${tarResult.code ?? tarResult.signal}; ${Buffer.concat([...gitError, ...tarError]).toString("utf8").trim()}`);
  }
}

function isolatedNpmEnvironment(supportRoot) {
  const env = {};
  for (const key of ["PATH", "LANG", "LC_ALL", "SystemRoot", "WINDIR"]) if (process.env[key]) env[key] = process.env[key];
  const home = path.join(supportRoot, "home");
  const temporary = path.join(supportRoot, "tmp");
  const cache = path.join(supportRoot, "npm-cache");
  Object.assign(env, {
    HOME: home,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    npm_config_cache: cache,
    npm_config_offline: "true",
    npm_config_ignore_scripts: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  });
  return { env, directories: [home, temporary, cache] };
}

async function installRuntimeClosure(plan, repoDir, candidateRoot) {
  if (plan.closure.install === "no-install") {
    return { performed: false, command: null, reason: "selected package has no runtime dependencies" };
  }
  if (plan.closure.install !== "npm-ci-production") fail(`unsupported install mode: ${plan.closure.install}`);
  const supportRoot = path.join(candidateRoot, "support");
  await mkdir(supportRoot, { mode: 0o700 });
  const isolated = isolatedNpmEnvironment(supportRoot);
  for (const directory of isolated.directories) await mkdir(directory, { recursive: true, mode: 0o700 });
  const packageDir = path.join(repoDir, plan.selection.packageRoot);
  await run(plan.builder.npmCommand, plan.builder.installArgs, {
    cwd: packageDir,
    env: isolated.env,
    maxOutputBytes: 4 * 1024 * 1024,
  });
  return { performed: true, command: [plan.builder.npmCommand, ...plan.builder.installArgs], cache: isolated.directories[2] };
}

async function writeFailure(root, plan, error) {
  if (!root) return;
  const receipt = stableJson({
    schema: "pi-extension-generation-failure.v1",
    generationId: plan.generationId,
    published: false,
    failedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  });
  await writeExclusive(path.join(root, "failure.json"), receipt, 0o600).catch(() => {});
}

async function publishMarker(markerPath, temporaryRoot, generationId, bytes, hooks, onLinked) {
  const temporary = path.join(temporaryRoot, `${generationId}.${process.pid}.${randomUUID()}.generation.tmp`);
  await writeExclusive(temporary, bytes, 0o444);
  await hooks.afterMarkerTemporary?.({ temporary, markerPath });
  try {
    await link(temporary, markerPath);
  } catch (error) {
    if (error?.code === "EEXIST") fail("published generation marker already exists and will not be replaced", "PI_GENERATION_EXISTS");
    throw error;
  }
  onLinked();
  await hooks.beforeMarkerDirectorySync?.({ temporary, markerPath });
  await syncDirectory(path.dirname(markerPath));
  return temporary;
}

function validateCompleteMarker(markerBytes, marker, plan, provenanceBytes, verificationBytes) {
  if (!Buffer.from(stableJson(marker)).equals(markerBytes)) fail("retained generation marker is not canonical deterministic JSON");
  let canonicalPublishedAt;
  try { canonicalPublishedAt = new Date(marker.publishedAt).toISOString(); } catch { fail("retained generation marker publication time is invalid"); }
  if (typeof marker.publishedAt !== "string" || canonicalPublishedAt !== marker.publishedAt) fail("retained generation marker publication time is invalid");
  const expected = {
    schema: GENERATION_SCHEMA,
    status: "published",
    generationId: plan.generationId,
    sourceCommit: plan.source.commit,
    inputDigest: plan.inputDigest,
    packageName: plan.selection.packageName,
    packageRoot: plan.selection.packageRoot,
    provenanceSha256: sha256(provenanceBytes),
    verificationSha256: sha256(verificationBytes),
    publishedAt: marker.publishedAt,
  };
  if (canonical(marker) !== canonical(expected)) fail("retained generation marker complete binding mismatch");
}

async function recoverPublication(plan, state) {
  const generationInfo = await lstat(plan.paths.generationDir).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!generationInfo) return null;
  if (!generationInfo.isDirectory() || generationInfo.isSymbolicLink()) fail("existing generation path is unsafe");
  const markerInfo = await lstat(plan.paths.marker).catch(() => null);
  if (markerInfo && (!markerInfo.isFile() || markerInfo.isSymbolicLink() || (markerInfo.mode & 0o222) !== 0)) fail("existing generation marker is unsafe");
  const expectedEntries = markerInfo ? ["generation.json", "provenance.json", "repo", "verification.json"] : ["provenance.json", "repo", "verification.json"];
  if (canonical((await readdir(plan.paths.generationDir)).sort()) !== canonical(expectedEntries)) {
    fail(`generation path already exists and is not a recoverable publication: ${plan.paths.generationDir}`, "PI_GENERATION_EXISTS");
  }
  const prefix = `${plan.generationId}.`;
  const temporaryNames = (await readdir(state.directories["publication-tmp"])).filter((name) => name.startsWith(prefix) && name.endsWith(".generation.tmp"));
  if (markerInfo && temporaryNames.length === 0) fail(`generation path already exists and will not be replaced: ${plan.paths.generationDir}`, "PI_GENERATION_EXISTS");
  if (temporaryNames.length !== 1) fail("recoverable publication requires exactly one retained marker temporary");
  const temporary = path.join(state.directories["publication-tmp"], temporaryNames[0]);
  const temporaryInfo = await assertRegularFile(temporary, "retained generation marker temporary");
  if ((temporaryInfo.mode & 0o222) !== 0) fail("retained generation marker temporary must be read-only");
  const markerBytes = await readFile(temporary);
  let marker;
  try { marker = JSON.parse(markerBytes.toString("utf8")); } catch { fail("retained generation marker temporary is invalid"); }
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) fail("retained generation marker temporary must be an object");
  const provenancePath = path.join(plan.paths.generationDir, "provenance.json");
  const verificationPath = path.join(plan.paths.generationDir, "verification.json");
  const provenanceInfo = await assertRegularFile(provenancePath, "recoverable provenance");
  const verificationInfo = await assertRegularFile(verificationPath, "recoverable verification");
  if ((provenanceInfo.mode & 0o222) !== 0 || (verificationInfo.mode & 0o222) !== 0) fail("recoverable records must be read-only");
  const provenanceBytes = await readFile(provenancePath);
  const verificationBytes = await readFile(verificationPath);
  let provenance;
  let verification;
  try { provenance = JSON.parse(provenanceBytes); verification = JSON.parse(verificationBytes); } catch { fail("recoverable generation records are invalid"); }
  if (provenance.schema !== PROVENANCE_SCHEMA || canonical(provenance.plan) !== canonical(plan) || verification.schema !== VERIFICATION_SCHEMA || verification.status !== "verified") {
    fail("recoverable generation provenance mismatch");
  }
  validateCompleteMarker(markerBytes, marker, plan, provenanceBytes, verificationBytes);
  const allowNodeModules = plan.closure.install !== "no-install";
  await verifyReadOnlyTree(path.join(plan.paths.generationDir, "repo"));
  await verifyPackageInventory(path.join(plan.paths.generationDir, "repo"), plan, { allowNodeModules, requireReadOnly: true });
  if (markerInfo) {
    const finalBytes = await readFile(plan.paths.marker);
    if (!finalBytes.equals(markerBytes)) fail("existing generation marker differs from retained complete temporary");
  } else {
    await link(temporary, plan.paths.marker);
    await syncDirectory(plan.paths.generationDir);
  }
  await chmod(plan.paths.generationDir, 0o555);
  const verificationReceipt = await verifyGeneration(plan.paths.generationDir);
  await unlink(temporary);
  await syncDirectory(state.directories["publication-tmp"]);
  return { plan, marker, generationDir: plan.paths.generationDir, packageDir: plan.paths.packageDir, recoveredPublication: true, verificationReceipt };
}

export async function materializePlan(plan, hooks = {}) {
  const state = await ensureStateLayout(plan.paths.stateRoot);
  const lock = await acquireOwnedLock({
    lockPath: path.join(state.directories.locks, `${plan.generationId}.lock`),
    historyDir: state.directories["lock-history"],
    schema: LOCK_SCHEMA,
    binding: { stateInstanceId: state.marker.instanceId, stateRoot: plan.paths.stateRoot, generationId: plan.generationId },
  });
  let failureRoot;
  let published = false;
  try {
    await hooks.afterLock?.({ plan, lock: lock.record });
    const recovered = await recoverPublication(plan, state);
    if (recovered) { published = true; return recovered; }
    await validateCommitTree(plan.source.repoRoot, plan.source.commit);
    const candidateRoot = path.join(state.directories.candidates, `${plan.generationId}.${process.pid}.${randomUUID()}`);
    await mkdir(candidateRoot, { mode: 0o700 });
    failureRoot = candidateRoot;
    const repoDir = path.join(candidateRoot, "repo");
    await exportCommit(plan, repoDir);
    await hooks.afterExport?.({ candidateRoot, repoDir, plan });
    await verifyPackageInventory(repoDir, plan, { allowNodeModules: false });
    const install = await installRuntimeClosure(plan, repoDir, candidateRoot);
    const allowNodeModules = plan.closure.install !== "no-install";
    const candidateInventory = await verifyPackageInventory(repoDir, plan, { allowNodeModules });

    const provenance = {
      schema: PROVENANCE_SCHEMA,
      plan,
      exportedAt: new Date().toISOString(),
      export: { kind: "git-archive", exactCommit: plan.source.commit },
      install,
    };
    const verification = {
      schema: VERIFICATION_SCHEMA,
      status: "verified",
      verifiedAt: new Date().toISOString(),
      generationId: plan.generationId,
      checks: {
        exactCommitExport: true,
        trackedPackageInputsMatch: true,
        manifestAndLockMatch: true,
        entrypointsContained: true,
        unexpectedOutputsAbsent: true,
        lifecycleScriptsDisabled: true,
        nodeModulesPolicyVerified: true,
        publishedReadOnlyModes: true,
      },
      nodeModulesPolicy: plan.closure.install === "no-install" ? "absent" : "installed-only",
      packagePath: plan.paths.packageDir,
      entrypoints: candidateInventory.entrypoints.map((entrypoint) => ({
        ...entrypoint,
        absolutePath: path.join(plan.paths.generationDir, "repo", entrypoint.path),
        baseDir: plan.paths.packageDir,
      })),
    };
    await hooks.beforePublish?.({ candidateRoot, repoDir, plan, provenance, verification });

    const provenanceBytes = stableJson(provenance);
    const provenancePath = path.join(candidateRoot, "provenance.json");
    await writeExclusive(provenancePath, provenanceBytes, 0o600);
    await mkdir(plan.paths.generationDir, { mode: 0o700 });
    failureRoot = plan.paths.generationDir;
    const publishedRepoDir = path.join(plan.paths.generationDir, "repo");
    const publishedProvenancePath = path.join(plan.paths.generationDir, "provenance.json");
    const publishedVerificationPath = path.join(plan.paths.generationDir, "verification.json");
    await rename(repoDir, publishedRepoDir);
    await rename(provenancePath, publishedProvenancePath);
    await makeTreeReadOnly(publishedRepoDir);
    await verifyReadOnlyTree(publishedRepoDir);
    await verifyPackageInventory(publishedRepoDir, plan, { allowNodeModules, requireReadOnly: true });
    await chmod(publishedProvenancePath, 0o444);
    const verificationBytes = stableJson(verification);
    await writeExclusive(publishedVerificationPath, verificationBytes, 0o444);
    await syncDirectory(plan.paths.generationDir);

    const marker = {
      schema: GENERATION_SCHEMA,
      status: "published",
      generationId: plan.generationId,
      sourceCommit: plan.source.commit,
      inputDigest: plan.inputDigest,
      packageName: plan.selection.packageName,
      packageRoot: plan.selection.packageRoot,
      provenanceSha256: sha256(provenanceBytes),
      verificationSha256: sha256(verificationBytes),
      publishedAt: new Date().toISOString(),
    };
    const markerTemporary = await publishMarker(plan.paths.marker, state.directories["publication-tmp"], plan.generationId, stableJson(marker), hooks, () => { published = true; });
    await chmod(plan.paths.generationDir, 0o555);
    await unlink(markerTemporary);
    await syncDirectory(state.directories["publication-tmp"]);
    return { plan, marker, generationDir: plan.paths.generationDir, packageDir: plan.paths.packageDir };
  } catch (error) {
    if (!published) await writeFailure(failureRoot, plan, error);
    throw error;
  } finally {
    await lock.release();
  }
}

export async function materializeGeneration(options, hooks = {}) {
  const plan = await planGeneration(options);
  return materializePlan(plan, hooks);
}
