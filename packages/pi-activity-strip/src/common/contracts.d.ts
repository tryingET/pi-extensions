// ---
// summary: "declares the public TypeScript shapes shared by activity-strip runtime and JavaScript consumers"
// read_when:
//   - "checking emitted declaration contracts for sessions, broker messages, telemetry, or compatibility"
// ---

export type SessionState = "idle" | "thinking" | "tool" | "waiting" | "success" | "error";

export interface SessionSnapshot {
  sessionId: string;
  publisherId: string;
  processId: number;
  cwd: string;
  repoLabel: string;
  sessionName: string;
  phase: string;
  detail: string;
  assistantPreview: string;
  toolName: string;
  toolTarget: string;
  state: SessionState;
  turnIndex: number;
  updatedAt: number;
  lastEventAt: number;
  startedAt: number;
  agentStartedAt: number | null;
  agentActive: boolean;
  lastPromptPreview: string;
  errorMessage: string;
}

export interface BrokerSnapshot {
  generatedAt: number;
  sessions: SessionSnapshot[];
}

export type ActivityStripRuntimeState = "starting" | "ready" | "error";

export interface ActivityStripRuntimeStatus {
  state: ActivityStripRuntimeState;
  startedAt: number;
  readyAt?: number | null;
  windowVisible?: boolean;
  displayServer?: "wayland" | "x11" | "headless" | "unknown";
  windowManager?: string | null;
  displayCount?: number | null;
  alignmentMode?: "niri" | "generic";
  warnings?: string[];
  error?: string | null;
}

export interface BrokerResponse {
  ok?: boolean;
  type?: string;
  snapshot?: BrokerSnapshot;
  runtimeStatus?: ActivityStripRuntimeStatus;
  error?: string;
}

export interface BrokerClientOptions {
  expectReply?: boolean;
  timeoutMs?: number;
  socketPath?: string;
}

export interface SessionStoreOptions {
  staleAfterMs?: number;
}

export interface ActivityStripBrokerOptions {
  socketPath?: string;
  socketDir?: string;
  store?: {
    snapshot(): BrokerSnapshot;
    upsert(session: Partial<SessionSnapshot> | Record<string, unknown>): boolean;
    remove(sessionId: string, publisherId?: string): boolean;
  };
  getRuntimeStatus?: () => ActivityStripRuntimeStatus | undefined;
  focusSession?: (sessionId: string) => Promise<{ ok: boolean; error?: string; windowId?: number }>;
}

export interface ToolCallDescription {
  state: "tool" | "waiting";
  phase: string;
  detail: string;
  toolTarget?: string;
}

export interface ToolResultSummary {
  state: "thinking" | "error";
  phase: string;
  detail: string;
  errorMessage?: string;
}

export interface TelemetryPiLike {
  getSessionName?: () => string | undefined;
}

export interface SessionStartContextLike {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error") => void;
    editor?: (title: string, text: string) => Promise<unknown>;
  };
  sessionManager?: {
    getSessionId?: () => string;
  };
}

export interface BeforeAgentStartEventLike {
  prompt?: string;
}

export interface TurnStartEventLike {
  turnIndex?: number;
}

export interface TurnEndEventLike {
  turnIndex?: number;
  message?: unknown;
}

export interface AssistantMessageEventLike {
  type?: string;
  delta?: unknown;
}

export interface MessageUpdateEventLike {
  assistantMessageEvent?: AssistantMessageEventLike;
}

export interface ToolExecutionEventLike {
  toolName?: string;
  args?: Record<string, unknown>;
  partialResult?: unknown;
  result?: unknown;
  isError?: boolean;
}

export interface SessionTelemetryOptions {
  pi?: TelemetryPiLike;
  cwd?: string;
  sessionName?: string;
  transport?: {
    publish: (session: SessionSnapshot) => Promise<unknown>;
    remove: (session: { sessionId: string; publisherId: string }) => Promise<unknown>;
  };
}

export interface ActivityStripCompatibilityReport {
  ok: boolean;
  displayServer: "wayland" | "x11" | "headless" | "unknown";
  windowManager: string | null;
  electronPath: string | null;
  displayCount: number | null;
  alignmentMode: "niri" | "generic";
  primaryDisplayOnly: boolean;
  clickThroughDefault: boolean;
  blockers: string[];
  warnings: string[];
}
