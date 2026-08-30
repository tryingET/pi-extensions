import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const BETTER_OPENAI_FAST_STATE_EVENT = "pi-better-openai:fast-state";
const BETTER_OPENAI_FAST_STATE_SCHEMA = "pi.better_openai.fast_state.v1";
const BETTER_OPENAI_PACKAGE_NAME = "@tryinget/pi-better-openai";

export interface SubagentRuntimeInheritance {
  betterOpenAIFast?: {
    mode: "on" | "off";
    childExtensionSource: string;
  };
}

export type SubagentRuntimeInheritanceProvider = () => SubagentRuntimeInheritance | undefined;

export function registerSubagentRuntimeInheritance(
  pi: ExtensionAPI,
): SubagentRuntimeInheritanceProvider {
  if (!pi.events || typeof pi.events.on !== "function") return () => undefined;
  let betterOpenAIFast: SubagentRuntimeInheritance["betterOpenAIFast"];
  const unsubscribe = pi.events.on(BETTER_OPENAI_FAST_STATE_EVENT, (payload) => {
    if (!isBetterOpenAIFastState(payload)) return;
    const childExtensionSource = resolveBetterOpenAIChildExtension(pi);
    if (!childExtensionSource) return;
    betterOpenAIFast = {
      mode: payload.mode,
      childExtensionSource,
    };
  });

  pi.on("session_shutdown", () => {
    unsubscribe();
  });

  return () => (betterOpenAIFast ? { betterOpenAIFast: { ...betterOpenAIFast } } : undefined);
}

export function resolveSubagentRuntimeInheritance(
  provider: SubagentRuntimeInheritanceProvider | undefined,
): SubagentRuntimeInheritance | undefined {
  const value = provider?.();
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Subagent runtime inheritance provider returned a non-object value.");
  }
  if (value.betterOpenAIFast === undefined) return {};
  if (!isBetterOpenAIFastDescriptor(value.betterOpenAIFast)) {
    throw new Error("Subagent runtime inheritance provider returned invalid Better OpenAI state.");
  }
  return { betterOpenAIFast: { ...value.betterOpenAIFast } };
}

function isBetterOpenAIFastState(value: unknown): value is {
  schema: typeof BETTER_OPENAI_FAST_STATE_SCHEMA;
  mode: "on" | "off";
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.schema === BETTER_OPENAI_FAST_STATE_SCHEMA &&
    (candidate.mode === "on" || candidate.mode === "off")
  );
}

function isBetterOpenAIFastDescriptor(value: unknown): value is {
  mode: "on" | "off";
  childExtensionSource: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.mode === "on" || candidate.mode === "off") &&
    typeof candidate.childExtensionSource === "string" &&
    isTrustedBetterOpenAIChildExtension(candidate.childExtensionSource)
  );
}

function isTrustedBetterOpenAIChildExtension(source: string): boolean {
  return (
    getTrustedBetterOpenAIPackageRoot(source, [
      "extensions/fast-child.ts",
      "extensions/fast-child.js",
    ]) !== undefined
  );
}

function resolveBetterOpenAIChildExtension(pi: ExtensionAPI): string | undefined {
  if (typeof pi.getCommands !== "function") return undefined;
  for (const command of pi.getCommands()) {
    if (command.source !== "extension" || command.name.replace(/:\\d+$/u, "") !== "fast") continue;
    const source = command.sourceInfo?.path;
    const baseDir = command.sourceInfo?.baseDir;
    if (
      command.sourceInfo?.origin !== "package" ||
      typeof source !== "string" ||
      typeof baseDir !== "string"
    ) {
      continue;
    }
    const packageRoot = getTrustedBetterOpenAIPackageRoot(
      source,
      ["extensions/fast.ts", "extensions/fast.js"],
      baseDir,
    );
    if (!packageRoot) continue;
    for (const childRelative of ["extensions/fast-child.ts", "extensions/fast-child.js"]) {
      const childSource = join(packageRoot, childRelative);
      if (isTrustedBetterOpenAIChildExtension(childSource)) return realpathSync(childSource);
    }
  }
  return undefined;
}

function getTrustedBetterOpenAIPackageRoot(
  source: string,
  expectedRelativePaths: string[],
  expectedPackageRoot?: string,
): string | undefined {
  if (!isAbsolute(source)) return undefined;
  const packageRoot = expectedPackageRoot ?? dirname(dirname(source));
  try {
    const realSource = realpathSync(source);
    const realRoot = realpathSync(packageRoot);
    const sourceRelative = relative(realRoot, realSource);
    if (!expectedRelativePaths.includes(sourceRelative)) return undefined;
    const manifest = JSON.parse(readFileSync(join(realRoot, "package.json"), "utf8")) as {
      name?: unknown;
    };
    return manifest.name === BETTER_OPENAI_PACKAGE_NAME ? realRoot : undefined;
  } catch {
    return undefined;
  }
}

export const _test = {
  isBetterOpenAIFastDescriptor,
  isBetterOpenAIFastState,
  getTrustedBetterOpenAIPackageRoot,
  isTrustedBetterOpenAIChildExtension,
  resolveBetterOpenAIChildExtension,
};
