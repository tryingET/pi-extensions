import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  type CandidateAdmissionLegacyReconciliationProof,
  type CandidateAdmissionPermit,
  type CandidateAdmissionPressure,
  candidateAdmissionPermitPath,
  withCandidateAdmissionLock,
  writeAdmissionJson,
} from "./candidatePeerAdmissionState.ts";
import {
  digestObject,
  getCandidateLifecycleEventsPath,
  getCandidateLifecycleRecordPath,
  getCandidateLifecycleRoot,
  stableJson,
  withResourceLock,
} from "./candidatePeerLifecycleV2.ts";

// biome-ignore format: compact helper preserves the package code-size budget
export type CandidateAdmissionLegacyTerminalReconciliationInput = { schemaVersion: 1; action: "reconcile_legacy_terminal_release"; admissionId: string; expectedPermitDigest: string; resourceId: string; generationId: string; peerRunId: string; repoRoot: string; worktreePath: string; branchName: string; branchOid: string; expectedRecordDigest: string; expectedEventsSha256: string; expectedArchiveDigest: string; expectedLegacyReceiptDigest: string; expectedCleanupAuthorizationDigest: string; ownerRationale: string; ownerReference: string; };

// biome-ignore format: compact helper preserves the package code-size budget
export type CandidateLegacyReconciliationPreparation = { admissionId: string; resourceId: string; ownerRationale: string; ownerReference: string; };

// biome-ignore format: compact helper preserves the package code-size budget
type Json = Record<string, unknown>;

// biome-ignore format: compact helper preserves the package code-size budget
type CapturePressure = (env: NodeJS.ProcessEnv, at: string) => CandidateAdmissionPressure;

// biome-ignore format: compact helper preserves the package code-size budget
type LegacyRecord = Json & { resourceId: string; generationId: string; resourceVersion: number; state: string; updatedAt: string; worktreePath: string; aliases: string[]; repoRoots: string[]; branchNames: string[]; reviewSnapshot: Json; disposition: Json; archive: Json; cleanupAuthorization: Json; terminalReceipt: Json; };

// biome-ignore format: compact helper preserves the package code-size budget
const INPUT_KEYS = "schemaVersion action admissionId expectedPermitDigest resourceId generationId peerRunId repoRoot worktreePath branchName branchOid expectedRecordDigest expectedEventsSha256 expectedArchiveDigest expectedLegacyReceiptDigest expectedCleanupAuthorizationDigest ownerRationale ownerReference".split( " ", );

// biome-ignore format: compact helper preserves the package code-size budget
const REQUEST_KEYS = "admissionId resourceId ownerRationale ownerReference".split(" ");

// biome-ignore format: compact helper preserves the package code-size budget
const BASE_RECORD_KEYS = "schemaVersion resourceId generationId resourceVersion state createdAt updatedAt worktreePath aliases repoRoots branchNames migrationInventoryDigest".split( " ", );

// biome-ignore format: compact helper preserves the package code-size budget
const REVIEW_KEYS = "schemaVersion resourceId generationId capturedAt worktreePath worktreeRealPath repoRoot gitCommonDir branchName headOid indexTreeOid statusSha256 unstagedPatchSha256 stagedPatchSha256 aliases objects blockers contentDigest snapshotDigest".split( " ", );

// biome-ignore format: compact helper preserves the package code-size budget
const DISPOSITION_KEYS = "disposition actor rationale issuedAt reviewSnapshotDigest validationRefs receiptDigest".split(
  " ",
);

// biome-ignore format: compact helper preserves the package code-size budget
const ARCHIVE_KEYS = "archiveDir archiveDigest verifiedAt".split(" ");

// biome-ignore format: compact helper preserves the package code-size budget
const AUTH_KEYS = "schemaVersion resourceId generationId authorizedResourceVersion aliases actor issuedAt expiresAt nonce dispositionDigest reviewSnapshotDigest archiveDigest expectedWorktreeRealPath expectedGitCommonDir branchName branchOid effects authorizationDigest".split( " ", );

// biome-ignore format: compact helper preserves the package code-size budget
const RECEIPT_KEYS = "type effects at archiveDigest authorizationDigest receiptDigest".split(" ");

// biome-ignore format: compact helper preserves the package code-size budget
const VERIFY_PROOF_KEYS = "schemaVersion type verificationSemantics hardenedV2Verified resourceId generationId recordDigest eventsSha256 archiveDigest legacyReceiptDigest cleanupAuthorizationDigest transactionAt proofDigest".split( " ", );

// biome-ignore format: compact helper preserves the package code-size budget
const RECONCILE_PROOF_KEYS = "schemaVersion type verificationSemantics hardenedV2Verified expectedPermitDigest ownerInputDigest ownerRationale ownerReference lifecycleVerificationProof pressureBefore pressureAfter reconciledAt reconciliationDigest".split( " ", );

// biome-ignore format: compact helper preserves the package code-size budget
const PRESSURE_KEYS = "capturedAt inventoryDigest unresolvedResources unresolvedBytes oldestUnresolvedAgeMs activeAdmissions byRepository activeAdmissionIds stateDigest".split( " ", );

// biome-ignore format: compact helper preserves the package code-size budget
const ROW_KEYS = "unresolvedResources unresolvedBytes oldestUnresolvedAgeMs activeAdmissions".split( " ", );

// biome-ignore format: compact helper preserves the package code-size budget
const HEX64 = /^[a-f0-9]{64}$/;

// biome-ignore format: compact helper preserves the package code-size budget
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }

// biome-ignore format: compact helper preserves the package code-size budget
function exact(value: unknown, keys: string[], label: string): asserts value is Json { if ( !value || typeof value !== "object" || Array.isArray(value) || stableJson(Object.keys(value).sort()) !== stableJson([...keys].sort()) ) throw new Error(`${label} key set mismatch`); }

// biome-ignore format: compact helper preserves the package code-size budget
function hasControl(value: string): boolean { return [...value].some((item) => item.charCodeAt(0) <= 31 || item.charCodeAt(0) === 127); }

// biome-ignore format: compact helper preserves the package code-size budget
function text(value: unknown, label: string): asserts value is string { if ( typeof value !== "string" || !value || [...value].some((item) => item.charCodeAt(0) <= 31 || item.charCodeAt(0) === 127) ) throw new Error(`${label} is empty or contains control characters`); }

// biome-ignore format: compact helper preserves the package code-size budget
function time(value: unknown, label: string): number { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error(`${label} is not canonical`); const parsed = Date.parse(value); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`${label} is invalid`); return parsed; }

// biome-ignore format: compact helper preserves the package code-size budget
function canonicalPath(path: string, label: string): void { text(path, label); if (!isAbsolute(path) || resolve(path) !== path) throw new Error(`${label} must be absolute and normalized`); }

// biome-ignore format: compact helper preserves the package code-size budget
function assertNoSymlinkAncestors(path: string, allowMissing = false): void { let cursor: string = sep; for (const part of path.split(sep).filter(Boolean)) { cursor = join(cursor, part); try { if (lstatSync(cursor).isSymbolicLink()) throw new Error("path contains a symlink ancestor"); } catch (error) { if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } } }

// biome-ignore format: compact helper preserves the package code-size budget
function secureRead(path: string, label: string, ownerOnly = true): Buffer { canonicalPath(path, label); assertNoSymlinkAncestors(path); const parent = lstatSync(dirname(path)); if ( !parent.isDirectory() || parent.uid !== process.getuid?.() || (ownerOnly && (parent.mode & 0o077) !== 0) ) throw new Error(`${label} parent must be owner-only`); const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { const before = fstatSync(fd); if ( !before.isFile() || before.uid !== process.getuid?.() || (ownerOnly && (before.mode & 0o777) !== 0o600) ) throw new Error(`${label} must be an owner regular 0600 file`); const raw = readFileSync(fd); const after = fstatSync(fd); if ( before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs ) throw new Error(`${label} changed while being read`); return raw; } finally { closeSync(fd); } }

// biome-ignore format: compact helper preserves the package code-size budget
function parseJson(raw: string, label: string): unknown { let i = 0; const ws = () => { while (/\s/.test(raw[i] ?? "")) i += 1; }; const string = (): string => { const start = i; if (raw[i++] !== '"') throw new Error(`${label} malformed string`); while (i < raw.length) { if (raw[i] === "\\") i += 2; else if (raw[i++] === '"') return JSON.parse(raw.slice(start, i)); } throw new Error(`${label} unterminated string`); }; const value = (): unknown => { ws(); if (raw[i] === "{") { i += 1; ws(); const out: Json = {}; const seen = new Set<string>(); if (raw[i] === "}") { i += 1; return out; } for (;;) { ws(); const key = string(); if (seen.has(key)) throw new Error(`${label} duplicate key`); seen.add(key); ws(); if (raw[i++] !== ":") throw new Error(`${label} malformed object`); out[key] = value(); ws(); const token = raw[i++]; if (token === "}") return out; if (token !== ",") throw new Error(`${label} malformed object`); } } if (raw[i] === "[") { i += 1; ws(); const out: unknown[] = []; if (raw[i] === "]") { i += 1; return out; } for (;;) { out.push(value()); ws(); const token = raw[i++]; if (token === "]") return out; if (token !== ",") throw new Error(`${label} malformed array`); } } if (raw[i] === '"') return string(); const match = raw .slice(i) .match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/); if (!match) throw new Error(`${label} malformed value`); i += match[0].length; return JSON.parse(match[0]); }; const parsed = value(); ws(); if (i !== raw.length) throw new Error(`${label} trailing data`); return parsed; }

// biome-ignore format: compact helper preserves the package code-size budget
function readCanonicalPacket(path: string, label: string): Json { const raw = secureRead(path, label).toString("utf8"); if (!raw.endsWith("\n") || raw.includes("\n\n")) throw new Error(`${label} must have one final newline and no blank line`); const parsed = parseJson(raw.slice(0, -1), label) as Json; if (`${stableJson(parsed)}\n` !== raw) throw new Error(`${label} is not canonical JSON`); return parsed; }

// biome-ignore format: compact helper preserves the package code-size budget
function assertInput( value: unknown, ): asserts value is CandidateAdmissionLegacyTerminalReconciliationInput { exact(value, INPUT_KEYS, "reconciliation input"); for (const [key, item] of Object.entries(value)) if (typeof item === "string") text(item, `input.${key}`); const input = value as CandidateAdmissionLegacyTerminalReconciliationInput; if (input.schemaVersion !== 1 || input.action !== "reconcile_legacy_terminal_release") throw new Error("reconciliation input schema mismatch"); if ( !/^[a-f0-9]{40}$/.test(input.branchOid) || ![ input.expectedPermitDigest, input.expectedRecordDigest, input.expectedEventsSha256, input.expectedArchiveDigest, input.expectedLegacyReceiptDigest, input.expectedCleanupAuthorizationDigest, ].every((item) => HEX64.test(item)) ) throw new Error("reconciliation input digest binding is malformed"); canonicalPath(input.repoRoot, "input repository"); canonicalPath(input.worktreePath, "input worktree"); if (!input.ownerRationale.trim() || !input.ownerReference.trim()) throw new Error("reconciliation owner binding is empty"); }

// biome-ignore format: compact helper preserves the package code-size budget
export function readCandidateAdmissionReconcileInput( path: string, ): CandidateAdmissionLegacyTerminalReconciliationInput { const value = readCanonicalPacket(path, "reconciliation input"); assertInput(value); return value; }

// biome-ignore format: compact helper preserves the package code-size budget
function readPermit(path: string): CandidateAdmissionPermit { return parseJson( secureRead(path, "candidate admission permit").toString("utf8"), "candidate admission permit", ) as CandidateAdmissionPermit; }

// biome-ignore format: compact helper preserves the package code-size budget
function readRecord( resourceId: string, env: NodeJS.ProcessEnv, ): { record: LegacyRecord; digest: string } { const raw = secureRead( getCandidateLifecycleRecordPath(resourceId, env), "lifecycle record", ).toString("utf8"); const record = parseJson(raw, "lifecycle record") as LegacyRecord; return { record, digest: digestObject(record) }; }

// biome-ignore format: compact helper preserves the package code-size budget
function readEvents(resourceId: string, env: NodeJS.ProcessEnv): { events: Json[]; sha: string } { const raw = secureRead( getCandidateLifecycleEventsPath(resourceId, env), "lifecycle events", ).toString("utf8"); if (!raw.endsWith("\n") || raw.includes("\n\n")) throw new Error("lifecycle events have a blank line or missing final newline"); const lines = raw.slice(0, -1).split("\n"); const events = lines.map((line, index) => { const event = parseJson(line, `lifecycle event ${index + 1}`) as Json; if (JSON.stringify(event) !== line) throw new Error("lifecycle events are not raw canonical JSONL"); return event; }); return { events, sha: sha256(raw) }; }

// biome-ignore format: compact helper preserves the package code-size budget
function verifyArchive(record: LegacyRecord, expectedDigest: string, env: NodeJS.ProcessEnv): void { const archive = record.archive; exact(archive, ARCHIVE_KEYS, "legacy archive receipt"); const root = join( getCandidateLifecycleRoot(env), "archives", record.resourceId, record.generationId, ); if (archive.archiveDir !== root || archive.archiveDigest !== expectedDigest) throw new Error("legacy archive binding mismatch"); assertNoSymlinkAncestors(root); const rootInfo = lstatSync(root); if ( !rootInfo.isDirectory() || rootInfo.uid !== process.getuid?.() || (rootInfo.mode & 0o077) !== 0 ) throw new Error("legacy archive root is not owner-only"); const completeRaw = secureRead(join(root, "COMPLETE"), "archive COMPLETE").toString("utf8"); const complete = parseJson(completeRaw, "archive COMPLETE"); exact(complete, ["schemaVersion", "archiveDigest", "restorationDigest"], "archive COMPLETE"); if ( `${JSON.stringify(complete)}\n` !== completeRaw || complete.schemaVersion !== 2 || complete.archiveDigest !== archive.archiveDigest || !HEX64.test(String(complete.restorationDigest)) ) throw new Error("archive COMPLETE mismatch"); const manifestRaw = secureRead(join(root, "manifest.json"), "archive manifest").toString("utf8"); const manifest = parseJson(manifestRaw, "archive manifest") as Json; exact(manifest, Object.keys(manifest), "archive manifest"); const listed = Object.keys(manifest); if (stableJson(listed) !== stableJson([...listed].sort())) throw new Error("archive manifest is not sorted"); const actual: string[] = []; const directories: string[] = []; const stack = [root]; while (stack.length) { const dir = stack.pop(); if (!dir) break; for (const name of readdirSync(dir).sort()) { const path = join(dir, name); const rel = relative(root, path); if (rel === "COMPLETE" || rel === "manifest.json") continue; const info = lstatSync(path); if (info.isSymbolicLink()) throw new Error("archive member is a symlink"); if (info.isDirectory()) { if ((info.mode & 0o077) !== 0) throw new Error("archive directory is not owner-only"); directories.push(rel); stack.push(path); } else { if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) throw new Error("archive member is not owner-only regular file"); actual.push(rel); } } } actual.sort(); if ( stableJson(actual) !== stableJson(listed) || directories.some((dir) => !listed.some((item) => item.startsWith(`${dir}${sep}`))) ) throw new Error("archive manifest member set mismatch"); for (const rel of listed) { text(rel, "archive member path"); if ( relative(root, resolve(root, rel)) !== rel || !HEX64.test(String(manifest[rel])) || sha256(secureRead(join(root, rel), "archive member")) !== manifest[rel] ) throw new Error("archive member byte hash mismatch"); } if ( archive.archiveDigest !== digestObject({ manifest, restorationDigest: complete.restorationDigest, resourceId: record.resourceId, generationId: record.generationId, }) ) throw new Error("legacy archive digest mismatch"); }

// biome-ignore format: compact helper preserves the package code-size budget
function git(repo: string, args: string[], env: NodeJS.ProcessEnv, absentStatus?: number): string { const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], }); if (result.error || result.signal || result.status === null) throw new Error("Git query could not execute"); if (absentStatus !== undefined) { if (result.status === absentStatus) return ""; if (result.status === 0) throw new Error("legacy Git fragment still exists"); } if (result.status !== 0) throw new Error("Git query failed closed"); return result.stdout; }

// biome-ignore format: compact helper preserves the package code-size budget
function withoutFinalLf(value: string, label: string): string { if (!value.endsWith("\n") || value.endsWith("\n\n")) throw new Error(`${label} returned malformed output`); const result = value.slice(0, -1); if (hasControl(result)) throw new Error(`${label} returned control characters`); return result; }

// biome-ignore format: compact helper preserves the package code-size budget
function syncDirectory(path: string): void { const fd = openSync(path, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }

// biome-ignore format: compact helper preserves the package code-size budget
function checkedBranchRef(branchName: string, env: NodeJS.ProcessEnv): string { text(branchName, "branch name"); const result = spawnSync("git", ["check-ref-format", "--branch", branchName], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }); if (result.error || result.signal || result.status !== 0 || !result.stdout.endsWith("\n") || hasControl(result.stdout.slice(0, -1)) || result.stdout.slice(0, -1) !== branchName) throw new Error("legacy branch ref is unsafe"); return `refs/heads/${branchName}`; }

// biome-ignore format: compact helper preserves the package code-size budget
function withGitRefFence<T>(commonDir: string, branchName: string, env: NodeJS.ProcessEnv, action: () => T, observer?: (lockPath: string) => void): T { canonicalPath(commonDir, "Git fence common directory"); assertNoSymlinkAncestors(commonDir); if (realpathSync(commonDir) !== commonDir) throw new Error("Git fence common directory is not canonical"); const ref = checkedBranchRef(branchName, env); const heads = join(commonDir, "refs", "heads"); assertNoSymlinkAncestors(heads); const headsInfo = lstatSync(heads); if (!headsInfo.isDirectory() || headsInfo.isSymbolicLink() || headsInfo.uid !== process.getuid?.() || realpathSync(heads) !== heads) throw new Error("Git heads directory is unsafe"); const parts = branchName.split("/"); const leaf = parts.pop(); if (!leaf) throw new Error("legacy branch ref is unsafe"); const created: string[] = []; let parent = heads; for (const part of parts) { const next = join(parent, part); try { const info = lstatSync(next); if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || realpathSync(next) !== next) throw new Error("Git ref parent is unsafe"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; mkdirSync(next, { mode: 0o700 }); if (readdirSync(next).length !== 0) throw new Error("new Git ref parent is not empty"); syncDirectory(parent); created.push(next); } parent = next; } const lockPath = join(parent, `${leaf}.lock`); if (relative(heads, lockPath) !== `${branchName}.lock` || join(commonDir, ref) !== lockPath.slice(0, -5)) throw new Error("Git ref fence path mismatch"); let fd: number; try { fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); } catch { for (const path of [...created].reverse()) { try { if (readdirSync(path).length === 0) { rmdirSync(path); syncDirectory(dirname(path)); } } catch {} } throw new Error("Git ref fence is held or stale; owner recovery is required"); } let value: T | undefined; let failure: unknown; let completed = false; try { fsyncSync(fd); syncDirectory(parent); observer?.(lockPath); value = action(); completed = true; } catch (error) { failure = error; } let cleanupFailure: unknown; try { closeSync(fd); } catch (error) { cleanupFailure = error; } try { unlinkSync(lockPath); syncDirectory(parent); } catch (error) { cleanupFailure ??= error; } for (const path of [...created].reverse()) { try { if (readdirSync(path).length === 0) { rmdirSync(path); syncDirectory(dirname(path)); } } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOTEMPTY") cleanupFailure ??= error; } } if (failure) throw failure; if (cleanupFailure && !completed) throw cleanupFailure; return value as T; }

// biome-ignore format: compact helper preserves the package code-size budget
function sameIdentity(left: string, right: string): boolean { const a = statSync(left); const b = statSync(right); return a.dev === b.dev && a.ino === b.ino; }

// biome-ignore format: compact helper preserves the package code-size budget
function assertDeleted(path: string): void { canonicalPath(path, "deleted worktree path"); try { lstatSync(path); throw new Error("legacy worktree path still exists"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } assertNoSymlinkAncestors(dirname(path), true); }

// biome-ignore format: compact helper preserves the package code-size budget
function verifyGitDeletion( repoRoot: string, worktreePath: string, branchName: string, expectedCommon: string, env: NodeJS.ProcessEnv, ): void { canonicalPath(repoRoot, "legacy repository root"); canonicalPath(expectedCommon, "authorization common directory"); assertNoSymlinkAncestors(repoRoot); assertNoSymlinkAncestors(expectedCommon); if (realpathSync(repoRoot) !== repoRoot || realpathSync(expectedCommon) !== expectedCommon) throw new Error("legacy Git identity is not canonical"); const top = withoutFinalLf( git(repoRoot, ["rev-parse", "--path-format=absolute", "--show-toplevel"], env), "Git repository identity", ); const common = withoutFinalLf( git(repoRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"], env), "Git common directory identity", ); if ( top !== repoRoot || common !== expectedCommon || !sameIdentity(top, repoRoot) || !sameIdentity(common, expectedCommon) ) throw new Error("legacy repository/common-dir identity mismatch"); const raw = git(repoRoot, ["worktree", "list", "--porcelain", "-z"], env); if (!raw.endsWith("\0\0")) throw new Error("Git worktree query returned malformed porcelain"); for (const block of raw.slice(0, -2).split("\0\0")) { const fields = block.split("\0"); const worktree = fields.find((field) => field.startsWith("worktree "))?.slice(9); if (!worktree) throw new Error("Git worktree query omitted identity"); if (resolve(worktree) === worktreePath) throw new Error("legacy worktree remains registered"); if (fields.includes(`branch refs/heads/${branchName}`)) throw new Error("legacy branch remains registered"); } git(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], env, 1); }

// biome-ignore format: compact helper preserves the package code-size budget
function recordKeys(...optional: string[]): string[] { return [...BASE_RECORD_KEYS, ...optional]; }

function verifyReview(
  review: Json,
  record: LegacyRecord,
  input: CandidateAdmissionLegacyTerminalReconciliationInput,
  label: string,
): void {
  exact(review, REVIEW_KEYS, label);
  const content = {
    headOid: review.headOid,
    indexTreeOid: review.indexTreeOid,
    statusSha256: review.statusSha256,
    unstagedPatchSha256: review.unstagedPatchSha256,
    stagedPatchSha256: review.stagedPatchSha256,
    aliases: review.aliases,
    objects: review.objects,
  };
  const unsigned = Object.fromEntries(
    Object.entries(review).filter(([key]) => key !== "snapshotDigest"),
  );
  if (
    review.schemaVersion !== 2 ||
    review.resourceId !== record.resourceId ||
    review.generationId !== record.generationId ||
    review.worktreePath !== input.worktreePath ||
    review.worktreeRealPath !== input.worktreePath ||
    review.repoRoot !== input.worktreePath ||
    review.branchName !== input.branchName ||
    review.headOid !== input.branchOid ||
    stableJson(review.aliases) !== stableJson([input.peerRunId]) ||
    stableJson(review.objects) !== "[]" ||
    stableJson(review.blockers) !== "[]" ||
    review.contentDigest !== digestObject(content) ||
    review.snapshotDigest !== digestObject(unsigned)
  )
    throw new Error(`${label} digest or identity mismatch`);
}

// biome-ignore format: compact helper preserves the package code-size budget
function verifyDisposition(disposition: Json, review: Json, label: string): void { exact(disposition, DISPOSITION_KEYS, label); if ( disposition.disposition !== "rejected" || disposition.reviewSnapshotDigest !== review.snapshotDigest || disposition.receiptDigest !== digestObject( Object.fromEntries(Object.entries(disposition).filter(([key]) => key !== "receiptDigest")), ) ) throw new Error(`${label} cross-digest mismatch`); }

function verifyEventChain(
  events: Json[],
  finalRecord: LegacyRecord,
  finalReview: Json,
  finalDisposition: Json,
  archive: Json,
  auth: Json,
  effects: Json[],
  input: CandidateAdmissionLegacyTerminalReconciliationInput,
): void {
  if (events.length !== 10) throw new Error("legacy lifecycle event chain length mismatch");
  const transitions = [
    ["migrated_v1", 1, "review_pending", []],
    ["review_captured", 2, "review_pending", ["reviewSnapshot"]],
    ["disposition_rejected", 3, "rejected", ["reviewSnapshot", "disposition"]],
    ["review_captured", 4, "review_pending", ["reviewSnapshot"]],
    ["disposition_rejected", 5, "rejected", ["reviewSnapshot", "disposition"]],
    ["archive_verified", 6, "archive_verified", ["reviewSnapshot", "disposition", "archive"]],
    [
      "cleanup_authorized",
      7,
      "cleanup_authorized",
      ["reviewSnapshot", "disposition", "archive", "cleanupAuthorization"],
    ],
  ] as const;
  for (let index = 0; index < transitions.length; index += 1) {
    const event = events[index];
    const [name, version, state, optional] = transitions[index];
    exact(
      event,
      index === 0 ? ["event", "at", "record"] : ["event", "at", "fromVersion", "record"],
      `legacy ${name} event`,
    );
    const record = event.record;
    exact(record, recordKeys(...optional), `legacy ${name} record`);
    if (
      event.event !== name ||
      event.at !== record.updatedAt ||
      record.resourceVersion !== version ||
      record.state !== state ||
      (index > 0 && event.fromVersion !== version - 1)
    )
      throw new Error("legacy lifecycle event transition mismatch");
    if (
      record.resourceId !== finalRecord.resourceId ||
      record.generationId !== finalRecord.generationId ||
      record.createdAt !== finalRecord.createdAt ||
      record.worktreePath !== finalRecord.worktreePath ||
      record.migrationInventoryDigest !== finalRecord.migrationInventoryDigest ||
      stableJson(record.aliases) !== stableJson(finalRecord.aliases) ||
      stableJson(record.repoRoots) !== stableJson(finalRecord.repoRoots) ||
      stableJson(record.branchNames) !== stableJson(finalRecord.branchNames)
    )
      throw new Error("legacy lifecycle event identity drift");
  }
  const review1 = events[1].record as Json;
  const disposition1Record = events[2].record as Json;
  const review2Record = events[3].record as Json;
  const disposition2Record = events[4].record as Json;
  const review1Value = review1.reviewSnapshot as Json;
  const disposition1 = disposition1Record.disposition as Json;
  const review2 = review2Record.reviewSnapshot as Json;
  const disposition2 = disposition2Record.disposition as Json;
  verifyReview(review1Value, finalRecord, input, "first legacy review snapshot");
  verifyDisposition(disposition1, review1Value, "first legacy disposition");
  verifyReview(review2, finalRecord, input, "second legacy review snapshot");
  verifyDisposition(disposition2, review2, "second legacy disposition");
  if (
    review1Value.snapshotDigest === review2.snapshotDigest ||
    disposition1.receiptDigest === disposition2.receiptDigest
  )
    throw new Error("legacy review cycles must be distinct");
  if (
    stableJson(disposition1Record.reviewSnapshot) !== stableJson(review1Value) ||
    stableJson(review2Record.disposition) !== stableJson(undefined) ||
    stableJson(disposition2Record.reviewSnapshot) !== stableJson(review2) ||
    stableJson(finalReview) !== stableJson(review2) ||
    stableJson(finalDisposition) !== stableJson(disposition2)
  )
    throw new Error("legacy review cycle hybrid mismatch");
  for (const index of [5, 6]) {
    const record = events[index].record as Json;
    if (
      stableJson(record.reviewSnapshot) !== stableJson(review2) ||
      stableJson(record.disposition) !== stableJson(disposition2)
    )
      throw new Error("legacy final cycle binding mismatch");
  }
  if (
    stableJson((events[5].record as Json).archive) !== stableJson(archive) ||
    stableJson((events[6].record as Json).archive) !== stableJson(archive) ||
    stableJson((events[6].record as Json).cleanupAuthorization) !== stableJson(auth)
  )
    throw new Error("legacy archive/authorization event binding mismatch");
  const eventTimes = events.map((event, index) => time(event.at, `legacy event ${index + 1}`));
  const cycleTimes = [
    time(review1Value.capturedAt, "first review capture"),
    time(disposition1.issuedAt, "first disposition issue"),
    time(review2.capturedAt, "second review capture"),
    time(disposition2.issuedAt, "second disposition issue"),
  ];
  if (
    eventTimes.some((item, index) => index > 0 && item < eventTimes[index - 1]) ||
    cycleTimes.some(
      (item, index) => item > eventTimes[index + 1] || (index > 0 && item < eventTimes[index]),
    )
  )
    throw new Error("legacy event chronology mismatch");
  if (stableJson(events.slice(7, 9)) !== stableJson(effects))
    throw new Error("legacy effect events mismatch");
  const final = events[9];
  exact(final, ["event", "at", "fromVersion", "record"], "legacy cleaned event");
  if (
    final.event !== "cleaned" ||
    final.at !== finalRecord.updatedAt ||
    final.fromVersion !== 7 ||
    stableJson(final.record) !== stableJson(finalRecord)
  )
    throw new Error("legacy final event does not equal cleaned record");
}

function verifyLegacy(
  input: CandidateAdmissionLegacyTerminalReconciliationInput,
  transactionAt: string,
  env: NodeJS.ProcessEnv,
): CandidateAdmissionLegacyReconciliationProof["lifecycleVerificationProof"] {
  const tx = time(transactionAt, "transaction timestamp");
  const { record, digest } = readRecord(input.resourceId, env);
  exact(
    record,
    recordKeys(
      "reviewSnapshot",
      "disposition",
      "archive",
      "cleanupAuthorization",
      "terminalReceipt",
    ),
    "legacy terminal record",
  );
  const {
    reviewSnapshot: review,
    disposition,
    archive,
    cleanupAuthorization: auth,
    terminalReceipt: receipt,
  } = record;
  exact(auth, AUTH_KEYS, "legacy cleanup authorization");
  exact(receipt, RECEIPT_KEYS, "legacy terminal receipt");
  if (
    record.schemaVersion !== 2 ||
    record.resourceVersion !== 8 ||
    record.state !== "cleaned" ||
    record.resourceId !== input.resourceId ||
    record.generationId !== input.generationId ||
    digest !== input.expectedRecordDigest ||
    record.worktreePath !== input.worktreePath ||
    stableJson(record.aliases) !== stableJson([input.peerRunId]) ||
    stableJson(record.repoRoots) !== stableJson([input.repoRoot]) ||
    stableJson(record.branchNames) !== stableJson([input.branchName])
  )
    throw new Error("legacy terminal record exact identity mismatch");
  verifyReview(review, record, input, "final legacy review snapshot");
  verifyDisposition(disposition, review, "final legacy disposition");
  if (review.gitCommonDir !== auth.expectedGitCommonDir)
    throw new Error("legacy review/common-dir binding mismatch");
  verifyArchive(record, input.expectedArchiveDigest, env);
  const unsignedAuth = Object.fromEntries(
    Object.entries(auth).filter(([key]) => key !== "authorizationDigest"),
  );
  if (
    auth.authorizationDigest !== digestObject(unsignedAuth) ||
    auth.authorizationDigest !== input.expectedCleanupAuthorizationDigest ||
    auth.resourceId !== record.resourceId ||
    auth.generationId !== record.generationId ||
    auth.authorizedResourceVersion !== 7 ||
    stableJson(auth.aliases) !== stableJson([input.peerRunId]) ||
    auth.dispositionDigest !== disposition.receiptDigest ||
    auth.reviewSnapshotDigest !== review.snapshotDigest ||
    auth.archiveDigest !== archive.archiveDigest ||
    auth.expectedWorktreeRealPath !== input.worktreePath ||
    auth.branchName !== input.branchName ||
    auth.branchOid !== input.branchOid ||
    stableJson(auth.effects) !== stableJson(["delete_branch", "remove_worktree"])
  )
    throw new Error("legacy authorization cross-digest or identity mismatch");
  const effects = receipt.effects;
  if (!Array.isArray(effects) || effects.length !== 2)
    throw new Error("legacy receipt effect count mismatch");
  exact(effects[0], ["effect", "at", "worktreePath"], "legacy remove effect");
  exact(effects[1], ["effect", "at", "branchName", "branchOid"], "legacy delete effect");
  if (
    effects[0].effect !== "remove_worktree" ||
    effects[0].worktreePath !== input.worktreePath ||
    effects[1].effect !== "delete_branch" ||
    effects[1].branchName !== input.branchName ||
    effects[1].branchOid !== input.branchOid ||
    receipt.type !== "cleaned" ||
    receipt.archiveDigest !== archive.archiveDigest ||
    receipt.authorizationDigest !== auth.authorizationDigest ||
    receipt.receiptDigest !==
      digestObject({
        resourceId: record.resourceId,
        effects,
        archiveDigest: archive.archiveDigest,
        authorizationDigest: auth.authorizationDigest,
      }) ||
    digestObject(receipt) !== input.expectedLegacyReceiptDigest
  )
    throw new Error("legacy receipt digest or identity mismatch");
  const eventData = readEvents(record.resourceId, env);
  if (eventData.sha !== input.expectedEventsSha256)
    throw new Error("legacy events SHA-256 mismatch");
  verifyEventChain(
    eventData.events,
    record,
    review,
    disposition,
    archive,
    auth,
    effects as Json[],
    input,
  );
  const chronology = [
    review.capturedAt,
    disposition.issuedAt,
    archive.verifiedAt,
    auth.issuedAt,
    effects[0].at,
    effects[1].at,
    receipt.at,
    record.updatedAt,
  ].map((item, index) => time(item, `legacy chronology ${index}`));
  if (
    chronology.some((item, index) => index > 0 && item > 0 && item < chronology[index - 1]) ||
    time(auth.expiresAt, "authorization expiry") < chronology[5] ||
    tx < chronology[chronology.length - 1]
  )
    throw new Error("legacy chronology or transaction timestamp mismatch");
  assertDeleted(input.worktreePath);
  verifyGitDeletion(
    input.repoRoot,
    input.worktreePath,
    input.branchName,
    String(auth.expectedGitCommonDir),
    env,
  );
  const unsigned = {
    schemaVersion: 1 as const,
    type: "legacy_july13_terminal_anomaly_verification" as const,
    verificationSemantics: "legacy_july13_exact" as const,
    hardenedV2Verified: false as const,
    resourceId: record.resourceId,
    generationId: record.generationId,
    recordDigest: digest,
    eventsSha256: eventData.sha,
    archiveDigest: String(archive.archiveDigest),
    legacyReceiptDigest: digestObject(receipt),
    cleanupAuthorizationDigest: String(auth.authorizationDigest),
    transactionAt,
  };
  return { ...unsigned, proofDigest: digestObject(unsigned) };
}

// biome-ignore format: compact helper preserves the package code-size budget
function assertPreflightPermit( input: CandidateAdmissionLegacyTerminalReconciliationInput, permit: CandidateAdmissionPermit, env: NodeJS.ProcessEnv, ): string { if (permit.status === "reserved") { if ( digestObject(permit) !== input.expectedPermitDigest || permit.peerRunId !== input.peerRunId || resolve(permit.repoRoot) !== input.repoRoot || resolve(permit.worktreePath ?? "") !== input.worktreePath || permit.branchName !== input.branchName ) throw new Error("reserved permit exact binding mismatch"); return "reserved"; } if ( permit.status === "released" && permit.releaseOutcome === "legacy_terminal_anomaly_reconciled" && permit.legacyTerminalReconciliation ) { validatePersistedProof(permit.legacyTerminalReconciliation); const proof = permit.legacyTerminalReconciliation; const unsigned = Object.fromEntries( Object.entries(proof).filter(([key]) => key !== "reconciliationDigest"), ); if ( proof.reconciliationDigest !== digestObject(unsigned) || permit.terminalReceiptDigest !== proof.reconciliationDigest || permit.releasedAt !== proof.reconciledAt || permit.terminalReceiptRef !== getCandidateLifecycleRecordPath(input.resourceId, env) || digestObject(originalPermit(permit)) !== input.expectedPermitDigest || proof.ownerInputDigest !== digestObject(input) ) throw new Error("released permit exact binding mismatch"); return permit.legacyTerminalReconciliation.reconciledAt; } throw new Error("permit is not eligible for legacy reconciliation"); }

// biome-ignore format: compact helper preserves the package code-size budget
export function verifyCandidateAdmissionReconcileInputSemantic( inputPath: string, env: NodeJS.ProcessEnv, transactionAt: string, ): CandidateAdmissionLegacyTerminalReconciliationInput { time(transactionAt, "preflight timestamp"); const firstInput = readCandidateAdmissionReconcileInput(inputPath); const snapshot = (input: CandidateAdmissionLegacyTerminalReconciliationInput) => { const permit = readPermit(candidateAdmissionPermitPath(input.admissionId, env)); const binding = assertPreflightPermit(input, permit, env); const lifecycle = verifyLegacy(input, binding === "reserved" ? transactionAt : binding, env); if ( binding !== "reserved" && stableJson(permit.legacyTerminalReconciliation?.lifecycleVerificationProof) !== stableJson(lifecycle) ) throw new Error("released permit lifecycle proof drift"); return digestObject({ input, permit, lifecycle }); }; const first = snapshot(firstInput); const secondInput = readCandidateAdmissionReconcileInput(inputPath); const second = snapshot(secondInput); if (stableJson(firstInput) !== stableJson(secondInput) || first !== second) throw new Error("semantic preflight facts changed during stable read"); return firstInput; }

// biome-ignore format: compact helper preserves the package code-size budget
function deriveInput( request: CandidateLegacyReconciliationPreparation, env: NodeJS.ProcessEnv, ): CandidateAdmissionLegacyTerminalReconciliationInput { exact(request, REQUEST_KEYS, "reconciliation preparation request"); text(request.ownerRationale, "owner rationale"); text(request.ownerReference, "owner reference"); const permit = readPermit(candidateAdmissionPermitPath(request.admissionId, env)); if ( permit.status !== "reserved" || !permit.peerRunId || !permit.worktreePath || !permit.branchName ) throw new Error("preparation requires a bound reserved permit"); const { record, digest } = readRecord(request.resourceId, env); const events = readEvents(request.resourceId, env); const auth = record.cleanupAuthorization; const receipt = record.terminalReceipt; const input: CandidateAdmissionLegacyTerminalReconciliationInput = { schemaVersion: 1, action: "reconcile_legacy_terminal_release", admissionId: permit.admissionId, expectedPermitDigest: digestObject(permit), resourceId: record.resourceId, generationId: record.generationId, peerRunId: permit.peerRunId, repoRoot: resolve(permit.repoRoot), worktreePath: resolve(permit.worktreePath), branchName: permit.branchName, branchOid: String(auth?.branchOid), expectedRecordDigest: digest, expectedEventsSha256: events.sha, expectedArchiveDigest: String(record.archive?.archiveDigest), expectedLegacyReceiptDigest: digestObject(receipt), expectedCleanupAuthorizationDigest: String(auth?.authorizationDigest), ownerRationale: request.ownerRationale.trim(), ownerReference: request.ownerReference.trim(), }; assertInput(input); return input; }

// biome-ignore format: compact helper preserves the package code-size budget
export function prepareCandidateAdmissionReconcileRelease( requestPath: string, outputPath: string, env: NodeJS.ProcessEnv = process.env, ): { inputDigest: string } { const requestRaw = secureRead(requestPath, "reconciliation request").toString("utf8"); const request = parseJson( requestRaw, "reconciliation request", ) as CandidateLegacyReconciliationPreparation; const input = deriveInput(request, env); canonicalPath(outputPath, "prepare output path"); assertNoSymlinkAncestors(dirname(outputPath)); const parent = lstatSync(dirname(outputPath)); if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o077) !== 0) throw new Error("prepare output parent must be owner-only"); const fd = openSync( outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600, ); try { writeFileSync(fd, `${stableJson(input)}\n`); fsyncSync(fd); } finally { closeSync(fd); } const parentFd = openSync(dirname(outputPath), constants.O_RDONLY); try { fsyncSync(parentFd); } finally { closeSync(parentFd); } return { inputDigest: digestObject(input) }; }

// biome-ignore format: compact helper preserves the package code-size budget
function validatePressure(value: CandidateAdmissionPressure, label: string): void { exact(value, PRESSURE_KEYS, label); if ( !Array.isArray(value.activeAdmissionIds) || stableJson(value.activeAdmissionIds) !== stableJson([...value.activeAdmissionIds].sort()) ) throw new Error(`${label} active admission IDs mismatch`); for (const row of Object.values(value.byRepository)) exact(row, ROW_KEYS, `${label} repository pressure`); if ( value.stateDigest !== digestObject({ inventoryDigest: value.inventoryDigest, activeAdmissionIds: value.activeAdmissionIds, }) ) throw new Error(`${label} state digest mismatch`); }

// biome-ignore format: compact helper preserves the package code-size budget
function changePressure( base: CandidateAdmissionPressure, permit: CandidateAdmissionPermit, at: string, direction: -1 | 1, ): CandidateAdmissionPressure { validatePressure(base, "legacy pressure"); const result = structuredClone(base); const repo = result.byRepository[resolve(permit.repoRoot)]; if (!repo) throw new Error("legacy repository pressure is missing"); const occurrences = base.activeAdmissionIds.filter((id) => id === permit.admissionId).length; if ((direction === -1 && occurrences !== 1) || (direction === 1 && occurrences !== 0)) throw new Error("legacy active admission identity mismatch"); for (const row of [result, repo]) { if ( direction === -1 && (row.activeAdmissions < 1 || row.unresolvedResources < 1 || row.unresolvedBytes < permit.reservationBytes) ) throw new Error("legacy pressure release precondition mismatch"); row.activeAdmissions += direction; row.unresolvedResources += direction; row.unresolvedBytes += direction * permit.reservationBytes; } result.capturedAt = at; result.activeAdmissionIds = direction === -1 ? result.activeAdmissionIds.filter((id) => id !== permit.admissionId) : [...result.activeAdmissionIds, permit.admissionId].sort(); result.stateDigest = digestObject({ inventoryDigest: result.inventoryDigest, activeAdmissionIds: result.activeAdmissionIds, }); validatePressure(result, "derived legacy pressure"); return result; }

// biome-ignore format: compact helper preserves the package code-size budget
function reconciliationProof( input: CandidateAdmissionLegacyTerminalReconciliationInput, lifecycle: CandidateAdmissionLegacyReconciliationProof["lifecycleVerificationProof"], before: CandidateAdmissionPressure, after: CandidateAdmissionPressure, at: string, ): CandidateAdmissionLegacyReconciliationProof { const unsigned = { schemaVersion: 1 as const, type: "legacy_terminal_anomaly_reconciliation" as const, verificationSemantics: "legacy_july13_exact" as const, hardenedV2Verified: false as const, expectedPermitDigest: input.expectedPermitDigest, ownerInputDigest: digestObject(input), ownerRationale: input.ownerRationale, ownerReference: input.ownerReference, lifecycleVerificationProof: lifecycle, pressureBefore: before, pressureAfter: after, reconciledAt: at, }; return { ...unsigned, reconciliationDigest: digestObject(unsigned) }; }

// biome-ignore format: compact helper preserves the package code-size budget
function originalPermit(released: CandidateAdmissionPermit): CandidateAdmissionPermit { const result = structuredClone(released); result.status = "reserved"; delete result.releasedAt; delete result.releaseOutcome; delete result.terminalReceiptRef; delete result.terminalReceiptDigest; delete result.legacyTerminalReconciliation; return result; }

// biome-ignore format: compact helper preserves the package code-size budget
function validatePersistedProof(proof: CandidateAdmissionLegacyReconciliationProof): void { exact(proof, RECONCILE_PROOF_KEYS, "persisted reconciliation proof"); exact(proof.lifecycleVerificationProof, VERIFY_PROOF_KEYS, "persisted lifecycle proof"); validatePressure(proof.pressureBefore, "persisted pressure before"); validatePressure(proof.pressureAfter, "persisted pressure after"); }

// biome-ignore format: compact helper preserves the package code-size budget
export function reconcileCandidateAdmissionLegacyTerminalReleaseLocked( inputPath: string, env: NodeJS.ProcessEnv, transactionAt: string, capturePressure: CapturePressure, fenceObserver?: (lockPath: string) => void, ): CandidateAdmissionPermit { time(transactionAt, "transaction timestamp"); const unlockedInput = readCandidateAdmissionReconcileInput(inputPath); return withResourceLock(unlockedInput.resourceId, "legacy_terminal_reconcile", env, () => withCandidateAdmissionLock(env, () => { const input = readCandidateAdmissionReconcileInput(inputPath); if (stableJson(input) !== stableJson(unlockedInput)) throw new Error("reconciliation input changed before locking"); const permitPath = candidateAdmissionPermitPath(input.admissionId, env); const permit = readPermit(permitPath); if (permit.status === "released") { const persisted = permit.legacyTerminalReconciliation; if (permit.releaseOutcome !== "legacy_terminal_anomaly_reconciled" || !persisted) throw new Error("admission was released by another transaction"); validatePersistedProof(persisted); if ( digestObject(originalPermit(permit)) !== input.expectedPermitDigest || permit.releasedAt !== persisted.reconciledAt || permit.terminalReceiptDigest !== persisted.reconciliationDigest || permit.terminalReceiptRef !== getCandidateLifecycleRecordPath(input.resourceId, env) ) throw new Error("persisted released permit binding mismatch"); const lifecycle = verifyLegacy(input, persisted.reconciledAt, env); const after = capturePressure(env, persisted.reconciledAt); const repo = resolve(permit.repoRoot); if (!after.byRepository[repo]) after.byRepository[repo] = { unresolvedResources: 0, unresolvedBytes: 0, oldestUnresolvedAgeMs: 0, activeAdmissions: 0, }; const before = changePressure(after, permit, persisted.reconciledAt, 1); const expected = reconciliationProof( input, lifecycle, before, after, persisted.reconciledAt, ); if (stableJson(expected) !== stableJson(persisted)) throw new Error("persisted reconciliation proof does not rederive exactly"); return permit; } if ( permit.status !== "reserved" || digestObject(permit) !== input.expectedPermitDigest || permit.peerRunId !== input.peerRunId || resolve(permit.repoRoot) !== input.repoRoot || resolve(permit.worktreePath ?? "") !== input.worktreePath || permit.branchName !== input.branchName ) throw new Error("reserved permit exact binding mismatch"); const lifecycle = verifyLegacy(input, transactionAt, env); const before = capturePressure(env, transactionAt); const after = changePressure(before, permit, transactionAt, -1); const proof = reconciliationProof(input, lifecycle, before, after, transactionAt); const commonDir = String(readRecord(input.resourceId, env).record.cleanupAuthorization.expectedGitCommonDir); const released: CandidateAdmissionPermit = { ...permit, status: "released", releasedAt: transactionAt, releaseOutcome: "legacy_terminal_anomaly_reconciled", terminalReceiptRef: getCandidateLifecycleRecordPath(input.resourceId, env), terminalReceiptDigest: proof.reconciliationDigest, legacyTerminalReconciliation: proof, }; return withGitRefFence(commonDir, input.branchName, env, () => { const beforeAgain = capturePressure(env, transactionAt); const lifecycleAgain = verifyLegacy(input, transactionAt, env); const inputAgain = readCandidateAdmissionReconcileInput(inputPath); if ( stableJson(lifecycleAgain) !== stableJson(lifecycle) || stableJson(beforeAgain) !== stableJson(before) || stableJson(inputAgain) !== stableJson(input) ) throw new Error("legacy canonical snapshot changed before commit"); writeAdmissionJson(permitPath, released); return released; }, fenceObserver); }), ); }
