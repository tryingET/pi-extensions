// ---
// summary: "Registers the context inspector command and keeps its overlay snapshot synchronized with Pi session events."
// read_when:
//   - "Changing context-overlay command registration, session synchronization, or zellij file opening."
// ---
import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  buildSessionContext,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { ContextOverlayComponent } from "../src/context-overlay-component.js";
import { executeOpenFile, planOpenFile, spawnDetachRunner } from "../src/open-file.js";
import { ContextSnapshotStore } from "../src/snapshot-store.js";

const stripAtPrefix = (path: string): string => (path.startsWith("@") ? path.slice(1) : path);

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
      if ((ctx as ExtensionContext & { mode?: string }).mode === "rpc") {
        ctx.ui.notify("Context inspector requires interactive TUI mode", "warning");
        return;
      }

      syncStoreFromSession(ctx);

      const openPathInEditor = async (rawPath: string): Promise<boolean> => {
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

        const attempts = planOpenFile({ filePath, cwd: ctx.cwd, env: process.env });
        if (attempts.length === 0) {
          ctx.ui.notify("No editor launch path (zellij or Ghostty)", "error");
          return false;
        }

        const result = await executeOpenFile(attempts, ctx.cwd, {
          wait: async (attempt, cwd) =>
            pi.exec(attempt.command, attempt.args, { cwd, timeout: attempt.timeoutMs }),
          detach: spawnDetachRunner(),
        });

        if (result.ok) {
          const how = result.kind === "detached" ? "editor session launched" : "opened in editor";
          ctx.ui.notify(`${how} (${result.label}): ${filePath}`, "info");
          return true;
        }

        ctx.ui.notify(`Failed to open in editor: ${result.detail}`, "error");
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
            openPathInEditor,
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
