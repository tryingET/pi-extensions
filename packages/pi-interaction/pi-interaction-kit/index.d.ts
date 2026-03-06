export type PickerCandidate = {
  id: string;
  label: string;
  detail: string;
  preview?: string;
  source?: string;
  [key: string]: unknown;
};

export declare const DEFAULT_TIMEOUT_MS: number;
export declare function normalize(value: unknown): string;
export declare function toMessage(error: unknown): string;
export declare function splitQueryAndContext(
  raw: unknown,
  separator?: string,
): { query: string; context: string };
export declare function rankCandidatesFallback(
  candidates: PickerCandidate[],
  query?: string,
): PickerCandidate[];
export declare function rankCandidatesWithFzf(
  candidates: PickerCandidate[],
  query?: string,
  timeoutMs?: number,
): { ranked: PickerCandidate[] | null; reason?: string };
export declare function runFzfProbe(): Record<string, unknown>;
export declare function selectFuzzyCandidate(
  candidates: PickerCandidate[],
  options?: Record<string, unknown>,
): Promise<{ selected: PickerCandidate | null; mode: "fzf" | "fallback"; reason?: string }>;
export declare function emitTelemetry(
  telemetry: ((payload: Record<string, unknown>) => void) | undefined,
  payload: Record<string, unknown>,
): void;
