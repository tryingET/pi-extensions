import assert from "node:assert/strict";
import test from "node:test";
import { joinAkTaskChips, parseAkClaimList } from "../src/common/ak-tasks.mjs";
import { claimantFor, parseClaimant, publisherClaimant } from "../src/common/recovery-identity.mjs";
import { buildRecoveryManifest, processLink } from "../src/common/recovery-manifest.mjs";

const id = "11111111-2222-4333-8444-555555555555";
const domain = "linux:synthetic-machine:pid:[100]";
const now = 1800000000000;
function proc(pid = 20, harness = "claude") {
  return {
    pid,
    ppid: pid === 20 ? 10 : 1,
    startTicks: "100",
    birthMs: now - 10000,
    bootId: "synthetic-boot",
    pidDomain: domain,
    executable: `/synthetic/bin/${harness || "ghostty"}`,
    executableIdentity: `1:${pid}`,
    cwd: "/synthetic/project",
    harness,
  };
}
function session(harness = "claude", pid = 20) {
  return {
    harness,
    sessionId: id,
    pid,
    source: "claude-registry",
    sourceRef: "/synthetic/registry.json",
    cwd: "/synthetic/project",
    startedAt: now - 10000,
    pidDomain: domain,
    procStart: "100",
    changed: false,
    transcripts: [],
  };
}
function input() {
  const processes = [proc(), proc(10, "")];
  const windows = [{ id: 442, pid: 10, workspace_id: 900 }];
  return {
    startedAt: now,
    endedAt: now + 100,
    bootId: "synthetic-boot",
    pidDomain: domain,
    before: structuredClone(processes),
    after: structuredClone(processes),
    sessions: [session()],
    windows: structuredClone(windows),
    windowsAfter: structuredClone(windows),
    workspaces: [{ id: 900, idx: 2 }],
    workspacesAfter: [{ id: 900, idx: 2 }],
    sources: [],
    claims: [],
  };
}
function claim(claimant = `claude-session-${id}`, taskId = 1) {
  return {
    id: taskId,
    claimed_by: claimant,
    status: "claimed",
    lease_expires_at: new Date(now + 60000).toISOString(),
  };
}

test("manifest records birth correlation, never completeness, custody transfer, or exact tab", () => {
  const m = buildRecoveryManifest(input());
  assert.equal(m.complete, false);
  assert.equal(m.observation.atomic, false);
  assert.equal(m.sessions[0].process.state, "birth-correlated");
  assert.deepEqual(m.sessions[0].process.uncertainties, ["registry-has-no-boot-id"]);
  assert.equal(m.sessions[0].placement.state, "containment-only");
  assert.equal(m.sessions[0].placement.windows[0].workspaceIndex, 2);
  assert.equal(m.sessions[0].placement.windows[0].workspaceId, 900);
  assert.ok(!JSON.stringify(m).includes("/synthetic/"));
  assert.ok(
    JSON.stringify(buildRecoveryManifest(input(), { includePaths: true })).includes("/synthetic/"),
  );
});

test("foreign PID namespace rejects collision BEFORE host PID and matching startTicks", () => {
  const x = input();
  x.sessions[0].pid = 2;
  x.sessions[0].procStart = "16";
  x.sessions[0].pidDomain = "linux:synthetic-machine:pid:[999]";
  x.before.push({ ...proc(2, "claude"), startTicks: "16" });
  x.after = structuredClone(x.before);
  const link = processLink(x.sessions[0], x);
  assert.equal(link.state, "foreign-namespace");
  assert.equal(link.process, null);
  assert.ok(!link.provenance.includes("/proc/2/stat"));
});

test("same-domain stale PID pointing to non-harness process rejected", () => {
  const x = input();
  x.before[0].harness = "";
  x.after[0].harness = "";
  assert.equal(processLink(x.sessions[0], x).state, "harness-mismatch");
});

test("stored process birth mismatch rejects reused PID", () => {
  const x = input();
  x.sessions[0].procStart = "99";
  assert.equal(processLink(x.sessions[0], x).state, "birth-mismatch");
});

test("boot mismatch rejects even matching PID namespace and startTicks", () => {
  const x = input();
  x.sessions[0].bootId = "old-boot";
  assert.equal(processLink(x.sessions[0], x).state, "boot-mismatch");
});

for (const field of [
  "startTicks",
  "bootId",
  "pidDomain",
  "executableIdentity",
  "ppid",
  "harness",
  "selectorDigest",
]) {
  test(`changing ${field} across observation drops process link`, () => {
    const x = input();
    x.after[0][field] = field === "ppid" ? 999 : "different";
    assert.equal(processLink(x.sessions[0], x).state, "process-changed");
  });
}

test("109-second startedAt offset remains uncertainty despite matching ticks", () => {
  const x = input();
  x.sessions[0].startedAt += 109000;
  const link = processLink(x.sessions[0], x);
  assert.equal(link.state, "uncertain-start-time");
  assert.ok(link.uncertainties.includes("registry-startedAt-differs-from-process-birth"));
});

test("registry without namespace or procStart is explicitly unconfirmed", () => {
  const x = input();
  x.sessions[0].pidDomain = null;
  assert.equal(processLink(x.sessions[0], x).state, "unconfirmed");
});

test("source changes and disappearing process cannot be called stable", () => {
  const x = input();
  x.sessions[0].changed = true;
  assert.equal(processLink(x.sessions[0], x).state, "source-changed");
  x.sessions[0].changed = false;
  x.after = [];
  assert.equal(processLink(x.sessions[0], x).state, "process-changed");
  x.before = [];
  assert.equal(processLink(x.sessions[0], x).state, "not-observed");
});

test("two windows for one Ghostty host stay ambiguous", () => {
  const x = input();
  x.windows.push({ id: 443, pid: 10, workspace_id: 900 });
  x.windowsAfter = structuredClone(x.windows);
  const p = buildRecoveryManifest(x).sessions[0].placement;
  assert.equal(p.state, "ambiguous");
  assert.equal(p.windows.length, 2);
});

test("two sessions in one shared Ghostty window are containment, not distinct tabs", () => {
  const x = input();
  x.sessions.push({ ...session(), sessionId: "22222222-2222-4333-8444-555555555555", pid: 21 });
  x.before.push({ ...proc(21), ppid: 10 });
  x.after = structuredClone(x.before);
  const m = buildRecoveryManifest(x);
  assert.deepEqual(
    m.sessions.map((s) => s.placement.state),
    ["containment-only", "containment-only"],
  );
  assert.deepEqual(
    m.sessions.map((s) => s.placement.windows[0].id),
    [442, 442],
  );
});

test("window movement, new window and changed ancestor are retained as changes", () => {
  const x = input();
  x.windowsAfter[0].workspace_id = 999;
  assert.equal(buildRecoveryManifest(x).sessions[0].placement.state, "changed");
  x.windowsAfter = [...x.windows, { id: 445, pid: 10, workspace_id: 900 }];
  assert.equal(buildRecoveryManifest(x).sessions[0].placement.state, "changed");
  x.after[1].startTicks = "changed";
  assert.equal(buildRecoveryManifest(x).sessions[0].placement.state, "changed");
});

test("workspace reorder does not retain stale user-visible index", () => {
  const x = input();
  x.workspacesAfter[0].idx = 3;
  assert.equal(buildRecoveryManifest(x).sessions[0].placement.windows[0].workspaceIndex, null);
});

test("same UUID in Pi Claude Codex remains three exact claimant namespaces", () => {
  const x = input();
  x.sessions = [session("pi"), session("claude"), session("codex")];
  x.claims = [
    claim(`session-${id}`, 1),
    claim(`claude-session-${id}`, 2),
    claim(`codex-session-${id}`, 3),
  ];
  const m = buildRecoveryManifest(x);
  assert.deepEqual(
    m.sessions.map((s) => s.ak.links.map((l) => l.taskId)),
    [[1], [2], [3]],
  );
  assert.equal(claimantFor("angelx", id), null);
  assert.equal(claimantFor("constructor", id), null);
  assert.equal(claimantFor("toString", id), null);
  assert.equal(parseClaimant(`angelx-session-${id}`), null);
  assert.equal(publisherClaimant(`agent:claude:${id}`), `claude-session-${id}`);
  assert.equal(publisherClaimant(`agent:unknown:${id}`), null);
});

test("expired and unknown claims retained but never active links", () => {
  const x = input();
  x.claims = [claim(), claim(`unknown-session-${id}`, 2)];
  x.claims[0].lease_expires_at = new Date(now - 1).toISOString();
  const m = buildRecoveryManifest(x);
  assert.deepEqual(
    m.claims.map((c) => c.state),
    ["expired", "unsupported-claimant"],
  );
  assert.equal(m.sessions[0].ak.links.length, 0);
});

test("duplicate same-harness session observations never receive unique claim link", () => {
  const x = input();
  x.sessions.push(session());
  x.claims = [claim()];
  assert.equal(buildRecoveryManifest(x).claims[0].state, "ambiguous-session");
});

test("no transcript and changing transcript are explicit; never evidence of absent conversation", () => {
  const x = input();
  x.sessions[0].transcripts = [
    { path: "", state: "not-found-in-scanned-roots", method: "bounded-filename-inventory" },
    {
      path: "/synthetic/transcript.jsonl",
      state: "header-id-matched",
      changed: true,
      method: "jq-first-record-id",
    },
  ];
  const m = buildRecoveryManifest(x);
  assert.equal(m.coverage.transcripts["not-found-in-scanned-roots"], 1);
  assert.equal(m.sessions[0].transcripts[1].changed, true);
});

test("Pi fresh broker is reported, not birth proven; stale publisher stays stale", () => {
  const x = input();
  x.before[0].harness = "pi";
  x.after[0].harness = "pi";
  x.sessions[0] = {
    ...session("pi"),
    source: "pi-broker",
    updatedAt: now,
    procStart: null,
    pidDomain: null,
  };
  assert.equal(processLink(x.sessions[0], x).state, "reported");
  x.sessions[0].updatedAt -= 20000;
  assert.equal(processLink(x.sessions[0], x).state, "stale-publisher");
});

test("Codex descriptor association never becomes current display proof", () => {
  const x = input();
  x.before[0].harness = "codex";
  x.after[0].harness = "codex";
  x.sessions[0] = { ...session("codex"), source: "codex-open-rollout" };
  assert.equal(processLink(x.sessions[0], x).state, "open-descriptor-associated");
  assert.ok(
    processLink(x.sessions[0], x).uncertainties.includes(
      "open-descriptor-is-not-writer-or-current-display",
    ),
  );
});

test("legacy panel remains Pi-only; CLI namespace joins must not promote old discovery guesses", () => {
  const raw = [
    claim(`session-${id}`, 1),
    claim(`claude-session-${id}`, 2),
    claim(`codex-session-${id}`, 3),
    claim(`unknown-session-${id}`, 4),
  ].map((c) => ({
    ...c,
    repo: "/synthetic",
    title: "Synthetic",
    claimed_at: new Date(now - 100).toISOString(),
  }));
  const parsed = parseAkClaimList(JSON.stringify(raw));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.claims.length, 1);
  const ids = [id, `agent:claude:${id}`, `agent:codex:${id}`];
  const joined = joinAkTaskChips({
    cards: ids.map((sessionId, i) => ({
      cardId: String(i),
      publisherSessionIds: [sessionId],
      cwd: "/synthetic",
    })),
    claims: parsed.claims,
    liveSessionIds: new Set(ids),
    nowMs: now,
  });
  assert.deepEqual(
    joined.cards.map((c) => (c.akTasks ?? []).map((t) => t.id)),
    [[1], [], []],
  );
});

test("procfs root/cwd paths cannot bypass default redaction", () => {
  const x = input();
  x.sessions[0].sourceRef = "/proc/20/root/home/PRIVATE_SYNTHETIC_SENTINEL/registry.json";
  x.sessions[0].cwd = "/proc/20/cwd/PRIVATE_SYNTHETIC_SENTINEL";
  x.sessions[0].transcripts = [
    {
      path: "/proc/20/root/home/PRIVATE_SYNTHETIC_SENTINEL/session.jsonl",
      state: "candidate",
      method: "stat",
    },
  ];
  const m = buildRecoveryManifest(x);
  assert.ok(!JSON.stringify(m).includes("PRIVATE_SYNTHETIC_SENTINEL"));
  assert.ok(!JSON.stringify(m).includes('"/proc/'));
});

test("stale registry cannot suppress live replacement process with same PID/harness/domain", () => {
  const x = input();
  x.sessions[0].procStart = "old-birth";
  const m = buildRecoveryManifest(x);
  assert.equal(m.sessions.length, 2);
  assert.equal(m.sessions[0].process.state, "birth-mismatch");
  assert.equal(m.sessions[1].process.state, "process-only");
  assert.equal(m.sessions[1].session.id, null);
  assert.equal(m.coverage.distinctSessionIdentities, 1);
  assert.equal(m.coverage.processOnlyObservations, 1);
});

test("eleven Electron helper processes do not become eleven AGNT sessions", () => {
  const x = input();
  x.sessions = [];
  x.before = [
    proc(10, ""),
    ...Array.from({ length: 11 }, (_, i) => ({ ...proc(20 + i, "agnt"), ppid: 10 })),
  ];
  x.after = structuredClone(x.before);
  const m = buildRecoveryManifest(x);
  assert.deepEqual(m.coverage.harnesses.agnt, {
    observationRows: 11,
    distinctSessionIdentities: 0,
    processOnlyObservations: 11,
  });
  assert.equal(m.windowContainmentGroups.length, 1);
  assert.equal(m.windowContainmentGroups[0].processObservations, 11);
  assert.equal(m.windowContainmentGroups[0].distinctSessionIdentities, 0);
  assert.equal(m.sessions.length, 11);
});
