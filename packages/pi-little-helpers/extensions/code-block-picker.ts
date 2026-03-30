/**
 * Code Block Picker Extension
 *
 * Extract all code blocks from the conversation and show in a fuzzy picker.
 * Select one to copy to clipboard.
 *
 * Usage:
 *   /codeblocks      - Show picker with all code blocks
 *   Ctrl+Shift+Y     - Keyboard shortcut
 */

import { execSync, spawn } from "node:child_process";
import { platform } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

interface CodeBlock {
  language: string;
  code: string;
  preview: string;
  messageIndex: number;
}

type NativeClipboardExecOptions = {
  input: string;
  timeout: number;
  stdio: ["pipe", "ignore", "ignore"];
};

function emitOsc52(text: string): void {
  const encoded = Buffer.from(text).toString("base64");
  process.stdout.write(`\x1b]52;c;${encoded}\x07`);
}

function copyToX11Clipboard(options: NativeClipboardExecOptions): void {
  try {
    execSync("xclip -selection clipboard", options);
  } catch {
    execSync("xsel --clipboard --input", options);
  }
}

function copyToWaylandClipboard(text: string): void {
  execSync("which wl-copy", { stdio: "ignore" });
  const proc = spawn("wl-copy", [], { stdio: ["pipe", "ignore", "ignore"] });
  proc.stdin.on("error", () => {
    // Ignore EPIPE if wl-copy exits early.
  });
  proc.stdin.write(text);
  proc.stdin.end();
  proc.unref();
}

async function copyTextSafely(text: string): Promise<void> {
  // Always emit OSC 52 first; this covers many remote-terminal cases.
  emitOsc52(text);

  const os = platform();
  const options: NativeClipboardExecOptions = {
    input: text,
    timeout: 5000,
    stdio: ["pipe", "ignore", "ignore"],
  };

  try {
    if (os === "darwin") {
      execSync("pbcopy", options);
      return;
    }

    if (os === "win32") {
      execSync("clip", options);
      return;
    }

    if (process.env.TERMUX_VERSION) {
      execSync("termux-clipboard-set", options);
      return;
    }

    const hasWaylandDisplay = Boolean(process.env.WAYLAND_DISPLAY);
    const hasX11Display = Boolean(process.env.DISPLAY);
    const isWayland = hasWaylandDisplay || process.env.XDG_SESSION_TYPE === "wayland";

    // Avoid pi's native clipboard helper here: on headless/Wayland Linux it can
    // panic inside the Rust binding when DISPLAY is unset.
    if (isWayland && hasWaylandDisplay) {
      try {
        copyToWaylandClipboard(text);
        return;
      } catch {
        if (hasX11Display) {
          copyToX11Clipboard(options);
        }
        return;
      }
    }

    if (hasX11Display) {
      copyToX11Clipboard(options);
    }
  } catch {
    // Ignore local clipboard failures; OSC 52 was already emitted.
  }
}

// Extract code blocks from text
function extractCodeBlocks(text: string, messageIndex: number): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  // Match ```lang\ncode``` or ```\ncode```
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match !== null) {
    const language = match[1] || "text";
    const code = match[2].trim();
    // Create preview: first line or first 50 chars
    const firstLine = code.split("\n")[0] || "";
    const preview = firstLine.length > 50 ? `${firstLine.slice(0, 47)}...` : firstLine;

    blocks.push({
      language,
      code,
      preview: preview || `(${language} block, ${code.split("\n").length} lines)`,
      messageIndex,
    });

    match = regex.exec(text);
  }

  return blocks;
}

// Extract text content from message
function getMessageText(message: unknown): string {
  if (!message) return "";

  const msg = message as Record<string, unknown>;

  // Handle string content
  if (typeof msg.content === "string") {
    return msg.content;
  }

  // Handle array content (TextContent[])
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) {
          return block.text;
        }
        return "";
      })
      .join("\n");
  }

  return "";
}

export default function codeBlockPickerExtension(pi: ExtensionAPI) {
  async function showCodeBlockPicker(ctx: ExtensionContext): Promise<void> {
    // Get all session entries
    const entries = ctx.sessionManager.getBranch();
    const blocks: CodeBlock[] = [];

    // Extract code blocks from message entries
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry && entry.type === "message") {
        const msgEntry = entry as { message?: unknown };
        const text = getMessageText(msgEntry.message);
        const entryBlocks = extractCodeBlocks(text, i);
        blocks.push(...entryBlocks);
      }
    }

    if (blocks.length === 0) {
      ctx.ui.notify("No code blocks found in conversation", "info");
      return;
    }

    // Reverse so latest blocks appear first
    blocks.reverse();

    // Build select items
    const items: SelectItem[] = blocks.map((block, index) => ({
      value: String(index),
      label: `[${block.language}] ${block.preview}`,
      description: `${block.code.split("\n").length} lines`,
    }));

    // Show picker
    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();

      // Top border
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      // Title
      container.addChild(
        new Text(theme.fg("accent", theme.bold(`Code Blocks (${blocks.length})`)), 1, 0),
      );
      container.addChild(new Text(theme.fg("dim", "Select to copy to clipboard"), 1, 0));

      // SelectList
      const selectList = new SelectList(items, Math.min(items.length, 15), {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      });

      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);
      container.addChild(selectList);

      // Help text
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter copy • esc cancel"), 1, 0));

      // Bottom border
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => {
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    });

    if (result !== null) {
      const blockIndex = parseInt(result, 10);
      const selectedBlock = blocks[blockIndex];

      if (selectedBlock) {
        try {
          await copyTextSafely(selectedBlock.code);
          ctx.ui.notify(
            `Copied ${selectedBlock.language} block (${selectedBlock.code.split("\n").length} lines)`,
            "success",
          );
        } catch (err) {
          ctx.ui.notify(`Failed to copy: ${err}`, "error");
        }
      }
    }
  }

  // Register /codeblocks command
  pi.registerCommand("codeblocks", {
    description: "Pick a code block from conversation to copy",
    handler: async (_args, ctx) => {
      await showCodeBlockPicker(ctx);
    },
  });

  // Register keyboard shortcut (Ctrl+Shift+Y)
  pi.registerShortcut("ctrl+shift+y", {
    description: "Pick code block to copy",
    handler: async (ctx) => {
      await showCodeBlockPicker(ctx);
    },
  });
}
