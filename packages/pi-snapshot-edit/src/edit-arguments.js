// summary: "normalizes deterministic caller slips in snapshot edit arguments before schema validation"
// read_when:
//   - "changing which edit argument shapes are repaired instead of failed"

/**
 * Models naturally copy the rendered `revision:<alias>` header line. Accept both
 * forms by stripping one optional header prefix and surrounding whitespace.
 */
export function normalizeRevisionAlias(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.startsWith("revision:") ? trimmed.slice("revision:".length).trim() : trimmed;
}

/**
 * Runs before a host's schema validation, so it removes deterministic caller slips instead of
 * failing them: strip the rendered 'revision:' header prefix from base, and infer a missing 'op'
 * when exactly one selector field (oldText or anchorText) is present. Ambiguous shapes are left
 * untouched so schema validation still fails closed. Returns the input itself when nothing changed.
 */
export function normalizeEditArguments(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  let changed = false;
  const next = { ...args };

  if (typeof args.base === "string") {
    const normalizedBase = normalizeRevisionAlias(args.base);
    if (normalizedBase !== args.base) {
      next.base = normalizedBase;
      changed = true;
    }
  }

  if (Array.isArray(args.edits)) {
    let editsChanged = false;
    const normalizedEdits = args.edits.map((operation) => {
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) return operation;
      if (typeof operation.op === "string" && operation.op.length > 0) return operation;
      const hasOldText = typeof operation.oldText === "string";
      const hasAnchorText = typeof operation.anchorText === "string";
      if (hasOldText === hasAnchorText) return operation;
      editsChanged = true;
      return { ...operation, op: hasOldText ? "replace" : "insert_after" };
    });
    if (editsChanged) {
      next.edits = normalizedEdits;
      changed = true;
    }
  }

  return changed ? next : args;
}
