import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const WORKFLOW_VERSION = "startup-intake-v1";
const STATE_ENTRY = "startup-intake-router-state";

type RouterPhase = "idle" | "intent_captured" | "command_proposed";

interface RouterState {
  workflowVersion: string;
  phase: RouterPhase;
  firstMessageProcessed: boolean;
  intent?: string;
  command?: string;
  updatedAt: number;
}

function newState(overrides: Partial<RouterState> = {}): RouterState {
  return {
    workflowVersion: WORKFLOW_VERSION,
    phase: "idle",
    firstMessageProcessed: false,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function normalizeInline(value: string, maxLen = 1200): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  return compact.slice(0, maxLen - 1) + "…";
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}

function formatCommand(name: string, args: string[]): string {
  return `/${name} ${args.map((arg) => quoteArg(arg)).join(" ")}`;
}

export default function startupIntakeRouter(pi: ExtensionAPI) {
  let state = newState();

  const persist = () => {
    state.updatedAt = Date.now();
    pi.appendEntry(STATE_ENTRY, state);
  };

  const setState = (patch: Partial<RouterState>, save = true) => {
    state = { ...state, ...patch, workflowVersion: WORKFLOW_VERSION };
    if (save) persist();
  };

  const restore = (ctx: any) => {
    const branch = ctx.sessionManager.getBranch();
    let restored: RouterState | undefined;

    for (const entry of branch) {
      if (entry.type === "custom" && entry.customType === STATE_ENTRY && entry.data && typeof entry.data === "object") {
        restored = entry.data as RouterState;
      }
    }

    state = restored ? { ...newState(), ...restored, workflowVersion: WORKFLOW_VERSION } : newState();
    setState({
      firstMessageProcessed: false,
      phase: "idle",
      intent: undefined,
      command: undefined,
    });
  };

  const prefill = (ctx: any, command: string, notice: string) => {
    if (!ctx.hasUI) return;
    ctx.ui.setEditorText(command);
    ctx.ui.notify(notice, "info");
  };

  pi.on("session_start", async (_event, ctx) => {
    restore(ctx);
    if (ctx.hasUI) {
      ctx.ui.setStatus("startup-intake", "ready (first-message intake)");
    }
  });

  pi.on("session_switch", async (_event, ctx) => {
    restore(ctx);
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" as const };
    if (!ctx.hasUI) return { action: "continue" as const };
    if (state.firstMessageProcessed) return { action: "continue" as const };

    const text = event.text.trim();
    if (!text) return { action: "continue" as const };

    if (text.startsWith("/")) {
      // Utility commands should not consume first-message intake.
      return { action: "continue" as const };
    }

    setState({ firstMessageProcessed: true, phase: "intent_captured" });

    const intent = normalizeInline(text, 1200);
    const command = formatCommand("init-project-docs", [intent]);

    setState({
      intent,
      command,
      phase: "command_proposed",
    });

    prefill(
      ctx,
      command,
      "Startup intent captured. Review/edit and run the command to launch interview-first project doc setup.",
    );
    ctx.ui.setStatus("startup-intake", "init-project-docs command ready");

    return { action: "handled" as const };
  });

  pi.registerCommand("startup-intake-router-status", {
    description: "Show startup intake router state",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const summary = [
        `phase: ${state.phase}`,
        `first_message_processed: ${state.firstMessageProcessed ? "yes" : "no"}`,
        `intent: ${state.intent ?? "<none>"}`,
        `command: ${state.command ?? "<none>"}`,
        `updated_at: ${new Date(state.updatedAt).toISOString()}`,
      ];
      ctx.ui.notify(summary.join(" | "), "info");
    },
  });

  pi.registerCommand("startup-intake-router-reset", {
    description: "Reset startup intake router state for this session",
    handler: async (_args, ctx) => {
      state = newState();
      persist();
      if (ctx.hasUI) {
        ctx.ui.setStatus("startup-intake", "ready (reset)");
        ctx.ui.notify("Startup intake router reset. Next non-command message will propose /init-project-docs.", "info");
      }
    },
  });
}
