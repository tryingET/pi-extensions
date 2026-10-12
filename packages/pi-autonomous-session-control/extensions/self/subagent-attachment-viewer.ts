import type {
  AppKeybinding,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { CustomEditor, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text, type TUI } from "@earendil-works/pi-tui";
import {
  type AttachmentTicket,
  acknowledgeAttachmentWithRetry,
  attachmentViewerStillBound,
  detachAttachment,
  publishAttachmentViewerSafety,
  readAttachmentTicket,
} from "./subagent-attachment-registry.ts";
import { AttachmentSafetyObserver } from "./subagent-attachment-safety.ts";
import {
  readSubagentCockpit,
  requestSubagentSteering,
  type SubagentCockpitSnapshot,
} from "./subagent-cockpit-data.ts";
import { inertText, literalGuidance } from "./subagent-cockpit-io.ts";
import { cancelSubagentDispatch } from "./subagent-control.ts";
import type { SubagentState } from "./subagent-session.ts";

const CUSTOM_TYPE = "asc.subagent-attachment.native.v1";
const PROVIDER = "asc-attachment-inert";
// No remote provider implementation, auth command, discovery, or network endpoint.
const INERT_MODEL = {
  id: "view-only",
  name: "Attached child · view only",
  api: "asc-attachment-inert",
  reasoning: false,
  input: ["text"] as ("text" | "image")[],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4096,
  maxTokens: 1,
};

/** Native transcript component, bounded mutable per-event children. No selector or overlay. */
export class AttachmentTranscript extends Container {
  private events = new Map<
    string,
    { component: Container; heading: Text; body: Markdown; detail: Text }
  >();
  private summary = new Text("Waiting for exact-attempt telemetry…", 0, 0);
  private receipts = new Text("", 0, 0);
  private activity = new Container();
  private note = new Text("", 0, 0);
  constructor() {
    super();
    this.addChild(this.summary);
    this.addChild(this.note);
    this.addChild(this.activity);
    this.addChild(this.receipts);
  }
  update(snapshot: SubagentCockpitSnapshot, notice: string): void {
    this.summary.setText(
      inertText(
        `${snapshot.sessionName} · ${snapshot.status}\n${snapshot.profile ?? "profile unavailable"} · ${snapshot.model ?? "model unavailable"}\n${snapshot.objective ?? "objective unavailable"}\n${notice}\n${snapshot.unavailableReason ?? "Literal input queues guidance to the ORIGINAL child; queued is not delivered."}`,
        6000,
      ),
    );
    const selected = snapshot.events.slice(-160);
    let textBudget = 32000;
    let detailBudget = 32000;
    let clipped = !!snapshot.truncated || snapshot.events.length > 160;
    const projected = new Map<string, { text: string; detail: string }>();
    // Spend the bounded display budget newest-first, then render in native chronological order.
    for (const event of [...selected].reverse()) {
      const text = inertText(event.text, Math.min(4096, Math.max(0, textBudget)));
      const detail = inertText(event.detail, Math.min(4096, Math.max(0, detailBudget)));
      clipped ||=
        text.length < (event.text?.length ?? 0) || detail.length < (event.detail?.length ?? 0);
      textBudget -= text.length;
      detailBudget -= detail.length;
      projected.set(event.id, { text, detail });
    }
    const next = new Map<
      string,
      { component: Container; heading: Text; body: Markdown; detail: Text }
    >();
    this.activity.clear();
    for (const event of selected) {
      if (!event.id || next.has(event.id)) continue;
      let view = this.events.get(event.id);
      if (!view) {
        view = {
          component: new Container(),
          heading: new Text("", 0, 0),
          body: new Markdown("", 0, 0, getMarkdownTheme()),
          detail: new Text("", 0, 0),
        };
        view.component.addChild(view.heading);
        view.component.addChild(view.body);
        view.component.addChild(view.detail);
      }
      const { text = "", detail = "" } = projected.get(event.id) ?? {};
      view.heading.setText(
        inertText(
          `\n${event.timestamp} · ${event.kind}${event.toolName ? ` · ${event.toolName}` : ""}`,
          300,
        ),
      );
      view.body.setText(text);
      view.detail.setText(detail);
      this.activity.addChild(view.component);
      next.set(event.id, view);
    }
    this.events = next;
    let receiptBudget = 32000;
    clipped ||= snapshot.receipts.length > 32;
    this.receipts.setText(
      snapshot.receipts
        .slice(-32)
        .reverse()
        .map((r) => {
          const raw = `\nGuidance ${r.requestId}: ${r.status}\n${r.message}\n${r.reason ?? ""}`;
          const text = inertText(raw, Math.min(4400, Math.max(0, receiptBudget)));
          clipped ||= text.length < raw.length;
          receiptBudget -= text.length;
          return text;
        })
        .reverse()
        .join(""),
    );
    this.note.setText(
      `Bounded observer history (latest 160 events; not a resumed child session).${clipped ? " History clipped." : ""}\n/cancel confirms original-attempt cancellation · /detach closes ONLY this viewer`,
    );
  }
}

// Pi copies native action handlers AFTER the editor factory. Preserve safe clear/display
// handlers while swallowing execution, external-editor, model-selection and session actions.
class ViewerActions extends Map<AppKeybinding, () => void> {
  override set(action: AppKeybinding, handler: () => void): this {
    return super.set(
      action,
      ["app.clear", "app.exit", "app.tools.expand", "app.thinking.toggle"].includes(action)
        ? handler
        : () => {},
    );
  }
}

export default function attachmentViewer(pi: ExtensionAPI): void {
  pi.registerFlag("asc-subagent-view-ticket", {
    description: "Private exact-attempt native-view ticket",
    type: "string",
  });
  const safety = new AttachmentSafetyObserver(
    pi,
    { provider: PROVIDER, id: INERT_MODEL.id, api: INERT_MODEL.api },
    (value) => (ticket ? publishAttachmentViewerSafety(ticket, value) : false),
  );
  pi.registerProvider(PROVIDER, {
    baseUrl: "http://127.0.0.1:0",
    apiKey: "view-only-not-a-credential",
    api: INERT_MODEL.api,
    models: [INERT_MODEL],
    streamSimple() {
      safety.attempt("inertProviderStreamAttempts");
      throw new Error("Attached viewer cannot execute a model request");
    },
  });
  safety.instrument("inertProviderStreamAttempts");
  let ticket: AttachmentTicket | undefined;
  let state: SubagentState | undefined;
  let tui: TUI | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let notice = "View only; startup/input-handler ACK is not placement or delivery proof.";
  let stopped = false;
  const bootstrapAbort = new AbortController();
  let confirming = false;
  let snapshot: SubagentCockpitSnapshot | undefined;
  const transcript = new AttachmentTranscript();
  const redraw = () => {
    if (snapshot) transcript.update(snapshot, notice);
    tui?.requestRender();
  };
  const bound = () => !!ticket && !!state && !stopped && attachmentViewerStillBound(ticket);
  const detach = (ctx: ExtensionContext) => {
    if (stopped) return;
    safety.publish("shutdown");
    stopped = true;
    bootstrapAbort.abort();
    if (timer) clearInterval(timer);
    timer = undefined;
    try {
      if (ticket) detachAttachment(ticket);
    } catch {
      /* Do not touch child on view shutdown. */
    }
    ctx.shutdown();
  };
  const cancel = async (ctx: ExtensionContext) => {
    if (confirming || !bound() || snapshot?.status !== "running") {
      notice = "Cancellation unavailable: no verified bound running attempt.";
      redraw();
      return;
    }
    confirming = true;
    try {
      if (
        !(await ctx.ui.confirm(
          "Cancel ORIGINAL child?",
          `${ticket?.sessionName} · attempt ${ticket?.attemptId}\nThis requests cancellation, not rollback. Keep running unless confirmed.`,
        ))
      )
        return;
      if (!bound() || !ticket || !state) {
        notice = "Attempt binding changed; nothing cancelled.";
        redraw();
        return;
      }
      const result = cancelSubagentDispatch({
        state,
        dispatchId: ticket.dispatchId,
        parentRepoRoot: ticket.parentRepoRoot,
        expectedAttemptId: ticket.attemptId,
        expectedParentSessionKey: ticket.parentSessionKey,
        expectedSessionName: ticket.sessionName,
        requestedBy: "subagent-attachment-viewer",
        reason: "Operator confirmed original-child cancellation in native view",
      });
      notice = result.ok
        ? `Cancellation: ${result.status} (not rollback or settlement proof).`
        : `Cancellation rejected: ${result.error}`;
      redraw();
    } finally {
      confirming = false;
    }
  };
  const submit = (text: string, ctx: ExtensionContext) =>
    safety.input(ctx, async () => {
      if (text.trim() === "/detach") {
        detach(ctx);
        return;
      }
      if (text.trim() === "/cancel") {
        await cancel(ctx);
        return;
      }
      if (!literalGuidance(text)) {
        notice =
          "Rejected: use literal text (≤4096 bytes), /cancel, or /detach; terminal controls are disabled.";
      } else if (!bound() || !ticket || !state || snapshot?.status !== "running") {
        notice = "Rejected: terminal/read-only, stale, or unbound original attempt.";
      } else {
        const r = requestSubagentSteering({
          state,
          dispatchId: ticket.dispatchId,
          attemptId: ticket.attemptId,
          parentSessionKey: ticket.parentSessionKey,
          parentRepoRoot: ticket.parentRepoRoot,
          requestedBy: "subagent-attachment-viewer",
          message: text,
        });
        notice = r.ok
          ? `Guidance ${r.requestId}: ${r.status}; queued is NOT delivered.`
          : `Guidance rejected: ${r.error}`;
      }
      redraw();
    });
  pi.registerMessageRenderer(CUSTOM_TYPE, () => transcript);
  pi.registerCommand("cancel", {
    description: "Confirm cancellation of original child only",
    handler: (_args, ctx) => submit("/cancel", ctx),
  });
  pi.registerCommand("detach", {
    description: "Close viewer only; original child unchanged",
    handler: (_args, ctx) => submit("/detach", ctx),
  });
  pi.on("input", async (event, ctx) => {
    if (event.source === "interactive" && !event.images?.length) await submit(event.text, ctx);
    else
      await safety.input(ctx, async () => {
        notice =
          "Rejected: viewer accepts literal operator text only; no model/image/extension input.";
        redraw();
      });
    return { action: "handled" };
  });
  pi.on("user_bash", (_event, ctx) => {
    safety.attempt("userBashAttempts", ctx);
    return {
      result: {
        output: "Bash disabled in attached viewer",
        exitCode: 1,
        cancelled: false,
        truncated: false,
      },
    };
  });
  safety.instrument("userBashAttempts");
  pi.on("tool_call", (_event, ctx) => {
    safety.attempt("toolCallAttempts", ctx);
    return { block: true, reason: "View-only attachment: tools disabled" };
  });
  safety.instrument("toolCallAttempts");
  pi.on("cache_warming_decision", () => ({ action: "stop" }));
  pi.on("session_before_switch", () => ({ cancel: true }));
  pi.on("session_before_fork", () => ({ cancel: true }));
  pi.on("session_before_tree", () => ({ cancel: true }));
  pi.on("session_before_compact", () => ({ cancel: true }));
  const selectInert = async (ctx: ExtensionContext) => {
    const model = ctx.modelRegistry.find(PROVIDER, INERT_MODEL.id);
    if (
      !model ||
      model.provider !== PROVIDER ||
      model.id !== INERT_MODEL.id ||
      model.api !== INERT_MODEL.api ||
      !(await pi.setModel(model))
    )
      throw new Error("Inert viewer provider unavailable or overridden");
  };
  const enforceInert = async (ctx: ExtensionContext) => {
    try {
      await selectInert(ctx);
    } catch {
      ctx.ui.notify(
        "Inert provider selection failed; viewer shutting down without execution.",
        "error",
      );
      detach(ctx);
    }
  };
  pi.on("model_select", async (event, ctx) => {
    if (
      event.model.provider !== PROVIDER ||
      event.model.id !== INERT_MODEL.id ||
      event.model.api !== INERT_MODEL.api
    )
      await enforceInert(ctx);
  });
  // This hook is NOT an agent-start veto. Input consumption and the throwing inert
  // stream are the no-model boundary; this only restores defensive model selection.
  pi.on("before_agent_start", async (_event, ctx) => {
    safety.attempt("modelStartAttempts", ctx);
    await enforceInert(ctx);
  });
  safety.instrument("modelStartAttempts");
  pi.on("session_start", async (_event, ctx) => {
    try {
      if (ctx.mode !== "tui" || !ctx.hasUI || ctx.sessionManager.getSessionFile())
        throw new Error("Viewer requires native TUI --no-session bootstrap");
      const path = pi.getFlag("asc-subagent-view-ticket");
      if (typeof path !== "string") throw new Error("Private ticket required");
      ticket = readAttachmentTicket(path);
      // Construct a read/control descriptor WITHOUT createSubagentState: that API reconciles
      // lifecycle statuses. A viewer must never reconcile/clear/resume/dispatch children.
      state = {
        sessionsDir: ticket.sessionsDir,
        activeCount: 0,
        completedCount: 0,
        maxConcurrent: 0,
        reservedSessionNames: new Set(),
      };
      pi.setActiveTools([]);
      await selectInert(ctx);
      // Pi refreshes its title after extension binding; a one-shot setTitle is overwritten.
      // Name only this in-memory viewer session so native tab titles remain identifiable.
      pi.setSessionName(`Subagent · ${inertText(ticket.sessionName, 160)} · view only`);
      let inputInstalled = false;
      ctx.ui.setEditorComponent((host, theme, keybindings) => {
        tui = host;
        const editor = new CustomEditor(host, theme, keybindings);
        editor.actionHandlers = new ViewerActions();
        editor.onCtrlD = () => detach(ctx);
        editor.onEscape = () => {
          editor.setText("");
          host.requestRender();
        };
        editor.onPasteImage = () => {
          notice = "Image paste disabled in attached viewer.";
          redraw();
        };
        editor.onExtensionShortcut = () => false;
        // Pi wires its built-in submit callback AFTER the factory. Keep the native Editor
        // but intercept submission before /resume, @file expansion, bash, and model paths.
        Object.defineProperty(editor, "onSubmit", {
          configurable: false,
          get: () => (text: string) => {
            void submit(text, ctx).catch(() => {
              notice = "Control failed; no launch/model retry.";
              redraw();
            });
          },
          set: () => {},
        });
        inputInstalled = true;
        return editor;
      });
      if (!inputInstalled) throw new Error("Native viewer input handlers not installed");
      ticket = await acknowledgeAttachmentWithRetry(path, { signal: bootstrapAbort.signal });
      safety.publish("ready", ctx);
      const poll = () => {
        if (!ticket || stopped) return;
        safety.retry();
        try {
          if (!attachmentViewerStillBound(ticket)) {
            notice =
              "Original owner/attempt binding unavailable. Remaining history is read-only; /detach only.";
            redraw();
            return;
          }
          const next = readSubagentCockpit(ticket.sessionsDir, ticket.sessionName, {
            currentSessionKey: ticket.parentSessionKey,
            currentRepoRoot: ticket.parentRepoRoot,
          });
          if (next.dispatchId !== ticket.dispatchId || next.attemptId !== ticket.attemptId) {
            notice = "Original attempt replaced; last observed history frozen, controls disabled.";
            redraw();
            return;
          }
          snapshot = next;
          redraw();
        } catch {
          notice = "Exact-attempt telemetry unavailable; controls recheck binding independently.";
          redraw();
        }
      };
      poll();
      pi.sendMessage(
        {
          customType: CUSTOM_TYPE,
          content: "Native original-child attachment (view only)",
          display: true,
        },
        { triggerTurn: false },
      );
      timer = setInterval(poll, 500);
      timer.unref?.();
    } catch (error) {
      if (stopped) return;
      ctx.ui.notify(
        inertText(error instanceof Error ? error.message : "Viewer bootstrap rejected", 500),
        "error",
      );
      detach(ctx);
    }
  });
  pi.on("session_shutdown", (_event, ctx) => {
    safety.publish("shutdown", ctx);
    stopped = true;
    bootstrapAbort.abort();
    if (timer) clearInterval(timer);
    timer = undefined;
    try {
      if (ticket) detachAttachment(ticket);
    } catch {
      /* Never signal original child. */
    }
  });
}
