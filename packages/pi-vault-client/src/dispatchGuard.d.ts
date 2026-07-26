import type {
  DispatchAggregateIdentity,
  DispatchAuthorizationV1,
  ExecutionSurface,
  VaultDispatchRuntime,
} from "./dispatchRuntime.d.js";
import type { ExecutionBinding, Template } from "./vaultTypes.d.js";

// The explicit .d.js targets keep NodeNext consumers inside the declaration island.
export interface GuardPreparedTextRequest {
  templates: Template[];
  primaryTemplateName: string;
  preparedText: string;
  surface: ExecutionSurface;
  currentCompany: string;
  compositionKind?: "single" | "grounding" | "route" | "batch";
  renderer?: string;
  rendererVersion?: string;
  wrapper?: string;
  context?: string;
  args?: string[];
}
export type GuardPreparedTextResult =
  | { ok: true; text: string; authorizationId: string }
  | { ok: false; error: string; authorization: DispatchAuthorizationV1 };
export declare function guardPreparedText(
  request: GuardPreparedTextRequest,
  runtime: VaultDispatchRuntime,
): GuardPreparedTextResult;
export interface DurableAuthorizationReceipt {
  schema: "pi.vault.dispatch-handoff.v1";
  handoffId: string;
  authorizationId: string;
  aggregate: DispatchAggregateIdentity;
  registryId: string;
  surface: ExecutionSurface;
  intendedExecutor: string;
  persistedAt: string;
}
export interface DispatchHandoffStore {
  readonly filePath: string;
}
export declare function createDispatchHandoffStore(options?: {
  filePath?: string;
}): DispatchHandoffStore;
export interface DispatchHandoffStoreReadiness {
  ok: boolean;
  filePath: string;
  error?: string;
}
export declare function probeDispatchHandoffStoreReadiness(
  store: DispatchHandoffStore,
): DispatchHandoffStoreReadiness;
export interface DispatchActivationPolicy {
  readonly mode: "enabled" | "disable_gated_dispatch";
  readonly enabled: boolean;
}
export declare function createDispatchActivationPolicy(enabled: boolean): DispatchActivationPolicy;
export interface DispatchExecutorResult {
  accepted: boolean;
  handoffId: string;
  runId?: string;
  status?: string;
}
export declare function dispatchAuthorizedExecution(options: {
  runtime: VaultDispatchRuntime;
  authorizationId: string;
  intendedExecutor: ExecutionBinding["execution_surface"];
  activation: DispatchActivationPolicy;
  receiptStore: DispatchHandoffStore;
  execute: (input: {
    handoffId: string;
    authorizationId: string;
    sealedText: string;
    binding: Readonly<ExecutionBinding>;
  }) => Promise<DispatchExecutorResult>;
}): Promise<
  | { ok: true; handoffId: string; result: DispatchExecutorResult }
  | { ok: false; error: string; handoffId?: string }
>;
