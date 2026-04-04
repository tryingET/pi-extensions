/**
 * Candidate selection flow for live trigger pickers.
 */

import {
  DEFAULT_TIMEOUT_MS,
  normalize,
  rankCandidatesFallback,
  rankCandidatesWithFzf,
} from "./core.js";
import { emitTelemetry } from "./telemetry.js";
import { selectWithInteractiveOverlay } from "./ui.js";

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   detail: string,
 *   preview?: string,
 *   source?: string,
 *   [key: string]: unknown,
 * }} Candidate
 */

/**
 * @typedef {{
 *   select?: (title: string, options: string[]) => Promise<string|null|undefined>,
 *   custom?: (
 *     factory: (tui: { requestRender: () => void }, theme: unknown, kb: unknown, done: (value: unknown) => void) => unknown,
 *     options?: unknown,
 *   ) => Promise<unknown>,
 * }} SelectionUI
 */

/**
 * @typedef {{
 *   query?: string,
 *   title?: string,
 *   ui?: SelectionUI,
 *   maxOptions?: number,
 *   timeoutMs?: number,
 *   disableFzf?: boolean,
 *   inlineFiltering?: boolean,
 *   telemetry?: ((payload: Record<string, unknown>) => void),
 * }} SelectOptions
 */

/**
 * @param {Candidate[]} candidates
 * @returns {{ label: string, candidate: Candidate }[]}
 */
function buildOptionLabels(candidates) {
  const labels = [];
  const seenCounts = new Map();

  for (const candidate of candidates) {
    const baseLabel = candidate.detail
      ? `${candidate.label} — ${candidate.detail}`
      : candidate.label;
    const count = seenCounts.get(baseLabel) ?? 0;
    seenCounts.set(baseLabel, count + 1);

    const label = count === 0 ? baseLabel : `${baseLabel} (${candidate.id})`;
    labels.push({ label, candidate });
  }

  return labels;
}

/**
 * @param {Candidate[]} candidates
 * @param {SelectOptions} [options]
 */
export async function selectFuzzyCandidate(candidates, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { selected: null, mode: "fallback", reason: "empty-candidates" };
  }

  const query = normalize(options.query);
  const ui = options.ui;
  const title = options.title ?? "Select option";
  const telemetry = options.telemetry;
  const requestedMaxOptions = options.maxOptions;
  const maxOptions = Number.isFinite(requestedMaxOptions)
    ? Math.max(1, Math.floor(/** @type {number} */ (requestedMaxOptions)))
    : candidates.length;
  const usesInlineOverlay = typeof ui?.custom === "function" && options.inlineFiltering !== false;
  const shouldUseFzf = !options.disableFzf && !usesInlineOverlay;

  const fzfAttempt = shouldUseFzf
    ? rankCandidatesWithFzf(candidates, query, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    : {
        ranked: null,
        reason: usesInlineOverlay ? "inline-overlay-fallback" : "fzf-disabled",
      };

  const mode = shouldUseFzf && Array.isArray(fzfAttempt.ranked) ? "fzf" : "fallback";
  let ranked =
    shouldUseFzf && Array.isArray(fzfAttempt.ranked)
      ? fzfAttempt.ranked
      : rankCandidatesFallback(candidates, query);

  emitTelemetry(telemetry, {
    event: "ranked",
    mode,
    reason: fzfAttempt.reason,
    query,
    rankedCount: ranked.length,
    candidateCount: candidates.length,
  });

  if (ranked.length === 0) {
    return {
      selected: null,
      mode,
      reason: "no-match",
    };
  }

  if (!ui || (typeof ui.custom !== "function" && typeof ui.select !== "function")) {
    const selected = ranked[0] ?? null;
    const reason = fzfAttempt.reason ?? "non-tty-auto-selected";

    emitTelemetry(telemetry, {
      event: "auto-selected",
      mode,
      reason,
      selectedId: selected?.id,
      selectedLabel: selected?.label,
    });

    return {
      selected,
      mode,
      reason,
    };
  }

  const modeLabel =
    mode === "fzf"
      ? "mode=fzf"
      : `mode=fallback${fzfAttempt.reason ? ` (${fzfAttempt.reason})` : ""}`;

  if (usesInlineOverlay) {
    const selected = /** @type {Candidate|null} */ (
      await selectWithInteractiveOverlay(candidates, {
        title: `${title} — ${modeLabel} [${ranked.length}/${candidates.length}]`,
        query,
        maxOptions,
        ui: /** @type {any} */ (ui),
        /** @param {string} nextQuery */
        onQueryChange: (nextQuery) => {
          emitTelemetry(telemetry, {
            event: "query-changed",
            query: nextQuery,
            mode,
            reason: fzfAttempt.reason,
          });
        },
      })
    );

    if (!selected) {
      emitTelemetry(telemetry, {
        event: "cancelled",
        mode,
        reason: "cancelled",
        rankReason: fzfAttempt.reason,
      });

      return {
        selected: null,
        mode,
        reason: "cancelled",
      };
    }

    emitTelemetry(telemetry, {
      event: "selected",
      mode,
      reason: fzfAttempt.reason,
      selectedId: selected?.id,
      selectedLabel: selected?.label,
    });

    return {
      selected,
      mode,
      reason: fzfAttempt.reason,
    };
  }

  ranked = ranked.slice(0, maxOptions);

  if (typeof ui.select !== "function") {
    const selected = ranked[0] ?? null;
    const reason = fzfAttempt.reason ?? "non-tty-auto-selected";

    emitTelemetry(telemetry, {
      event: "auto-selected",
      mode,
      reason,
      selectedId: selected?.id,
      selectedLabel: selected?.label,
    });

    return {
      selected,
      mode,
      reason,
    };
  }

  const optionEntries = buildOptionLabels(ranked);
  const pickerTitle = `${title} — ${modeLabel} [${optionEntries.length}/${candidates.length}]`;
  const picked = await ui.select(
    pickerTitle,
    optionEntries.map((entry) => entry.label),
  );

  if (!picked) {
    emitTelemetry(telemetry, {
      event: "cancelled",
      mode,
      reason: "cancelled",
      rankReason: fzfAttempt.reason,
    });

    return {
      selected: null,
      mode,
      reason: "cancelled",
    };
  }

  const selected = optionEntries.find((entry) => entry.label === picked)?.candidate ?? null;
  emitTelemetry(telemetry, {
    event: "selected",
    mode,
    reason: fzfAttempt.reason,
    selectedId: selected?.id,
    selectedLabel: selected?.label,
  });

  return {
    selected,
    mode,
    reason: fzfAttempt.reason,
  };
}
