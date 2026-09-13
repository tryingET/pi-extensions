// ---
// summary: "Level-4 plan observations: identity-bound cursor hints, never effect receipts."
// read_when:
//   - "Changing Level-4 resume validation or migrating unsafe legacy receipts."
// ---

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AutoresearchLevel4CampaignRunnerReceipt,
  AutoresearchLevel4CampaignRunnerRequest,
} from "./autoresearch-level4-runner-types.ts";

export function level4Digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function level4RequestDigest(input: AutoresearchLevel4CampaignRunnerRequest): string {
  return level4Digest([
    input.taskId,
    path.resolve(input.cwd),
    input.objective,
    input.direction,
    input.metricName,
    input.metricThreshold,
    input.scenarios,
    input.hypotheses,
    input.candidateCountPerCell,
    input.filesInScope,
    input.offLimits,
    input.constraints,
    input.parentPeerTarget,
    input.runnerManifestPath,
    input.candidateBindings,
    input.maxIterationsPerCandidate,
    input.maxWallClockMinutesPerCandidate,
  ]);
}

export function resolveLevel4ReceiptPath(input: AutoresearchLevel4CampaignRunnerRequest): string {
  const cwd = fs.realpathSync(input.cwd);
  const file = path.resolve(
    cwd,
    input.level4ReceiptPath ?? ".autoresearch/level4-campaign-runner-receipts.jsonl",
  );
  const relative = path.relative(cwd, file);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("level4ReceiptPath must stay under cwd.");
  }
  // Reject symlink components, including dangling links, before reading or writing.
  let current = cwd;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Error("level4ReceiptPath cannot traverse symlinks.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return file;
}

export function loadLevel4Receipts(
  file: string,
  requestDigest: string,
  actionPlanDigest: string,
  actions: readonly string[],
): AutoresearchLevel4CampaignRunnerReceipt[] {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024)
    throw new Error("Invalid or oversized Level-4 receipt journal.");
  const text = fs.readFileSync(file, "utf8");
  if (text && !text.endsWith("\n"))
    throw new Error("Torn Level-4 receipt journal; owner reconciliation required.");
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const row = JSON.parse(line) as AutoresearchLevel4CampaignRunnerReceipt | null;
      if (
        !row ||
        row.kind !== "autoresearch.level4_campaign_runner_receipt.v2" ||
        row.requestDigest !== requestDigest ||
        row.actionPlanDigest !== actionPlanDigest ||
        row.effectStatus !== "not_dispatched" ||
        ![
          "awaiting_external_controller",
          "blocked_dangerous_gate",
          "controller_cursor_recorded",
        ].includes(row.disposition) ||
        (row.disposition === "controller_cursor_recorded") !==
          (row.actionIndex === actions.length) ||
        !Number.isInteger(row.actionIndex) ||
        row.actionIndex < 0 ||
        row.actionIndex > actions.length ||
        row.call !== (actions[row.actionIndex] ?? "") ||
        typeof row.call !== "string" ||
        !Number.isFinite(row.observedAtEpochMs) ||
        row.observedAtEpochMs <= 0 ||
        typeof row.summary !== "string" ||
        row.receiptId !==
          level4Digest([
            requestDigest,
            actionPlanDigest,
            row.actionIndex,
            row.call,
            row.disposition,
          ])
      ) {
        throw new Error(
          "Invalid/legacy Level-4 receipt or request identity/action plan drift; owner reconciliation required. Do not replay effects.",
        );
      }
      return row;
    });
}

export function appendLevel4Receipt(
  file: string,
  receipt: AutoresearchLevel4CampaignRunnerReceipt,
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(receipt)}\n`, { flag: "a", flush: true });
}
