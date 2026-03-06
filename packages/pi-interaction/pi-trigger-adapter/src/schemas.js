import { Type } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

const pickerConfigBoundarySchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
    priority: Type.Optional(Type.Number()),
    requireCursorAtEnd: Type.Optional(Type.Boolean()),
    debounceMs: Type.Optional(Type.Number()),
    showInPicker: Type.Optional(Type.Boolean()),
    pickerLabel: Type.Optional(Type.String()),
    pickerDetail: Type.Optional(Type.String()),
    minQueryLength: Type.Optional(Type.Number()),
    promptForQueryWhenEmpty: Type.Optional(Type.Boolean()),
    promptQueryThreshold: Type.Optional(Type.Number()),
    maxOptions: Type.Optional(Type.Number()),
    timeoutMs: Type.Optional(Type.Number()),
    disableFzf: Type.Optional(Type.Boolean()),
    inlineFiltering: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

const sanitizedCandidateSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    label: Type.String({ minLength: 1 }),
    detail: Type.String(),
    preview: Type.Optional(Type.String()),
    source: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

const sanitizedCandidateArraySchema = Type.Array(sanitizedCandidateSchema);

const pickerConfigBoundaryChecker = TypeCompiler.Compile(pickerConfigBoundarySchema);
const sanitizedCandidateChecker = TypeCompiler.Compile(sanitizedCandidateArraySchema);

const allowedConfigKeys = new Set([
  "id",
  "description",
  "priority",
  "match",
  "requireCursorAtEnd",
  "debounceMs",
  "showInPicker",
  "pickerLabel",
  "pickerDetail",
  "parseInput",
  "minQueryLength",
  "loadCandidates",
  "onNoCandidates",
  "selectTitle",
  "queryPromptTitle",
  "queryPromptPlaceholder",
  "promptForQueryWhenEmpty",
  "promptQueryThreshold",
  "maxOptions",
  "timeoutMs",
  "disableFzf",
  "inlineFiltering",
  "applySelection",
  "onCancel",
  "onError",
  "telemetry",
]);

/**
 * @param {import("@sinclair/typebox/compiler").TypeCheck<any>} checker
 * @param {unknown} value
 * @returns {string}
 */
function firstError(checker, value) {
  for (const error of checker.Errors(value)) {
    const path = error.path || "(root)";
    return `${path}: ${error.message}`;
  }
  return "(unknown validation error)";
}

/**
 * @param {string} name
 * @param {number|undefined} value
 */
function assertFiniteOptionalNumber(name, value) {
  if (value === undefined) return;
  if (!Number.isFinite(value)) {
    throw new Error(`[registerPickerInteraction] config.${name} must be a finite number`);
  }
}

/**
 * @param {Record<string, any>} config
 */
export function assertPickerConfigBoundary(config) {
  const unknownKeys = Object.keys(config).filter((key) => !allowedConfigKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`[registerPickerInteraction] unknown config keys: ${unknownKeys.join(", ")}`);
  }

  const boundary = {
    id: config.id,
    description: config.description,
    priority: config.priority,
    requireCursorAtEnd: config.requireCursorAtEnd,
    debounceMs: config.debounceMs,
    showInPicker: config.showInPicker,
    pickerLabel: config.pickerLabel,
    pickerDetail: config.pickerDetail,
    minQueryLength: config.minQueryLength,
    promptForQueryWhenEmpty: config.promptForQueryWhenEmpty,
    promptQueryThreshold: config.promptQueryThreshold,
    maxOptions: config.maxOptions,
    timeoutMs: config.timeoutMs,
    disableFzf: config.disableFzf,
    inlineFiltering: config.inlineFiltering,
  };

  if (!pickerConfigBoundaryChecker.Check(boundary)) {
    throw new Error(
      `[registerPickerInteraction] invalid config option type: ${firstError(pickerConfigBoundaryChecker, boundary)}`,
    );
  }

  assertFiniteOptionalNumber("priority", config.priority);
  assertFiniteOptionalNumber("debounceMs", config.debounceMs);
  assertFiniteOptionalNumber("minQueryLength", config.minQueryLength);
  assertFiniteOptionalNumber("promptQueryThreshold", config.promptQueryThreshold);
  assertFiniteOptionalNumber("maxOptions", config.maxOptions);
  assertFiniteOptionalNumber("timeoutMs", config.timeoutMs);
}

/**
 * @param {unknown} candidates
 * @param {string} triggerId
 */
export function assertSanitizedCandidates(candidates, triggerId) {
  if (!sanitizedCandidateChecker.Check(candidates)) {
    throw new Error(
      `[${triggerId}] invalid sanitized candidates: ${firstError(sanitizedCandidateChecker, candidates)}`,
    );
  }
}
