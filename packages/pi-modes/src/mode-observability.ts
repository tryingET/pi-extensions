import { createHash } from "node:crypto";
import type { ModeSelection, ModeStateV3, ResolvedMode, ResolvedModeSelection } from "./modes.ts";

export interface CompositionComponentReport {
  key: string;
  role: "base" | "overlay";
  strategy: ResolvedMode["promptStrategy"];
  scope: ResolvedMode["scope"];
  path: string | null;
  digest: string;
}

export interface CompositionReport {
  schemaVersion: 1;
  selection: ModeSelection;
  effective: ModeSelection;
  blocked: boolean;
  driftedKeys: string[];
  diagnostics: string[];
  composition: {
    sha256: string;
    utf8Bytes: number;
    characters: number;
    estimatedTokens: number;
    hostDeltaBytes: number;
  };
  activation: {
    source: string | null;
    activatedAt: string | null;
    driftPolicy: string | null;
  };
  components: CompositionComponentReport[];
  prompt?: string;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

export function createCompositionReport(options: {
  selection: ModeSelection;
  resolved: ResolvedModeSelection;
  prompt: string;
  hostPrompt: string;
  state?: ModeStateV3;
  includePrompt?: boolean;
}): CompositionReport {
  const components: CompositionComponentReport[] = [
    ...(options.resolved.base
      ? [
          {
            key: options.resolved.base.key,
            role: "base" as const,
            strategy: options.resolved.base.promptStrategy,
            scope: options.resolved.base.scope,
            path: options.resolved.base.path ?? null,
            digest: sha256(options.resolved.base.systemPrompt),
          },
        ]
      : []),
    ...options.resolved.overlays.map((mode) => ({
      key: mode.key,
      role: "overlay" as const,
      strategy: mode.promptStrategy,
      scope: mode.scope,
      path: mode.path ?? null,
      digest: sha256(mode.systemPrompt),
    })),
  ];
  return {
    schemaVersion: 1,
    selection: {
      baseKey: options.selection.baseKey,
      overlayKeys: [...options.selection.overlayKeys],
    },
    effective: {
      baseKey: options.resolved.base?.key ?? null,
      overlayKeys: options.resolved.overlays.map((mode) => mode.key),
    },
    blocked: options.resolved.blocked,
    driftedKeys: [...options.resolved.driftedKeys],
    diagnostics: options.resolved.diagnostics.map(
      (item) => `${item.key ? `${item.key}: ` : ""}${item.message}`,
    ),
    composition: {
      sha256: sha256(options.prompt),
      utf8Bytes: Buffer.byteLength(options.prompt, "utf8"),
      characters: options.prompt.length,
      estimatedTokens: estimateTokens(options.prompt),
      hostDeltaBytes:
        Buffer.byteLength(options.prompt, "utf8") - Buffer.byteLength(options.hostPrompt, "utf8"),
    },
    activation: {
      source: options.state?.source ?? null,
      activatedAt: options.state?.activatedAt ?? null,
      driftPolicy: options.state?.driftPolicy ?? null,
    },
    components,
    ...(options.includePrompt ? { prompt: options.prompt } : {}),
  };
}

export function compactCompositionSummary(report: CompositionReport): string {
  const base = report.effective.baseKey ?? "native";
  const overlay = report.effective.overlayKeys.length;
  const flags = [report.blocked ? "BLOCKED" : "", report.driftedKeys.length ? "DRIFT" : ""]
    .filter(Boolean)
    .join("/");
  return [
    `base:${base} +${overlay}`,
    `${report.composition.utf8Bytes} B`,
    `~${report.composition.estimatedTokens} tokens`,
    `sha256:${report.composition.sha256.slice(0, 12)}`,
    flags,
  ]
    .filter(Boolean)
    .join(" · ");
}
