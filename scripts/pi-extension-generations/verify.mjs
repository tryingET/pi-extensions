// ---
// summary: "Reconstructs published generation provenance and reports retained generation status without mutation."
// read_when:
//   - "Changing generation verification, tamper detection, or status reporting."
// ---
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import {
  GENERATION_SCHEMA,
  PLAN_SCHEMA,
  PROVENANCE_SCHEMA,
  VERIFICATION_SCHEMA,
  assertAbsolute,
  assertDirectory,
  assertObject,
  assertRegularFile,
  canonical,
  fail,
  sha256,
  stableJson,
} from "./common.mjs";
import { verifyPackageInventory, verifyReadOnlyTree } from "./inventory.mjs";
import { recomputePlanIdentity } from "./plan.mjs";

function parse(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateRoutineMarker(markerRecord, marker) {
  const expectedKeys = ["generationId", "inputDigest", "packageName", "packageRoot", "provenanceSha256", "publishedAt", "schema", "sourceCommit", "status", "verificationSha256"];
  if (canonical(Object.keys(marker).sort()) !== canonical(expectedKeys)) fail("generation marker keys are not exact");
  if (!Buffer.from(stableJson(marker)).equals(markerRecord.bytes)) fail("generation marker is not canonical deterministic JSON");
  let canonicalPublishedAt;
  try { canonicalPublishedAt = new Date(marker.publishedAt).toISOString(); } catch { fail("generation marker publishedAt is invalid"); }
  if (typeof marker.publishedAt !== "string" || canonicalPublishedAt !== marker.publishedAt) fail("generation marker publishedAt is invalid");
}

function assertNoInstallPlan(plan) {
  if (plan?.builder?.installPolicy !== "no-install" || plan?.closure?.install !== "no-install" || !Array.isArray(plan.closure.runtimeDependencies) || plan.closure.runtimeDependencies.length !== 0 || !Array.isArray(plan.closure.optionalDependencies) || plan.closure.optionalDependencies.length !== 0) {
    fail("published generation violates the empty-runtime-dependency no-install first-slice policy");
  }
}

function assertEmptyManifestDependencies(manifest) {
  for (const field of ["dependencies", "optionalDependencies"]) {
    if (manifest[field] === undefined) continue;
    const value = assertObject(manifest[field], `exported package manifest ${field}`);
    if (Object.keys(value).length !== 0) fail(`exported package manifest ${field} must be empty in the first no-install slice`);
  }
}

async function readAttested(target, label) {
  const info = await assertRegularFile(target, label);
  if ((info.mode & 0o222) !== 0) fail(`${label} must be read-only after publication`);
  const bytes = await readFile(target);
  return { bytes, value: parse(bytes, label) };
}

export async function verifyGeneration(generationDir) {
  assertAbsolute(generationDir, "generation directory");
  const generationInfo = await assertDirectory(generationDir, "generation directory");
  if ((generationInfo.mode & 0o222) !== 0) fail("published generation directory must be read-only");
  const canonicalGeneration = await realpath(generationDir);
  if (canonicalGeneration !== generationDir) fail("generation directory must use its canonical path");
  const topLevel = (await readdir(generationDir)).sort();
  const expectedTopLevel = ["generation.json", "provenance.json", "repo", "verification.json"];
  if (JSON.stringify(topLevel) !== JSON.stringify(expectedTopLevel)) fail("published generation contains unexpected top-level state");

  const markerRecord = await readAttested(path.join(generationDir, "generation.json"), "generation marker");
  const provenanceRecord = await readAttested(path.join(generationDir, "provenance.json"), "generation provenance");
  const verificationRecord = await readAttested(path.join(generationDir, "verification.json"), "generation verification");
  const marker = assertObject(markerRecord.value, "generation marker");
  validateRoutineMarker(markerRecord, marker);
  const provenance = assertObject(provenanceRecord.value, "generation provenance");
  const verification = assertObject(verificationRecord.value, "generation verification");
  if (marker.schema !== GENERATION_SCHEMA || marker.status !== "published") fail("generation marker is not a published supported generation");
  if (provenance.schema !== PROVENANCE_SCHEMA) fail("unsupported provenance schema");
  if (verification.schema !== VERIFICATION_SCHEMA || verification.status !== "verified") fail("generation verification did not pass");
  if (marker.provenanceSha256 !== sha256(provenanceRecord.bytes)) fail("provenance record hash mismatch");
  if (marker.verificationSha256 !== sha256(verificationRecord.bytes)) fail("verification record hash mismatch");

  const plan = assertObject(provenance.plan, "generation plan");
  if (plan.schema !== PLAN_SCHEMA) fail("unsupported generation plan schema");
  assertNoInstallPlan(plan);
  const identity = recomputePlanIdentity(plan);
  if (plan.inputDigest !== identity.inputDigest || plan.generationId !== identity.generationId) fail("generation plan identity reconstruction failed");
  if (marker.inputDigest !== identity.inputDigest || marker.generationId !== identity.generationId) fail("generation marker identity mismatch");
  if (marker.sourceCommit !== plan.source?.commit || marker.packageName !== plan.selection?.packageName || marker.packageRoot !== plan.selection?.packageRoot) {
    fail("generation marker provenance fields mismatch");
  }
  if (path.basename(generationDir) !== identity.generationId) fail("generation directory name does not match its content identity");
  const expectedPaths = {
    generationDir,
    repoDir: path.join(generationDir, "repo"),
    packageDir: path.join(generationDir, "repo", plan.selection.packageRoot),
    marker: path.join(generationDir, "generation.json"),
  };
  for (const [key, value] of Object.entries(expectedPaths)) if (plan.paths?.[key] !== value) fail(`generation plan ${key} path mismatch`);

  const exportedManifest = await readAttested(path.join(expectedPaths.packageDir, "package.json"), "exported package manifest");
  assertEmptyManifestDependencies(assertObject(exportedManifest.value, "exported package manifest"));
  await verifyReadOnlyTree(expectedPaths.repoDir);
  const inventory = await verifyPackageInventory(expectedPaths.repoDir, plan, { allowNodeModules: false, requireReadOnly: true });
  const expectedNodeModulesPolicy = "absent";
  if (verification.generationId !== identity.generationId || verification.packagePath !== expectedPaths.packageDir || verification.nodeModulesPolicy !== expectedNodeModulesPolicy) {
    fail("verification record generation/package path mismatch");
  }
  if (!verification.checks || Object.values(verification.checks).some((value) => value !== true)) fail("verification record contains a failed check");
  if (!Array.isArray(verification.entrypoints) || verification.entrypoints.length !== inventory.entrypoints.length) {
    fail("verification entrypoint inventory mismatch");
  }
  for (let index = 0; index < inventory.entrypoints.length; index += 1) {
    const expected = inventory.entrypoints[index];
    const recorded = verification.entrypoints[index];
    if (recorded.path !== expected.path || recorded.sha256 !== expected.sha256 || recorded.absolutePath !== path.join(generationDir, "repo", expected.path) || recorded.baseDir !== expectedPaths.packageDir) {
      fail(`verification entrypoint provenance mismatch: ${expected.path}`);
    }
  }
  return {
    ok: true,
    generationId: identity.generationId,
    generationDir,
    packageName: plan.selection.packageName,
    packageRoot: plan.selection.packageRoot,
    packageDir: expectedPaths.packageDir,
    sourceCommit: plan.source.commit,
    inputDigest: identity.inputDigest,
    entrypoints: inventory.entrypoints.map((entrypoint) => ({
      path: path.join(generationDir, "repo", entrypoint.path),
      baseDir: expectedPaths.packageDir,
      sha256: entrypoint.sha256,
    })),
    marker,
    plan,
  };
}

export async function generationStatus(stateRoot) {
  assertAbsolute(stateRoot, "state root");
  await assertDirectory(stateRoot, "state root");
  const generationsRoot = path.join(stateRoot, "generations");
  const info = await lstat(generationsRoot).catch(() => null);
  if (!info) return { stateRoot, generations: [] };
  if (!info.isDirectory() || info.isSymbolicLink()) fail("generations root must be a non-symlink directory");
  const names = (await readdir(generationsRoot)).sort();
  const generations = [];
  for (const name of names) {
    const generationDir = path.join(generationsRoot, name);
    const marker = await lstat(path.join(generationDir, "generation.json")).catch(() => null);
    if (!marker) generations.push({ generationId: name, status: "incomplete-retained", generationDir });
    else {
      try {
        const receipt = await verifyGeneration(generationDir);
        generations.push({ generationId: name, status: "published-verified", generationDir, sourceCommit: receipt.sourceCommit });
      } catch (error) {
        generations.push({ generationId: name, status: "published-invalid-retained", generationDir, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { stateRoot, generations };
}
