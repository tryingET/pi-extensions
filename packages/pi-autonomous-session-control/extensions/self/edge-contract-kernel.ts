/**
 * Edge Contract Kernel (ECK)
 * Shared boundary contracts for natural-language and process-boundary tools.
 */

import { createMonotonicId } from "./resolvers/helpers.ts";

export interface InvariantCheck {
  id: string;
  check: boolean;
  message: string;
  level?: "error" | "warning";
}

export interface InvariantIssue {
  id: string;
  message: string;
  level: "error" | "warning";
}

export interface InvariantReport {
  ok: boolean;
  checked: number;
  issues: InvariantIssue[];
}

export function normalizeInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

export function normalizeString(
  value: unknown,
  options: { trim?: boolean; allowEmpty?: boolean; maxLength?: number } = {},
): string | undefined {
  if (typeof value !== "string") return undefined;

  const trim = options.trim !== false;
  let normalized = trim ? value.trim() : value;

  if (!options.allowEmpty && normalized.length === 0) {
    return undefined;
  }

  if (typeof options.maxLength === "number" && options.maxLength >= 0) {
    normalized = normalized.slice(0, options.maxLength);
    if (!options.allowEmpty && normalized.length === 0) {
      return undefined;
    }
  }

  return normalized;
}

export function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => typeof entry === "string");
}

export function normalizeNumber(
  value: unknown,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return undefined;
  }

  if (options.integer && !Number.isInteger(value)) {
    return undefined;
  }

  if (typeof options.min === "number" && value < options.min) {
    return undefined;
  }

  if (typeof options.max === "number" && value > options.max) {
    return undefined;
  }

  return value;
}

export function normalizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  const normalized = normalizeString(value);
  if (!normalized) return undefined;

  const lower = normalized.toLowerCase();
  return allowed.find((candidate) => candidate.toLowerCase() === lower);
}

export function assertInvariants(checks: InvariantCheck[]): InvariantReport {
  const issues = checks
    .filter((check) => !check.check)
    .map((check) => ({
      id: check.id,
      message: check.message,
      level: check.level ?? "error",
    }));

  return {
    ok: issues.length === 0,
    checked: checks.length,
    issues,
  };
}

export function shapeToolResult(options: {
  text: string;
  status: string;
  details?: Record<string, unknown>;
}): {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
} {
  return {
    content: [{ type: "text", text: options.text }],
    details: {
      ...(options.details || {}),
      status: options.status,
    },
  };
}

export function createEdgeMonotonicId(prefix: string): string {
  return createMonotonicId(prefix);
}
