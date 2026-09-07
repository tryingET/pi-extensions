import type { Context, OAuthCredential } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  createAgentSession,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type CodexProfile, codexRuntime, type SendPort } from "./codex.js";
import { DispatchGuard, guardedExecution, toolIdentity } from "./dispatch.js";
import { assertSdkIdentity } from "./identity.js";
import { bytesDigest, digest, text } from "./json.js";
import { modelIdentity } from "./model-source.js";
import { literalLoader, type Resources } from "./resources.js";
export interface HostInput {
  incarnation: string;
  cwd: string;
  objective: string;
  profile: CodexProfile;
  resources: Resources;
}
/** Private production host composition. Only copied observations/control leave this closure. */
export async function sealedHost(
  input: HostInput,
  credential: OAuthCredential,
  port: SendPort,
  assertExternal: () => void = () => {},
) {
  const frozen = structuredClone(input);
  text(frozen.objective);
  const profileDigest = bytesDigest(JSON.stringify(frozen.profile));
  const guard = new DispatchGuard(frozen.incarnation, profileDigest, assertExternal);
  assertSdkIdentity();
  let session: AgentSession | undefined;
  let system = "";
  let toolsHash = "";
  let promptStarted = false;
  const events: Record<string, unknown>[] = [];
  const assertContext = (context: {
    systemPrompt?: string;
    tools?: Context["tools"];
    messages: readonly { role: string; content?: unknown }[];
  }) => {
    guard.assert(frozen.incarnation, profileDigest);
    if (context.systemPrompt !== system || toolIdentity(context.tools ?? []) !== toolsHash)
      guard.deny("context_profile_drift");
    const users = context.messages.filter((m) => m.role === "user");
    if (
      users.length !== 1 ||
      JSON.stringify(users[0]?.content) !==
        JSON.stringify([{ type: "text", text: frozen.objective }])
    )
      guard.deny("objective_lineage_drift");
    if (context.messages.some((m) => !["user", "assistant", "toolResult"].includes(m.role)))
      guard.deny("secondary_context");
    if (
      session &&
      (session.pendingMessageCount !== 0 ||
        session.thinkingLevel !== frozen.profile.reasoning ||
        JSON.stringify(session.model) !== JSON.stringify(frozen.profile.model))
    )
      guard.deny("session_profile_drift");
  };
  const runtime = await codexRuntime(frozen.profile, credential, guard, assertContext, port);
  const tools = [
    createReadTool(frozen.cwd),
    createWriteTool(frozen.cwd),
    createEditTool(frozen.cwd),
    createBashTool(frozen.cwd, { exposeSessionEnvironment: false }),
  ].map((tool) => ({
    ...tool,
    async execute(...args: Parameters<typeof tool.execute>) {
      const execute = guardedExecution(
        () => {
          guard.assert();
          if (session) assertContext(session.agent.state);
        },
        tool.execute as (...args: unknown[]) => ReturnType<typeof tool.execute>,
      );
      return execute(...args);
    },
  })) as unknown as ToolDefinition[];
  const settings = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false, maxRetries: 0 },
    transport: "sse",
  });
  try {
    const result = await createAgentSession({
      cwd: frozen.cwd,
      agentDir: frozen.cwd,
      model: frozen.profile.model,
      thinkingLevel: frozen.profile.reasoning,
      modelRuntime: runtime,
      settingsManager: settings,
      sessionManager: SessionManager.inMemory(frozen.cwd),
      resourceLoader: literalLoader(frozen.resources),
      tools: ["read", "write", "edit", "bash"],
      customTools: tools,
    });
    session = result.session;
    if (
      result.modelFallbackMessage ||
      result.extensionsResult.errors.length ||
      result.extensionsResult.extensions.length ||
      session.messages.length ||
      session.pendingMessageCount ||
      session.thinkingLevel !== frozen.profile.reasoning
    )
      guard.deny("constructor_state_invalid");
    system = session.agent.state.systemPrompt;
    toolsHash = toolIdentity(session.agent.state.tools);
    const originalPrompt = session.prompt.bind(session);
    const block = () => guard.deny("secondary_ingress_forbidden");
    for (const key of [
      "prompt",
      "steer",
      "followUp",
      "sendCustomMessage",
      "sendUserMessage",
      "compact",
      "navigateTree",
      "executeBash",
      "setModel",
      "cycleModel",
      "setThinkingLevel",
      "reload",
    ])
      Object.defineProperty(session, key, { value: block });
    // Agent queues are not UI capabilities either. Reject before insertion, including non-triggering paths.
    for (const key of ["steer", "followUp"])
      Object.defineProperty(session.agent, key, { value: block });
    const before = session.agent.beforeToolCall;
    session.agent.beforeToolCall = async (args) => {
      guard.assert();
      return before?.(args);
    };
    const prepare = session.agent.prepareNextTurnWithContext;
    session.agent.prepareNextTurnWithContext = async (turn, signal) => {
      assertContext(turn.context);
      const next = await prepare?.(turn, signal);
      guard.assert();
      if (next?.context) assertContext(next.context);
      return next;
    };
    session.agent.streamFunction = async (model, context, options) => {
      assertContext(context);
      // These callbacks are SDK-owned no-op optional extension hooks; factories are forbidden.
      const { onPayload: _payload, onResponse: _response, ...rest } = options ?? {};
      return runtime.streamSimple(model, context, { ...rest, transport: "sse", maxRetries: 0 });
    };
    session.subscribe((event) => {
      if (
        ["compaction_start", "auto_retry_start", "summarization_retry_scheduled"].includes(
          event.type,
        )
      )
        guard.stop("unsupported_continuation");
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta")
        events.push({ type: "text", text: event.assistantMessageEvent.delta });
      if (event.type === "tool_execution_start")
        events.push({ type: "tool_start", tool: event.toolName });
      if (event.type === "tool_execution_end")
        events.push({ type: "tool_end", tool: event.toolName, isError: event.isError });
      if (events.length > 4096) {
        events.shift();
        guard.stop("transcript_capacity");
      }
    });
    guard.prepared();
    return Object.freeze({
      envelopeDigest: digest({
        objective: frozen.objective,
        system,
        tools: toolsHash,
        profile: profileDigest,
        resources: frozen.resources.digest,
      }),
      identity: Object.freeze({
        session: session.sessionId,
        cwd: frozen.cwd,
        ...modelIdentity(frozen.profile),
        reasoning: frozen.profile.reasoning,
      }),
      // Owner-channel driver only. Not exported from package public core/tool/bin.
      admit(deadline: number) {
        guard.admitted(Math.min(deadline, frozen.profile.runDeadline));
      },
      async dispatchAfterClosed(persist: () => void) {
        if (promptStarted) guard.deny("duplicate_dispatch");
        guard.closed();
        try {
          persist();
        } catch {
          guard.deny("post_close_persistence_failed");
        }
        guard.begin();
        promptStarted = true;
        try {
          await originalPrompt(frozen.objective, { expandPromptTemplates: false });
          const last = session?.messages.at(-1);
          if (
            last?.role === "assistant" &&
            (last.stopReason === "error" || last.stopReason === "aborted")
          )
            guard.stop(last.stopReason === "error" ? "provider_error" : "provider_aborted");
        } finally {
          guard.stop("host_finished");
          session?.dispose();
        }
      },
      async stop() {
        guard.stop();
        await session?.abort();
      },
      deny(reason: string) {
        guard.stop(reason);
      },
      inspect: () => ({
        identity: {
          session: session?.sessionId,
          cwd: frozen.cwd,
          ...modelIdentity(frozen.profile),
          reasoning: frozen.profile.reasoning,
        },
        ...guard.status,
        events: structuredClone(events),
      }),
    });
  } catch (e) {
    guard.stop("construction_failed");
    session?.dispose();
    throw e;
  }
}
