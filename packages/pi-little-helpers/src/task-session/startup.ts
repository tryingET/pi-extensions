import { join } from "node:path";
import { assertNotStopped, attemptDirectory, findAttempt, writeObservation } from "./bridge.js";
import { installedHostBuild } from "./build-identity.js";
import { AdmissionChannel, type WireMessage } from "./channel.js";
import type { SendPort } from "./codex.js";
import { taskSessionRequest } from "./core.js";
import { assertSdkIdentity } from "./identity.js";
import { digest, id, integer, parseJson, record, refuse } from "./json.js";
import { interpretTaskSessionPlan } from "./producer-adapter.js";
import { hash, loadHostProfile, loadProfile } from "./profile.js";
import type { PrivateChannel } from "./socket-channel.js";
import {
  assertDomainPhysical,
  assertSnapshotDomains,
  durableWrite,
  type Locator,
  privateRead,
  readSnapshot,
} from "./state.js";
import { assertViewerReady } from "./viewer.js";

export function bootstrapSeed(input: unknown) {
  const s = record(input, [
    "schema",
    "attempt",
    "incarnation",
    "startupDeadline",
    "actor",
    "leaseSeconds",
    "baselineDigest",
    "akBinaryDigest",
    "policyDigest",
    "databaseIdentity",
    "hostBuildDigest",
  ]);
  if (s.schema !== "pi.task-session.host-bootstrap.v1") refuse("bootstrap_version_unsupported");
  id(s.attempt);
  id(s.incarnation);
  id(s.actor);
  integer(s.startupDeadline);
  integer(s.leaseSeconds);
  if (
    s.startupDeadline <= Date.now() ||
    s.startupDeadline > Date.now() + 120000 ||
    s.leaseSeconds > 86400
  )
    refuse("startup_deadline_invalid");
  for (const k of [
    "baselineDigest",
    "akBinaryDigest",
    "policyDigest",
    "databaseIdentity",
    "hostBuildDigest",
  ])
    hash(s[k]);
  return s;
}
/** Shared production orchestration. Test ports live in unpublished fixtures, never public CLI flags. */
export async function runHost(
  channel: PrivateChannel,
  locator: Locator,
  send: SendPort,
  interpret: (value: unknown) => WireMessage,
) {
  let closedVerified = false;
  let admission: AdmissionChannel | undefined;
  let terminal = () => {};
  let host: Awaited<ReturnType<typeof import("./host.js").sealedHost>> | undefined;
  let observationTimer: ReturnType<typeof setInterval> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let failure: string | null = null;
  let publish = () => {};
  try {
    const seed = bootstrapSeed(await channel.receive(Date.now() + 120000));
    const attempt = findAttempt(locator, seed.attempt);
    if (attempt.incarnation !== seed.incarnation) refuse("incarnation_mismatch");
    const dir = attemptDirectory(locator, attempt);
    // An exclusive immutable receipt prevents a second host from consuming this incarnation.
    durableWrite(
      join(dir, "host-entered.json"),
      {
        schema: "pi.task-session.host-entered.v1",
        attempt: attempt.attempt,
        incarnation: attempt.incarnation,
      },
      true,
    );
    publish = () =>
      writeObservation(dir, attempt, 1, {
        identity: { attempt: attempt.attempt, cwd: attempt.domain.checkout },
        phase: failure ? "DENIED" : "BOOTSTRAP",
        denial: failure,
        events: [],
      });
    const intent = record(parseJson(privateRead(join(dir, "intent.json"))), [
      "schema",
      "request",
      "attempt",
      "incarnation",
      "resources",
      "viewNonce",
    ]);
    if (
      intent.schema !== "pi.task-session.intent.v1" ||
      intent.attempt !== attempt.attempt ||
      intent.incarnation !== attempt.incarnation
    )
      refuse("intent_binding_mismatch");
    const request = taskSessionRequest(intent.request);
    if (
      digest(request) !== attempt.semanticDigest ||
      request.cwd !== attempt.domain.checkout ||
      request.akInstance !== attempt.domain.akInstance ||
      request.taskId !== attempt.domain.taskId
    )
      refuse("reservation_binding_mismatch");
    const assertCustody = () => {
      const snapshot = readSnapshot(locator);
      if (snapshot.withdrawn || !snapshot.attempts.some((a) => digest(a) === digest(attempt)))
        refuse("custody_changed");
      assertSnapshotDomains(snapshot);
      assertDomainPhysical(attempt.domain);
      assertNotStopped(dir, attempt);
    };
    assertCustody();
    assertViewerReady(dir, attempt, intent.viewNonce);
    const nativeBaseline = record(
      interpretTaskSessionPlan(parseJson(privateRead(join(dir, "baseline.json")))),
      ["protocol", "evaluated_at", "baseline_digest", "baseline"],
    );
    if (
      nativeBaseline.protocol !== "ak.task-session.baseline.v1" ||
      nativeBaseline.baseline_digest !== seed.baselineDigest ||
      digest(nativeBaseline.baseline) !== seed.baselineDigest ||
      nativeBaseline.baseline?.task?.id !== request.taskId ||
      typeof nativeBaseline.baseline?.task?.repo !== "string"
    )
      refuse("baseline_binding_mismatch");
    const pin = loadProfile(locator, request.profile);
    if (seed.actor !== `pi-task-${attempt.incarnation}` || seed.leaseSeconds !== pin.runSeconds)
      refuse("actor_or_lease_mismatch");
    for (const key of [
      "akBinaryDigest",
      "policyDigest",
      "databaseIdentity",
      "hostBuildDigest",
    ] as const)
      if (seed[key] !== pin.producer[key]) refuse("producer_binding_mismatch");
    if (installedHostBuild() !== seed.hostBuildDigest) refuse("host_build_mismatch");
    assertSdkIdentity();
    const loaded = await loadHostProfile(locator, request.profile);
    for (const k of ["provider", "model", "reasoning", "account"] as const)
      if (request[k] !== loaded.pin[k]) refuse("requested_profile_mismatch");
    // Only after custody adoption, bounded parser, immutable reservation/profile and viewer checks.
    const { sealedHost } = await import("./host.js");
    host = await sealedHost(
      {
        incarnation: attempt.incarnation,
        cwd: request.cwd,
        objective: request.objective,
        profile: loaded.profile,
        resources: intent.resources,
      },
      loaded.credential,
      send,
      assertCustody,
    );
    let sequence = 0,
      lastPublish = 0,
      last = "";
    publish = () => {
      if (!host) return;
      const o = host.inspect();
      const hash = digest(o);
      if (hash !== last || Date.now() - lastPublish >= 1000) {
        writeObservation(dir, attempt, ++sequence, { ...o, identity: host.identity });
        last = hash;
        lastPublish = Date.now();
      }
    };
    publish();
    const prepared: WireMessage = {
      protocol: "ak.task-session.v1",
      kind: "PREPARED",
      binding: {
        request: request.requestId,
        semantic_digest: attempt.semanticDigest,
        attempt: attempt.attempt,
        incarnation: attempt.incarnation,
        reservation: digest(attempt),
        ak_binary_digest: seed.akBinaryDigest,
        policy_digest: seed.policyDigest,
        database_identity: seed.databaseIdentity,
        host_build_digest: seed.hostBuildDigest,
        profile_digest: request.profile,
        raw_envelope_digest: digest(intent),
        effective_envelope_digest: host.envelopeDigest,
      },
      body: {
        no_dispatch: true,
        startup_deadline_ms: seed.startupDeadline,
        task_id: request.taskId,
        repo: nativeBaseline.baseline.task.repo,
        actor: seed.actor,
        lease_seconds: seed.leaseSeconds,
        baseline_digest: seed.baselineDigest,
      },
    };
    terminal = () => {
      const receipt = {
        schema: "pi.task-session.host-terminal.v1",
        attempt: attempt.attempt,
        incarnation: attempt.incarnation,
        preparedDigest: digest(prepared),
        guard: host?.inspect(),
      };
      durableWrite(join(dir, "host-terminal.json"), receipt, true);
      durableWrite(
        join(dir, "host-closure.json"),
        {
          schema: "pi.task-session.host-closure.v1",
          attempt: attempt.attempt,
          incarnation: attempt.incarnation,
          future_dispatch_closed: true,
          owner_receipt_digest: digest(receipt),
        },
        true,
      );
    };
    admission = new AdmissionChannel(prepared, interpret);
    await channel.send(prepared, seed.startupDeadline);
    admission.admission(await channel.receive(seed.startupDeadline));
    assertCustody();
    assertViewerReady(dir, attempt, intent.viewNonce);
    await channel.send(admission.publish(dir), seed.startupDeadline);
    const lease = admission.closed(await channel.receive(seed.startupDeadline));
    closedVerified = true;
    channel.finish();
    host.admit(lease);
    deadlineTimer = setTimeout(
      () => {
        void host?.stop();
      },
      Math.max(0, Math.min(lease, loaded.profile.runDeadline) - Date.now()),
    );
    observationTimer = setInterval(() => {
      try {
        assertCustody();
        publish();
      } catch {
        host?.deny("custody_or_observation_failed");
        void host?.stop();
      }
    }, 100);
    await host.dispatchAfterClosed(() => {
      assertCustody();
      assertViewerReady(dir, attempt, intent.viewNonce);
      durableWrite(
        join(dir, "dispatch.json"),
        {
          schema: "pi.task-session.dispatch.v1",
          attempt: attempt.attempt,
          incarnation: attempt.incarnation,
          preparedDigest: digest(prepared),
          envelopeDigest: host?.envelopeDigest,
        },
        true,
      );
    });
    publish();
    terminal();
    return {
      closedVerified,
      promptReturned: true,
      reason:
        host.inspect().denial === "host_finished"
          ? undefined
          : (host.inspect().denial ?? "runtime_outcome_unknown"),
    };
  } catch (error) {
    const reason =
      error instanceof Error && /^[a-z_]+$/.test(error.message)
        ? error.message
        : "startup_or_runtime_denied";
    closedVerified = admission?.closedVerified ?? false;
    failure = reason;
    host?.deny(reason);
    await host?.stop();
    try {
      publish();
      terminal();
    } catch {
      /* Retain last durable observation and all independent occupancy. */
    }
    return { closedVerified, promptReturned: false, reason };
  } finally {
    if (observationTimer) clearInterval(observationTimer);
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}
