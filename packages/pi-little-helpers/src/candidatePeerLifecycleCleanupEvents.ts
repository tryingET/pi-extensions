import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readSync } from "node:fs";
import type { CandidateCleanupEffect } from "./candidatePeerLifecycleArchiveTypes.ts";
import {
  completeCleanupEventJson,
  newCleanupEventJsonScanner as newEventIdentityScanner,
  scanCleanupEventJson as scanTopLevelEventIdentity,
} from "./candidatePeerLifecycleCleanupJson.ts";
import type { CandidateLifecycleRecord } from "./candidatePeerLifecycleV2.ts";
import {
  appendLifecycleEvent,
  digestObject,
  getCandidateLifecycleEventsPath,
} from "./candidatePeerLifecycleV2.ts";

export type CleanupEffectEvent = {
  event: "cleanup_effect_intent" | "cleanup_effect_observed";
  effect: CandidateCleanupEffect;
  authorizationDigest: string;
  attemptId: string;
  at: string;
  recoveredAfterCrash?: boolean;
  worktreePath?: string;
  branchName?: string;
  branchOid?: string;
  observationDigest?: string;
};

const CLEANUP_EVENT_READ_CHUNK_BYTES = 64 * 1024;
const MAX_RELEVANT_CLEANUP_EVENT_BYTES = 16 * 1024 * 1024;
const FINAL_LF = Buffer.from("\n");
const RELEVANT_CLEANUP_EVENTS = new Set([
  "cleanup_effect_intent",
  "cleanup_effect_observed",
  "cleaned",
]);

export type CleanupEventScanResult = {
  events: Array<Record<string, unknown>>;
  finalEvent?: Record<string, unknown>;
};

type ExpectedCleanedEvent = {
  byteLength: number;
  contentByteLength: number;
  sha256: string;
  record: CandidateLifecycleRecord;
};

function expectedCleanedEvent(record: CandidateLifecycleRecord): ExpectedCleanedEvent {
  const bytes = Buffer.from(
    `${JSON.stringify({
      event: "cleaned",
      at: record.updatedAt,
      fromVersion: record.resourceVersion - 1,
      record,
    })}\n`,
  );
  return {
    byteLength: bytes.length,
    contentByteLength: bytes.length - FINAL_LF.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    record,
  };
}

function cleanedEventMismatch(lineBytes: number, expectation: ExpectedCleanedEvent): Error {
  if (
    lineBytes > MAX_RELEVANT_CLEANUP_EVENT_BYTES ||
    expectation.contentByteLength > MAX_RELEVANT_CLEANUP_EVENT_BYTES
  ) {
    return new Error(
      "oversized cleaned lifecycle event does not match the canonical terminal record",
    );
  }
  return new Error(
    "cleaned lifecycle event does not match exact canonical bytes including final LF",
  );
}

export function readCleanupEvents(
  resourceId: string,
  env: NodeJS.ProcessEnv,
  path = getCandidateLifecycleEventsPath(resourceId, env),
  expectedFinalCleanedRecord?: CandidateLifecycleRecord,
): CleanupEventScanResult {
  if (!existsSync(path)) return { events: [] };

  const cleanedExpectation = expectedFinalCleanedRecord
    ? expectedCleanedEvent(expectedFinalCleanedRecord)
    : undefined;
  const events: Array<Record<string, unknown>> = [];
  let finalEvent: Record<string, unknown> | undefined;
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(CLEANUP_EVENT_READ_CHUNK_BYTES);
  let lineChunks: Buffer[] = [];
  let lineBytes = 0;
  let lineRelevant: boolean | undefined;
  let identity = newEventIdentityScanner();
  let cleanedLineHash = cleanedExpectation ? createHash("sha256") : undefined;

  const appendLineBytes = (bytes: Buffer): void => {
    if (bytes.length === 0) return;
    const nextLineBytes = lineBytes + bytes.length;
    cleanedLineHash?.update(bytes);
    if (nextLineBytes <= MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
      lineChunks.push(Buffer.from(bytes));
    } else {
      lineChunks = [];
    }
    scanTopLevelEventIdentity(identity, bytes);
    if (lineRelevant === undefined && identity.event !== undefined) {
      lineRelevant = RELEVANT_CLEANUP_EVENTS.has(identity.event);
      if (identity.event === "cleaned" && cleanedExpectation) lineChunks = [];
      if (identity.event !== "cleaned") cleanedLineHash = undefined;
    }
    lineBytes = nextLineBytes;
    if (lineBytes > MAX_RELEVANT_CLEANUP_EVENT_BYTES && identity.event === undefined) {
      throw new Error("lifecycle event identity exceeds bounded read limit");
    }
    if (identity.event !== undefined && RELEVANT_CLEANUP_EVENTS.has(identity.event)) {
      if (identity.event === "cleaned" && cleanedExpectation) {
        if (lineBytes > cleanedExpectation.contentByteLength) {
          throw cleanedEventMismatch(lineBytes, cleanedExpectation);
        }
      } else if (lineBytes > MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
        throw new Error("relevant cleanup lifecycle event exceeds bounded read limit");
      }
    }
  };

  const finishLine = (terminatedWithLf: boolean): void => {
    if (lineBytes === 0) throw new Error("malformed empty lifecycle event");
    if (!completeCleanupEventJson(identity)) {
      throw new Error("malformed lifecycle event or non-unique top-level event identity");
    }
    const relevant = RELEVANT_CLEANUP_EVENTS.has(identity.event);
    let event: Record<string, unknown>;
    if (identity.event === "cleaned" && cleanedExpectation) {
      if (terminatedWithLf) cleanedLineHash?.update(FINAL_LF);
      const observedBytes = lineBytes + (terminatedWithLf ? FINAL_LF.length : 0);
      const cleanedDigest = cleanedLineHash?.digest("hex");
      if (
        observedBytes !== cleanedExpectation.byteLength ||
        cleanedDigest !== cleanedExpectation.sha256
      ) {
        throw cleanedEventMismatch(lineBytes, cleanedExpectation);
      }
      event = {
        event: "cleaned",
        at: cleanedExpectation.record.updatedAt,
        fromVersion: cleanedExpectation.record.resourceVersion - 1,
        record: cleanedExpectation.record,
      };
    } else if (lineBytes <= MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
      try {
        event = JSON.parse(Buffer.concat(lineChunks, lineBytes).toString("utf8")) as Record<
          string,
          unknown
        >;
      } catch (error) {
        throw new Error(`malformed lifecycle event: ${String(error)}`);
      }
      if (event.event !== identity.event) {
        throw new Error("lifecycle event identity changed during decoding");
      }
    } else if (relevant) {
      throw new Error("relevant cleanup lifecycle event exceeds bounded read limit");
    } else {
      event = { event: identity.event };
    }
    finalEvent = event;
    if (typeof event.event === "string" && RELEVANT_CLEANUP_EVENTS.has(event.event)) {
      events.push(event);
    }
    lineChunks = [];
    lineBytes = 0;
    lineRelevant = undefined;
    identity = newEventIdentityScanner();
    cleanedLineHash = cleanedExpectation ? createHash("sha256") : undefined;
  };

  try {
    for (;;) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      let start = 0;
      while (start < bytesRead) {
        const newline = buffer.indexOf(0x0a, start);
        const end = newline === -1 ? bytesRead : newline;
        appendLineBytes(buffer.subarray(start, end));
        if (newline === -1) break;
        finishLine(true);
        start = newline + 1;
      }
    }
    if (lineBytes > 0) finishLine(false);
  } finally {
    closeSync(fd);
  }
  return { events, finalEvent };
}

export function cleanupObservations(
  events: Array<Record<string, unknown>>,
  authorizationDigest: string,
): Map<CandidateCleanupEffect, CleanupEffectEvent> {
  const observations = new Map<CandidateCleanupEffect, CleanupEffectEvent>();
  for (const event of events) {
    if (
      event.event === "cleanup_effect_observed" &&
      event.authorizationDigest === authorizationDigest &&
      (event.effect === "remove_worktree" || event.effect === "delete_branch")
    ) {
      observations.set(event.effect, event as CleanupEffectEvent);
    }
  }
  return observations;
}

export function appendCleanupObservation(
  resourceId: string,
  event: Omit<CleanupEffectEvent, "event" | "at" | "observationDigest">,
  env: NodeJS.ProcessEnv,
): CleanupEffectEvent {
  const unsigned = {
    event: "cleanup_effect_observed" as const,
    ...event,
    at: new Date().toISOString(),
  };
  const observation = { ...unsigned, observationDigest: digestObject(unsigned) };
  appendLifecycleEvent(resourceId, observation, env);
  return observation;
}
