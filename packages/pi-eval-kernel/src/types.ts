import type { PiToolResult, PiToolUpdateCallback } from "./pi-api.ts";

export type CodeModeLanguage = "javascript" | "python";

/**
 * Kernel engine selection.
 * - "disposable" (default): a fresh worker per eval with host-persisted state.
 * - "persistent": one long-lived worker whose state lives in-process (Wave 1A,
 *   Python only). The host never sends or reads back state.
 */
export type CodeModeEngine = "persistent" | "disposable";

export type CapabilityEffect = "read" | "write" | "process" | "network" | "orchestration";

export interface CapabilityCatalogEntry {
  name: string;
  description: string;
  effect: CapabilityEffect;
}

export interface CapabilityInvocationContext {
  cwd: string;
  signal?: AbortSignal;
  allowedEffects: ReadonlySet<CapabilityEffect>;
}

export interface CodeModeCapability<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  effect: CapabilityEffect;
  execute(input: TInput, context: CapabilityInvocationContext): Promise<TOutput> | TOutput;
}

export interface KernelCapabilityInvocation {
  name: string;
  effect: CapabilityEffect | "unknown";
  elapsedMs: number;
  ok: boolean;
}

export interface KernelRunRequest {
  code: string;
  cwd: string;
  timeoutMs: number;
  outputLimitBytes: number;
  allowedEffects: ReadonlySet<CapabilityEffect>;
  signal?: AbortSignal;
  onUpdate?: PiToolUpdateCallback<EvalToolDetails>;
}

export interface KernelRunResult {
  language: CodeModeLanguage;
  value: unknown;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  capabilityInvocations: KernelCapabilityInvocation[];
  kernelReused: boolean;
}

export interface EvalToolDetails {
  ok: boolean;
  language: CodeModeLanguage;
  elapsedMs: number;
  capabilityCalls: number;
  capabilityInvocations: KernelCapabilityInvocation[];
  kernelReused: boolean;
  truncated: boolean;
  denied?: boolean;
  error?: string;
}

export interface CodeModeRuntime {
  run(language: CodeModeLanguage, request: KernelRunRequest): Promise<KernelRunResult>;
  reset(language?: CodeModeLanguage): Promise<void>;
  close(): Promise<void>;
}

export interface EvalToolParams {
  language: CodeModeLanguage;
  code: string;
  timeoutSeconds?: number;
}

export interface CodeModeExtensionOptions {
  capabilities?: CodeModeCapability[];
  runtime?: CodeModeRuntime;
  requireConfirmation?: boolean;
  allowNonInteractive?: boolean;
  allowedCapabilityEffects?: CapabilityEffect[];
  pythonExecutable?: string;
  engine?: CodeModeEngine;
  maxOutputBytes?: number;
  maxTimeoutMs?: number;
}

export type EvalToolResult = PiToolResult<EvalToolDetails>;
