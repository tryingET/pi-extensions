/**
summary: "Adversarial coverage for lossless scheduler handoff JSON and duplicate-key rejection."
read_when:
  - "Changing scheduler handoff canonicalization, raw snapshot persistence, or JSON parsing."
*/
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  clearSchedulerHandoff,
  readSchedulerHandoff,
} from "../extensions/workstation-scheduler.ts";

const POLICY_REVISION = "338405904887567215";
const COLLIDING_POLICY_REVISION = "338405904887567216";
const LIFECYCLE_REVISION = "30350130036645910";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function replaceRevisionStrings(value) {
  return value
    .replace(JSON.stringify(POLICY_REVISION), POLICY_REVISION)
    .replace(JSON.stringify(LIFECYCLE_REVISION), LIFECYCLE_REVISION);
}

function schedulerHandoffText() {
  const unsigned = {
    schema_version: 1,
    kind: "ai-control-external-effect-claim-handoff",
    reservation_token: {
      reservation_id: "reservation-large-revision-test",
      generation: 1,
      plan_digest: "a".repeat(64),
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      physical_store_id: "scheduler-store",
      deployment_id: "workstation-capability-graph",
      profile_id: "inkling-tts-canary",
      resource_request_digest: "b".repeat(64),
      graph_observation_digest: "c".repeat(64),
      claim_envelope_digest: "d".repeat(64),
      graph_step_ids: ["inkling-small:0"],
    },
    claim: {
      claim_generation: 1,
      consumer_id: "pi:audio-turn",
      attempt_nonce: "attempt-large-revision-test",
      operation_key: "pi:inkling-audio",
      effect_kind: "graph",
      graph_step_id: "inkling-small:0",
      provider_id: "workstation-inference",
      model_id: "inkling-small-iq2m-canary",
      claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    owner_authority: {
      profile_policy_store_id: "workstation-policy",
      profile_policy_revision: POLICY_REVISION,
      lifecycle_store_id: "workstation-lifecycle",
      lifecycle_revision: LIFECYCLE_REVISION,
      profile_config_digest: "e".repeat(64),
      lifecycle_profile_config_digest: "f".repeat(64),
    },
  };
  const digest = createHash("sha256")
    .update(replaceRevisionStrings(canonicalJson(unsigned)))
    .digest("hex");
  return replaceRevisionStrings(JSON.stringify({ ...unsigned, handoff_digest: digest }));
}

async function readHandoff(path, schedulerDb) {
  return readSchedulerHandoff(
    path,
    schedulerDb,
    "workstation-inference",
    "inkling-small-iq2m-canary",
  );
}

test("unsafe-range owner revisions retain exact digest lexemes and snapshot bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "scheduler-json-lossless-"));
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const rawText = schedulerHandoffText().replace(
    '"profile_policy_revision"',
    '"\\u0070rofile_policy_revision"',
  );
  let handoff;
  try {
    await writeFile(handoffPath, rawText);
    handoff = await readHandoff(handoffPath, schedulerDb);
    assert.equal(await readFile(handoff.handoffPath, "utf8"), rawText);
    assert.equal((await stat(handoff.snapshotDirectory)).mode & 0o777, 0o700);
    assert.equal((await stat(handoff.handoffPath)).mode & 0o777, 0o600);
  } finally {
    if (handoff) await clearSchedulerHandoff(handoff);
    await rm(root, { recursive: true, force: true });
  }
});

test("colliding unsafe-range tampering is rejected before snapshot publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "scheduler-json-tamper-"));
  const handoffPath = join(root, "handoff.json");
  try {
    await writeFile(
      handoffPath,
      schedulerHandoffText().replace(POLICY_REVISION, COLLIDING_POLICY_REVISION),
    );
    await assert.rejects(
      readHandoff(handoffPath, join(root, "scheduler.sqlite3")),
      /digest is invalid/,
    );
    assert.deepEqual(
      (await readdir(root)).filter((entry) => entry.startsWith("pi-inkling-handoff-")),
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("decoded duplicate keys are rejected at owner, authority, and claim paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "scheduler-json-duplicates-"));
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const rawText = schedulerHandoffText();
  const attacks = [
    rawText.replace(
      `"profile_policy_revision":${POLICY_REVISION}`,
      `"profile_policy_revision":${POLICY_REVISION},"\\u0070rofile_policy_revision":${COLLIDING_POLICY_REVISION}`,
    ),
    rawText.replace('"owner_authority":{', '"owner_authority":{},"\\u006fwner_authority":{'),
    rawText.replace(
      '"provider_id":"workstation-inference"',
      '"provider_id":"attacker-provider","\\u0070rovider_id":"workstation-inference"',
    ),
  ];
  try {
    for (const attack of attacks) {
      await writeFile(handoffPath, attack);
      await assert.rejects(readHandoff(handoffPath, schedulerDb), /duplicate key/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
