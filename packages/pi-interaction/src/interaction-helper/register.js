/**
 * Trigger registration flow for picker-style interactions.
 */

import { getBroker } from "../TriggerBroker.js";
import { normalize, splitQueryAndContext, toMessage } from "./core.js";
import { assertPickerConfigBoundary, assertSanitizedCandidates } from "./schemas.js";
import { selectFuzzyCandidate } from "./selection.js";
import { emitTelemetry } from "./telemetry.js";

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
 *   query: string,
 *   context: string,
 *   raw: string,
 *   meta?: unknown,
 * }} ParsedInput
 */

/**
 * @typedef {{
 *   matchedText?: string,
 *   groups?: string[],
 *   [key: string]: unknown,
 * }} TriggerMatchLike
 */

/**
 * @typedef {{
 *   cursorLine?: number,
 *   cursorColumn?: number,
 *   [key: string]: unknown,
 * }} TriggerContextLike
 */

/**
 * @typedef {{
 *   select?: (title: string, options: string[]) => Promise<string|null|undefined>,
 *   custom?: (
 *     factory: (tui: { requestRender: () => void }, theme: unknown, kb: unknown, done: (value: unknown) => void) => unknown,
 *     options?: unknown,
 *   ) => Promise<unknown>,
 *   input?: (title: string, placeholder?: string) => Promise<string|null|undefined>,
 *   notify?: (message: string, level?: "info"|"warning"|"error") => void,
 *   setText?: (text: string) => void,
 * }} InteractionAPI
 */

/**
 * @typedef {{
 *   candidates: Candidate[],
 *   reason?: string,
 *   metadata?: unknown,
 * }} NormalizedCandidates
 */

/**
 * @typedef {{
 *   broker?: import("../TriggerBroker.js").TriggerBroker,
 *   registration?: Record<string, unknown>,
 * }} RegisterPickerOptions
 */

/**
 * @param {unknown} loadResult
 * @returns {NormalizedCandidates}
 */
function normalizeCandidates(loadResult) {
  if (Array.isArray(loadResult)) {
    return { candidates: loadResult, reason: undefined, metadata: undefined };
  }

  if (!loadResult || typeof loadResult !== "object") {
    throw new Error("loadCandidates must return an array or an object with candidates[]");
  }

  const typed = /** @type {{ candidates?: unknown, reason?: unknown, metadata?: unknown }} */ (
    loadResult
  );

  if (!Array.isArray(typed.candidates)) {
    throw new Error("loadCandidates object must include a candidates array");
  }

  return {
    candidates: /** @type {Candidate[]} */ (typed.candidates),
    reason: normalize(typed.reason) || undefined,
    metadata: typed.metadata,
  };
}

/**
 * @param {Candidate[]} candidates
 * @returns {Candidate[]}
 */
function sanitizeCandidates(candidates) {
  return candidates.map((candidate) => {
    const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};

    return {
      ...safeCandidate,
      id: typeof candidate?.id === "string" ? candidate.id.trim() : candidate?.id,
      label: typeof candidate?.label === "string" ? normalize(candidate.label) : candidate?.label,
      detail:
        candidate?.detail === undefined
          ? ""
          : typeof candidate.detail === "string"
            ? normalize(candidate.detail)
            : candidate.detail,
      preview:
        candidate?.preview === undefined || typeof candidate.preview === "string"
          ? candidate?.preview
          : candidate.preview,
      source:
        candidate?.source === undefined || typeof candidate.source === "string"
          ? candidate?.source
          : candidate.source,
    };
  });
}

/**
 * @param {TriggerMatchLike} match
 * @returns {ParsedInput}
 */
function defaultParsedInput(match) {
  const grouped = Array.isArray(match?.groups) ? String(match.groups[0] ?? "") : "";
  const parsed = splitQueryAndContext(grouped);
  return {
    query: parsed.query,
    context: parsed.context,
    raw: grouped,
  };
}

/**
 * @param {Record<string, any>} config
 * @param {ParsedInput} parsed
 */
function resolveTitle(config, parsed) {
  if (typeof config.selectTitle === "function") {
    return config.selectTitle(parsed);
  }
  return config.selectTitle ?? "Select option";
}

/**
 * @param {Record<string, any>} config
 * @param {ParsedInput} parsed
 */
function resolveQueryPromptTitle(config, parsed) {
  if (typeof config.queryPromptTitle === "function") {
    return config.queryPromptTitle(parsed);
  }
  return config.queryPromptTitle ?? "Filter options";
}

/**
 * @param {Record<string, any>} config
 * @param {ParsedInput} parsed
 */
function resolveQueryPromptPlaceholder(config, parsed) {
  if (typeof config.queryPromptPlaceholder === "function") {
    return config.queryPromptPlaceholder(parsed);
  }
  return config.queryPromptPlaceholder ?? "Type to filter";
}

/**
 * Register a trigger that loads candidates, ranks them, shows a picker,
 * then applies the selected result.
 * @param {Record<string, any>} config
 * @param {RegisterPickerOptions} [options]
 */
export function registerPickerInteraction(config, options = {}) {
  if (!config || typeof config !== "object") {
    throw new Error("registerPickerInteraction requires a config object");
  }

  if (typeof config.id !== "string" || !config.id.trim()) {
    throw new Error("registerPickerInteraction requires config.id");
  }

  assertPickerConfigBoundary(config);

  if (
    typeof config.match !== "string" &&
    !(config.match instanceof RegExp) &&
    typeof config.match !== "function"
  ) {
    throw new Error("registerPickerInteraction requires config.match");
  }

  if (typeof config.loadCandidates !== "function") {
    throw new Error("registerPickerInteraction requires config.loadCandidates");
  }

  if (typeof config.applySelection !== "function") {
    throw new Error("registerPickerInteraction requires config.applySelection");
  }

  const broker = options.broker ?? getBroker();

  const trigger = {
    id: config.id,
    description: config.description ?? config.id,
    priority: Number.isFinite(config.priority) ? config.priority : 100,
    match: config.match,
    requireCursorAtEnd: config.requireCursorAtEnd ?? true,
    debounceMs: Number.isFinite(config.debounceMs)
      ? Math.max(0, Math.floor(config.debounceMs))
      : 180,
    showInPicker: config.showInPicker ?? true,
    pickerLabel: config.pickerLabel,
    pickerDetail: config.pickerDetail,
    /**
     * @param {TriggerMatchLike} match
     * @param {TriggerContextLike} context
     * @param {InteractionAPI} api
     */
    handler: async (match, context, api) => {
      const telemetry = config.telemetry;

      try {
        const parsedRaw = (typeof config.parseInput === "function"
          ? config.parseInput(match, context, api)
          : defaultParsedInput(match)) ?? { query: "", context: "", raw: "" };

        const parsed = /** @type {ParsedInput} */ ({
          query: normalize(parsedRaw.query),
          context: normalize(parsedRaw.context),
          raw: String(parsedRaw.raw ?? ""),
          meta: parsedRaw.meta,
        });

        emitTelemetry(telemetry, {
          event: "trigger-matched",
          triggerId: config.id,
          query: parsed.query,
          contextLength: parsed.context.length,
          cursorLine: context?.cursorLine,
          cursorColumn: context?.cursorColumn,
        });

        const minQueryLength = Number.isFinite(config.minQueryLength)
          ? Math.max(0, Math.floor(config.minQueryLength))
          : 0;

        if (parsed.query.length < minQueryLength) {
          emitTelemetry(telemetry, {
            event: "skip-min-query",
            triggerId: config.id,
            query: parsed.query,
            minQueryLength,
          });
          return;
        }

        const loaded = normalizeCandidates(
          await config.loadCandidates({ parsed, match, context, api }),
        );

        const candidates = sanitizeCandidates(loaded.candidates);
        assertSanitizedCandidates(candidates, config.id);

        emitTelemetry(telemetry, {
          event: "candidates-loaded",
          triggerId: config.id,
          candidateCount: candidates.length,
          reason: loaded.reason,
        });

        if (candidates.length === 0) {
          if (typeof config.onNoCandidates === "function") {
            await config.onNoCandidates({
              parsed,
              match,
              context,
              api,
              reason: loaded.reason,
              metadata: loaded.metadata,
            });
          }
          return;
        }

        let effectiveQuery = parsed.query;
        const promptThreshold = Number.isFinite(config.promptQueryThreshold)
          ? Math.max(1, Math.floor(config.promptQueryThreshold))
          : 1;

        const hasInlineCustomPicker = api && typeof api.custom === "function";
        const shouldPromptForQuery =
          !effectiveQuery &&
          Boolean(config.promptForQueryWhenEmpty) &&
          candidates.length >= promptThreshold &&
          !hasInlineCustomPicker;

        if (shouldPromptForQuery && api && typeof api.input === "function") {
          const entered = await api.input(
            resolveQueryPromptTitle(config, parsed),
            resolveQueryPromptPlaceholder(config, parsed),
          );

          if (entered === null || entered === undefined) {
            emitTelemetry(telemetry, {
              event: "query-prompt-cancelled",
              triggerId: config.id,
            });

            if (typeof config.onCancel === "function") {
              await config.onCancel({
                parsed,
                match,
                context,
                api,
                selection: {
                  selected: null,
                  mode: "fallback",
                  reason: "query-prompt-cancelled",
                },
              });
            }
            return;
          }

          effectiveQuery = normalize(entered);
          parsed.query = effectiveQuery;

          emitTelemetry(telemetry, {
            event: "query-prompt-submitted",
            triggerId: config.id,
            query: effectiveQuery,
          });
        }

        const maxOptions = Number.isFinite(config.maxOptions)
          ? Math.max(1, Math.floor(config.maxOptions))
          : Math.min(30, candidates.length);

        const selection = await selectFuzzyCandidate(candidates, {
          query: effectiveQuery,
          title: resolveTitle(config, parsed),
          ui: api
            ? {
                select:
                  typeof api.select === "function"
                    ? /** @param {string} title @param {string[]} selectOptions */
                      (title, selectOptions) =>
                        /** @type {(title: string, options: string[]) => Promise<string|null|undefined>} */ (
                          api.select
                        )(title, selectOptions)
                    : undefined,
                custom:
                  typeof api.custom === "function"
                    ? /** @param {(tui: { requestRender: () => void }, theme: unknown, kb: unknown, done: (value: unknown) => void) => unknown} factory @param {unknown} customOptions */
                      (factory, customOptions) =>
                        /** @type {(factory: (tui: { requestRender: () => void }, theme: unknown, kb: unknown, done: (value: unknown) => void) => unknown, options?: unknown) => Promise<unknown>} */ (
                          api.custom
                        )(factory, customOptions)
                    : undefined,
              }
            : undefined,
          maxOptions,
          timeoutMs: config.timeoutMs,
          disableFzf: config.disableFzf,
          inlineFiltering: config.inlineFiltering,
          telemetry,
        });

        if (!selection.selected) {
          if (typeof config.onCancel === "function") {
            await config.onCancel({ parsed, match, context, api, selection });
          }
          return;
        }

        await config.applySelection({
          parsed,
          match,
          context,
          api,
          selection,
          selected: selection.selected,
        });

        emitTelemetry(telemetry, {
          event: "selection-applied",
          triggerId: config.id,
          selectedId: selection.selected.id,
          selectedLabel: selection.selected.label,
          mode: selection.mode,
          reason: selection.reason,
        });
      } catch (error) {
        emitTelemetry(telemetry, {
          event: "error",
          triggerId: config.id,
          error: toMessage(error),
        });

        if (typeof config.onError === "function") {
          await config.onError({ error, match, context, api });
          return;
        }

        api?.notify?.(`[${config.id}] ${toMessage(error)}`, "error");
      }
    },
  };

  const registrationResult = broker.register(trigger, {
    replaceIfExists: true,
    ...options.registration,
  });

  return {
    ...registrationResult,
    unregister: () => broker.unregister(config.id),
  };
}
