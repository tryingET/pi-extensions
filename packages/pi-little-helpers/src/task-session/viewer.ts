import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attemptDirectory, findAttempt, readObservation, requestStop } from "./bridge.js";
import { parseJson, record, refuse } from "./json.js";
import { type Attempt, durableWrite, type Locator, privateRead } from "./state.js";
export function processStart(pid: number): string {
  if (!Number.isSafeInteger(pid) || pid < 1) refuse("viewer_pid_invalid");
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  if (["Z", "X"].includes(fields[0])) refuse("viewer_exited");
  return fields[19];
}
export function announceViewer(dir: string, attempt: Attempt, nonce: string): void {
  durableWrite(join(dir, "viewer-ready.json"), {
    schema: "pi.task-session.viewer-ready.v1",
    attempt: attempt.attempt,
    incarnation: attempt.incarnation,
    nonce,
    pid: process.pid,
    start: processStart(process.pid),
    at: Date.now(),
  });
}
export function assertViewerReady(dir: string, attempt: Attempt, nonce: string): void {
  const r = record(parseJson(privateRead(join(dir, "viewer-ready.json"))), [
    "schema",
    "attempt",
    "incarnation",
    "nonce",
    "pid",
    "start",
    "at",
  ]);
  if (
    r.schema !== "pi.task-session.viewer-ready.v1" ||
    r.attempt !== attempt.attempt ||
    r.incarnation !== attempt.incarnation ||
    r.nonce !== nonce ||
    !Number.isSafeInteger(r.at) ||
    r.at > Date.now() ||
    Date.now() - r.at > 2500 ||
    r.start !== processStart(r.pid)
  )
    refuse("viewer_not_ready");
}
export async function runViewer(
  locator: Locator,
  attemptId: string,
  render: (
    inspect: () => ReturnType<typeof readObservation>,
    stop: () => Promise<void>,
    quit: () => void,
  ) => () => void,
) {
  const attempt = findAttempt(locator, attemptId),
    dir = attemptDirectory(locator, attempt);
  const view = record(parseJson(privateRead(join(dir, "view.json"))), [
    "schema",
    "attempt",
    "incarnation",
    "nonce",
  ]);
  if (
    view.schema !== "pi.task-session.view.v1" ||
    view.attempt !== attempt.attempt ||
    view.incarnation !== attempt.incarnation ||
    typeof view.nonce !== "string" ||
    !/^[a-f0-9]{64}$/.test(view.nonce)
  )
    refuse("view_binding_invalid");
  let observation = readObservation(locator, attemptId),
    timer: ReturnType<typeof setInterval> | undefined;
  await new Promise<void>((resolve, reject) => {
    let close: () => void = () => {};
    const quit = () => {
      if (timer) clearInterval(timer);
      resolve();
    };
    try {
      close = render(
        () => {
          try {
            observation = readObservation(locator, attemptId);
            if (observation.phase === "active" && Date.now() - observation.observedAt > 2500)
              observation = {
                ...observation,
                phase: "UNAVAILABLE",
                denial: "host_heartbeat_stale",
              };
          } catch {
            observation = { ...observation, phase: "UNAVAILABLE", denial: "inspection_failed" };
          }
          return observation;
        },
        async () => requestStop(locator, attemptId),
        quit,
      );
      announceViewer(dir, attempt, view.nonce);
      timer = setInterval(() => {
        try {
          announceViewer(dir, attempt, view.nonce);
        } catch {
          clearInterval(timer);
          close();
          reject(new Error("viewer_publication_failed"));
        }
      }, 1000);
    } catch (error) {
      close();
      reject(error);
    }
  });
}
