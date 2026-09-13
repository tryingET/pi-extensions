// summary: explicit-intent, compare-before-write protection for operator editor drafts.
// read_when: changing self editor delivery or supporting another UI mode.
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

function normalizeEditorDirective(query: string): string {
  return query
    .normalize("NFKC")
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑‒–—―]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Structural ownership survives opt-outs: declining a write never authorizes a send. */
export function hasEditorPrefillDirective(query: string): boolean {
  return /^(?:please )?prefill\b/i.test(normalizeEditorDirective(query));
}

export function hasExplicitEditorIntent(query: string): boolean {
  // A small command grammar, not a general natural-language consent classifier.
  return (
    hasEditorPrefillDirective(query) &&
    !/\b(?:(?:no|do[- ]+not|don't|never|avoid)[- ]+prefill|show[- ]+only)\b/i.test(
      normalizeEditorDirective(query),
    )
  );
}

export type EditorOutcome =
  | "shown"
  | "prefilled"
  | "no_ui"
  | "editor_state_unavailable"
  | "nonempty_draft"
  | "draft_changed"
  | "write_failed"
  | "write_unconfirmed";
export interface EditorDelivery {
  requested: boolean;
  available: boolean;
  outcome: EditorOutcome;
}

/** Capture before the first await, not after asynchronous memory loading. */
export function captureEditorDraft(ctx: ExtensionContext) {
  const read = (): string | undefined => {
    try {
      const text = ctx.ui?.getEditorText?.();
      return typeof text === "string" ? text : undefined;
    } catch {
      return undefined;
    }
  };
  // RPC's getEditorText returns an empty placeholder, not the remote operator draft.
  const capability = !ctx.hasUI
    ? "no_ui"
    : ctx.mode !== "tui" || typeof ctx.ui?.setEditorText !== "function"
      ? "editor_state_unavailable"
      : undefined;
  const before = capability ? undefined : read();
  const unavailable = capability ?? (before === undefined ? "editor_state_unavailable" : undefined);
  return {
    apply(requested: boolean, text: string): EditorDelivery {
      const result = (outcome: EditorOutcome): EditorDelivery => ({
        requested,
        available: !unavailable && outcome !== "editor_state_unavailable",
        outcome,
      });
      if (!requested) return result("shown");
      if (unavailable) return result(unavailable);
      if (before !== "") return result("nonempty_draft");
      const current = read();
      if (current === undefined) return result("editor_state_unavailable");
      if (current !== before) return result("draft_changed");
      try {
        ctx.ui.setEditorText(text);
        return result(read() === text ? "prefilled" : "write_unconfirmed");
      } catch {
        // Never attempt a second write/rollback or silently send after a setter failure.
        return result("write_failed");
      }
    },
  };
}
