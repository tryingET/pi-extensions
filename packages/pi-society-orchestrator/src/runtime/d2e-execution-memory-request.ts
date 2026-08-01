/** Request and immutable-binary validation for Decision 100 consumption. */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  D2E_EXECUTION_MEMORY_OWNER,
  D2E_EXECUTION_MEMORY_TEMPLATE,
  D2EExecutionMemoryConsumerError,
  type D2EExecutionMemoryConsumerErrorCode,
  type D2EExecutionMemoryRequest,
  EXECUTION_MEMORY_PROFILE,
  GITHUB_BLOB,
  SHA256,
} from "./d2e-execution-memory-contract.ts";

export function fail(code: D2EExecutionMemoryConsumerErrorCode, message: string): never {
  throw new D2EExecutionMemoryConsumerError(code, message);
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("D2E_EXECUTION_MEMORY_ENVELOPE_INVALID", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function exactRecord(value: unknown, expectedKeys: readonly string[], label: string) {
  const result = record(value, label);
  const actual = Object.keys(result).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(
      "D2E_EXECUTION_MEMORY_ENVELOPE_INVALID",
      `${label} keys drifted: expected ${expected.join(",")}; got ${actual.join(",")}.`,
    );
  }
  return result;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    fail("D2E_EXECUTION_MEMORY_INPUT_INVALID", `${label} must be a positive safe integer.`);
  }
  return Number(value);
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    fail("D2E_EXECUTION_MEMORY_INPUT_INVALID", `${label} must be non-empty and already trimmed.`);
  }
  return value;
}

function normalizedDependencies(values: readonly string[], taskIds: readonly number[]) {
  const expectedIds = new Set(taskIds);
  const parsed = values.map((raw) => {
    const value = nonEmpty(raw, "expected dependency");
    const [idRaw, dependencyRaw, ...extra] = value.split(":");
    if (extra.length || dependencyRaw === undefined) {
      fail("D2E_EXECUTION_MEMORY_INPUT_INVALID", `Invalid dependency declaration: ${value}.`);
    }
    const taskId = integer(Number(idRaw), "dependency task id");
    if (!expectedIds.has(taskId)) {
      fail(
        "D2E_EXECUTION_MEMORY_INPUT_INVALID",
        `Dependency declaration task ${taskId} is outside expected task set.`,
      );
    }
    const dependsOn =
      dependencyRaw === "none"
        ? []
        : dependencyRaw.split(",").map((item) => integer(Number(item), "dependency id"));
    const sorted = [...new Set(dependsOn)].sort((left, right) => left - right);
    if (sorted.length !== dependsOn.length || sorted.some((id, index) => id !== dependsOn[index])) {
      fail(
        "D2E_EXECUTION_MEMORY_INPUT_INVALID",
        `Dependency declaration ${value} must be unique and sorted.`,
      );
    }
    return { raw: value, task_id: taskId, depends_on: sorted };
  });
  if (
    parsed.length !== taskIds.length ||
    new Set(parsed.map((row) => row.task_id)).size !== taskIds.length
  ) {
    fail(
      "D2E_EXECUTION_MEMORY_INPUT_INVALID",
      "Expected dependencies must contain exactly one declaration per expected task.",
    );
  }
  return parsed.sort((left, right) => left.task_id - right.task_id);
}

export function normalizeExecutionMemoryRequest(request: D2EExecutionMemoryRequest) {
  const mode = request.mode ?? "proposal";
  if (mode !== "proposal" && mode !== "applied") {
    fail("D2E_EXECUTION_MEMORY_INPUT_INVALID", "mode must be proposal or applied.");
  }
  const repo = nonEmpty(request.repo, "repo");
  if (!path.isAbsolute(repo)) {
    fail("D2E_EXECUTION_MEMORY_INPUT_INVALID", "repo must be an absolute canonical path.");
  }
  const expectedTaskIds = request.expectedTaskIds.map((id) => integer(id, "expected task id"));
  const sortedTaskIds = [...new Set(expectedTaskIds)].sort((left, right) => left - right);
  if (
    sortedTaskIds.length === 0 ||
    sortedTaskIds.length !== expectedTaskIds.length ||
    sortedTaskIds.some((id, index) => id !== expectedTaskIds[index])
  ) {
    fail(
      "D2E_EXECUTION_MEMORY_INPUT_INVALID",
      "expected task ids must be non-empty, unique, and sorted.",
    );
  }
  const dependencies = normalizedDependencies(request.expectedDependencies, sortedTaskIds);
  const packetSource = nonEmpty(request.packetSource, "packet source");
  if (!GITHUB_BLOB.test(packetSource)) {
    fail(
      "D2E_EXECUTION_MEMORY_INPUT_INVALID",
      "packet source must be an immutable 40-hex GitHub blob coordinate.",
    );
  }
  if (!SHA256.test(request.packetSourceSha256)) {
    fail("D2E_EXECUTION_MEMORY_INPUT_INVALID", "packet source SHA-256 must be lowercase hex.");
  }
  if (
    request.authorizationBlockRef !== undefined &&
    !nonEmpty(request.authorizationBlockRef, "authorization block ref")
  ) {
    fail("D2E_EXECUTION_MEMORY_INPUT_INVALID", "authorization block ref is invalid.");
  }
  const template = request.templateIdentity;
  if (
    template.templateName !== D2E_EXECUTION_MEMORY_TEMPLATE ||
    template.ownerCompany !== D2E_EXECUTION_MEMORY_OWNER ||
    template.artifactKind !== "procedure" ||
    template.controlMode !== "one_shot" ||
    template.formalizationLevel !== "workflow" ||
    !Number.isSafeInteger(template.templateId) ||
    template.templateId <= 0 ||
    !Number.isSafeInteger(template.templateVersion) ||
    template.templateVersion <= 0 ||
    !SHA256.test(template.contentSha256)
  ) {
    fail(
      "D2E_EXECUTION_MEMORY_TEMPLATE_IDENTITY_MISMATCH",
      "Execution-memory template identity or governed metadata drifted.",
    );
  }
  return {
    ...request,
    mode,
    repo,
    decisionId: integer(request.decisionId, "decision id"),
    packetId: integer(request.packetId, "packet id"),
    packetKey: nonEmpty(request.packetKey, "packet key"),
    packetSource,
    expectedTaskIds: sortedTaskIds,
    dependencies,
  };
}

export function validateExecutionMemoryBinary(binaryPath: string, expectedSha256: string) {
  if (!path.isAbsolute(binaryPath) || !SHA256.test(expectedSha256)) {
    fail(
      "D2E_EXECUTION_MEMORY_BINARY_IDENTITY_MISMATCH",
      "Configured AK binary path/hash are not exact.",
    );
  }
  let canonicalPath: string;
  let bytes: Buffer;
  let stat: fs.Stats;
  try {
    canonicalPath = fs.realpathSync(binaryPath);
    const descriptor = fs.openSync(canonicalPath, "r");
    try {
      stat = fs.fstatSync(descriptor);
      bytes = fs.readFileSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch (error) {
    fail(
      "D2E_EXECUTION_MEMORY_BINARY_IDENTITY_MISMATCH",
      `Configured AK binary is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const observed = createHash("sha256").update(bytes).digest("hex");
  if (!stat.isFile() || (stat.mode & 0o111) === 0) {
    fail(
      "D2E_EXECUTION_MEMORY_BINARY_IDENTITY_MISMATCH",
      "Configured AK binary is not one executable regular file.",
    );
  }
  if (observed !== expectedSha256) {
    fail(
      "D2E_EXECUTION_MEMORY_BINARY_IDENTITY_MISMATCH",
      `Configured AK binary hash mismatch: expected ${expectedSha256}; got ${observed}.`,
    );
  }
  return {
    path: canonicalPath,
    sha256: observed,
    fingerprint: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`,
  };
}

export function revalidateExecutionMemoryBinary(
  binary: ReturnType<typeof validateExecutionMemoryBinary>,
): void {
  const current = validateExecutionMemoryBinary(binary.path, binary.sha256);
  if (current.fingerprint !== binary.fingerprint) {
    fail(
      "D2E_EXECUTION_MEMORY_BINARY_IDENTITY_MISMATCH",
      "Configured AK binary identity changed during producer execution.",
    );
  }
}

export function buildExecutionMemoryArgs(request: NormalizedExecutionMemoryRequest): string[] {
  const args = [
    "decision",
    "execution-memory-check",
    String(request.decisionId),
    "--profile",
    EXECUTION_MEMORY_PROFILE,
    "--repo",
    request.repo,
    "--packet-id",
    String(request.packetId),
    "--packet-key",
    request.packetKey,
    "--packet-source",
    request.packetSource,
    "--packet-source-sha256",
    request.packetSourceSha256,
  ];
  for (const taskId of request.expectedTaskIds) args.push("--expect-task", String(taskId));
  for (const dependency of request.dependencies) {
    args.push("--expect-dependency", dependency.raw);
  }
  if (request.authorizationBlockRef) {
    args.push("--authorization-block-ref", request.authorizationBlockRef);
  }
  args.push("--machine");
  return args;
}

export type NormalizedExecutionMemoryRequest = ReturnType<typeof normalizeExecutionMemoryRequest>;
