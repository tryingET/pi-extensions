import assert from "node:assert/strict";
import test from "node:test";
import { buildStartupContextPacket } from "../extensions/society-context.ts";
import { payloadProblem } from "../src/payload-check.ts";
import { fixture } from "./fixture.ts";

// Wire location and nullable lifecycle fields follow `ak machine schema decision-passport`
// and `ak decision passport <id> --machine`, not the flattened `-F json` output.
function passportBody(repo: string) {
  return {
    decision: {
      id: 7,
      title: "Open decision",
      state: "review_pending",
      repo_scope: repo,
      review_mode: null,
      review_outcome: null,
      adr_ref: null,
      outcome: null,
      evidence_ref: null,
    },
    linked_tasks: [],
    artifacts: [],
    artifact_statuses: [],
    readiness_checks: [{ name: "ready_for_adr_recorded", ready: false, missing: ["adr_ref"] }],
    next_transitions: [
      {
        to_state: "in_review",
        outcome: null,
        command: "ak decision advance 7 --state in_review",
        ready: true,
        missing: [],
        readiness_check: null,
      },
    ],
    legal_next_step: null,
    supersession: {
      superseded_by: null,
      live_successor: null,
      needs_disposition: [],
      disposition_commands: [],
    },
  };
}

function collect(f: ReturnType<typeof fixture>, payload: Record<string, unknown>) {
  const decision = passportBody(f.repo).decision;
  return buildStartupContextPacket(
    f.repo,
    undefined,
    f.config({
      "decision.list": { payload: { count: 1, decisions: [decision] } },
      "decision.passport": { payload },
    }),
  );
}

test("machine-v1 nested passport is readable without interpreting legal readiness as authorization", async () => {
  const f = fixture();
  try {
    const passport = passportBody(f.repo);
    const packet = await collect(f, { passport });
    assert.equal(packet.sourceHealth, "healthy");
    assert.equal(packet.warningCount, 0);
    assert.deepEqual(packet.decisionPassports, ["#7 Open decision: passport readable"]);
    assert.equal(payloadProblem("decision.passport", { passport }), undefined);
    assert.ok(
      f
        .calls()
        .every((call) =>
          [
            "repo.resolve",
            "startup.snapshot",
            "direction.export",
            "direction.check",
            "decision.list",
            "decision.passport",
          ].includes(call.surface),
        ),
    );
    const shadowed = await collect(f, {
      passport,
      decision: { ...passport.decision, id: 99 },
      readiness: { summary: "UNVALIDATED summary" },
      next_step: "UNVALIDATED instruction",
      status: "UNVALIDATED status",
    });
    assert.equal(shadowed.sourceHealth, "healthy");
    assert.deepEqual(shadowed.decisionPassports, packet.decisionPassports);
  } finally {
    f.dispose();
  }
});

test("nested unconsumed advisory fields do not affect health or become instructions", async () => {
  const f = fixture();
  try {
    for (const advisory of [
      {
        readiness: { summary: "UNVALIDATED nested summary" },
        next_step: "UNVALIDATED nested instruction",
        status: "UNVALIDATED nested status",
      },
      { readiness: false, next_step: ["UNVALIDATED nested instruction"], status: null },
    ]) {
      const passport = { ...passportBody(f.repo), ...advisory };
      assert.equal(payloadProblem("decision.passport", { passport }), undefined);
      const packet = await collect(f, { passport });
      assert.equal(packet.sourceHealth, "healthy");
      assert.equal(packet.warningCount, 0);
      assert.deepEqual(packet.decisionPassports, ["#7 Open decision: passport readable"]);
    }
  } finally {
    f.dispose();
  }
});

test("missing, flattened, or malformed nested passports remain rejected", () => {
  const passport = passportBody("/workspace/repo");
  const invalid: Record<string, unknown>[] = [
    {},
    passport,
    { passport: null },
    { passport: [] },
    { passport: "wrong" },
    { passport: {} },
    { passport: { ...passport, decision: null } },
    { passport: { ...passport, decision: { ...passport.decision, id: "7" } } },
    {
      passport: {
        ...passport,
        decision: { ...passport.decision, id: Number.MAX_SAFE_INTEGER + 1 },
      },
    },
    { passport: { ...passport, decision: { ...passport.decision, repo_scope: 7 } } },
  ];
  for (const field of ["linked_tasks", "artifacts", "artifact_statuses", "readiness_checks"]) {
    invalid.push({ passport: { ...passport, [field]: undefined } });
    invalid.push({ passport: { ...passport, [field]: null } });
    for (const row of [null, [], ["nested"], "text", 0, true])
      invalid.push({ passport: { ...passport, [field]: [row] } });
  }
  for (const payload of invalid)
    assert.match(
      payloadProblem("decision.passport", payload) || "",
      /malformed payload/,
      `Expected malformed payload rejection: ${JSON.stringify(payload)}`,
    );
});

test("nested passport decision identity must match the requested decision despite a valid shadow", async () => {
  const f = fixture();
  try {
    const passport = passportBody(f.repo);
    const packet = await collect(f, {
      ...passport,
      passport: { ...passport, decision: { ...passport.decision, id: 99 } },
    });
    assert.equal(packet.sourceHealth, "degraded");
    assert.equal(packet.warningCount, 1);
    assert.match(packet.decisionPassports[0], /decision identity mismatch/);
  } finally {
    f.dispose();
  }
});
