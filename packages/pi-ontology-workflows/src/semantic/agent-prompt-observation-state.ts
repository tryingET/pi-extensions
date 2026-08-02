import type { HandlerObservationRecord } from "./handler-observation.ts";
import { domainDigest, measurePreparedPrompt } from "./handler-observation.ts";

export const AGENT_PROMPT_OBSERVATION_SCHEMA =
  "pi-ontology-workflows.agent-prompt-observation.v0" as const;
export const AGENT_PROMPT_OBSERVATION_PROTOCOL_REVISION =
  "pi-ontology-workflows-agent-prompt-observation-v0-r2" as const;
export const AGENT_PROMPT_OBSERVATION_CAPABILITY = "prompt.agent-state.observation.v1" as const;

const REPOSITORY_ID = "pi-extensions" as const;
const COMPONENT_ID = "pi-ontology-workflows" as const;
const PACKAGE_NAME = "@tryinget/pi-ontology-workflows" as const;
const RECORD_DOMAIN = "pi-ontology-workflows.agent-prompt-observation-record.v0";
const OUTPUT_PREFIX = `semantic-preflight-observation protocol=${AGENT_PROMPT_OBSERVATION_PROTOCOL_REVISION}`;

interface SharedRecord {
  readonly schema: typeof AGENT_PROMPT_OBSERVATION_SCHEMA;
  readonly protocol_revision: typeof AGENT_PROMPT_OBSERVATION_PROTOCOL_REVISION;
  readonly repository_id: typeof REPOSITORY_ID;
  readonly component_id: typeof COMPONENT_ID;
  readonly package_name: typeof PACKAGE_NAME;
  readonly predecessor_record_digest: string;
  readonly prepared_prompt_byte_length: number;
  readonly prepared_prompt_digest: string;
  readonly provider_payload_observed: false;
  readonly provider_transmission_observed: false;
  readonly model_input_observed: false;
  readonly record_digest: string;
}

export interface PreparedAgentPromptObservationRecord extends SharedRecord {
  readonly phase: "prepared";
  readonly observation_outcome: "package_handler_return_prepared";
  readonly claim_scope: "extension_local_pre_return_only";
  readonly callback_chain_completion_observed: false;
  readonly pi_agent_state_observed: false;
  readonly whole_prompt_exact_match_observed: false;
}

export interface TerminalAgentPromptObservationRecord extends SharedRecord {
  readonly phase: "terminal";
  readonly observation_outcome: "agent_prompt_exact_match" | "agent_prompt_mismatch";
  readonly claim_scope: "pi_agent_state_at_agent_prompt_ready_only";
  readonly callback_chain_completion_observed: true;
  readonly pi_agent_state_observed: true;
  readonly whole_prompt_exact_match_observed: boolean;
}

export type AgentPromptObservationRecord =
  | PreparedAgentPromptObservationRecord
  | TerminalAgentPromptObservationRecord;

export interface PiHostCapabilities {
  readonly host_package: string;
  readonly host_version: string;
  readonly extension_api_version: string;
  readonly capabilities: readonly string[];
}

export interface RuntimeContext {
  cwd: string;
  mode: string;
  hasUI: boolean;
  hostCapabilities?: PiHostCapabilities;
  isIdle(): boolean;
  ui: {
    confirm(title: string, message: string, options?: { timeout?: number }): Promise<boolean>;
    notify(message: string, level?: "info" | "warning" | "error"): void;
    setStatus(id: string, value?: string): void;
  };
}

export interface CorrelatedBeforeAgentStartEvent {
  readonly type: "before_agent_start";
  readonly promptRunToken: string;
  readonly prompt: string;
  readonly systemPrompt: string;
}

export interface AgentPromptReadyEvent {
  readonly type: "agent_prompt_ready";
  readonly promptRunToken: string;
  readonly systemPrompt: string;
}

export function correlatedPromptRunToken(event: unknown): unknown {
  return dataProperty(event, "promptRunToken");
}

export function registerAgentPromptReady(pi: unknown, state: AgentPromptObservationState): void {
  (
    pi as { on(event: "agent_prompt_ready", handler: (event: AgentPromptReadyEvent) => void): void }
  ).on("agent_prompt_ready", (event) => {
    state.observeReady(event);
  });
}

export interface AgentPromptObservationState {
  prepare(
    token: unknown,
    predecessor: HandlerObservationRecord,
  ): AgentPromptObservationRecord | undefined;
  observeReady(event: unknown): AgentPromptObservationRecord | undefined;
  clear(): void;
  latest(): AgentPromptObservationRecord | undefined;
}

export function createAgentPromptObservationState(): AgentPromptObservationState {
  let privateToken: string | undefined;
  let record: AgentPromptObservationRecord | undefined;

  const clear = () => {
    privateToken = undefined;
    record = undefined;
  };

  return Object.freeze({
    prepare(token: unknown, predecessor: HandlerObservationRecord) {
      clear();
      if (typeof token !== "string") return undefined;
      try {
        const prepared = buildRecord({
          phase: "prepared" as const,
          predecessor_record_digest: predecessor.record_digest,
          prepared_prompt_byte_length: predecessor.prepared_return_prompt_byte_length,
          prepared_prompt_digest: predecessor.prepared_return_prompt_digest,
          observation_outcome: "package_handler_return_prepared" as const,
          claim_scope: "extension_local_pre_return_only" as const,
          callback_chain_completion_observed: false as const,
          pi_agent_state_observed: false as const,
          whole_prompt_exact_match_observed: false as const,
        });
        privateToken = token;
        record = prepared;
        return prepared;
      } catch {
        clear();
        return undefined;
      }
    },
    observeReady(event: unknown) {
      if (!record || privateToken === undefined) return undefined;
      const pendingRecord = record;
      const pendingToken = privateToken;
      const token = dataProperty(event, "promptRunToken");
      if (record !== pendingRecord || privateToken !== pendingToken) return record;
      if (typeof token !== "string" || token !== pendingToken) return pendingRecord;
      if (pendingRecord.phase === "terminal") return pendingRecord;
      const prompt = dataProperty(event, "systemPrompt");
      if (record !== pendingRecord || privateToken !== pendingToken) return record;
      if (typeof prompt !== "string") {
        clear();
        return undefined;
      }
      try {
        const observed = measurePreparedPrompt(prompt);
        const exact =
          observed.byteLength === pendingRecord.prepared_prompt_byte_length &&
          observed.digest === pendingRecord.prepared_prompt_digest;
        record = buildRecord({
          phase: "terminal" as const,
          predecessor_record_digest: pendingRecord.predecessor_record_digest,
          prepared_prompt_byte_length: pendingRecord.prepared_prompt_byte_length,
          prepared_prompt_digest: pendingRecord.prepared_prompt_digest,
          observation_outcome: exact
            ? ("agent_prompt_exact_match" as const)
            : ("agent_prompt_mismatch" as const),
          claim_scope: "pi_agent_state_at_agent_prompt_ready_only" as const,
          callback_chain_completion_observed: true as const,
          pi_agent_state_observed: true as const,
          whole_prompt_exact_match_observed: exact,
        });
        return record;
      } catch {
        clear();
        return undefined;
      }
    },
    clear,
    latest: () => record,
  });
}

export function createAgentPromptObservationRuntime() {
  const state = createAgentPromptObservationState();
  let readyRegistered = false;

  return Object.freeze({
    clear: state.clear,
    latest: state.latest,
    supports(host: unknown) {
      const supported = supportsAgentPromptObservation(host);
      if (!supported) state.clear();
      return supported;
    },
    registerReady(pi: unknown, host: unknown) {
      if (readyRegistered || !supportsAgentPromptObservation(host)) return;
      readyRegistered = true;
      registerAgentPromptReady(pi, state);
    },
    prepare(
      event: unknown,
      predecessor: HandlerObservationRecord,
      host: unknown,
      isCurrent: () => boolean,
    ) {
      const token = supportsAgentPromptObservation(host)
        ? correlatedPromptRunToken(event)
        : undefined;
      if (!isCurrent()) return false;
      state.prepare(token, predecessor);
      return true;
    },
    render(supported: boolean, enabled: boolean) {
      return renderAgentPromptObservation(supported, enabled, state.latest());
    },
  });
}

type RecordFields = Pick<
  SharedRecord,
  "predecessor_record_digest" | "prepared_prompt_byte_length" | "prepared_prompt_digest"
> &
  (
    | Pick<
        PreparedAgentPromptObservationRecord,
        | "phase"
        | "observation_outcome"
        | "claim_scope"
        | "callback_chain_completion_observed"
        | "pi_agent_state_observed"
        | "whole_prompt_exact_match_observed"
      >
    | Pick<
        TerminalAgentPromptObservationRecord,
        | "phase"
        | "observation_outcome"
        | "claim_scope"
        | "callback_chain_completion_observed"
        | "pi_agent_state_observed"
        | "whole_prompt_exact_match_observed"
      >
  );

function buildRecord(fields: RecordFields): AgentPromptObservationRecord {
  const withoutDigest = {
    schema: AGENT_PROMPT_OBSERVATION_SCHEMA,
    protocol_revision: AGENT_PROMPT_OBSERVATION_PROTOCOL_REVISION,
    repository_id: REPOSITORY_ID,
    component_id: COMPONENT_ID,
    package_name: PACKAGE_NAME,
    ...fields,
    provider_payload_observed: false as const,
    provider_transmission_observed: false as const,
    model_input_observed: false as const,
  };
  return Object.freeze({
    ...withoutDigest,
    record_digest: domainDigest(RECORD_DOMAIN, withoutDigest),
  }) as AgentPromptObservationRecord;
}

function dataProperty(value: unknown, key: string): unknown {
  try {
    if (typeof value !== "object" || value === null) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

export function supportsAgentPromptObservation(host: unknown): boolean {
  try {
    if (typeof host !== "object" || host === null || !Object.isFrozen(host)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(host, "capabilities");
    const capabilities = descriptor && "value" in descriptor ? descriptor.value : undefined;
    return (
      Array.isArray(capabilities) &&
      Object.isFrozen(capabilities) &&
      capabilities.includes(AGENT_PROMPT_OBSERVATION_CAPABILITY)
    );
  } catch {
    return false;
  }
}

export function renderAgentPromptObservation(
  supported: boolean,
  enabled: boolean,
  record: AgentPromptObservationRecord | undefined,
): string {
  if (!supported) return `${OUTPUT_PREFIX} state=unsupported-host`;
  if (!enabled) return `${OUTPUT_PREFIX} state=disabled`;
  if (!record) return `${OUTPUT_PREFIX} state=enabled outcome=none`;
  if (record.phase === "prepared") return `${OUTPUT_PREFIX} state=prepared claim=pre-return-only`;
  return record.observation_outcome === "agent_prompt_exact_match"
    ? `${OUTPUT_PREFIX} state=terminal outcome=exact_match claim=pi-agent-state-only provider=false model=false`
    : `${OUTPUT_PREFIX} state=terminal outcome=mismatch claim=pi-agent-state-only contribution_survival=unknown provider=false model=false`;
}
