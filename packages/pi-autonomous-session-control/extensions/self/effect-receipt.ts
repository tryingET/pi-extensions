import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export type DispatchEffectDisposition = "settled" | "confirmed_no_effects" | "effect_indeterminate";

export interface DispatchEffectReceipt {
  schema: "asc.dispatch_effect_receipt.v1";
  dispatchId: string;
  attemptId: string;
  sessionName: string;
  disposition: DispatchEffectDisposition;
  recordedAt: string;
  receiptPath: string;
}

/** Persist ASC's owner-issued execution-effect attestation before exposing it to consumers. */
export function writeDispatchEffectReceipt(params: {
  sessionsDir: string;
  sessionName: string;
  dispatchId: string;
  attemptId: string;
  disposition: DispatchEffectDisposition;
}): DispatchEffectReceipt {
  const sessionsRoot = fs.realpathSync(params.sessionsDir);
  const safeSessionName = path.basename(params.sessionName);
  if (safeSessionName !== params.sessionName || !safeSessionName) {
    throw new Error("ASC effect receipt requires a safe session name.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(params.attemptId)) {
    throw new Error("ASC effect receipt requires a filename-safe attempt id.");
  }
  const receiptPath = path.join(
    sessionsRoot,
    `${safeSessionName}.${params.attemptId}.effect-receipt.json`,
  );
  const receipt: DispatchEffectReceipt = {
    schema: "asc.dispatch_effect_receipt.v1",
    dispatchId: params.dispatchId,
    attemptId: params.attemptId,
    sessionName: safeSessionName,
    disposition: params.disposition,
    recordedAt: new Date().toISOString(),
    receiptPath,
  };
  const temporaryPath = `${receiptPath}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    fs.writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, receiptPath);
    fs.unlinkSync(temporaryPath);
    fsyncDirectory(sessionsRoot);
    return receipt;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Publication or earlier cleanup already removed the private temporary file.
    }
  }
}

function fsyncDirectory(directory: string): void {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}
