// ---
// summary: "Pure, conservative recovery links with observation coverage, never custody transfer."
// read_when: ["changing recovery manifest proof semantics"]
// ---
import { createHash } from "node:crypto";
import { claimantFor, parseClaimant } from "./recovery-identity.mjs";

/** @typedef {import('./recovery-types.ts').ProcessObservation} ProcessObservation */
/** @typedef {import('./recovery-types.ts').SessionObservation} SessionObservation */
/** @typedef {import('./recovery-types.ts').RecoveryInputs} RecoveryInputs */

export const MANIFEST_SCHEMA = "pi-activity-strip.recovery-manifest.v1";
// /proc/stat btime has one-second precision. This is a comparison allowance, not identity proof.
export const BIRTH_CLOCK_ALLOWANCE_MS = 2000;

/** Preserve unmatched/reused live processes independently of stale registry assertions.
 * @param {RecoveryInputs} input @returns {SessionObservation[]} */
export function withProcessOnlyObservations(input) {
  const result = [...input.sessions];
  const linked = new Set(
    input.sessions.map((s) => processLink(s, input).process?.pid).filter(Boolean),
  );
  for (const p of input.before.filter((p) => p.harness)) {
    if (linked.has(p.pid)) continue;
    result.push({
      harness: p.harness,
      sessionId: null,
      pid: p.pid,
      source: "process-scan",
      sourceRef: `/proc/${p.pid}/stat`,
      cwd: p.cwd,
      startedAt: p.birthMs,
      pidDomain: p.pidDomain,
      procStart: p.startTicks,
      bootId: p.bootId,
      changed: false,
      transcripts: [],
    });
  }
  return result;
}

export const RECOVERY_CAPABILITIES = [
  {
    harness: "pi",
    session: "broker-self-report",
    transcript: "header-id",
    currentDisplay: "unproved",
    claimantPrefix: "session-",
    limitation: "broker has no process-birth token; custom session roots need --pi-session-root",
  },
  {
    harness: "claude",
    session: "registry-pid-domain-procStart",
    transcript: "filename-candidate",
    currentDisplay: "unproved",
    claimantPrefix: "claude-session-",
    limitation: "registry lacks boot id; start-time mismatch retained; transcript content not read",
  },
  {
    harness: "codex",
    session: "open-rollout-header",
    transcript: "open-descriptor",
    currentDisplay: "unsupported",
    claimantPrefix: "codex-session-",
    limitation:
      "open descriptor proves neither writer nor currently displayed thread; no cwd/recency fallback",
  },
  {
    harness: "angelx",
    session: "unsupported",
    transcript: "unsupported",
    currentDisplay: "unsupported",
    claimantPrefix: null,
    limitation:
      "installed saved-session metadata has no verified live presence; filename PID may be historical",
  },
  {
    harness: "agnt",
    session: "unsupported",
    transcript: "unsupported",
    currentDisplay: "unsupported",
    claimantPrefix: null,
    limitation:
      "Electron application; frontend activeConversationId has no verified process-birth publisher",
  },
  {
    harness: "omp",
    session: "unsupported",
    transcript: "unsupported",
    currentDisplay: "unsupported",
    claimantPrefix: null,
    limitation:
      "no qualified current-session adapter; breadcrumbs and daemon client IDs are not live conversation identity",
  },
  {
    harness: "unknown",
    session: "unsupported",
    transcript: "unsupported",
    currentDisplay: "unsupported",
    claimantPrefix: null,
    limitation: "no guessed UUID, command replay, or canonical AK prefix",
  },
];

/** @param {ProcessObservation | undefined} a @param {ProcessObservation | undefined} b */
export function sameProcess(a, b) {
  return Boolean(
    a &&
      b &&
      a.pid === b.pid &&
      a.startTicks === b.startTicks &&
      a.bootId === b.bootId &&
      a.pidDomain === b.pidDomain &&
      a.executableIdentity === b.executableIdentity &&
      a.ppid === b.ppid &&
      a.harness === b.harness &&
      a.selectorDigest === b.selectorDigest,
  );
}

/** Namespace is checked BEFORE looking up a host PID, including coincident start ticks.
 * @param {SessionObservation} session @param {RecoveryInputs} input */
export function processLink(session, input) {
  const provenance = [session.sourceRef];
  /** @type {string[]} */
  const uncertainties = [];
  const result = (
    state = "unresolved",
    process = /** @type {ProcessObservation | null} */ (null),
  ) => ({ state, process, provenance, uncertainties });
  if (session.pidDomain && session.pidDomain !== input.pidDomain) {
    uncertainties.push("foreign-pid-domain-no-mapping");
    return result("foreign-namespace");
  }
  if (session.bootId && session.bootId !== input.bootId) return result("boot-mismatch");
  if (session.changed) return result("source-changed");
  const before = input.before.find((p) => p.pid === session.pid);
  const after = input.after.find((p) => p.pid === session.pid);
  if (!before) return result("not-observed");
  provenance.push(
    `/proc/${session.pid}/stat`,
    `/proc/${session.pid}/exe`,
    `/proc/${session.pid}/ns/pid`,
  );
  if (!sameProcess(before, after)) return result("process-changed");
  if (before.harness !== session.harness) return result("harness-mismatch");
  if (session.procStart && session.procStart !== before.startTicks) return result("birth-mismatch");
  if (session.source === "process-scan") return result("process-only", before);
  if (session.source === "codex-open-rollout") {
    uncertainties.push("open-descriptor-is-not-writer-or-current-display");
    return result("open-descriptor-associated", before);
  }
  if (session.source === "pi-broker") {
    uncertainties.push(
      "publisher-has-no-process-birth-token",
      "self-report-not-current-display-proof",
    );
    if (
      !session.updatedAt ||
      session.updatedAt < input.startedAt - 12000 ||
      session.updatedAt > input.endedAt + BIRTH_CLOCK_ALLOWANCE_MS
    )
      return result("stale-publisher", before);
    if (session.startedAt < before.birthMs - BIRTH_CLOCK_ALLOWANCE_MS)
      return result("birth-mismatch");
    return result("reported", before);
  }
  if (!session.pidDomain || !session.procStart) {
    uncertainties.push("registry-missing-pid-domain-or-birth-token");
    return result("unconfirmed", before);
  }
  uncertainties.push("registry-has-no-boot-id");
  const delta = session.startedAt - before.birthMs;
  if (!Number.isFinite(delta) || Math.abs(delta) > BIRTH_CLOCK_ALLOWANCE_MS) {
    uncertainties.push("registry-startedAt-differs-from-process-birth");
    return result("uncertain-start-time", before);
  }
  return result("birth-correlated", before);
}

/** @param {ProcessObservation | null} process @param {RecoveryInputs} input */
function windowLinks(process, input) {
  if (!process)
    return {
      state: "unresolved",
      windows: [],
      provenance: [],
      uncertainties: ["no-stable-process-link"],
    };
  /** @type {ProcessObservation[]} */
  const chain = [];
  const seen = new Set();
  let current = process;
  while (current && !seen.has(current.pid) && chain.length < 64) {
    seen.add(current.pid);
    if (
      !sameProcess(
        current,
        input.after.find((p) => p.pid === current.pid),
      )
    ) {
      return { state: "changed", windows: [], provenance: [], uncertainties: ["ancestor-changed"] };
    }
    chain.push(current);
    const parent = input.before.find((p) => p.pid === current.ppid);
    if (!parent) break;
    current = parent;
  }
  const candidates = input.windows.filter((w) => chain.some((p) => p.pid === w.pid));
  const stable = candidates.filter((w) =>
    input.windowsAfter.some(
      (a) => a.id === w.id && a.pid === w.pid && a.workspace_id === w.workspace_id,
    ),
  );
  const changed =
    stable.length !== candidates.length ||
    input.windowsAfter.some(
      (w) => chain.some((p) => p.pid === w.pid) && !candidates.some((b) => b.id === w.id),
    );
  const windows = stable.map((w) => {
    const ws = input.workspaces.find((s) => s.id === w.workspace_id);
    const wsStable = ws && input.workspacesAfter.some((a) => a.id === ws.id && a.idx === ws.idx);
    return {
      id: w.id,
      hostPid: w.pid,
      workspaceId: w.workspace_id,
      workspaceIndex: wsStable ? ws.idx : null,
      relation: "process-ancestry-containment",
      provenance: [
        "niri msg -j windows",
        ...chain.map((p) => `/proc/${p.pid}/stat`),
        "niri msg -j workspaces",
      ],
    };
  });
  return {
    state: changed
      ? "changed"
      : windows.length > 1
        ? "ambiguous"
        : windows.length === 1
          ? "containment-only"
          : "not-observed",
    windows,
    provenance: ["niri msg -j windows (before/after)"],
    uncertainties: [
      "containment-is-not-exact-tab-identity",
      ...(changed ? ["window-observation-changed"] : []),
    ],
  };
}

/** @param {RecoveryInputs} input @param {{includePaths?: boolean}} [options] */

export function buildRecoveryManifest(input, { includePaths = false } = {}) {
  const observations = withProcessOnlyObservations(input);
  const sessions = observations.map((s, index) => {
    const process = processLink(s, input);
    const claimant = s.sessionId ? claimantFor(s.harness, s.sessionId) : null;
    return {
      observationId: `observation-${index + 1}`,
      harness: s.harness,
      session: {
        id: s.sessionId,
        source: s.source,
        provenance: [s.sourceRef],
        cwd: s.cwd,
        reportedStartedAt: s.startedAt || null,
      },
      process,
      placement: windowLinks(process.process, input),
      transcripts: s.transcripts,
      ak: {
        claimant,
        authority: "AK-only; observation does not transfer custody",
        links:
          /** @type {Array<{taskId: number; state: string; claimant: string; leaseExpiresAt: string; provenance: string[]}>} */ ([]),
      },
    };
  });
  const claims = input.claims.map((c) => {
    const claimant = parseClaimant(c.claimed_by);
    const lease = Date.parse(c.lease_expires_at);
    const matched = claimant ? sessions.filter((s) => s.ak.claimant === claimant.claimant) : [];
    const state = !claimant
      ? "unsupported-claimant"
      : !Number.isFinite(lease)
        ? "invalid-lease"
        : lease <= input.endedAt
          ? "expired"
          : c.status !== "claimed"
            ? "not-claimed"
            : matched.length > 1
              ? "ambiguous-session"
              : matched.length === 1
                ? "exact-claimant"
                : "session-not-observed";
    if (state === "exact-claimant")
      matched[0].ak.links.push({
        taskId: c.id,
        state,
        claimant: c.claimed_by,
        leaseExpiresAt: c.lease_expires_at,
        provenance: ["ak task list --status claimed --format json --all --verbose"],
      });
    return {
      taskId: c.id,
      claimant: c.claimed_by,
      leaseExpiresAt: c.lease_expires_at,
      state,
      observationIds: matched.map((s) => s.observationId),
      provenance: ["ak task list --status claimed --format json --all --verbose"],
    };
  });
  const manifest = {
    schema: MANIFEST_SCHEMA,
    readOnly: true,
    complete: false,
    observation: {
      startedAt: new Date(input.startedAt).toISOString(),
      endedAt: new Date(input.endedAt).toISOString(),
      bootId: input.bootId,
      pidDomain: input.pidDomain,
      atomic: false,
    },
    privacy: {
      paths: includePaths ? "included-private-output-only" : "sha256-redacted",
      transcriptContent: "never-emitted",
      titles: "never-emitted",
      commandLines: "never-emitted",
    },
    capabilities: RECOVERY_CAPABILITIES,
    sources: input.sources,
    coverage: {
      observationRows: sessions.length,
      identifiedSessionObservations: sessions.filter((s) => s.session.id).length,
      distinctSessionIdentities: new Set(
        sessions.filter((s) => s.session.id).map((s) => `${s.harness}:${s.session.id}`),
      ).size,
      processOnlyObservations: sessions.filter((s) => !s.session.id).length,
      processCandidates: input.before.filter((p) => p.harness).length,
      processLinks: sessions.filter((s) => s.process.process).length,
      processLinkStates: counts(sessions.map((s) => s.process.state)),
      harnesses: Object.fromEntries(
        [...new Set(sessions.map((s) => s.harness))].map((h) => [
          h,
          {
            observationRows: sessions.filter((s) => s.harness === h).length,
            distinctSessionIdentities: new Set(
              sessions.filter((s) => s.harness === h && s.session.id).map((s) => s.session.id),
            ).size,
            processOnlyObservations: sessions.filter((s) => s.harness === h && !s.session.id)
              .length,
          },
        ]),
      ),
      placementStates: counts(sessions.map((s) => s.placement.state)),
      transcripts: counts(sessions.flatMap((s) => s.transcripts.map((t) => t.state))),
      claimRows: claims.length,
      claimStates: counts(claims.map((c) => c.state)),
    },
    limitations: [
      "Non-atomic bounded observation; processes can start or exit after capture.",
      "No full historical session census or transcript/context completeness claim.",
      "No exact terminal tab/current display proof; no reopen, focus or replay command.",
      "AK6737 owns custody; AK6481 owns native reopen; this is observation only.",
    ],
    sessions,
    claims,
    windowContainmentGroups: [
      ...new Set(sessions.flatMap((s) => s.placement.windows.map((w) => w.id))),
    ].map((windowId) => {
      const contained = sessions.filter((s) => s.placement.windows.some((w) => w.id === windowId));
      return {
        windowId,
        relation: "candidate-containment-not-session-count",
        processObservations: new Set(contained.map((s) => s.process.process?.pid).filter(Boolean))
          .size,
        distinctSessionIdentities: new Set(
          contained.filter((s) => s.session.id).map((s) => `${s.harness}:${s.session.id}`),
        ).size,
        observationIds: contained.map((s) => s.observationId),
      };
    }),
  };
  return includePaths ? manifest : redactPaths(manifest);
}

/** @param {string[]} values */

function counts(values) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((key) => [key, values.filter((v) => v === key).length]),
  );
}

/** @template T @param {T} value @returns {T} */
function redactPaths(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "string" && item.startsWith("/")
        ? `path-sha256:${createHash("sha256").update(item).digest("hex")}`
        : item,
    ),
  );
}
