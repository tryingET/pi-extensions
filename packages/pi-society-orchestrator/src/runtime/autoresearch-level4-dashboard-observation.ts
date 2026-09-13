// ---
// summary: "Best-effort non-authoritative dashboard snapshots of returned Level-4 results."
// read_when:
//   - "Changing the Level-4 dashboard observation export or consumer contract."
// ---

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { AutoresearchLevel4CampaignRunner } from "./autoresearch-level4-runner-types.ts";

export const LEVEL4_DASHBOARD_MAX_BYTES = 8 * 1024 * 1024;
const KIND = "autoresearch.level4_dashboard_observation.v1";

export interface Level4DashboardObservation {
  kind: typeof KIND;
  observedAt: string;
  taskId: number;
  cwd: string;
  objective: string;
  nonAuthority: true;
  execution: "not_executed_by_orchestrator";
  result: AutoresearchLevel4CampaignRunner;
}

export type Level4DashboardObservationExport =
  | { ok: true; path: string }
  | { ok: false; error: string };

function lstatIfPresent(file: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return undefined;
  }
}

function ensureDirectory(cwd: string): string {
  let directory = cwd;
  for (const part of [".autoresearch", "dashboard", "level4"]) {
    directory = path.join(directory, part);
    if (!lstatIfPresent(directory)) fs.mkdirSync(directory, { mode: 0o700 });
    if (!fs.lstatSync(directory).isDirectory()) {
      throw new Error("Dashboard directory must be a real directory, not a symlink.");
    }
  }
  return directory;
}

function checkReplacement(file: string, observation: Level4DashboardObservation): void {
  const stat = lstatIfPresent(file);
  if (!stat) return;
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > LEVEL4_DASHBOARD_MAX_BYTES) {
    throw new Error("Dashboard target must be a bounded regular single-link snapshot.");
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size) {
      throw new Error("Dashboard target changed during inspection.");
    }
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length !== stat.size) throw new Error("Dashboard target size changed during inspection.");
    const previous = JSON.parse(
      buffer.subarray(0, length).toString("utf8"),
    ) as Level4DashboardObservation;
    // Only replace our own identity-matched projection, never an unrelated file/journal.
    if (
      previous?.kind !== KIND ||
      previous.taskId !== observation.taskId ||
      previous.cwd !== observation.cwd ||
      previous.objective !== observation.objective ||
      previous.nonAuthority !== true ||
      previous.execution !== "not_executed_by_orchestrator"
    ) {
      throw new Error("Dashboard target is not an identity-matched observation.");
    }
  } finally {
    fs.closeSync(fd);
  }
}

function writeObservation(file: string, observation: Level4DashboardObservation, data: string) {
  const directory = ensureDirectory(observation.cwd);
  checkReplacement(file, observation);
  const temporary = path.join(directory, `.observation-${randomUUID()}.tmp`);
  const fd = fs.openSync(
    temporary,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      fs.writeFileSync(fd, data, "utf8");
      fs.fchmodSync(fd, 0o400);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // Synchronous rechecks narrow (but cannot eliminate) external parent-swap races.
    ensureDirectory(observation.cwd);
    checkReplacement(file, observation);
    fs.renameSync(temporary, file);
  } finally {
    // Only this invocation's exclusive scratch file; cleanup must not mask the result.
    try {
      fs.unlinkSync(temporary);
    } catch {}
  }
}

/** Export only: never dispatch, modify the owner result, or read observations as cursors. */
export async function observeAutoresearchLevel4Dashboard(
  result: AutoresearchLevel4CampaignRunner,
): Promise<{ observationExport: Level4DashboardObservationExport }> {
  try {
    if (!Number.isSafeInteger(result.taskId) || result.taskId <= 0) {
      throw new Error("Dashboard taskId must be a positive safe integer.");
    }
    if (typeof result.objective !== "string" || !result.objective.trim()) {
      throw new Error("Dashboard objective must be non-empty.");
    }
    if (typeof result.cwd !== "string" || !result.cwd.trim()) {
      throw new Error("Dashboard cwd must be non-empty.");
    }
    const cwd = fs.realpathSync(path.resolve(result.cwd));
    const digest = createHash("sha256").update(result.objective, "utf8").digest("hex");
    const file = path.join(
      cwd,
      ".autoresearch",
      "dashboard",
      "level4",
      `${result.taskId}-${digest}.json`,
    );
    if (path.resolve(result.receiptPath) === file) {
      throw new Error("Dashboard target cannot replace the owner receipt journal.");
    }
    const observation: Level4DashboardObservation = {
      kind: KIND,
      observedAt: new Date().toISOString(),
      taskId: result.taskId,
      cwd,
      objective: result.objective,
      nonAuthority: true,
      execution: "not_executed_by_orchestrator",
      result,
    };
    const data = `${JSON.stringify(observation)}\n`;
    if (Buffer.byteLength(data, "utf8") > LEVEL4_DASHBOARD_MAX_BYTES) {
      throw new Error(`Dashboard observation exceeds ${LEVEL4_DASHBOARD_MAX_BYTES} bytes.`);
    }
    await withFileMutationQueue(file, async () => writeObservation(file, observation, data));
    return { observationExport: { ok: true, path: file } };
  } catch (error) {
    return {
      observationExport: {
        ok: false,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 1024),
      },
    };
  }
}
