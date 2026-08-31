// summary: Supplies bounded editor-state and autocomplete normalization helpers.
// read_when:
//   - Changing TriggerEditor paste detection, instance identity, or autocomplete payload handling.

let triggerEditorSessionCounter = 0;

/** @param {unknown} editor */
export function isPasteInProgress(editor) {
  const candidate = /** @type {{ isInPaste?: unknown, pasteBuffer?: unknown }|null} */ (
    editor && typeof editor === "object" ? editor : null
  );
  return Boolean(candidate && (candidate.isInPaste || candidate.pasteBuffer));
}

export function createTriggerEditorSessionKey() {
  triggerEditorSessionCounter += 1;
  return `trigger-editor-${triggerEditorSessionCounter}`;
}

/** @param {unknown} value */
export function isPromiseLike(value) {
  const maybePromise = /** @type {{ then?: unknown }|null|undefined} */ (value);
  return Boolean(maybePromise && typeof maybePromise.then === "function");
}

/** @param {unknown} suggestions @returns {{items: any[], prefix: string}|null} */
export function normalizeAutocompleteSuggestions(suggestions) {
  if (!suggestions || typeof suggestions !== "object") return null;

  const candidate = /** @type {{ items?: unknown, prefix?: unknown }} */ (suggestions);
  if (!Array.isArray(candidate.items)) return null;

  return {
    items: candidate.items,
    prefix: typeof candidate.prefix === "string" ? candidate.prefix : "",
  };
}
