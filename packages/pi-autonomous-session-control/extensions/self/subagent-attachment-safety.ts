import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const LIMIT = 1_000_000;
const ATTEMPTS = [
  "modelStartAttempts",
  "inertProviderStreamAttempts",
  "toolCallAttempts",
  "userBashAttempts",
] as const;
type Attempt = (typeof ATTEMPTS)[number];
export type SafetyStage =
  | "ready"
  | "before_input"
  | "after_input"
  | "attempt"
  | "poll"
  | "shutdown";
export interface AttachmentViewerSafety {
  schema: "asc.subagent-attachment.safety.v1";
  observedAt: string;
  revision: number;
  stage: SafetyStage;
  sdk: {
    noSession: boolean | null;
    activeToolsCount: number | null;
    inertModelSelected: boolean | null;
  };
  attempts: Record<Attempt, number | null>;
  instrumented: Record<Attempt, boolean>;
  inputObservations: { before: number; after: number };
  saturated: boolean;
}
function objectWithKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    Object.keys(descriptors).length === keys.length &&
    keys.every((key) => descriptors[key] && "value" in descriptors[key])
  );
}
const count = (value: unknown) =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= LIMIT;
const booleanOrUnknown = (value: unknown) => value === null || typeof value === "boolean";
/** Exact content-free shape; reject strings/payloads/extra fields rather than publishing them. */
export function validAttachmentViewerSafety(value: unknown): value is AttachmentViewerSafety {
  if (
    !objectWithKeys(value, [
      "schema",
      "observedAt",
      "revision",
      "stage",
      "sdk",
      "attempts",
      "instrumented",
      "inputObservations",
      "saturated",
    ])
  )
    return false;
  const { attempts, instrumented } = value;
  return (
    value.schema === "asc.subagent-attachment.safety.v1" &&
    typeof value.observedAt === "string" &&
    value.observedAt.length === 24 &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.observedAt) &&
    Number.isFinite(Date.parse(value.observedAt)) &&
    count(value.revision) &&
    Number(value.revision) > 0 &&
    typeof value.stage === "string" &&
    ["ready", "before_input", "after_input", "attempt", "poll", "shutdown"].includes(value.stage) &&
    typeof value.saturated === "boolean" &&
    objectWithKeys(value.sdk, ["noSession", "activeToolsCount", "inertModelSelected"]) &&
    booleanOrUnknown(value.sdk.noSession) &&
    booleanOrUnknown(value.sdk.inertModelSelected) &&
    (value.sdk.activeToolsCount === null || count(value.sdk.activeToolsCount)) &&
    objectWithKeys(attempts, [...ATTEMPTS]) &&
    objectWithKeys(instrumented, [...ATTEMPTS]) &&
    ATTEMPTS.every(
      (key) =>
        typeof instrumented[key] === "boolean" &&
        (instrumented[key] ? count(attempts[key]) : attempts[key] === null),
    ) &&
    objectWithKeys(value.inputObservations, ["before", "after"]) &&
    count(value.inputObservations.before) &&
    count(value.inputObservations.after)
  );
}
function observe<T>(action: () => T | null): T | null {
  try {
    return action();
  } catch {
    return null;
  }
}

/** Local hook counters, NOT an audit of every possible SDK/provider path. Unknown observations
 * remain null. Failed registry writes retain the latest snapshot for the existing viewer poll. */
export class AttachmentSafetyObserver {
  private context?: ExtensionContext;
  private counts: Record<Attempt, number> = {
    modelStartAttempts: 0,
    inertProviderStreamAttempts: 0,
    toolCallAttempts: 0,
    userBashAttempts: 0,
  };
  private monitored: Record<Attempt, boolean> = {
    modelStartAttempts: false,
    inertProviderStreamAttempts: false,
    toolCallAttempts: false,
    userBashAttempts: false,
  };
  private inputs = { before: 0, after: 0 };
  private revision = 0;
  private saturated = false;
  private pending?: AttachmentViewerSafety;
  private pi: Pick<ExtensionAPI, "getActiveTools">;
  private inert: { provider: string; id: string; api: string };
  private publisher: (snapshot: AttachmentViewerSafety) => boolean;
  constructor(
    pi: Pick<ExtensionAPI, "getActiveTools">,
    inert: { provider: string; id: string; api: string },
    publisher: (snapshot: AttachmentViewerSafety) => boolean,
  ) {
    this.pi = pi;
    this.inert = inert;
    this.publisher = publisher;
  }
  instrument(key: Attempt): void {
    this.monitored[key] = true;
  }
  private increment(value: number): number {
    if (value >= LIMIT) {
      this.saturated = true;
      return LIMIT;
    }
    return value + 1;
  }
  attempt(key: Attempt, ctx?: ExtensionContext): void {
    this.counts[key] = this.increment(this.counts[key]);
    this.publish("attempt", ctx);
  }
  publish(stage: SafetyStage, ctx?: ExtensionContext): void {
    if (ctx) this.context = ctx;
    this.revision = this.increment(this.revision);
    const context = this.context;
    const noSession = observe(() => {
      if (typeof context?.sessionManager?.getSessionFile !== "function") return null;
      const path = context.sessionManager.getSessionFile();
      return path === undefined ? true : typeof path === "string" && path.length > 0 ? false : null;
    });
    const activeToolsCount = observe(() => {
      if (typeof this.pi.getActiveTools !== "function") return null;
      const tools = this.pi.getActiveTools();
      return Array.isArray(tools) &&
        tools.length <= LIMIT &&
        tools.every((t) => typeof t === "string")
        ? tools.length
        : null;
    });
    const inertModelSelected = observe(() => {
      const model = context?.model;
      if (!model || ![model.provider, model.id, model.api].every((s) => typeof s === "string"))
        return null;
      return (
        model.provider === this.inert.provider &&
        model.id === this.inert.id &&
        model.api === this.inert.api
      );
    });
    this.pending = {
      schema: "asc.subagent-attachment.safety.v1",
      observedAt: new Date().toISOString(),
      revision: this.revision,
      stage,
      sdk: { noSession, activeToolsCount, inertModelSelected },
      attempts: {
        modelStartAttempts: this.monitored.modelStartAttempts
          ? this.counts.modelStartAttempts
          : null,
        inertProviderStreamAttempts: this.monitored.inertProviderStreamAttempts
          ? this.counts.inertProviderStreamAttempts
          : null,
        toolCallAttempts: this.monitored.toolCallAttempts ? this.counts.toolCallAttempts : null,
        userBashAttempts: this.monitored.userBashAttempts ? this.counts.userBashAttempts : null,
      },
      instrumented: { ...this.monitored },
      inputObservations: { ...this.inputs },
      saturated: this.saturated,
    };
    this.retry();
  }
  retry(): void {
    if (!this.pending) return;
    try {
      if (this.publisher(this.pending)) this.pending = undefined;
    } catch {
      /* A safety write failure cannot let an execution guard fall through. */
    }
  }
  async input<T>(ctx: ExtensionContext, action: () => Promise<T>): Promise<T> {
    this.inputs.before = this.increment(this.inputs.before);
    this.publish("before_input", ctx);
    try {
      return await action();
    } finally {
      this.inputs.after = this.increment(this.inputs.after);
      this.publish("after_input", ctx);
    }
  }
}
