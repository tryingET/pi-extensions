import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readSync } from "node:fs";
import type { CandidateCleanupEffect } from "./candidatePeerLifecycleArchiveTypes.ts";
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
const MAX_EVENT_IDENTITY_BYTES = 256;
const MAX_EVENT_NESTING_DEPTH = 256;
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

type EventIdentityScanner = {
  state: "start" | "key" | "colon" | "value" | "primitive" | "comma" | "done";
  currentKey?: string;
  event?: string;
  eventSeen: boolean;
  malformed: boolean;
  stringRole?: "key" | "event-value" | "other-value";
  stringBytes: number[];
  stringEscaped: boolean;
  nestedClosers: number[];
  nestedString: boolean;
  nestedEscaped: boolean;
};

function newEventIdentityScanner(): EventIdentityScanner {
  return {
    state: "start",
    eventSeen: false,
    malformed: false,
    stringBytes: [],
    stringEscaped: false,
    nestedClosers: [],
    nestedString: false,
    nestedEscaped: false,
  };
}

function decodeIdentityString(scanner: EventIdentityScanner): string | undefined {
  try {
    const value = JSON.parse(`"${Buffer.from(scanner.stringBytes).toString("utf8")}"`);
    return typeof value === "string" ? value : undefined;
  } catch {
    scanner.malformed = true;
    return undefined;
  }
}

function scanTopLevelEventIdentity(scanner: EventIdentityScanner, bytes: Buffer): void {
  if (scanner.malformed) return;
  const whitespace = (byte: number): boolean =>
    byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a;
  for (const byte of bytes) {
    if (scanner.nestedClosers.length > 0) {
      if (scanner.nestedString) {
        if (scanner.nestedEscaped) scanner.nestedEscaped = false;
        else if (byte === 0x5c) scanner.nestedEscaped = true;
        else if (byte === 0x22) scanner.nestedString = false;
        continue;
      }
      if (byte === 0x22) scanner.nestedString = true;
      else if (byte === 0x7b || byte === 0x5b) {
        if (scanner.nestedClosers.length >= MAX_EVENT_NESTING_DEPTH) {
          scanner.malformed = true;
          return;
        }
        scanner.nestedClosers.push(byte === 0x7b ? 0x7d : 0x5d);
      } else if (byte === 0x7d || byte === 0x5d) {
        if (scanner.nestedClosers.pop() !== byte) {
          scanner.malformed = true;
          return;
        }
        if (scanner.nestedClosers.length === 0) scanner.state = "comma";
      }
      continue;
    }

    if (scanner.stringRole) {
      if (scanner.stringEscaped) {
        scanner.stringEscaped = false;
        if (scanner.stringRole !== "other-value") scanner.stringBytes.push(byte);
      } else if (byte === 0x5c) {
        scanner.stringEscaped = true;
        if (scanner.stringRole !== "other-value") scanner.stringBytes.push(byte);
      } else if (byte === 0x22) {
        const role = scanner.stringRole;
        const value = role === "other-value" ? undefined : decodeIdentityString(scanner);
        scanner.stringRole = undefined;
        scanner.stringBytes = [];
        if (scanner.malformed) return;
        if (role === "key") {
          scanner.currentKey = value;
          scanner.state = "colon";
        } else {
          if (role === "event-value") {
            if (scanner.eventSeen) {
              scanner.malformed = true;
              return;
            }
            scanner.eventSeen = true;
            scanner.event = value;
          }
          scanner.state = "comma";
        }
      } else if (scanner.stringRole !== "other-value") {
        if (scanner.stringBytes.length >= MAX_EVENT_IDENTITY_BYTES) {
          scanner.malformed = true;
          return;
        }
        scanner.stringBytes.push(byte);
      }
      continue;
    }

    if (scanner.state === "start") {
      if (whitespace(byte)) continue;
      if (byte !== 0x7b) scanner.malformed = true;
      else scanner.state = "key";
    } else if (scanner.state === "key") {
      if (whitespace(byte)) continue;
      if (byte === 0x7d) scanner.state = "done";
      else if (byte === 0x22) {
        scanner.stringRole = "key";
        scanner.stringBytes = [];
      } else scanner.malformed = true;
    } else if (scanner.state === "colon") {
      if (whitespace(byte)) continue;
      if (byte !== 0x3a) scanner.malformed = true;
      else scanner.state = "value";
    } else if (scanner.state === "value") {
      if (whitespace(byte)) continue;
      if (byte === 0x22) {
        scanner.stringRole = scanner.currentKey === "event" ? "event-value" : "other-value";
        scanner.stringBytes = [];
      } else if (byte === 0x7b || byte === 0x5b) {
        if (scanner.currentKey === "event") {
          scanner.malformed = true;
          return;
        }
        scanner.nestedClosers.push(byte === 0x7b ? 0x7d : 0x5d);
      } else {
        if (scanner.currentKey === "event") {
          scanner.malformed = true;
          return;
        }
        scanner.state = "primitive";
      }
    } else if (scanner.state === "primitive") {
      if (byte === 0x2c) scanner.state = "key";
      else if (byte === 0x7d) scanner.state = "done";
    } else if (scanner.state === "comma") {
      if (whitespace(byte)) continue;
      if (byte === 0x2c) scanner.state = "key";
      else if (byte === 0x7d) scanner.state = "done";
      else scanner.malformed = true;
    } else if (!whitespace(byte)) {
      scanner.malformed = true;
    }
    if (scanner.malformed) return;
  }
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
    if (lineRelevant !== false && nextLineBytes <= MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
      lineChunks.push(Buffer.from(bytes));
    } else if (nextLineBytes > MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
      lineChunks = [];
    }
    scanTopLevelEventIdentity(identity, bytes);
    if (lineRelevant === undefined && identity.event !== undefined) {
      lineRelevant = RELEVANT_CLEANUP_EVENTS.has(identity.event);
      if (!lineRelevant || (identity.event === "cleaned" && cleanedExpectation)) lineChunks = [];
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
    if (identity.malformed || identity.event === undefined) {
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
    } else if (relevant) {
      if (lineBytes > MAX_RELEVANT_CLEANUP_EVENT_BYTES) {
        throw new Error("relevant cleanup lifecycle event exceeds bounded read limit");
      }
      try {
        event = JSON.parse(Buffer.concat(lineChunks, lineBytes).toString("utf8")) as Record<
          string,
          unknown
        >;
      } catch (error) {
        throw new Error(`malformed relevant cleanup lifecycle event: ${String(error)}`);
      }
      if (event.event !== identity.event) {
        throw new Error("relevant cleanup lifecycle event identity changed during decoding");
      }
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
