// ---
// summary: "Reads and validates checkout-bound canary lock and recovery-journal state."
// read_when:
//   - "Changing recovery-state inventory, checkout bindings, or package metadata validation."
// ---
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { identitiesMatch, identityOf, IntegrityError } from "./integrity.mjs";
import { CANONICAL_ROOT } from "./paths.mjs";
import {
  MAX_JOURNAL_BYTES,
  MAX_LOCK_BYTES,
  processLiveness,
  readStateRecord as readRawStateRecord,
  sha256,
} from "./state-files.mjs";
import { validateStatePayload } from "./state-schema.mjs";
import {
  bindingsMatch,
  GATE_KIND,
  LOCK_KIND,
  ownersMatch,
  rootBinding,
  verifyGate,
} from "./state-lock.mjs";

export {
  acquireCheckoutRecoveryLock,
  acquireStateGate,
  ConcurrentCanaryError,
  GATE_KIND,
  LOCK_KIND,
} from "./state-lock.mjs";

export const JOURNAL_KIND = "pi-host-compatibility-canary-recovery-journal";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function readStateRecord(filePath, expectedKind, maxBytes) {
  const record = readRawStateRecord(filePath, expectedKind, maxBytes);
  validateStatePayload(record.payload, expectedKind);
  return record;
}

function assertRegularMetadataFile(filePath, label, required = true) {
  const stats = lstatSync(filePath, { bigint: true, throwIfNoEntry: false });
  if (!stats) {
    if (!required) return null;
    throw new IntegrityError(`${label} is missing: ${filePath}`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new IntegrityError(`${label} must be a regular file: ${filePath}`);
  }
  const contents = readFileSync(filePath);
  return { digest: sha256(contents), size: Number(stats.size), identity: identityOf(stats), contents };
}

export function manifestStateBinding(manifest) {
  const declared = path.resolve(manifest.manifestPath);
  const stats = lstatSync(declared, { bigint: true });
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new IntegrityError("mutation manifest must be a regular non-symlink file");
  }
  const canonical = realpathSync(declared);
  const relativePath = path.relative(CANONICAL_ROOT, canonical);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new IntegrityError("mutation manifest must stay inside the canonical checkout");
  }
  const metadata = assertRegularMetadataFile(canonical, "mutation manifest");
  return { relativePath, digest: metadata.digest, identity: metadata.identity };
}

export function packageMetadataBinding(packageAbs) {
  const packageJson = assertRegularMetadataFile(path.join(packageAbs, "package.json"), "package manifest");
  let parsed;
  try { parsed = JSON.parse(packageJson.contents.toString("utf8")); }
  catch { throw new IntegrityError(`package manifest is malformed: ${path.relative(CANONICAL_ROOT, packageAbs)}`); }
  const packageLock = assertRegularMetadataFile(path.join(packageAbs, "package-lock.json"), "package lock", false);
  return {
    packageJsonDigest: packageJson.digest,
    packageName: typeof parsed.name === "string" ? parsed.name : null,
    packageVersion: typeof parsed.version === "string" ? parsed.version : null,
    packageLock: packageLock ? { present: true, digest: packageLock.digest } : { present: false, digest: null },
  };
}

function validateRecordBindings(payload, manifestBinding) {
  if (!bindingsMatch(payload.root, rootBinding())) {
    throw new IntegrityError("recovery state belongs to a different checkout identity");
  }
  if (
    payload.manifest?.relativePath !== manifestBinding.relativePath ||
    payload.manifest?.digest !== manifestBinding.digest ||
    !identitiesMatch(payload.manifest?.identity, manifestBinding.identity)
  ) throw new IntegrityError("recovery state manifest identity or checksum drifted");
  if (!UUID_PATTERN.test(payload.runId ?? "")) {
    throw new IntegrityError("recovery state has an invalid run id");
  }
}

function journalInventory(paths) {
  if (!existsSync(paths.journalsDir)) return [];
  const journals = [];
  for (const entry of readdirSync(paths.journalsDir, { withFileTypes: true })) {
    const candidate = /^\.([0-9a-f-]{36})\.json\.([0-9a-f-]{36})\.tmp$/.exec(entry.name);
    if (candidate && UUID_PATTERN.test(candidate[1]) && UUID_PATTERN.test(candidate[2])) {
      const stats = lstatSync(path.join(paths.journalsDir, entry.name), { bigint: true });
      if (
        !entry.isFile() || entry.isSymbolicLink() ||
        typeof process.geteuid !== "function" || Number(stats.uid) !== process.geteuid() ||
        (Number(stats.mode) & 0o077) !== 0
      ) throw new IntegrityError(`unpublished recovery journal candidate is unsafe: ${entry.name}`);
      continue;
    }
    if (
      !entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json") ||
      !UUID_PATTERN.test(entry.name.replace(/\.json$/, ""))
    ) throw new IntegrityError(`unexpected recovery journal entry: ${entry.name}`);
    journals.push(path.join(paths.journalsDir, entry.name));
  }
  if (journals.length > 1) throw new IntegrityError("multiple recovery journals exist for this checkout");
  return journals;
}

export function readCheckoutState(paths, manifestBinding) {
  const journals = journalInventory(paths);
  const lock = existsSync(paths.lockPath)
    ? readStateRecord(paths.lockPath, LOCK_KIND, MAX_LOCK_BYTES)
    : null;
  const recoveryLock = existsSync(paths.recoveryLockPath)
    ? readStateRecord(paths.recoveryLockPath, GATE_KIND, MAX_LOCK_BYTES)
    : null;
  const journal = journals.length === 1
    ? readStateRecord(journals[0], JOURNAL_KIND, MAX_JOURNAL_BYTES)
    : null;
  if (lock) validateRecordBindings(lock.payload, manifestBinding);
  if (recoveryLock) verifyGate(recoveryLock);
  if (journal) validateRecordBindings(journal.payload, manifestBinding);
  if (lock && journal && lock.payload.runId !== journal.payload.runId) {
    throw new IntegrityError("mutation lock and recovery journal run ids differ");
  }
  if (lock && journal && !ownersMatch(lock.payload.owner, journal.payload.owner)) {
    throw new IntegrityError("mutation lock and recovery journal owner identities differ");
  }
  if (journal && path.basename(journal.path) !== `${journal.payload.runId}.json`) {
    throw new IntegrityError("recovery journal filename does not match its run id");
  }
  return { lock, journal, recoveryLock };
}

export function validateTargetMetadata(target, packageAbs) {
  const current = packageMetadataBinding(packageAbs);
  if (
    current.packageJsonDigest !== target.metadata?.packageJsonDigest ||
    current.packageName !== target.metadata?.packageName ||
    current.packageVersion !== target.metadata?.packageVersion ||
    current.packageLock.present !== target.metadata?.packageLock?.present ||
    current.packageLock.digest !== target.metadata?.packageLock?.digest
  ) throw new IntegrityError(`package metadata drifted for ${target.declaredPath}`);
  return current;
}

export function recordLiveness(record) {
  return record ? processLiveness(record.payload.owner?.identity) : null;
}

export function childLiveness(journal) {
  return journal?.payload.child ? processLiveness(journal.payload.child.identity) : null;
}
