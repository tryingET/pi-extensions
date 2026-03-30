import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

/**
 * Stash extension - persistent, session-aware content stashing
 *
 * Shortcuts:
 *   Ctrl+X         - Quick stash (push+clear) or unstash if empty (pop+append)
 *   Alt+X / F9     - Explicit unstash (pop+append)
 *
 * Commands:
 *   /stash         - Open picker to select from all stashed items
 *   /stash clear   - Clear all stashed items
 *   /stash status  - Show stash statistics
 *
 * Persistence:
 *   Items stored in ~/.pi/agent/stash.json
 *   Survives /reload and pi restart
 */

interface StashItem {
  id: string;
  sessionId: string;
  sessionName?: string;
  content: string;
  preview: string;
  timestamp: number;
}

interface StashStore {
  items: StashItem[];
  version: number;
}

const STASH_VERSION = 1;
const STASH_FILE = path.join(os.homedir(), ".pi", "agent", "stash.json");
const PREVIEW_LEN = 50;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createPreview(content: string): string {
  const firstLine = content.split("\n")[0] || "";
  return firstLine.length > PREVIEW_LEN
    ? `${firstLine.slice(0, PREVIEW_LEN - 3)}...`
    : firstLine || "(empty)";
}

function loadStash(): StashStore {
  try {
    if (fs.existsSync(STASH_FILE)) {
      const raw = fs.readFileSync(STASH_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (data.version === STASH_VERSION && Array.isArray(data.items)) {
        return data as StashStore;
      }
    }
  } catch {
    // Ignore errors, start fresh
  }
  return { items: [], version: STASH_VERSION };
}

function saveStash(store: StashStore): void {
  try {
    const dir = path.dirname(STASH_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STASH_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save stash:", err);
  }
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isToday) {
    return `Today ${timeStr}`;
  }
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${timeStr}`;
}

export default function stashExtension(pi: ExtensionAPI) {
  const store: StashStore = loadStash();
  let currentSessionId: string = "unknown";
  let currentSessionName: string | undefined;

  const updateStatus = (
    ctx:
      | ExtensionContext
      | { hasUI: boolean; ui: { setStatus: (key: string, value: string | undefined) => void } },
  ) => {
    if (!ctx?.hasUI) return;
    ctx.ui.setStatus("stash", store.items.length > 0 ? `stash: ${store.items.length}` : undefined);
  };

  // Track current session
  pi.on("session_start", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    currentSessionId = sessionFile || `ephemeral-${Date.now()}`;
    currentSessionName = pi.getSessionName() || undefined;
    updateStatus(ctx);
  });

  const pushToStash = (content: string, ctx: ExtensionContext): void => {
    const item: StashItem = {
      id: generateId(),
      sessionId: currentSessionId,
      sessionName: currentSessionName,
      content,
      preview: createPreview(content),
      timestamp: Date.now(),
    };
    store.items.unshift(item); // Most recent first
    saveStash(store);
    updateStatus(ctx);
  };

  const popFromStash = (ctx: ExtensionContext): StashItem | undefined => {
    // Pop from current session first, then any
    const currentSessionIndex = store.items.findIndex(
      (item) => item.sessionId === currentSessionId,
    );
    const index = currentSessionIndex >= 0 ? currentSessionIndex : 0;
    const item = store.items.splice(index, 1)[0];
    if (item) {
      saveStash(store);
      updateStatus(ctx);
    }
    return item;
  };

  const popAndAppend = (ctx: ExtensionContext): void => {
    const popped = popFromStash(ctx);
    if (!popped) {
      ctx.ui.notify("stash: empty", "info");
      return;
    }

    const current = ctx.ui.getEditorText() ?? "";
    let next: string;
    if (current.length === 0) {
      next = popped.content;
    } else if (current.endsWith("\n") || popped.content.startsWith("\n")) {
      next = current + popped.content;
    } else {
      next = `${current}\n${popped.content}`;
    }

    ctx.ui.setEditorText(next);
    ctx.ui.notify(`Restored: ${popped.preview}`, "success");
  };

  async function showStashPicker(ctx: ExtensionContext): Promise<void> {
    if (store.items.length === 0) {
      ctx.ui.notify("No stashed items", "info");
      return;
    }

    // Group items by session
    const sessions = new Map<string, { name: string; items: StashItem[] }>();
    for (const item of store.items) {
      const key = item.sessionId;
      if (!sessions.has(key)) {
        sessions.set(key, {
          name: item.sessionName || `Session ${key.slice(0, 8)}`,
          items: [],
        });
      }
      sessions.get(key)?.items.push(item);
    }

    // Build select items with group headers
    const items: SelectItem[] = [];
    for (const [_key, session] of sessions) {
      for (const item of session.items) {
        items.push({
          value: item.id,
          label: item.preview,
          description: `${session.name} • ${formatTimestamp(item.timestamp)}`,
        });
      }
    }

    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();

      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(
        new Text(theme.fg("accent", theme.bold(`Stash (${store.items.length})`)), 1, 0),
      );
      container.addChild(new Text(theme.fg("dim", "Select to restore to editor"), 1, 0));

      const selectList = new SelectList(items, Math.min(items.length, 12), {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      });

      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);
      container.addChild(selectList);

      container.addChild(
        new Text(theme.fg("dim", "↑↓ navigate • enter restore • esc cancel • d delete"), 1, 0),
      );
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => {
          // Handle 'd' for delete
          if (data === "d") {
            const selected = selectList.getSelected();
            if (selected) {
              store.items = store.items.filter((item) => item.id !== selected.value);
              saveStash(store);
              updateStatus(ctx);
              if (store.items.length === 0) {
                done(null);
                ctx.ui.notify("Stash cleared", "info");
              } else {
                // Rebuild items and update list
                items.length = 0;
                const sessions = new Map<string, { name: string; items: StashItem[] }>();
                for (const item of store.items) {
                  const key = item.sessionId;
                  if (!sessions.has(key)) {
                    sessions.set(key, {
                      name: item.sessionName || `Session ${key.slice(0, 8)}`,
                      items: [],
                    });
                  }
                  sessions.get(key)?.items.push(item);
                }
                for (const [_key, session] of sessions) {
                  for (const item of session.items) {
                    items.push({
                      value: item.id,
                      label: item.preview,
                      description: `${session.name} • ${formatTimestamp(item.timestamp)}`,
                    });
                  }
                }
                selectList.setItems(items);
                tui.requestRender();
              }
            }
            return;
          }
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    });

    if (result !== null) {
      const selected = store.items.find((item) => item.id === result);
      if (selected) {
        const current = ctx.ui.getEditorText() ?? "";
        let next: string;
        if (current.length === 0) {
          next = selected.content;
        } else if (current.endsWith("\n") || selected.content.startsWith("\n")) {
          next = current + selected.content;
        } else {
          next = `${current}\n${selected.content}`;
        }
        ctx.ui.setEditorText(next);
        ctx.ui.notify(`Restored: ${selected.preview}`, "success");
      }
    }
  }

  // Quick stash/unstash shortcut
  pi.registerShortcut("ctrl+x", {
    description: "Stash editor content (push+clear). If empty, unstash (pop+append).",
    handler: async (ctx) => {
      if (!ctx.hasUI) return;

      const text = ctx.ui.getEditorText() ?? "";
      if (text.length === 0) {
        popAndAppend(ctx);
        return;
      }

      pushToStash(text, ctx);
      ctx.ui.setEditorText("");
      ctx.ui.notify(`Stashed: ${createPreview(text)}`, "success");
    },
  });

  // Alternative unstash shortcuts
  for (const key of ["alt+x", "ctrl+alt+x", "f9"] as const) {
    pi.registerShortcut(key, {
      description: "Unstash (pop+append) to editor",
      handler: async (ctx) => {
        if (!ctx.hasUI) return;
        popAndAppend(ctx);
      },
    });
  }

  // Stash picker shortcut (Ctrl+Shift+X might not work in all terminals)
  pi.registerShortcut("ctrl+shift+x", {
    description: "Open stash picker",
    handler: async (ctx) => {
      if (!ctx.hasUI) return;
      await showStashPicker(ctx);
    },
  });

  // Commands
  pi.registerCommand("stash", {
    description: "Manage stashed content",
    handler: async (args, ctx) => {
      const subCommand = args?.trim().toLowerCase();

      if (subCommand === "clear") {
        const count = store.items.length;
        store.items = [];
        saveStash(store);
        updateStatus(ctx);
        ctx.ui.notify(`Cleared ${count} stashed items`, "info");
        return;
      }

      if (subCommand === "status") {
        const sessions = new Set(store.items.map((item) => item.sessionId));
        ctx.ui.notify(
          `Stash: ${store.items.length} items across ${sessions.size} session(s)`,
          "info",
        );
        return;
      }

      // Default: show picker
      await showStashPicker(ctx);
    },
  });
}
