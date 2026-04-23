export interface FuzzyCandidate {
  id: string;
  label: string;
  detail?: string;
}

export interface FuzzySelectorUi {
  select?(title: string, options: string[]): Promise<string | undefined> | string | undefined;
}

export interface FuzzySelectionResult<TCandidate extends FuzzyCandidate> {
  selected: TCandidate | null;
  mode: "fzf" | "fallback";
  reason?: string;
}

export interface FzfProbeReport {
  interactive: {
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    error?: string;
  };
  filter: {
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    error?: string;
  };
}

export function rankCandidatesFallback<TCandidate extends FuzzyCandidate>(
  candidates: readonly TCandidate[],
  query?: string,
): TCandidate[];

export function rankCandidatesWithFzf<TCandidate extends FuzzyCandidate>(
  candidates: readonly TCandidate[],
  query?: string,
): { ranked: TCandidate[] | null; reason?: string };

export function selectFuzzyCandidate<TCandidate extends FuzzyCandidate>(
  candidates: readonly TCandidate[],
  options?: {
    query?: string;
    ui?: FuzzySelectorUi;
    title?: string;
    maxOptions?: number;
  },
): Promise<FuzzySelectionResult<TCandidate>>;

export function runFzfProbe(): FzfProbeReport;
