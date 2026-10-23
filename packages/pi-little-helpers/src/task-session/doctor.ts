import { userInfo } from "node:os";
import { join } from "node:path";
import { coordinates, ObservationFiles, observationReason } from "./doctor-files.js";
import { bytesDigest, digest, id, integer, parseJson, record, refuse } from "./json.js";
import { type Locator, type Snapshot, validateSnapshot } from "./state.js";

type Coordinates = { dev: string; ino: string };
type Issue = { component: string; code: string };
function locator(bytes: Buffer, home: string, uid: number): Locator {
  const v = record(parseJson(bytes), [
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
    v.uid !== uid ||
    v.root !== join(home, ".local/state/pi-task-sessions")
  )
    refuse("locator_identity_mismatch");
  id(v.namespace);
  for (const key of ["rootDev", "rootIno", "lockDev", "lockIno"]) integer(v[key]);
  return v as Locator;
}
function stateSummary(s: Snapshot, bytes: Buffer) {
  const unresolved = s.attempts.filter(
    (a) => !(a.hostClosed && a.effectsDisposed && a.claimResolved),
  );
  return {
    provenance: "unverified" as const,
    snapshotDigest: bytesDigest(bytes),
    generation: s.generation,
    withdrawn: s.withdrawn,
    inventoryComplete: s.inventoryComplete,
    domainCount: s.domains.length,
    enrolledCount: s.enrolled.length,
    attemptCount: s.attempts.length,
    unresolvedAttempts: unresolved.length,
    // No objective, context, domain paths, request ids, credentials or transcript bodies.
    // Prefer unresolved observations, but never mistake omitted entries for retired custody.
    attempts: [...unresolved, ...s.attempts.filter((a) => !unresolved.includes(a))]
      .slice(0, 32)
      .map((a) => ({
        attemptRef: digest({ attempt: a.attempt, incarnation: a.incarnation }),
        taskId: a.domain.taskId,
        hostClosed: a.hostClosed,
        effectsDisposed: a.effectsDisposed,
        claimResolved: a.claimResolved,
      })),
    omittedAttempts: Math.max(0, s.attempts.length - 32),
  };
}
function comparison(expected: Coordinates | null, observed: Coordinates | null) {
  return {
    expected,
    observed,
    matches:
      expected && observed ? expected.dev === observed.dev && expected.ino === observed.ino : null,
  };
}
const nextActions = [
  {
    owner: "namespace_owner",
    action:
      "Preserve the original locator, permanent lock and all history. Submit continuity and writer-custody evidence for owner assessment; do not rebind identities or reinitialize.",
  },
  {
    owner: "host_effect_and_ak_owners",
    action:
      "Establish host future-dispatch closure, started-effect disposition and exact AK claim disposition separately. PID absence, reboot, age or an unclaimed task does not retire an attempt.",
  },
  {
    owner: "repair_controller",
    action:
      "Diagnostics do not authorize implementation, migration or admission. Any reconciliation needs its exact owner-approved procedure and application authorization; no online migration or legacy fallback.",
  },
];

/** Public, argument-free, DB-free observation. Never calls the strict admission reader, any
 * producer, native mutex or provider. Accessible metadata remains unverified evidence even when
 * current coordinates match; it cannot establish historical continuity or complete custody. */
export function taskSessionDoctor() {
  const issues: Issue[] = [];
  let files: ObservationFiles | undefined;
  let expected: Locator | null = null;
  let root: Coordinates | null = null;
  let lock: Coordinates | null = null;
  let state: ReturnType<typeof stateSummary> | null = null;
  let locatorDigest: string | null = null;
  let consistent = true;
  const observe = <T>(component: string, read: () => T): T | null => {
    try {
      return read();
    } catch (error) {
      issues.push({ component, code: observationReason(error) });
      return null;
    }
  };
  try {
    if (process.platform !== "linux") refuse("unsupported_platform");
    const account = userInfo(),
      home = account.homedir;
    const namespaceRoot = join(home, ".local/state/pi-task-sessions");
    files = new ObservationFiles(account.uid);
    const reader = files;
    expected = observe("locator", () => {
      const bytes = reader.read(join(home, ".config/pi-task-sessions/host.json"));
      const value = locator(bytes, home, account.uid);
      locatorDigest = bytesDigest(bytes);
      return value;
    });
    root = observe("root", () => coordinates(reader.privateDirectory(namespaceRoot)));
    if (root) {
      lock = observe("lock", () =>
        coordinates(reader.privateFile(join(namespaceRoot, "namespace.lock")).before),
      );
      // Inspect history through safe objects only; coordinate mismatch is evidence, not
      // permission. An unsafe/missing lock leaves state unobserved rather than guessed.
      if (lock)
        state = observe("state", () => {
          const bytes = reader.read(join(namespaceRoot, "state.json"));
          const s = validateSnapshot(parseJson(bytes));
          if (expected && s.namespace !== expected.namespace)
            issues.push({ component: "state", code: "namespace_mismatch" });
          if (s.withdrawn) issues.push({ component: "state", code: "admission_withdrawn" });
          if (!s.inventoryComplete)
            issues.push({ component: "state", code: "inventory_incomplete" });
          return stateSummary(s, bytes);
        });
    }
    consistent = reader.stable();
  } catch (error) {
    issues.push({ component: "account", code: observationReason(error) });
  } finally {
    files?.close();
  }
  const identity = {
    root: comparison(
      expected ? { dev: String(expected.rootDev), ino: String(expected.rootIno) } : null,
      root,
    ),
    lock: comparison(
      expected ? { dev: String(expected.lockDev), ino: String(expected.lockIno) } : null,
      lock,
    ),
  };
  const hypotheses: string[] = [];
  if (Object.values(identity).some((v) => v.matches === false)) {
    issues.push({ component: "namespace", code: "namespace_identity_changed" });
    if (
      Object.values(identity).every(
        (v) => v.expected && v.observed && v.expected.ino === v.observed.ino,
      ) &&
      Object.values(identity).some((v) => v.expected?.dev !== v.observed?.dev)
    )
      hypotheses.push("device_number_change_possible");
    hypotheses.push("replacement_or_restore_not_excluded");
  }
  if (!consistent) {
    issues.push({ component: "observation", code: "observation_changed" });
    // No mixed-time state/identity/hypothesis is presented as a coherent observation.
    state = null;
    locatorDigest = null;
    hypotheses.length = 0;
  }
  return {
    schema: "pi.task-session.doctor.v1",
    status: !consistent
      ? "inconsistent"
      : !expected || !root || !lock || !state
        ? "incomplete"
        : "observed",
    authority: false,
    admissionAssessed: false,
    repairPerformed: false,
    continuity: "unverified",
    custody: "unverified",
    locatorDigest,
    identity: consistent ? identity : null,
    state,
    issues,
    hypotheses,
    limitations: [
      "Current coordinates and stable reads are not proof of continuity across reboot, replacement or restore.",
      "No lock ownership, host/effect closure, current AK claim, profile, producer or admission was assessed.",
      "Concurrent change detection is bounded observation, not writer exclusion or a filesystem snapshot.",
    ],
    nextActions,
  };
}
