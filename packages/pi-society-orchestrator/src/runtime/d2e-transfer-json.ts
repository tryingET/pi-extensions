/** Canonical JSON and digest helpers shared by the D2E gate. */

import * as crypto from "node:crypto";
import {
  type D2EFailureBoundary,
  D2ETransferError,
  type D2ETransferErrorCode,
  type JsonRecord,
} from "./d2e-transfer-contract.ts";

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("value is not canonical JSON");
  }
  const object = value as JsonRecord;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function digest(value: unknown): string {
  return sha256(canonicalize(value));
}

export function record(
  value: unknown,
  code: D2ETransferErrorCode,
  label: string,
  failureBoundary?: D2EFailureBoundary,
): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new D2ETransferError(code, `${label} readback is not a JSON object.`, {
      failureBoundary,
    });
  }
  return value as JsonRecord;
}

export function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
