// ---
// summary: write-once Fleet Phase-3 visible standing-agent launch receipts with canonical digests.
// read_when:
//   - changing visible-launch receipt identity, immutability mechanics, or verification semantics.
// ---

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AkTaskSnapshot } from "./dispatch-contract.ts";
import { canonicalJsonString, sha256Hex } from "./dispatch-receipt.ts";
import type { TrustedVisibleLaunchBootstrap } from "./visible-launch-bootstrap.ts";
import { VISIBLE_LAUNCH_RECEIPT_SCHEMA } from "./visible-launch-contract.ts";

/** Minimal registry-owned agent-dir resolution for the receipts home (honors PI_CODING_AGENT_DIR). */
function resolvePiAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR?.trim();
  if (configured) {
    return configured === "~" ? homedir() : configured;
  }
  return join(homedir(), ".pi", "agent");
}

export const VISIBLE_LAUNCH_RECEIPTS_DIR_ENV = "PI_AGENT_REGISTRY_VISIBLE_LAUNCH_RECEIPTS_DIR";

export class VisibleLaunchReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisibleLaunchReceiptError";
  }
}

export interface VisibleLaunchReceipt {
  schema: typeof VISIBLE_LAUNCH_RECEIPT_SCHEMA;
  phase: "fleet_phase_3";
  agent: {
    name: string;
    role?: string;
    creation_task?: string;
    declaredTools: string[];
    effectiveTools: string[];
    thinking: string;
    model: string | null;
    skillProfile?: string;
    loadedSkills: string[];
    manifestSha256: string;
    manifestBlobOid: string;
    systemPromptSha256: string;
    systemPromptBlobOid: string;
    composedSystemPromptSha256: string;
    agentRepo: {
      commit: string;
      treeOid: string;
      statusSha256: string;
    };
  };
  task: AkTaskSnapshot;
  bootstrap: TrustedVisibleLaunchBootstrap["bindings"];
  observation: {
    agentRevisionStable: boolean;
    originRevisionStable: boolean;
    bootstrapStable: boolean;
    inputsStable: boolean;
    parentRepoRoot: string;
    parentCommit: string;
    parentStatusSha256: string;
    boundary: string;
  };
  launch: {
    runId: string;
    sessionMode: "clean";
    objective: string;
    mutationPolicy: "read_only";
    composedArgvSha256: string;
    admission: "transport_admitted" | "not_admitted" | "unproven";
    sessionStarted: "unproven";
    ack: "unproven";
    taskCompletion: "unproven";
    objectiveSha256: string;
    reportBack: "intercom" | "manual" | "none";
    parentPeerTarget?: string;
    cwd: string;
    title: string;
    promptSha256: string;
    argvFlags: string[];
    argvCount: number;
    skillDirCount: number;
  };
  transport: {
    owner: "pi-little-helpers";
    launchMode: string;
    effectDisposition: string;
    ok: boolean;
    failure?: string;
    launchNote?: string;
  };
  recordedAt: string;
  receiptSha256: string;
}

/** Digest of the receipt over its canonical form without the `receiptSha256` field. */
export function computeVisibleLaunchReceiptSha256(
  receipt: Omit<VisibleLaunchReceipt, "receiptSha256">,
): string {
  const { receiptSha256: _omitted, ...rest } = receipt as VisibleLaunchReceipt;
  return sha256Hex(canonicalJsonString(rest));
}

export function validateVisibleLaunchIdentity(agent: string, runId: string): void {
  if (
    !/^[a-z][a-z0-9-]{0,63}$/u.test(agent) ||
    !/^standingagent-[a-z0-9]{1,32}-[a-f0-9]{8}$/u.test(runId)
  ) {
    throw new VisibleLaunchReceiptError("Invalid visible launch agent/run identity");
  }
}

export function visibleLaunchReceiptFileName(agent: string, stamp: string, nonce: string): string {
  if (
    !/^[a-z][a-z0-9-]{0,63}$/u.test(agent) ||
    !/^\d{8}T\d{6}Z$/u.test(stamp) ||
    !/^[a-f0-9]{8}$/u.test(nonce)
  ) {
    throw new VisibleLaunchReceiptError("Unsafe visible launch receipt filename");
  }
  return `visible-${agent}.${stamp}.${nonce}.launch-receipt.json`;
}

/** UTC compact stamp (yyyymmddThhmmssZ) for receipt file names. */
export function visibleLaunchStamp(date = new Date()): string {
  return `${date.toISOString().replaceAll(/[-:]/gu, "").split(".")[0]}Z`;
}

export function resolveVisibleLaunchReceiptsDir(explicit?: string): string {
  const configured = explicit ?? process.env[VISIBLE_LAUNCH_RECEIPTS_DIR_ENV]?.trim();
  if (configured) {
    return configured;
  }
  return join(resolvePiAgentDir(), "visible-launch-receipts");
}

export interface WrittenVisibleLaunchReceipt {
  receipt: VisibleLaunchReceipt;
  receiptPath: string;
  receiptSha256: string;
  bytes: number;
}

/** Build one receipt input from explicit pipeline facts (schema/phase included). */
export function buildVisibleLaunchReceiptInput(facts: {
  agent: VisibleLaunchReceipt["agent"];
  task: VisibleLaunchReceipt["task"];
  bootstrap: VisibleLaunchReceipt["bootstrap"];
  observation: VisibleLaunchReceipt["observation"];
  launch: VisibleLaunchReceipt["launch"];
  transport: VisibleLaunchReceipt["transport"];
  recordedAt: string;
}): Omit<VisibleLaunchReceipt, "receiptSha256"> {
  return {
    schema: VISIBLE_LAUNCH_RECEIPT_SCHEMA,
    phase: "fleet_phase_3",
    agent: facts.agent,
    task: facts.task,
    bootstrap: facts.bootstrap,
    observation: facts.observation,
    launch: facts.launch,
    transport: facts.transport,
    recordedAt: facts.recordedAt,
  };
}

/**
 * Publish one immutable append-only launch receipt: canonical bytes, private
 * temporary file, hard-link publication (O_EXCL-equivalent), read-only final
 * mode, and a verified re-read. Pair reservations precede transport and are
 * separate from receipts: an unresolved reservation blocks all automatic retries.
 */
export async function writeImmutableVisibleLaunchReceipt(
  receiptInput: Omit<VisibleLaunchReceipt, "receiptSha256">,
  options?: { dir?: string },
): Promise<WrittenVisibleLaunchReceipt> {
  validateVisibleLaunchIdentity(receiptInput.agent.name, receiptInput.launch.runId);
  const receipt: VisibleLaunchReceipt = {
    ...receiptInput,
    receiptSha256: computeVisibleLaunchReceiptSha256(receiptInput),
  };
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
  const configuredDir = resolveVisibleLaunchReceiptsDir(options?.dir);
  const dir = await realpath(configuredDir).catch(async () => {
    await mkdir(configuredDir, { recursive: true });
    return realpath(configuredDir);
  });
  const receiptPath = join(
    dir,
    visibleLaunchReceiptFileName(
      receipt.agent.name,
      visibleLaunchStamp(new Date(receipt.recordedAt)),
      randomUUID().slice(0, 8),
    ),
  );
  if (fs.existsSync(receiptPath)) {
    throw new VisibleLaunchReceiptError(
      `visible launch receipt name collision for ${receipt.launch.runId}`,
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
  const verified = await readVisibleLaunchReceipt(receiptPath);
  if (!verified || verified.receiptSha256 !== receipt.receiptSha256) {
    throw new VisibleLaunchReceiptError("published visible launch receipt failed verification");
  }
  return {
    receipt: verified,
    receiptPath,
    receiptSha256: verified.receiptSha256,
    bytes: Buffer.byteLength(bytes, "utf8"),
  };
}

export async function readVisibleLaunchReceipt(
  receiptPath: string,
): Promise<VisibleLaunchReceipt | undefined> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(receiptPath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: VisibleLaunchReceipt;
  try {
    parsed = JSON.parse(raw) as VisibleLaunchReceipt;
  } catch {
    return undefined;
  }
  if (!parsed || parsed.schema !== VISIBLE_LAUNCH_RECEIPT_SCHEMA) {
    return undefined;
  }
  try {
    validateVisibleLaunchIdentity(parsed.agent.name, parsed.launch.runId);
  } catch {
    return undefined;
  }
  if (computeVisibleLaunchReceiptSha256(parsed) !== parsed.receiptSha256) {
    return undefined;
  }
  return parsed;
}
