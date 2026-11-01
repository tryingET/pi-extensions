// ---
// summary: "keeps an already-visible ribbon mapped across a proven eligible handoff, without input authority"
// read_when:
//   - "Changing passive presentation during selected-window / seat-focus event ordering."
// ---
import { projectSessionCards } from "../common/session-cards.mjs";
import { classifyAdmittedWindowFocus } from "../common/workspace-view.mjs";
import {
  publisherSet,
  selectionContradictsSource,
  sourceIdentity,
  visibleCardsForWindow,
} from "./interaction-context.mjs";

/** Presentation only: no request, epoch, source admission, or keyboard eligibility is stored here.
 * Both ends must retain exact complete-window admission and process/publisher identities.
 * @param {{getWindowFacts: (id: number) => Record<string, unknown> | null;
 * getCards: () => Record<string, unknown>[]; getRawSessions: () => Record<string, unknown>[];
 * env: NodeJS.ProcessEnv}} options
 */
export function createPanelPresentation({ getWindowFacts, getCards, getRawSessions, env }) {
  /** @type {ReturnType<typeof proof>} */
  let source = null;
  /** @type {{source: NonNullable<ReturnType<typeof proof>>; target: NonNullable<ReturnType<typeof proof>>} | null} */
  let handoff = null;
  /** @type {((workspace: Record<string, unknown>) => {sessions: Record<string, unknown>[]; focusKind?: string} | null) | null} */
  let resolveView = null;

  /** @param {Record<string, unknown> | null} workspace @param {number | null} id
   * @param {Record<string, unknown>[]} cards */
  function proof(workspace, id, cards) {
    if (workspace?.is_focused !== true || id === null) return null;
    const facts = getWindowFacts(id);
    if (
      facts?.id !== id ||
      facts.workspace_id !== workspace.id ||
      !(facts.pid === null || Number.isInteger(facts.pid)) ||
      typeof facts.app_id !== "string"
    )
      return null;
    const kind = classifyAdmittedWindowFocus(id, cards, facts, env);
    if (kind !== "agent" && kind !== "neutral") return null;
    const owner = visibleCardsForWindow(cards, id)[0];
    if (kind === "agent") {
      // A complete admission result, not an arbitrary legacy display card, is required to bridge.
      if (owner?.surfaceVisible !== true || typeof owner.placement !== "string") return null;
      const raw = projectSessionCards(getRawSessions(), null).find(
        (card) => card.cardId === owner.cardId,
      );
      if (JSON.stringify(publisherSet(owner)) !== JSON.stringify(publisherSet(raw))) return null;
    }
    return {
      id,
      workspaceId: workspace.id,
      pid: facts.pid,
      appId: facts.app_id,
      kind,
      identity: sourceIdentity(workspace.id, id, owner),
    };
  }

  function clear() {
    source = null;
    handoff = null;
    resolveView = null;
  }

  /** @param {Record<string, unknown> | null} workspace
   * @param {NonNullable<typeof resolveView>} [resolver] */
  function holds(workspace, resolver) {
    if (resolver) resolveView = resolver;
    if (!handoff) return true;
    if (
      Object.hasOwn(workspace ?? {}, "active_window_id") &&
      ![handoff.source.id, handoff.target.id].some((id) => id === workspace?.active_window_id)
    )
      return false;
    const cached = workspace && resolveView?.(workspace);
    if (!cached || !["agent", "neutral", "none"].includes(cached.focusKind ?? "unknown"))
      return false;
    return [handoff.source, handoff.target].every((pinned) =>
      [getCards(), cached.sessions].every(
        (cards) => JSON.stringify(proof(workspace, pinned.id, cards)) === JSON.stringify(pinned),
      ),
    );
  }

  /** A selection can keep an existing surface, never create a surface or input grant.
   * @param {Record<string, unknown> | null} workspace @param {number | null} id
   * @param {NonNullable<typeof resolveView>} resolver */
  function prepare(workspace, id, resolver) {
    resolveView = resolver;
    if (source?.id === id) return;
    const cached = workspace && resolver(workspace);
    const target = cached ? proof(workspace, id, cached.sessions) : null;
    if (!source || !target) {
      clear();
      return;
    }
    handoff = { source, target };
    if (!holds(workspace)) clear();
  }

  return {
    clear,
    holds,
    prepare,
    /** Full reads can interleave the same way as incremental focus/selection events.
     * @param {{workspace: Record<string, unknown> | null; sessions: Record<string, unknown>[]; focusKind?: string}} view
     * @param {number | null} sourceId */
    prepareView(view, sourceId) {
      if (!["agent", "neutral", "none"].includes(view.focusKind ?? "unknown")) clear();
      else if (selectionContradictsSource(view.workspace, sourceId))
        prepare(
          view.workspace,
          Number.isSafeInteger(view.workspace?.active_window_id)
            ? Number(view.workspace?.active_window_id)
            : null,
          () => view,
        );
    },
    /** @param {number} id */
    involves: (id) => handoff?.source.id === id || handoff?.target.id === id,
    /** @param {boolean} eligible @param {Record<string, unknown> | null} workspace
     * @param {number | null} id */
    visible(eligible, workspace, id) {
      if (eligible) {
        source = proof(workspace, id, getCards());
        handoff = null;
        return true;
      }
      if (handoff && holds(workspace)) return true;
      clear();
      return false;
    },
  };
}
