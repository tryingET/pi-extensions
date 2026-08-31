// ---
// summary: write-once dispatch receipts binding exact-task standing-agent dispatch facts with canonical digests.
// read_when:
//   - changing receipt identity, immutability mechanics, or verification semantics.
// ---

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DISPATCH_RECEIPT_SCHEMA } from "./dispatch-contract.ts";

/** Minimal registry-owned agent-dir resolution for the receipts home (honors PI_CODING_AGENT_DIR). */
function resolvePiAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR?.trim();
  if (configured) {
    return configured === "~" ? homedir() : configured;
  }
  return join(homedir(), ".pi", "agent");
}

export const DISPATCH_RECEIPTS_DIR_ENV = "PI_AGENT_REGISTRY_DISPATCH_RECEIPTS_DIR";

export class DispatchReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchReceiptError";
  }
}

export interface DispatchReceipt {
  schema: typeof DISPATCH_RECEIPT_SCHEMA;
  phase: "fleet_phase_2";
  agent: {
    name: string;
    role?: string;
    creation_task?: string;
    tools: string[];
    thinking: string;
    model: string | null;
    skillProfile?: string;
    loadedSkills: string[];
    manifestSha256: string;
    manifestBlobOid: string;
    systemPromptSha256: string;
    agentRepo: {
      commit: string;
      treeOid: string;
      status: "clean_observed";
      statusSha256: string;
      revisionStable: boolean;
    };
  };
  task: {
    id: number;
    repo: string;
    title: string;
    status: string;
    claimedBy: string;
    leaseExpiresAt: string | null;
  };
  dispatch: {
    attemptIndex: number;
    settlement: "settled" | "not_settled";
    objective: string;
    objectiveSha256: string;
    mutationPolicy: "read_only";
    allowedPaths: string[];
    forbiddenPaths: string[];
    effectCorrelationId: string;
    executionTimeoutSeconds: number;
    startupTimeoutSeconds: number;
    asc: {
      dispatchId: string;
      attemptId: string;
      sessionName: string;
      sessionFile: string;
      status: string;
      exitCode?: number;
      effectDisposition: string;
      effectReceiptPath?: string;
      requestedModel?: string;
      effectiveModel?: string;
      usage?: Record<string, unknown>;
    };
    outputSha256: string;
    outputChars: number;
  };
  observation: {
    parentRepoRoot: string;
    parentHead: string;
    preStatusSha256: string;
    postStatusSha256: string;
    headStable: boolean;
    noMutationObserved: boolean;
    boundary: string;
  };
  recordedAt: string;
  receiptSha256: string;
}

/** Deterministic JSON serialization: sorted code-point keys, no ambient whitespace. */
export function canonicalJsonString(value: unknown): string {
  const serialize = (input: unknown): string => {
    if (input === null || typeof input !== "object") {
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) {
      return `[${input.map(serialize).join(",")}]`;
    }
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${serialize(v)}`).join(",")}}`;
  };
  return serialize(value);
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Digest of the receipt over its canonical form without the `receiptSha256` field. */
export function computeDispatchReceiptSha256(
  receipt: Omit<DispatchReceipt, "receiptSha256">,
): string {
  const { receiptSha256: _omitted, ...rest } = receipt as DispatchReceipt;
  return sha256Hex(canonicalJsonString(rest));
}

export function dispatchReceiptFileName(agent: string, task: number, attemptIndex: number): string {
  if (!Number.isInteger(attemptIndex) || attemptIndex < 1 || attemptIndex > 99) {
    throw new DispatchReceiptError("dispatch receipt attempt index must be 1..99");
  }
  return `ak-${task}.${agent}.${String(attemptIndex).padStart(2, "0")}.dispatch-receipt.json`;
}

export function attemptIndexFromReceiptFileName(name: string): number | undefined {
  const match = /^ak-\d+\.[A-Za-z0-9._-]+\.(\d{2})\.dispatch-receipt\.json$/u.exec(name);
  if (!match) return undefined;
  const index = Number(match[1]);
  return index >= 1 && index <= 99 ? index : undefined;
}

export function resolveDispatchReceiptsDir(explicit?: string): string {
  const configured = explicit ?? process.env[DISPATCH_RECEIPTS_DIR_ENV]?.trim();
  if (configured) {
    return configured;
  }
  return join(resolvePiAgentDir(), "dispatch-receipts");
}

/** Build one receipt input from explicit pipeline facts (phase/stamp included). */
export function buildDispatchReceiptInput(facts: {
  agent: DispatchReceipt["agent"];
  task: DispatchReceipt["task"];
  dispatch: DispatchReceipt["dispatch"];
  observation: DispatchReceipt["observation"];
  recordedAt: string;
}): Omit<DispatchReceipt, "receiptSha256"> {
  return {
    schema: DISPATCH_RECEIPT_SCHEMA,
    phase: "fleet_phase_2",
    agent: facts.agent,
    task: facts.task,
    dispatch: facts.dispatch,
    observation: facts.observation,
    recordedAt: facts.recordedAt,
  };
}

export interface WrittenDispatchReceipt {
  receipt: DispatchReceipt;
  receiptPath: string;
  receiptSha256: string;
  bytes: number;
}

/**
 * Publish one immutable receipt: canonical bytes, private temporary file,
 * hard-link publication (O_EXCL-equivalent), read-only final mode, and a
 * verified re-read. Any pre-existing receipt for the same (agent, task)
 * fails closed with the existing digest so one pair can never be re-spent.
 */
export async function writeImmutableDispatchReceipt(
  receiptInput: Omit<DispatchReceipt, "receiptSha256">,
  options?: { dir?: string },
): Promise<WrittenDispatchReceipt> {
  const receipt: DispatchReceipt = {
    ...receiptInput,
    receiptSha256: computeDispatchReceiptSha256(receiptInput),
  };
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
  const configuredDir = resolveDispatchReceiptsDir(options?.dir);
  const dir = await realpath(configuredDir).catch(async () => {
    await mkdir(configuredDir, { recursive: true });
    return realpath(configuredDir);
  });
  const receiptPath = join(
    dir,
    dispatchReceiptFileName(receipt.agent.name, receipt.task.id, receipt.dispatch.attemptIndex),
  );
  if (basename(receiptPath) !== receiptPath.split("/").pop()) {
    throw new DispatchReceiptError("dispatch receipt requires a safe file name");
  }
  if (fs.existsSync(receiptPath)) {
    const existing = await readDispatchReceipt(receiptPath);
    throw new DispatchReceiptError(
      existing && existing.receiptSha256 === receipt.receiptSha256
        ? `dispatch receipt already recorded for ak-${receipt.task.id}/${receipt.agent.name} (sha256 ${existing.receiptSha256})`
        : `dispatch receipt collision for ak-${receipt.task.id}/${receipt.agent.name}`,
    );
  }
  const temporaryPath = `${receiptPath}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    fs.writeFileSync(descriptor, bytes, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, receiptPath);
    fs.unlinkSync(temporaryPath);
    fs.chmodSync(receiptPath, 0o400);
    const dirDescriptor = fs.openSync(dir, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(dirDescriptor);
    } finally {
      fs.closeSync(dirDescriptor);
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Publication or earlier cleanup already removed the private temporary file.
    }
  }
  const verified = await readDispatchReceipt(receiptPath);
  if (!verified || verified.receiptSha256 !== receipt.receiptSha256) {
    throw new DispatchReceiptError("published dispatch receipt failed verification");
  }
  return {
    receipt: verified,
    receiptPath,
    receiptSha256: verified.receiptSha256,
    bytes: Buffer.byteLength(bytes, "utf8"),
  };
}

export async function readDispatchReceipt(
  receiptPath: string,
): Promise<DispatchReceipt | undefined> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(receiptPath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: DispatchReceipt;
  try {
    parsed = JSON.parse(raw) as DispatchReceipt;
  } catch {
    return undefined;
  }
  if (parsed.schema !== DISPATCH_RECEIPT_SCHEMA) {
    return undefined;
  }
  if (computeDispatchReceiptSha256(parsed) !== parsed.receiptSha256) {
    return undefined;
  }
  return parsed;
}

export interface DispatchAttemptLedger {
  attempts: Array<{ receipt: DispatchReceipt; receiptPath: string; attemptIndex: number }>;
  settled?: { receipt: DispatchReceipt; receiptPath: string };
  nextAttemptIndex: number;
}

/** Enumerate one (agent, exact task) pair's immutable attempt receipts. */
export async function readDispatchAttemptLedger(
  agent: string,
  task: number,
  options?: { dir?: string },
): Promise<DispatchAttemptLedger> {
  const dir = resolveDispatchReceiptsDir(options?.dir);
  let names: string[] = [];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return { attempts: [], nextAttemptIndex: 1 };
  }
  const attempts: DispatchAttemptLedger["attempts"] = [];
  for (const name of names) {
    const attemptIndex = attemptIndexFromReceiptFileName(name);
    if (attemptIndex === undefined) continue;
    if (name !== dispatchReceiptFileName(agent, task, attemptIndex)) continue;
    const receipt = await readDispatchReceipt(join(dir, name));
    if (receipt && receipt.agent.name === agent && receipt.task.id === task) {
      if (receipt.dispatch.attemptIndex !== attemptIndex) {
        throw new DispatchReceiptError(
          `dispatch receipt file name ${name} disagrees with its recorded attempt index ${receipt.dispatch.attemptIndex}`,
        );
      }
      attempts.push({ receipt, receiptPath: join(dir, name), attemptIndex });
    } else if (receipt) {
      throw new DispatchReceiptError(
        `dispatch receipt file name ${name} carries a different (agent, task) pair than its contents record`,
      );
    }
  }
  attempts.sort((a, b) => a.attemptIndex - b.attemptIndex);
  const settled = attempts.find((entry) => entry.receipt.dispatch.settlement === "settled");
  const maxIndex = attempts.length > 0 ? attempts[attempts.length - 1].attemptIndex : 0;
  return {
    attempts,
    ...(settled ? { settled } : {}),
    nextAttemptIndex: maxIndex + 1,
  };
}
