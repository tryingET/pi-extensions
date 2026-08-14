// ---
// summary: "Pure shared utilities for autoresearch supervisor runtime modules: stable JSON hashing, JSON file reads, shell quoting, and small coercion helpers."
// read_when:
//   - "Changing shared pure helpers used across autoresearch supervisor runtime modules."
// ---

import { createHash } from "node:crypto";
import * as fs from "node:fs";
export function resolveStartCampaignPositiveIntegerBudget(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`${name} must be a positive integer, received: ${String(value)}`);
  }
  return resolved;
}

export function resolveStartCampaignPositiveNumberBudget(
  name: string,
  value: number | undefined,
  fallback: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`${name} must be a positive number, received: ${String(value)}`);
  }
  return resolved;
}

export function metricStatus(value: number): "target_met" | "blocked" {
  return value === 0 ? "target_met" : "blocked";
}

export function readJsonFile(pathToRead: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(pathToRead, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read JSON file ${pathToRead}: ${message}`);
  }
}

export function nonEmptyStrings(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

export function formatToolCall(name: string, payload: Record<string, unknown>): string {
  return `${name}(${JSON.stringify(payload, null, 2)})`;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256StableJson(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function stringArrayFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}

export function optionalJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function exactStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
