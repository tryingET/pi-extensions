import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  buildSessionContext,
  type ExtensionAPI,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { ContextOverlayComponent } from "../src/context-overlay-component.js";
import { ContextSnapshotStore } from "../src/snapshot-store.js";

const stripAtPrefix = (path: string): string => (path.startsWith("@") ? path.slice(1) : path);

const resolveEditorCommand = (): string[] => {
  const rawEditor = (process.env.VISUAL ?? process.env.EDITOR ?? "vi").trim();
  const parts = rawEditor.split(/\s+/).filter((part) => part.length > 0);
  return parts.length > 0 ? parts : ["vi"];
};

export default function contextOverlayExtension(pi: ExtensionAPI): void {
  const store = new ContextSnapshotStore();

  const syncStoreFromSession = (ctx: ExtensionContext): void => {
    const liveSessionContext = buildSessionContext(
      ctx.sessionManager.getEntries(),
      ctx.sessionManager.getLeafId(),
    );

    store.replaceSnapshot({
      systemPrompt: ctx.getSystemPrompt(),
      messages: liveSessionContext.messages,
      usage: ctx.getContextUsage(),
    });
  };

  pi.on("before_agent_start", (event) => {
    store.onBeforeAgentStart(event.systemPrompt);
  });

  pi.on("context", (event, ctx) => {
    store.onContext(event.messages);
    store.onUsage(ctx.getContextUsage());
  });

  pi.on("turn_end", (_event, ctx) => {
    store.onUsage(ctx.getContextUsage());
  });

  pi.on("session_start", (_event, ctx) => {
    syncStoreFromSession(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    syncStoreFromSession(ctx);
  });

  pi.on("session_compact", (_event, ctx) => {
    syncStoreFromSession(ctx);
  });

  pi.registerCommand("c", {
    description: "Open context inspector overlay",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      syncStoreFromSession(ctx);

      const openPathInZellij = async (rawPath: string): Promise<boolean> => {
        if (!process.env.ZELLIJ) {
          ctx.ui.notify("Not running inside zellij session", "error");
          return false;
        }

        const normalized = stripAtPrefix(rawPath.trim());
        const filePath = isAbsolute(normalized) ? normalized : resolve(ctx.cwd, normalized);

        let fileStat: Awaited<ReturnType<typeof stat>>;
        try {
          fileStat = await stat(filePath);
        } catch {
          ctx.ui.notify(`Path does not exist: ${filePath}`, "error");
          return false;
        }

        if (!fileStat.isFile()) {
          if (fileStat.isDirectory()) {
            ctx.ui.notify(`Path is a directory, not a file: ${filePath}`, "warning");
          } else {
            ctx.ui.notify(`Path is not a regular file: ${filePath}`, "warning");
          }
          return false;
        }

        const sessionName = process.env.ZELLIJ_SESSION_NAME;
        const sessionPrefix = sessionName ? ["--session", sessionName] : [];
        const editorCommand = resolveEditorCommand();

        const attempts: Array<{ label: string; args: string[] }> = [
          {
            label: "run",
            args: [
              ...sessionPrefix,
              "run",
              "--direction",
              "down",
              "--cwd",
              ctx.cwd,
              "--",
              ...editorCommand,
              filePath,
            ],
          },
          {
            label: "action-edit",
            args: [
              ...sessionPrefix,
              "action",
              "edit",
              "--direction",
              "down",
              "--cwd",
              ctx.cwd,
              filePath,
            ],
          },
          {
            label: "edit",
            args: [...sessionPrefix, "edit", "--direction", "down", "--cwd", ctx.cwd, filePath],
          },
        ];

        if (sessionPrefix.length > 0) {
          attempts.push({
            label: "run-no-session",
            args: [
              "run",
              "--direction",
              "down",
              "--cwd",
              ctx.cwd,
              "--",
              ...editorCommand,
              filePath,
            ],
          });
        }

        let lastError = "unknown error";
        for (const attempt of attempts) {
          const result = await pi.exec("zellij", attempt.args, { cwd: ctx.cwd });
          if (result.code === 0) {
            ctx.ui.notify(`Opened in zellij (${attempt.label}): ${filePath}`, "info");
            return true;
          }
          lastError = (result.stderr || result.stdout || `exit ${result.code}`).trim();
        }

        ctx.ui.notify(`Failed to open in zellij: ${lastError}`, "error");
        return false;
      };

      const modelLabel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
      let component: ContextOverlayComponent | undefined;

      await ctx.ui.custom<void>(
        (tui, theme, keybindings, done) => {
          component = new ContextOverlayComponent(
            tui,
            theme,
            keybindings,
            store.buildSnapshot(modelLabel),
            () => done(undefined),
            openPathInZellij,
            (message, level) => ctx.ui.notify(message, level ?? "info"),
          );

          const mountedComponent = component;
          const unsubscribe = store.subscribe(() => {
            mountedComponent.setSnapshot(store.buildSnapshot(modelLabel));
          });

          return {
            render: (w) => mountedComponent.render(w),
            handleInput: (d) => mountedComponent.handleInput(d),
            invalidate: () => mountedComponent.invalidate(),
            dispose: () => {
              unsubscribe();
              mountedComponent.dispose();
            },
          };
        },
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: "82%",
            maxHeight: "86%",
            margin: 1,
          },
        },
      );
    },
  });
}
