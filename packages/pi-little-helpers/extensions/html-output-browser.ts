import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const RECENT_ACTION_WINDOW_MS = 5000;
const HTML_WIDGET_ID = "html-output-browser";

type ToolPathInput = {
  path?: unknown;
};

type HtmlTarget = {
  absolutePath: string;
  rawReference: string;
  prettyPath: string;
  fileUrl: string;
};

type BrowserOpenCommand = {
  command: string;
  args: string[];
};

export type HtmlOutputBrowserDeps = {
  spawn: typeof spawn;
  now: () => number;
};

function isToolPathInput(value: unknown): value is ToolPathInput {
  return typeof value === "object" && value !== null;
}

function normalizeToolPath(input: unknown): string | undefined {
  if (!isToolPathInput(input) || typeof input.path !== "string") return undefined;
  return input.path.trim() || undefined;
}

function isHtmlPath(filePath: string): boolean {
  return /\.html?$/i.test(filePath);
}

function displayPath(cwd: string, rawPath: string, absolutePath: string): string {
  if (!isAbsolute(rawPath)) return rawPath;
  const relativePath = relative(cwd, absolutePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : rawPath;
}

function displayPathForReference(cwd: string, rawReference: string, absolutePath: string): string {
  if (rawReference.startsWith("file://")) {
    return displayPath(cwd, absolutePath, absolutePath);
  }
  return displayPath(cwd, rawReference, absolutePath);
}

function buildOsc8Hyperlink(target: string, label: string): string {
  return `\u001b]8;;${target}\u0007${label}\u001b]8;;\u0007`;
}

function buildHtmlNotice(target: HtmlTarget): string {
  return [
    "HTML preview:",
    buildOsc8Hyperlink(target.fileUrl, `- ${target.prettyPath}`),
    `  ${target.fileUrl}`,
  ].join("\n");
}

function buildHtmlWidgetLines(target: HtmlTarget): string[] {
  return [
    "Latest HTML preview",
    buildOsc8Hyperlink(target.fileUrl, `- ${target.prettyPath}`),
    `  ${target.fileUrl}`,
  ];
}

function appendNotice(content: unknown, notice: string) {
  const base = Array.isArray(content) ? content : [];
  return [...base, { type: "text", text: notice }];
}

function expandUserPath(candidate: string): string {
  if (candidate === "~") return homedir();
  if (candidate.startsWith("~/")) return resolve(homedir(), candidate.slice(2));
  return candidate;
}

function resolveHtmlTarget(cwd: string, candidate: string): HtmlTarget | undefined {
  const normalized = candidate.trim();
  if (!normalized) return undefined;

  let absolutePath: string;
  if (normalized.startsWith("file://")) {
    try {
      absolutePath = fileURLToPath(new URL(normalized));
    } catch {
      return undefined;
    }
  } else {
    const expanded = expandUserPath(normalized);
    absolutePath = isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
  }

  if (!existsSync(absolutePath) || !isHtmlPath(absolutePath)) return undefined;

  return {
    absolutePath,
    rawReference: normalized,
    prettyPath: displayPathForReference(cwd, normalized, absolutePath),
    fileUrl: pathToFileURL(absolutePath).href,
  };
}

function getBrowserOpenCommand(fileUrl: string): BrowserOpenCommand {
  if (process.platform === "darwin") {
    return { command: "open", args: [fileUrl] };
  }

  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", fileUrl] };
  }

  return { command: "xdg-open", args: [fileUrl] };
}

function formatOpenError(command: string, error: unknown): string {
  if (error instanceof Error) {
    return `${command}: ${error.message}`;
  }
  return `${command}: ${String(error)}`;
}

function clearHtmlWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(HTML_WIDGET_ID, undefined);
}

export function createHtmlOutputBrowserExtension(
  deps: Partial<HtmlOutputBrowserDeps> = {},
): (pi: ExtensionAPI) => void {
  const spawnImpl = deps.spawn ?? spawn;
  const now = deps.now ?? (() => Date.now());
  const recentHtmlActions = new Map<string, number>();

  function shouldAutoOpen(absolutePath: string): boolean {
    const currentTime = now();
    const lastOpened = recentHtmlActions.get(absolutePath);
    recentHtmlActions.set(absolutePath, currentTime);
    return lastOpened === undefined || currentTime - lastOpened > RECENT_ACTION_WINDOW_MS;
  }

  async function openInBrowser(fileUrl: string): Promise<void> {
    const { command, args } = getBrowserOpenCommand(fileUrl);

    await new Promise<void>((resolvePromise, rejectPromise) => {
      try {
        const child = spawnImpl(command, args, {
          detached: true,
          stdio: "ignore",
        });

        let settled = false;
        const settle =
          <T>(callback: (value: T) => void) =>
          (value: T) => {
            if (settled) return;
            settled = true;
            callback(value);
          };

        child.once(
          "error",
          settle((error: unknown) => {
            rejectPromise(new Error(formatOpenError(command, error)));
          }),
        );
        child.once(
          "spawn",
          settle(() => {
            child.unref();
            resolvePromise();
          }),
        );
      } catch (error) {
        rejectPromise(new Error(formatOpenError(command, error)));
      }
    });
  }

  async function presentHtmlTarget(ctx: ExtensionContext, target: HtmlTarget): Promise<void> {
    if (!ctx.hasUI) return;

    ctx.ui.setWidget(HTML_WIDGET_ID, buildHtmlWidgetLines(target), {
      placement: "belowEditor",
    });

    if (!shouldAutoOpen(target.absolutePath)) return;

    try {
      await openInBrowser(target.fileUrl);
      ctx.ui.notify(`Opened HTML in browser: ${target.prettyPath}`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`HTML preview ready, but auto-open failed: ${message}`, "warning");
    }
  }

  return function htmlOutputBrowserExtension(pi: ExtensionAPI): void {
    pi.on("tool_result", async (event, ctx) => {
      if (event.isError) return undefined;
      if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

      const rawPath = normalizeToolPath(event.input);
      if (!rawPath || !isHtmlPath(rawPath)) {
        clearHtmlWidget(ctx);
        return undefined;
      }

      const target = resolveHtmlTarget(ctx.cwd, rawPath);
      if (!target) {
        clearHtmlWidget(ctx);
        return undefined;
      }

      await presentHtmlTarget(ctx, target);
      return {
        content: appendNotice(event.content, buildHtmlNotice(target)),
      };
    });
  };
}

export default createHtmlOutputBrowserExtension();
