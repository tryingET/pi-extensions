import type { WireMessage } from "./channel.js";
export declare function interpretTaskSessionMessage(value: unknown): WireMessage;
export declare function requireTaskSessionProducer(
  data?: unknown,
  expected?: unknown,
): ProducerBindings;

export declare function encodeTaskSessionStartup(input: unknown): unknown;

export declare function interpretTaskSessionPlan(data: unknown): unknown;

export interface ProducerBindings {
  policy_path: string;
  policy_sha256: string;
  policy_generation: string;
  ordinary_binary: { path: string; sha256: string; commit: string };
  worker: {
    path: string;
    sha256: string;
    commit: string;
    abi: string;
    manifest_path: string;
    manifest_sha256: string;
  };
  gate_path: string;
  gate_sha256: string;
  binding_sha256: string;
  deployment_schema_sha256: string;
  protocol_sha256: string;
  supervisor_sha256: string;
  host_sha256: string;
  host_build_digest: string;
  database_selector_digest: string;
  recovery_invariant_digest: string;
}
export interface ProducerDescriptor {
  schema: string;
  platform: string;
  state: string;
  reason: string;
  operations: string[];
  authority: false;
  database_opened: false;
  database_locked: false;
  bindings: ProducerBindings | null;
  worker_test_support: boolean | null;
}

export declare function interpretTaskSessionBindings(data: unknown): ProducerBindings;
export declare function interpretTaskSessionDescriptor(data: unknown): ProducerDescriptor;
export declare function interpretTaskSessionOwnerPlan(
  data: unknown,
  expected: ProducerBindings,
): { baseline: unknown; databaseIdentity: string };

export declare const taskSessionAdapterIdentity: {
  producerSchemaDigest: string;
  deploymentSchemaDigest: string;
  configurationRequired: true;
};
