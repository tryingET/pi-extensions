import { spawn } from "node:child_process";
import { type Dirent, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

const RECENT_ACTION_WINDOW_MS = 5000;
const RECENT_ARTIFACT_WINDOW_MS = 60 * 60 * 1000;
const MAX_RECENT_ARTIFACTS = 50;
const HTML_WIDGET_ID = "html-output-browser";
const MAX_ARTIFACT_DEPTH = 5;
const MAX_ARTIFACT_RESULTS = 200;
const ARTIFACT_SHORTCUT = "ctrl+shift+s";
const ARTIFACT_COMMAND = "artifacts";
const EXCLUDED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "target",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".venv",
  "__pycache__",
]);

const OPENABLE_ARTIFACT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".pdf",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

const JSON_ARTIFACT_NAME =
  /(?:artifact|artifacts|report|reports|export|snapshot|receipt|receipts|coverage|result|results|manifest|index)/i;

type ToolPathInput = {
  path?: unknown;
};

type ArtifactTarget = {
  absolutePath: string;
  rawReference: string;
  prettyPath: string;
  fileUrl: string;
  kind: string;
  mtimeMs: number;
};

type BrowserOpenCommand = {
  command: string;
  args: string[];
};

type RecentArtifactEntry = {
  absolutePath: string;
  seenAtMs: number;
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

export function isOpenableArtifactPath(filePath: string): boolean {
  const extension = extname(filePath).toLowerCase();
  if (OPENABLE_ARTIFACT_EXTENSIONS.has(extension)) return true;
  if (extension !== ".json") return false;
  return JSON_ARTIFACT_NAME.test(basename(filePath));
}

function artifactKind(filePath: string): string {
  const extension = extname(filePath).toLowerCase().replace(/^\./, "");
  if (extension === "htm") return "html";
  return extension || "file";
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

function buildHtmlNotice(target: ArtifactTarget): string {
  return [
    "HTML preview:",
    buildOsc8Hyperlink(target.fileUrl, `- ${target.prettyPath}`),
    `  ${target.fileUrl}`,
  ].join("\n");
}

function buildArtifactWidgetLines(target: ArtifactTarget): string[] {
  return [
    "Latest artifact preview",
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

function resolveArtifactTarget(cwd: string, candidate: string): ArtifactTarget | undefined {
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

  if (!existsSync(absolutePath) || !isOpenableArtifactPath(absolutePath)) return undefined;

  let mtimeMs = 0;
  try {
    mtimeMs = statSync(absolutePath).mtimeMs;
  } catch {
    return undefined;
  }

  return {
    absolutePath,
    rawReference: normalized,
    prettyPath: displayPathForReference(cwd, normalized, absolutePath),
    fileUrl: pathToFileURL(absolutePath).href,
    kind: artifactKind(absolutePath),
    mtimeMs,
  };
}

function isExcludedDir(name: string): boolean {
  return EXCLUDED_DIRS.has(name);
}

function rememberRecentArtifact(
  recentArtifacts: Map<string, RecentArtifactEntry>,
  target: ArtifactTarget,
  seenAtMs: number,
): void {
  recentArtifacts.delete(target.absolutePath);
  recentArtifacts.set(target.absolutePath, {
    absolutePath: target.absolutePath,
    seenAtMs,
  });

  while (recentArtifacts.size > MAX_RECENT_ARTIFACTS) {
    const oldestKey = recentArtifacts.keys().next().value;
    if (typeof oldestKey !== "string") return;
    recentArtifacts.delete(oldestKey);
  }
}

function getRecentArtifactTargets(
  cwd: string,
  recentArtifacts: Map<string, RecentArtifactEntry>,
  currentTime: number,
): ArtifactTarget[] {
  const targets: ArtifactTarget[] = [];

  for (const [absolutePath, entry] of recentArtifacts) {
    if (currentTime - entry.seenAtMs > RECENT_ARTIFACT_WINDOW_MS) {
      recentArtifacts.delete(absolutePath);
      continue;
    }

    const target = resolveArtifactTarget(cwd, entry.absolutePath);
    if (!target) {
      recentArtifacts.delete(absolutePath);
      continue;
    }

    targets.push(target);
  }

  return targets.sort((a, b) => {
    const aSeenAt = recentArtifacts.get(a.absolutePath)?.seenAtMs ?? 0;
    const bSeenAt = recentArtifacts.get(b.absolutePath)?.seenAtMs ?? 0;
    return bSeenAt - aSeenAt || b.mtimeMs - a.mtimeMs || a.prettyPath.localeCompare(b.prettyPath);
  });
}

function sortArtifactTargets(targets: ArtifactTarget[]): ArtifactTarget[] {
  return targets.sort((a, b) => {
    const htmlBias = Number(isHtmlPath(b.absolutePath)) - Number(isHtmlPath(a.absolutePath));
    if (htmlBias !== 0) return htmlBias;
    return b.mtimeMs - a.mtimeMs || a.prettyPath.localeCompare(b.prettyPath);
  });
}

export function discoverArtifactTargets(cwd: string): ArtifactTarget[] {
  const targets: ArtifactTarget[] = [];

  function visit(dir: string, depth: number): void {
    if (depth > MAX_ARTIFACT_DEPTH || targets.length >= MAX_ARTIFACT_RESULTS) return;

    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (targets.length >= MAX_ARTIFACT_RESULTS) return;
      if (entry.isDirectory()) {
        if (!isExcludedDir(entry.name)) visit(resolve(dir, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;

      const absolutePath = resolve(dir, entry.name);
      if (!isOpenableArtifactPath(absolutePath)) continue;

      const target = resolveArtifactTarget(cwd, absolutePath);
      if (target) targets.push(target);
    }
  }

  visit(cwd, 0);

  return sortArtifactTargets(targets);
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
  const recentArtifacts = new Map<string, RecentArtifactEntry>();

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

  async function presentArtifactTarget(
    ctx: ExtensionContext,
    target: ArtifactTarget,
  ): Promise<void> {
    if (!ctx.hasUI) return;

    ctx.ui.setWidget(HTML_WIDGET_ID, buildArtifactWidgetLines(target), {
      placement: "belowEditor",
    });

    if (!shouldAutoOpen(target.absolutePath)) return;

    try {
      await openInBrowser(target.fileUrl);
      ctx.ui.notify(`Opened artifact in browser: ${target.prettyPath}`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Artifact preview ready, but auto-open failed: ${message}`, "warning");
    }
  }

  async function showArtifactPicker(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) return;

    const recentTargets = getRecentArtifactTargets(ctx.cwd, recentArtifacts, now());
    const recentAbsolutePaths = new Set(recentTargets.map((target) => target.absolutePath));
    const discoveredTargets = discoverArtifactTargets(ctx.cwd).filter(
      (target) => !recentAbsolutePaths.has(target.absolutePath),
    );
    const targets = [...recentTargets, ...discoveredTargets];
    if (targets.length === 0) {
      ctx.ui.notify("No openable artifacts found in this workspace", "info");
      return;
    }

    const items: SelectItem[] = targets.map((target, index) => {
      const kind = recentAbsolutePaths.has(target.absolutePath)
        ? `recent ${target.kind}`
        : target.kind;
      return {
        value: String(index),
        label: `[${kind}] ${target.prettyPath}`,
        description: target.fileUrl,
      };
    });

    const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(
        new Text(theme.fg("accent", theme.bold(`Artifacts (${targets.length})`)), 1, 0),
      );
      container.addChild(
        new Text(theme.fg("dim", "Select to open or copy the clickable file URL"), 1, 0),
      );

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
      container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter open • esc cancel"), 1, 0));
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

    if (result === null) return;
    const target = targets[parseInt(result, 10)];
    if (target) await presentArtifactTarget(ctx, target);
  }

  return function htmlOutputBrowserExtension(pi: ExtensionAPI): void {
    pi.on("tool_result", async (event, ctx) => {
      if (event.isError) return undefined;
      if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

      const rawPath = normalizeToolPath(event.input);
      const target = rawPath ? resolveArtifactTarget(ctx.cwd, rawPath) : undefined;
      if (target) rememberRecentArtifact(recentArtifacts, target, now());

      if (!rawPath || !isHtmlPath(rawPath)) {
        clearHtmlWidget(ctx);
        return undefined;
      }

      if (!target) {
        clearHtmlWidget(ctx);
        return undefined;
      }

      await presentArtifactTarget(ctx, target);
      return {
        content: appendNotice(event.content, buildHtmlNotice(target)),
      };
    });

    const artifactCommand = {
      description: "Pick an artifact from the workspace to open",
      handler: async (args: string, ctx: ExtensionContext) => {
        const requestedPath = args.trim();
        if (requestedPath) {
          const target = resolveArtifactTarget(ctx.cwd, requestedPath);
          if (!target) {
            ctx.ui.notify(`Artifact not found or unsupported: ${requestedPath}`, "warning");
            return;
          }
          rememberRecentArtifact(recentArtifacts, target, now());
          await presentArtifactTarget(ctx, target);
          return;
        }
        await showArtifactPicker(ctx);
      },
    };

    pi.registerCommand(ARTIFACT_COMMAND, artifactCommand);
    pi.registerCommand("show-artifacts", artifactCommand);

    pi.registerShortcut(ARTIFACT_SHORTCUT, {
      description: "Show artifacts",
      handler: async (ctx) => {
        await showArtifactPicker(ctx);
      },
    });
  };
}

export default createHtmlOutputBrowserExtension();
