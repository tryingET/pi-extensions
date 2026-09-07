import { join } from "node:path";
import { digest, id, parseJson, record, refuse } from "./json.js";
import {
  type Attempt,
  durableWrite,
  type Locator,
  privatePath,
  privateRead,
  readSnapshot,
} from "./state.js";
export function attemptDirectory(locator: Locator, attempt: Attempt): string {
  id(attempt.attempt);
  id(attempt.incarnation);
  const base = join(locator.root, "attempts");
  privatePath(base, true);
  const dir = join(base, attempt.attempt);
  privatePath(dir, true);
  const leaf = join(dir, attempt.incarnation);
  privatePath(leaf, true);
  return leaf;
}
export function findAttempt(locator: Locator, attemptId: string): Attempt {
  id(attemptId);
  const attempt = readSnapshot(locator).attempts.find((a) => a.attempt === attemptId);
  if (!attempt) refuse("attempt_unknown");
  return attempt;
}
export function readObservation(locator: Locator, attemptId: string) {
  const attempt = findAttempt(locator, attemptId),
    dir = attemptDirectory(locator, attempt);
  const o = record(parseJson(privateRead(join(dir, "observation.json"))), [
    "schema",
    "attempt",
    "incarnation",
    "sequence",
    "observedAt",
    "identity",
    "phase",
    "denial",
    "events",
  ]);
  if (
    o.schema !== "pi.task-session.observation.v1" ||
    o.attempt !== attemptId ||
    o.incarnation !== attempt.incarnation ||
    !Number.isSafeInteger(o.sequence) ||
    !Number.isSafeInteger(o.observedAt) ||
    !Array.isArray(o.events) ||
    o.events.length > 4096 ||
    typeof o.phase !== "string" ||
    !(o.denial === null || typeof o.denial === "string")
  )
    refuse("observation_invalid");
  if (
    !o.identity ||
    typeof o.identity !== "object" ||
    Object.values(o.identity).some((v) => typeof v !== "string")
  )
    refuse("observation_invalid");
  return structuredClone(o) as {
    identity: Record<string, string>;
    phase: string;
    denial: string | null;
    events: Record<string, unknown>[];
    sequence: number;
    observedAt: number;
  };
}
export function requestStop(locator: Locator, attemptId: string): void {
  const attempt = findAttempt(locator, attemptId),
    dir = attemptDirectory(locator, attempt);
  const value = {
    schema: "pi.task-session.stop.v1",
    attempt: attempt.attempt,
    incarnation: attempt.incarnation,
  };
  try {
    durableWrite(join(dir, "stop.json"), value, true);
  } catch (error) {
    // Idempotent repeated stop is the only tolerated existing file. No alternate control messages.
    if (
      (error as NodeJS.ErrnoException).code !== "EEXIST" ||
      digest(parseJson(privateRead(join(dir, "stop.json")))) !== digest(value)
    )
      throw error;
  }
}
export function assertNotStopped(dir: string, attempt: Attempt): void {
  try {
    const value = parseJson(privateRead(join(dir, "stop.json")));
    const expected = {
      schema: "pi.task-session.stop.v1",
      attempt: attempt.attempt,
      incarnation: attempt.incarnation,
    };
    if (digest(value) !== digest(expected)) refuse("control_invalid");
    refuse("operator_stop");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export function writeObservation(
  dir: string,
  attempt: Attempt,
  sequence: number,
  o: { identity: unknown; phase: string; denial: string | null; events: unknown[] },
) {
  durableWrite(join(dir, "observation.json"), {
    schema: "pi.task-session.observation.v1",
    attempt: attempt.attempt,
    incarnation: attempt.incarnation,
    sequence,
    observedAt: Date.now(),
    identity: o.identity,
    phase: o.phase,
    denial: o.denial,
    events: o.events,
  });
}
