import assert from "node:assert/strict";
import test from "node:test";
import { claimantFor, parseClaimant, publisherClaimant } from "../src/common/recovery-identity.mjs";
import { buildRecoveryManifest, RECOVERY_CAPABILITIES } from "../src/common/recovery-manifest.mjs";

/**
 * Session ids copied from the sources named here, never written by hand (AK8200). AK owns this
 * grammar: valid_nodecode_session_id in agent-kernel crates/ak-core/src/tasks.rs.
 */
const COPIED_NODECODE_IDS = [
  // `select distinct session_id from events` on ~/.nodecode/history.db, 2026-11-02.
  "s-7A983FMC",
  // A real session's claim on live AK: AK8223's completed_by.
  "s-J1YV0VJR",
  // On a live Nodecode process's command line, 2026-11-03.
  "s-U82YC5MU",
  // AK8195's test vectors, which the read above does not reach. Their time fields decode to dates
  // from 2026-10-24 to 2026-11-02, while real sessions ran; no record names each id as real.
  "session-1U70ICX-Y7SWDDRC89",
  "fork-turn-1U6LA5U-Y76LVYTQT8-1",
  "fork-turn-1U6XL8M-L4BIWPI96-2",
  "fork-turn-1U71LF4-SCA2RGH7WD-1-11",
];

const REFUSED_NODECODE_IDS = [
  // The gateway's shared pseudo-session, a real id that names no one session.
  "s-GATEWAY",
  // Case: one session has one spelling, and lowercase is not it.
  "s-j1yv0vjr",
  "s-J1yV0VJR",
  "S-J1YV0VJR",
  "session-1u70icx-y7swddrc89",
  "SESSION-1U70ICX-Y7SWDDRC89",
  "fork-turn-1u71lf4-sca2rgh7wd-1",
  "FORK-TURN-1U71LF4-SCA2RGH7WD-1",
  // Leading zeros: the second spelling of a number.
  "s-07F3K",
  "s-0GATEWAY",
  "s-00000000",
  "s-00",
  "session-01U70ICX-Y7SWDDRC89",
  "session-1U70ICX-0Y7SWDDRC8",
  "fork-turn-01U71LF4-SCA2RGH7WD-1",
  "fork-turn-1U71LF4-0SCA2RGH7W-1",
  "fork-turn-1U71LF4-SCA2RGH7WD-01",
  "fork-turn-1U71LF4-SCA2RGH7WD-1-02",
  // A UUID under this prefix is another harness's shape.
  "11111111-2222-4333-8444-555555555555",
  "ef417f82-8bb2-42eb-a0ba-186d15b18272",
  // Field lengths.
  "",
  "s",
  "s-",
  "s-U82YC5MU9",
  "session-1U70ICX",
  "session-1U70ICX-",
  "session--Y7SWDDRC89",
  "session-1U70IC-Y7SWDDRC89",
  "session-1U70ICXAB-Y7SWDDRC89",
  "session-1U70ICX-Y7SWDDRC89A",
  "session-1-1",
  "fork",
  "fork-turn",
  "fork-turn-1U71LF4",
  // Fields beyond the form: extra numbers belong to forks alone, and a fork names its turn.
  "s-s-U82YC5MU",
  "s-U82YC5MU-1",
  "session-1U70ICX-Y7SWDDRC89-1",
  "session-session-1U70ICX-Y7SWDDRC89",
  "fork-trial-1U71LF4-SCA2RGH7WD-1",
  "cron-turn-1U71LF4-SCA2RGH7WD-1",
  // Fork numbers: they count from 1, a taken name from 2, in at most six digits.
  "fork-turn-1U71LF4-SCA2RGH7WD",
  "fork-turn-1U71LF4-SCA2RGH7WD-",
  "fork-turn-1U71LF4-SCA2RGH7WD-0",
  "fork-turn-1U71LF4-SCA2RGH7WD-X",
  "fork-turn-1U71LF4-SCA2RGH7WD-1000000",
  "fork-turn-1U71LF4-SCA2RGH7WD-1-0",
  "fork-turn-1U71LF4-SCA2RGH7WD-1-1",
  "fork-turn-1U71LF4-SCA2RGH7WD-1-1000000",
  "fork-turn-1U71LF4-SCA2RGH7WD-1-2-3",
  // Other shapes Nodecode mints, or a client may name; AK admits none of them.
  "cron-backup",
  "layer",
  "fork-trial-g1",
  "fork-1U71LF4-SCA2RGH7WD-1",
  // Doubled prefix and padding: never trimmed into a claimant.
  "nodecode-session-s-U82YC5MU",
  " s-U82YC5MU",
  "s-U82YC5MU ",
  "s-U82YC5MU\n",
  "s-U82\n",
  "fork-turn-1U71LF4-SCA2RGH7WD-1\n",
  "s-U82YC5MU\0",
  "s-Ü82YC5MU",
];

const uuid = "11111111-2222-4333-8444-555555555555";
const OTHER_HARNESSES = [
  ["pi", "session-"],
  ["claude", "claude-session-"],
  ["codex", "codex-session-"],
];
const now = 1800000000000;

/** A claim row as `ak task list --status claimed` projects it. */
function claim(claimedBy, id = 1) {
  return {
    id,
    claimed_by: claimedBy,
    status: "claimed",
    lease_expires_at: new Date(now + 60000).toISOString(),
  };
}

function manifest({ sessions = [], claims = [] }) {
  return buildRecoveryManifest({
    startedAt: now,
    endedAt: now + 100,
    bootId: "synthetic-boot",
    pidDomain: "synthetic-domain",
    before: [],
    after: [],
    sessions,
    windows: [],
    windowsAfter: [],
    workspaces: [],
    workspacesAfter: [],
    claims,
    sources: [],
  });
}

for (const id of COPIED_NODECODE_IDS) {
  test(`Given Nodecode id ${id}, when it round-trips, then AK's claimant keeps its exact case`, () => {
    const claimant = `nodecode-session-${id}`;
    assert.equal(claimantFor("nodecode", id), claimant);
    assert.deepEqual(parseClaimant(claimant), { harness: "nodecode", id, claimant });
  });
}

for (const id of REFUSED_NODECODE_IDS) {
  test(`Given ${JSON.stringify(id)}, when read as a Nodecode id, then it is refused as AK refuses it`, () => {
    assert.equal(claimantFor("nodecode", id), null);
    assert.equal(parseClaimant(`nodecode-session-${id}`), null);
  });
}

test("Given a value that is not a string, when read as a Nodecode id, then it is refused without throwing", () => {
  for (const value of [null, undefined, 7, {}, ["s-U82YC5MU"]]) {
    assert.equal(claimantFor("nodecode", value), null);
  }
});

test("Given a bare Nodecode id, when parsed as a claimant, then no harness is guessed for it", () => {
  // `session-<time>-<random>` starts like Pi's prefix but is not a Pi claimant.
  for (const value of [
    "s-U82YC5MU",
    "session-1U70ICX-Y7SWDDRC89",
    "fork-turn-1U6LA5U-Y76LVYTQT8-1",
  ]) {
    assert.equal(parseClaimant(value), null);
  }
});

test("Given a Nodecode id, when another harness claims it, then the prefix does not transfer", () => {
  for (const [harness, prefix] of OTHER_HARNESSES) {
    assert.equal(claimantFor(harness, "s-U82YC5MU"), null);
    assert.equal(parseClaimant(`${prefix}s-U82YC5MU`), null);
  }
});

for (const [harness, prefix] of OTHER_HARNESSES) {
  test(`Given a ${harness} UUID, when it round-trips, then it folds to lowercase as before`, () => {
    const lower = `${prefix}${uuid}`;
    const mixed = "ABCDEF01-2222-4333-8444-555555555555";
    const folded = `${prefix}${mixed.toLowerCase()}`;
    assert.equal(claimantFor(harness, uuid), lower);
    assert.deepEqual(parseClaimant(lower), { harness, id: uuid, claimant: lower });
    assert.equal(claimantFor(harness, mixed), folded);
    assert.deepEqual(parseClaimant(`${prefix}${mixed}`), {
      harness,
      id: mixed.toLowerCase(),
      claimant: folded,
    });
    assert.equal(publisherClaimant(`agent:${harness}:${mixed}`), folded);
    assert.equal(claimantFor(harness, "not-a-uuid"), null);
    assert.equal(parseClaimant(`${prefix}not-a-uuid`), null);
  });
}

test("Given a live claim by a real Nodecode session, when the manifest cannot look for it, then it reads as Nodecode and says so", () => {
  const m = manifest({ claims: [claim("nodecode-session-s-J1YV0VJR")] });
  assert.equal(m.claims[0].harness, "nodecode");
  assert.equal(m.claims[0].state, "session-source-unsupported");
  assert.equal(m.claims[0].claimant, "nodecode-session-s-J1YV0VJR");
  assert.equal(m.coverage.claimStates["unsupported-claimant"], undefined);
});

test("Given a Nodecode claim its lease or status rules out, when the manifest is built, then that state wins", () => {
  const holder = "nodecode-session-s-J1YV0VJR";
  const m = manifest({
    claims: [
      { ...claim(holder, 1), lease_expires_at: new Date(now - 1).toISOString() },
      { ...claim(holder, 2), lease_expires_at: "not-a-time" },
      { ...claim(holder, 3), status: "running" },
    ],
  });
  assert.deepEqual(
    m.claims.map((c) => [c.harness, c.state]),
    [
      ["nodecode", "expired"],
      ["nodecode", "invalid-lease"],
      ["nodecode", "not-claimed"],
    ],
  );
});

test("Given a claim AK would refuse, when the manifest is built, then it stays unknown", () => {
  const m = manifest({
    claims: [claim("nodecode-session-s-GATEWAY"), claim("nodecode-session-s-j1yv0vjr", 2)],
  });
  assert.deepEqual(
    m.claims.map((c) => [c.harness, c.state]),
    [
      [null, "unsupported-claimant"],
      [null, "unsupported-claimant"],
    ],
  );
});

test("Given no observed session, when each harness's claim is read, then only a harness with a source reports it unobserved", () => {
  const m = manifest({
    claims: [
      claim(`session-${uuid}`, 1),
      claim(`claude-session-${uuid}`, 2),
      claim(`codex-session-${uuid}`, 3),
      claim("nodecode-session-s-J1YV0VJR", 4),
      claim(`unknown-session-${uuid}`, 5),
    ],
  });
  assert.deepEqual(
    m.claims.map((c) => [c.harness, c.state]),
    [
      ["pi", "session-not-observed"],
      ["claude", "session-not-observed"],
      ["codex", "session-not-observed"],
      ["nodecode", "session-source-unsupported"],
      [null, "unsupported-claimant"],
    ],
  );
});

test("Given a Nodecode session observation, when its claim is joined, then the case-exact id links", () => {
  const m = manifest({
    sessions: [
      {
        harness: "nodecode",
        sessionId: "fork-turn-1U71LF4-SCA2RGH7WD-1-11",
        pid: 20,
        source: "synthetic",
        sourceRef: "synthetic",
        cwd: "synthetic",
        startedAt: now,
        pidDomain: null,
        procStart: null,
        changed: false,
        transcripts: [],
      },
    ],
    claims: [claim("nodecode-session-fork-turn-1U71LF4-SCA2RGH7WD-1-11", 9)],
  });
  assert.equal(m.claims[0].state, "exact-claimant");
  assert.equal(m.claims[0].harness, "nodecode");
  assert.equal(m.sessions[0].ak.claimant, "nodecode-session-fork-turn-1U71LF4-SCA2RGH7WD-1-11");
  assert.deepEqual(
    m.sessions[0].ak.links.map((l) => l.taskId),
    [9],
  );
});

test("Given the harness table, when Nodecode is looked up, then it publishes AK's prefix and no session source", () => {
  const row = RECOVERY_CAPABILITIES.find((c) => c.harness === "nodecode");
  assert.equal(row?.claimantPrefix, "nodecode-session-");
  assert.equal(row?.session, "unsupported");
  assert.equal(row?.transcript, "unsupported");
  assert.equal(row?.currentDisplay, "unsupported");
});
