/** Default-disabled Decision 100 execution-memory consumer. */

import { createHash } from "node:crypto";
import {
  D2E_EXECUTION_MEMORY_RECEIPT,
  D2EExecutionMemoryConsumerError,
  type D2EExecutionMemoryReceipt,
  type D2EExecutionMemoryRequest,
  EXECUTION_MEMORY_PAYLOAD_KIND,
  EXECUTION_MEMORY_PROFILE,
  EXECUTION_MEMORY_SURFACE,
  EXECUTION_MEMORY_TIMEOUT_MS,
} from "./d2e-execution-memory-contract.ts";
import { parseExecutionMemoryEnvelope } from "./d2e-execution-memory-parser.ts";
import {
  buildExecutionMemoryArgs,
  fail,
  normalizeExecutionMemoryRequest,
  validateExecutionMemoryBinary,
} from "./d2e-execution-memory-request.ts";
import type { D2ETransferExec } from "./d2e-transfer-contract.ts";

export * from "./d2e-execution-memory-contract.ts";

export async function consumeD2EExecutionMemory(options: {
  request: D2EExecutionMemoryRequest;
  activation?: "enabled" | "disabled";
  akBinaryPath: string;
  akBinarySha256: string;
  exec: D2ETransferExec;
  signal?: AbortSignal;
}): Promise<{ kind: "observation"; receipt: D2EExecutionMemoryReceipt }> {
  const activation = options.activation ?? "disabled";
  if (activation !== "enabled") {
    fail(
      "D2E_EXECUTION_MEMORY_DISABLED",
      "Decision 100 execution-memory consumption is disabled; no producer was invoked.",
    );
  }
  const request = normalizeExecutionMemoryRequest(options.request);
  if (request.mode !== "proposal") {
    fail(
      "D2E_EXECUTION_MEMORY_POSITIVE_AUTHORIZATION_UNSUPPORTED",
      "Decision 100 is negative-only and cannot perform applied execution.",
    );
  }
  const binary = validateExecutionMemoryBinary(options.akBinaryPath, options.akBinarySha256);
  let result: Awaited<ReturnType<D2ETransferExec>>;
  try {
    result = await options.exec(binary.path, buildExecutionMemoryArgs(request), {
      cwd: request.repo,
      signal: options.signal,
      timeout: EXECUTION_MEMORY_TIMEOUT_MS,
    });
  } catch (error) {
    throw new D2EExecutionMemoryConsumerError(
      "D2E_EXECUTION_MEMORY_TRANSPORT_FAILED",
      `Execution-memory producer transport failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (result.killed) {
    fail("D2E_EXECUTION_MEMORY_TRANSPORT_FAILED", "Execution-memory producer was killed.");
  }
  const parsed = parseExecutionMemoryEnvelope(result.stdout, result.code, request);
  const envelopeSha256 = createHash("sha256").update(result.stdout, "utf8").digest("hex");
  return {
    kind: "observation",
    receipt: {
      schema: D2E_EXECUTION_MEMORY_RECEIPT,
      lawful_success: true,
      read_only: true,
      execution_performed: false,
      status: "not_ready",
      mode: "proposal",
      applied: false,
      applied_ready: false,
      activation: "enabled",
      template: request.templateIdentity,
      producer: {
        surface: EXECUTION_MEMORY_SURFACE,
        envelope_schema_version: 1,
        payload_kind: EXECUTION_MEMORY_PAYLOAD_KIND,
        profile: EXECUTION_MEMORY_PROFILE,
        profile_schema_version: 1,
        binary_path: binary.path,
        binary_sha256: binary.sha256,
        envelope_sha256: envelopeSha256,
      },
      pre_execution_memory_ready: parsed.ready,
      result_state: parsed.resultState,
      authorization: {
        capability: parsed.authorization.capability,
        positive_proof_supported: false,
        state: parsed.authorization.state,
      },
      profile_health: { state: parsed.health.state },
      transfer_materialization_authorization: {
        disposition: "not_authorized",
        basis: "negative_only_execution_memory_profile",
      },
      downstream_implementation_authorization: {
        disposition: "not_authorized",
        granted: false,
        basis: "separate_downstream_owner_authorization_required",
      },
      effect: { disposition: "not_materialized" },
      observation: parsed.payload,
    },
  };
}
