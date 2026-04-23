import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type CreatePeerMessagingRuntimeOptions,
  createPeerMessagingRuntime,
  type ManagedPeerMessagingRuntime,
  PEER_ATTACHMENT_TYPES,
} from "../index.ts";
import {
  createIntercomCompatibleAdapter,
  INTERCOM_TOOL_NAME,
  type IntercomIncomingMessage,
  type IntercomToolRequest,
  type IntercomToolResponse,
} from "../src/intercom-adapter.ts";

export interface IntercomSessionManager {
  getCwd(): string;
  getSessionId(): string;
  getSessionName(): string | undefined;
}

export interface IntercomExtensionContext {
  cwd?: string;
  hasUI?: boolean;
  model?: {
    id?: string;
  };
  sessionManager: IntercomSessionManager;
}

export interface IntercomRegisteredTool {
  name: string;
  label?: string;
  description?: string;
  promptSnippet?: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: IntercomExtensionContext,
  ) => Promise<IntercomToolResponse>;
}

export interface IntercomExtensionAPI {
  on(event: string, handler: (event: unknown, ctx?: IntercomExtensionContext) => unknown): void;
  registerTool(tool: IntercomRegisteredTool): void;
  sendMessage(
    message: {
      customType?: string;
      content: string;
      display?: boolean;
      details?: unknown;
    },
    options?: {
      triggerTurn?: boolean;
      deliverAs?: "followUp";
    },
  ): void;
}

export interface IntercomExtensionOptions {
  runtimeFactory?: (
    options: CreatePeerMessagingRuntimeOptions,
  ) => Promise<ManagedPeerMessagingRuntime>;
  runtimeDir?: string;
  idleShutdownMs?: number;
  now?: () => number;
}

const INTERCOM_TOOL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: {
    action: {
      type: "string",
      description: "Action: 'list', 'send', 'ask', 'reply', 'pending', or 'status'",
    },
    to: {
      type: "string",
      description: "Target session name, address label, or exact session id",
    },
    message: {
      type: "string",
      description: "Message text to send, ask, or reply with",
    },
    attachments: {
      type: "array",
      description: "Optional file, snippet, or context attachments",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name", "content"],
        properties: {
          type: {
            type: "string",
            enum: [...PEER_ATTACHMENT_TYPES],
          },
          name: {
            type: "string",
          },
          content: {
            type: "string",
          },
          language: {
            type: "string",
          },
        },
      },
    },
    replyTo: {
      type: "string",
      description: "Exact message id to reply to or thread under",
    },
    timeoutMs: {
      type: "number",
      description: "Optional ask timeout override in milliseconds",
    },
  },
} satisfies Record<string, unknown>;

function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveSessionName(ctx: IntercomExtensionContext | undefined): string | undefined {
  const candidate = ctx?.sessionManager.getSessionName()?.trim();
  return candidate && candidate.length > 0 ? candidate : undefined;
}

function resolveSessionCwd(ctx: IntercomExtensionContext | undefined): string {
  return ctx?.sessionManager.getCwd() ?? ctx?.cwd ?? process.cwd();
}

function resolveModelId(ctx: IntercomExtensionContext | undefined): string {
  const modelId = ctx?.model?.id?.trim();
  return modelId && modelId.length > 0 ? modelId : "unknown";
}

function formatIncomingSender(entry: IntercomIncomingMessage): string {
  const senderName = entry.from.name?.trim() || entry.from.addressLabel || entry.from.id;
  return `${senderName} (${entry.from.id.slice(0, 8)})`;
}

function formatIncomingContent(entry: IntercomIncomingMessage): string {
  const replyInstruction = entry.replyCommand
    ? `\n\nTo reply, use the intercom tool: ${entry.replyCommand}`
    : "";
  return `**📨 From ${formatIncomingSender(entry)}** (${entry.from.cwd})${replyInstruction}\n\n${entry.bodyText}`;
}

export function registerPeerMessagingIntercomExtension(
  pi: IntercomExtensionAPI,
  options: IntercomExtensionOptions = {},
): void {
  const adapter = createIntercomCompatibleAdapter({
    now: options.now,
    onIncomingMessage: (entry) => {
      pi.sendMessage(
        {
          customType: "intercom_message",
          content: formatIncomingContent(entry),
          display: true,
          details: entry,
        },
        { triggerTurn: true },
      );
    },
  });
  const runtimeFactory =
    options.runtimeFactory ??
    ((runtimeOptions: CreatePeerMessagingRuntimeOptions) =>
      createPeerMessagingRuntime(runtimeOptions));

  let runtime: ManagedPeerMessagingRuntime | null = null;
  let detachRuntimeMessages: (() => void) | null = null;

  async function ensureRuntime(
    ctx: IntercomExtensionContext | undefined,
  ): Promise<ManagedPeerMessagingRuntime> {
    if (runtime) {
      return runtime;
    }

    const nextRuntime = await runtimeFactory({
      name: resolveSessionName(ctx),
      cwd: resolveSessionCwd(ctx),
      model: resolveModelId(ctx),
      runtimeDir: options.runtimeDir,
      packageRoot: getPackageRoot(),
      idleShutdownMs: options.idleShutdownMs,
    });
    detachRuntimeMessages = nextRuntime.onMessage((from, message) => {
      adapter.handleIncomingMessage(from, message);
    });
    runtime = nextRuntime;
    return nextRuntime;
  }

  async function syncPresence(ctx: IntercomExtensionContext | undefined): Promise<void> {
    const activeRuntime = await ensureRuntime(ctx);
    await activeRuntime.updatePresence({
      name: resolveSessionName(ctx),
      model: resolveModelId(ctx),
      lastActivity: (options.now ?? (() => Date.now()))(),
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    try {
      await syncPresence(ctx);
    } catch {
      // Fail closed at tool execution time instead of breaking session startup.
    }
  });

  pi.on("session_shutdown", async () => {
    adapter.clear();
    detachRuntimeMessages?.();
    detachRuntimeMessages = null;

    const activeRuntime = runtime;
    runtime = null;
    if (!activeRuntime) {
      return;
    }

    await activeRuntime.disconnect();
  });

  pi.registerTool({
    name: INTERCOM_TOOL_NAME,
    label: "Intercom",
    description:
      "Thin intercom-compatible adapter over the peer-messaging stable core for local session coordination.",
    promptSnippet:
      "Use to coordinate with other local pi sessions through the peer-messaging stable core: list peers, send updates, ask and wait for replies, or reply to pending messages.",
    parameters: INTERCOM_TOOL_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const activeRuntime = await ensureRuntime(ctx);
        await syncPresence(ctx);
        return adapter.execute(activeRuntime, params as IntercomToolRequest);
      } catch (error) {
        return {
          content: [{ type: "text", text: `Intercom not connected: ${getErrorMessage(error)}` }],
          isError: true,
        } satisfies IntercomToolResponse;
      }
    },
  });
}

export default function peerMessagingIntercomExtension(pi: IntercomExtensionAPI): void {
  registerPeerMessagingIntercomExtension(pi);
}
