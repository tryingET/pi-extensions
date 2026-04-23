export const DEFAULT_ASK_TIMEOUT_MS = 10 * 60 * 1000;
export const PEER_ATTACHMENT_TYPES = ["file", "snippet", "context"] as const;

export type PeerAttachmentType = (typeof PEER_ATTACHMENT_TYPES)[number];

export interface PeerPresence {
  id: string;
  name?: string;
  addressLabel: string;
  cwd: string;
  model: string;
  pid: number;
  startedAt: number;
  lastActivity: number;
  status?: string;
}

export interface PeerAttachment {
  type: PeerAttachmentType;
  name: string;
  content: string;
  language?: string;
}

export interface PeerMessage {
  id: string;
  timestamp: number;
  replyTo?: string;
  content: {
    text: string;
    attachments?: PeerAttachment[];
  };
}

export interface DeliveryResult {
  delivered: boolean;
  messageId: string;
  reason?: string;
}

export interface PeerRuntimeStatus {
  connected: boolean;
  selfId?: string;
  activePeerCount: number;
}

export interface PeerMessagingRuntime {
  listPeers(): Promise<PeerPresence[]>;
  send(request: { to: string; message: PeerMessage }): Promise<DeliveryResult>;
  ask(request: { to: string; message: PeerMessage; timeoutMs?: number }): Promise<PeerMessage>;
  status(): Promise<PeerRuntimeStatus>;
}

export interface PeerMessagingBoundary {
  sameMachineOnly: true;
  communicationOnly: true;
  canonicalAuthority: false;
  adapterSurface: string;
  duplicateNameDelivery: "fail-closed";
  defaultAskTimeoutMs: number;
  askTimeoutBehavior: "bounded-default-applied";
  oneInFlightAskPerSession: 1;
  replyCorrelation: "explicit-replyTo";
  runtimeFallbackAliasPersistence: "runtime-only";
  runtimeFallbackAliasUse: "addressability-only";
  preferredAddressingOrder: readonly ["session-id", "address-label"];
}

export const PEER_MESSAGING_BOUNDARY = Object.freeze({
  sameMachineOnly: true,
  communicationOnly: true,
  canonicalAuthority: false,
  adapterSurface: "deferred-intercom-compatible-adapter",
  duplicateNameDelivery: "fail-closed",
  defaultAskTimeoutMs: DEFAULT_ASK_TIMEOUT_MS,
  askTimeoutBehavior: "bounded-default-applied",
  oneInFlightAskPerSession: 1,
  replyCorrelation: "explicit-replyTo",
  runtimeFallbackAliasPersistence: "runtime-only",
  runtimeFallbackAliasUse: "addressability-only",
  preferredAddressingOrder: ["session-id", "address-label"] as const,
} satisfies PeerMessagingBoundary);

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }

  return value;
}

function assertNonEmptyString(value: unknown, label: string): string {
  const stringValue = assertString(value, label).trim();

  if (stringValue.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }

  return stringValue;
}

function assertOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return assertString(value, label);
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }

  return value;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  const numberValue = assertFiniteNumber(value, label);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }

  return numberValue;
}

export function assertPeerPresence(value: unknown): asserts value is PeerPresence {
  const record = assertRecord(value, "PeerPresence");

  assertNonEmptyString(record.id, "PeerPresence.id");
  assertOptionalString(record.name, "PeerPresence.name");
  assertNonEmptyString(record.addressLabel, "PeerPresence.addressLabel");
  assertNonEmptyString(record.cwd, "PeerPresence.cwd");
  assertNonEmptyString(record.model, "PeerPresence.model");
  assertNonNegativeInteger(record.pid, "PeerPresence.pid");
  assertFiniteNumber(record.startedAt, "PeerPresence.startedAt");
  assertFiniteNumber(record.lastActivity, "PeerPresence.lastActivity");
  assertOptionalString(record.status, "PeerPresence.status");
}

export function assertPeerAttachment(value: unknown): asserts value is PeerAttachment {
  const record = assertRecord(value, "PeerAttachment");
  const attachmentType = assertString(record.type, "PeerAttachment.type");

  if (!PEER_ATTACHMENT_TYPES.includes(attachmentType as PeerAttachmentType)) {
    throw new TypeError(
      `PeerAttachment.type must be one of ${PEER_ATTACHMENT_TYPES.join(", ")}. Received: ${attachmentType}`,
    );
  }

  assertNonEmptyString(record.name, "PeerAttachment.name");
  assertString(record.content, "PeerAttachment.content");
  assertOptionalString(record.language, "PeerAttachment.language");
}

export function assertPeerMessage(value: unknown): asserts value is PeerMessage {
  const record = assertRecord(value, "PeerMessage");

  assertNonEmptyString(record.id, "PeerMessage.id");
  assertFiniteNumber(record.timestamp, "PeerMessage.timestamp");
  assertOptionalString(record.replyTo, "PeerMessage.replyTo");

  const content = assertRecord(record.content, "PeerMessage.content");
  assertString(content.text, "PeerMessage.content.text");

  if (content.attachments !== undefined) {
    if (!Array.isArray(content.attachments)) {
      throw new TypeError("PeerMessage.content.attachments must be an array when provided.");
    }

    content.attachments.forEach((attachment) => {
      assertPeerAttachment(attachment);
    });
  }
}

export function assertDeliveryResult(value: unknown): asserts value is DeliveryResult {
  const record = assertRecord(value, "DeliveryResult");

  if (typeof record.delivered !== "boolean") {
    throw new TypeError("DeliveryResult.delivered must be a boolean.");
  }

  assertNonEmptyString(record.messageId, "DeliveryResult.messageId");
  assertOptionalString(record.reason, "DeliveryResult.reason");
}

export function assertPeerRuntimeStatus(value: unknown): asserts value is PeerRuntimeStatus {
  const record = assertRecord(value, "PeerRuntimeStatus");

  if (typeof record.connected !== "boolean") {
    throw new TypeError("PeerRuntimeStatus.connected must be a boolean.");
  }

  assertOptionalString(record.selfId, "PeerRuntimeStatus.selfId");
  assertNonNegativeInteger(record.activePeerCount, "PeerRuntimeStatus.activePeerCount");
}

function assertRuntimeMethod<T extends keyof PeerMessagingRuntime>(
  runtime: Record<string, unknown>,
  methodName: T,
): asserts runtime is Record<string, PeerMessagingRuntime[T]> {
  if (typeof runtime[methodName] !== "function") {
    throw new TypeError(`PeerMessagingRuntime.${methodName} must be a function.`);
  }
}

function assertSendRequest(value: unknown): { to: string; message: PeerMessage } {
  const record = assertRecord(value, "PeerMessagingRuntime.send request");
  const to = assertNonEmptyString(record.to, "PeerMessagingRuntime.send request.to");

  assertPeerMessage(record.message);

  return {
    to,
    message: record.message,
  };
}

function assertAskRequest(value: unknown): {
  to: string;
  message: PeerMessage;
  timeoutMs?: number;
} {
  const record = assertRecord(value, "PeerMessagingRuntime.ask request");
  const to = assertNonEmptyString(record.to, "PeerMessagingRuntime.ask request.to");

  assertPeerMessage(record.message);

  if (record.timeoutMs !== undefined) {
    const timeoutMs = assertFiniteNumber(
      record.timeoutMs,
      "PeerMessagingRuntime.ask request.timeoutMs",
    );

    if (timeoutMs <= 0) {
      throw new TypeError("PeerMessagingRuntime.ask request.timeoutMs must be greater than zero.");
    }
  }

  return {
    to,
    message: record.message,
    timeoutMs: record.timeoutMs as number | undefined,
  };
}

export function definePeerMessagingRuntime(runtime: PeerMessagingRuntime): PeerMessagingRuntime {
  const record = assertRecord(runtime, "PeerMessagingRuntime");

  assertRuntimeMethod(record, "listPeers");
  assertRuntimeMethod(record, "send");
  assertRuntimeMethod(record, "ask");
  assertRuntimeMethod(record, "status");

  return Object.freeze({
    async listPeers() {
      const peers = await record.listPeers();

      if (!Array.isArray(peers)) {
        throw new TypeError("PeerMessagingRuntime.listPeers must resolve to an array.");
      }

      peers.forEach((peer) => {
        assertPeerPresence(peer);
      });

      return peers;
    },
    async send(request: Parameters<PeerMessagingRuntime["send"]>[0]) {
      const normalizedRequest = assertSendRequest(request);
      const result = await record.send(normalizedRequest);

      assertDeliveryResult(result);
      return result;
    },
    async ask(request: Parameters<PeerMessagingRuntime["ask"]>[0]) {
      const normalizedRequest = assertAskRequest(request);
      const result = await record.ask({
        ...normalizedRequest,
        timeoutMs: normalizedRequest.timeoutMs ?? DEFAULT_ASK_TIMEOUT_MS,
      });

      assertPeerMessage(result);
      return result;
    },
    async status() {
      const result = await record.status();

      assertPeerRuntimeStatus(result);
      return result;
    },
  });
}

export function createStubPeerMessagingRuntime(
  overrides: Partial<PeerMessagingRuntime> = {},
): PeerMessagingRuntime {
  const defaultRuntime: PeerMessagingRuntime = {
    async listPeers() {
      throw new Error(
        "PeerMessagingRuntime.listPeers is not implemented yet. PM-1 only scaffolds the stable contract.",
      );
    },
    async send() {
      throw new Error(
        "PeerMessagingRuntime.send is not implemented yet. PM-1 only scaffolds the stable contract.",
      );
    },
    async ask() {
      throw new Error(
        "PeerMessagingRuntime.ask is not implemented yet. PM-1 only scaffolds the stable contract.",
      );
    },
    async status() {
      return {
        connected: false,
        activePeerCount: 0,
      };
    },
  };

  return definePeerMessagingRuntime({
    ...defaultRuntime,
    ...overrides,
  });
}
