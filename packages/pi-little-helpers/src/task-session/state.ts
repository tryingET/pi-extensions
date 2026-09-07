import { randomUUID } from "node:crypto";
import {
  constants as C,
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { canonical, digest, id, integer, parseJson, record, refuse, text } from "./json.js";
import { native } from "./native.js";

export interface Domain {
  akInstance: string;
  taskId: number;
  checkout: string;
  commonGit: string;
  sharedEffects: string[];
  physical: { checkout: string; commonGit: string };
}
export function physicalIdentity(path: string): string {
  canonicalPath(path);
  const s = lstatSync(path);
  if (!s.isDirectory()) refuse("domain_not_directory");
  return `${s.dev}:${s.ino}`;
}
export function assertDomainPhysical(d: Domain): void {
  if (
    physicalIdentity(d.checkout) !== d.physical.checkout ||
    physicalIdentity(d.commonGit) !== d.physical.commonGit
  )
    refuse("domain_replaced");
}
export interface Attempt {
  requestId: string;
  semanticDigest: string;
  attempt: string;
  incarnation: string;
  domain: Domain;
  hostClosed: boolean;
  effectsDisposed: boolean;
  claimResolved: boolean;
}
export interface Snapshot {
  schema: "pi.task-session.state.v1";
  namespace: string;
  generation: number;
  withdrawn: boolean;
  inventoryComplete: boolean;
  domains: Domain[];
  enrolled: Domain[];
  attempts: Attempt[];
}
export interface Locator {
  schema: string;
  namespace: string;
  root: string;
  uid: number;
  rootDev: number;
  rootIno: number;
  lockDev: number;
  lockIno: number;
}
export function canonicalPath(path: unknown): string {
  const p = text(path, 4096);
  if (resolve(p) !== p || realpathSync(p) !== p) refuse("path_not_canonical");
  return p;
}
function domain(v: unknown): Domain {
  const d = record(v, [
    "akInstance",
    "taskId",
    "checkout",
    "commonGit",
    "sharedEffects",
    "physical",
  ]);
  const physical = record(d.physical, ["checkout", "commonGit"]);
  for (const value of Object.values(physical))
    if (typeof value !== "string" || !/^\d+:\d+$/.test(value)) refuse("physical_identity_missing");
  id(d.akInstance);
  integer(d.taskId);
  text(d.checkout, 4096);
  text(d.commonGit, 4096);
  for (const p of [d.checkout, d.commonGit]) if (resolve(p) !== p) refuse("invalid_domain");
  if (!Array.isArray(d.sharedEffects) || d.sharedEffects.length > 256) refuse("invalid_effects");
  d.sharedEffects.forEach((v: unknown) => {
    id(v);
  });
  if (new Set(d.sharedEffects).size !== d.sharedEffects.length) refuse("duplicate_effects");
  return d as Domain;
}
export function conflicts(a: Omit<Domain, "physical">, b: Omit<Domain, "physical">): boolean {
  const overlap = (x: string, y: string) =>
    x === y ||
    x.startsWith(y.endsWith(sep) ? y : y + sep) ||
    y.startsWith(x.endsWith(sep) ? x : x + sep);
  return (
    (a.akInstance === b.akInstance && a.taskId === b.taskId) ||
    a.commonGit === b.commonGit ||
    overlap(a.checkout, b.checkout) ||
    a.sharedEffects.some((e) => b.sharedEffects.includes(e))
  );
}
export const occupied = (a: Attempt): boolean =>
  !(a.hostClosed && a.effectsDisposed && a.claimResolved);
export function validateSnapshot(v: unknown): Snapshot {
  const s = record(v, [
    "schema",
    "namespace",
    "generation",
    "withdrawn",
    "inventoryComplete",
    "domains",
    "enrolled",
    "attempts",
  ]);
  if (s.schema !== "pi.task-session.state.v1") refuse("state_version_unsupported");
  id(s.namespace);
  integer(s.generation);
  if (typeof s.withdrawn !== "boolean" || typeof s.inventoryComplete !== "boolean")
    refuse("invalid_state");
  for (const list of [s.domains, s.enrolled, s.attempts])
    if (!Array.isArray(list) || list.length > 4096) refuse("invalid_state");
  s.domains.forEach(domain);
  s.enrolled.forEach(domain);
  const tasks = s.domains.map((d: Domain) => `${d.akInstance}:${d.taskId}`);
  if (new Set(tasks).size !== tasks.length) refuse("ambiguous_inventory");
  const requests = new Set<string>();
  const attempts = new Set<string>();
  for (const item of s.attempts) {
    const a = record(item, [
      "requestId",
      "semanticDigest",
      "attempt",
      "incarnation",
      "domain",
      "hostClosed",
      "effectsDisposed",
      "claimResolved",
    ]);
    id(a.requestId);
    id(a.attempt);
    id(a.incarnation);
    domain(a.domain);
    if (!/^[a-f0-9]{64}$/.test(a.semanticDigest)) refuse("invalid_digest");
    for (const k of ["hostClosed", "effectsDisposed", "claimResolved"])
      if (typeof a[k] !== "boolean") refuse("invalid_retirement");
    if (requests.has(a.requestId) || attempts.has(a.attempt)) refuse("duplicate_attempt");
    requests.add(a.requestId);
    attempts.add(a.attempt);
  }
  return s as Snapshot;
}
export function privatePath(path: string, directory: boolean) {
  const s = lstatSync(path);
  if (
    s.isSymbolicLink() ||
    (directory ? !s.isDirectory() : !s.isFile()) ||
    s.uid !== process.getuid?.() ||
    (s.mode & 0o777) !== (directory ? 0o700 : 0o600) ||
    (!directory && s.nlink !== 1)
  )
    refuse("private_identity_invalid");
  if (realpathSync(path) !== path) refuse("private_path_alias");
  return s;
}
export function privateRead(path: string): Buffer {
  privatePath(path, false);
  const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    const named = lstatSync(path);
    if (
      s.ino !== named.ino ||
      s.dev !== named.dev ||
      s.size > 1048576 ||
      s.uid !== process.getuid?.() ||
      (s.mode & 0o777) !== 0o600
    )
      refuse("private_identity_changed");
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
function syncDir(path: string): void {
  const fd = openSync(path, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
/** Private metadata only. Caller holds namespace mutex OR is the sole immutable sidecar writer. */
export function durableWrite(path: string, value: unknown, immutable = false): void {
  privatePath(dirname(path), true);
  const bytes = canonical(value);
  if (Buffer.byteLength(bytes) > 1048576) refuse("state_capacity_exceeded");
  const temp = join(dirname(path), `.publish-${randomUUID()}`);
  const fd = openSync(temp, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // On failure retain temporary bytes and previous record. Never compensate an uncertain publication.
  if (immutable) {
    linkSync(temp, path);
    unlinkSync(temp);
  } else {
    renameSync(temp, path);
  }
  syncDir(dirname(path));
}
export function accountLocator(): Locator {
  const account = userInfo();
  const home = account.homedir;
  const v = record(parseJson(privateRead(join(home, ".config/pi-task-sessions/host.json"))), [
    "schema",
    "namespace",
    "root",
    "uid",
    "rootDev",
    "rootIno",
    "lockDev",
    "lockIno",
  ]);
  if (
    v.schema !== "pi.task-session.locator.v1" ||
    v.uid !== account.uid ||
    v.root !== join(home, ".local/state/pi-task-sessions")
  )
    refuse("locator_identity_mismatch");
  id(v.namespace);
  for (const k of ["rootDev", "rootIno", "lockDev", "lockIno"]) integer(v[k]);
  return v as Locator;
}
export function readSnapshot(locator: Locator): Snapshot {
  const root = privatePath(locator.root, true);
  const lock = privatePath(join(locator.root, "namespace.lock"), false);
  if (
    root.dev !== locator.rootDev ||
    root.ino !== locator.rootIno ||
    lock.dev !== locator.lockDev ||
    lock.ino !== locator.lockIno
  )
    refuse("namespace_identity_changed");
  const s = validateSnapshot(parseJson(privateRead(join(locator.root, "state.json"))));
  if (s.namespace !== locator.namespace) refuse("namespace_mismatch");
  return s;
}
export function reserve(
  locator: Locator,
  requestId: string,
  semanticDigest: string,
  d: Domain,
): Attempt {
  id(requestId);
  domain(d);
  const n = native();
  const handle = n.openMutex(join(locator.root, "namespace.lock"));
  try {
    const identity = n.mutexIdentity(handle);
    if (identity.dev !== locator.lockDev || identity.ino !== locator.lockIno)
      refuse("namespace_lock_replaced");
    if (!n.tryLock(handle)) refuse("namespace_busy");
    try {
      const s = readSnapshot(locator);
      assertDomainPhysical(d);
      const existing = s.attempts.find((a) => a.requestId === requestId);
      if (existing) {
        if (existing.semanticDigest !== semanticDigest) refuse("request_digest_conflict");
        return structuredClone(existing);
      }
      if (s.withdrawn || !s.inventoryComplete) refuse("admission_withdrawn_or_unknown");
      if (!s.enrolled.some((e) => digest(e) === digest(d))) refuse("not_enrolled");
      if (s.attempts.some((a) => occupied(a) && conflicts(a.domain, d))) refuse("domain_occupied");
      const attempt: Attempt = {
        requestId,
        semanticDigest,
        attempt: randomUUID(),
        incarnation: randomUUID(),
        domain: structuredClone(d),
        hostClosed: false,
        effectsDisposed: false,
        claimResolved: false,
      };
      s.attempts.push(attempt);
      s.generation++;
      validateSnapshot(s);
      durableWrite(join(locator.root, "state.json"), s);
      return structuredClone(attempt);
    } finally {
      n.unlockMutex(handle);
    }
  } finally {
    n.closeMutex(handle);
  }
}
