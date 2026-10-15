// ---
// summary: "projects broker snapshots into presentation-ready native-panel views"
// read_when:
//   - "changing native panel card membership, focus, or transport revisions"
// ---

import { joinAkTaskChips } from "../common/ak-tasks.mjs";
import { resolveSnapshotSession } from "../common/niri-focus.mjs";
import { projectSessionCards, sessionRecordKey } from "../common/session-cards.mjs";
import { classifyAdmittedWindowFocus } from "../common/workspace-view.mjs";
import { createFocusVisibility } from "./focus-visibility.mjs";

/** @typedef {Record<string, unknown>} SessionRecord */
/** @typedef {{generatedAt: number; sessions: SessionRecord[]}} Snapshot */
/** @typedef {{workspace: Record<string, unknown> | null; sessions: SessionRecord[]; focusedSessionId: string | null; focusedCardId?: string | null; focusKind?: import("./focus-visibility.mjs").FocusKind}} WorkspaceView */
/** @typedef {{placement: string; surfaceVisible: boolean; windowId: number | null; workspaceIdx: number | null}} CardPlacement */
/** @typedef {{isNiriSession: () => boolean; publish: (view: Record<string, unknown> & {type: string; sessions: SessionRecord[]}) => void}} NativePanelProjectionOptions */

/** @param {NativePanelProjectionOptions} options */
export function createNativePanelProjection({ isNiriSession, publish }) {
  /** @type {Snapshot} */
  let snapshot = { generatedAt: Date.now(), sessions: [] };
  /** Agent tabs discovered from the process table; they publish no telemetry of their own. */
  /** @type {SessionRecord[]} */
  let agentSessions = [];
  /** @type {string | null} */
  let focusedSessionId = null;
  /** @type {string | null} */
  let focusedCardId = null;
  /** @type {Record<string, unknown> | null} */
  let workspace = null;
  /** @type {Set<string>} */
  let workspaceCardIds = new Set();
  /** @type {Set<string>} */
  let workspaceRecordKeys = new Set();
  /** @type {Map<string, CardPlacement>} */
  let workspacePlacements = new Map();
  /** Read-only AK task claims joined onto cards; absent until the first successful AK read. */
  /** @type {{claims: import("../common/contracts.ts").AkTaskClaim[]; deferred: import("../common/contracts.ts").AkTaskDeferred[]} | null} */
  let akTasks = null;
  /** Every agent window on every workspace, for the brand block's window list. */
  /** @type {import("../common/workspace-view.mjs").WindowDirectoryEntry[]} */
  let directory = [];
  /** @type {Map<string, SessionRecord>} */
  let directoryCards = new Map();
  let revision = 0;
  const visibility = createFocusVisibility();
  /** @type {import("./focus-visibility.mjs").FocusKind} */
  let focusKind = "unknown";
  /** Exact agent window that established eligibility, retained across explicit panel NULL focus. */
  /** @type {number | null} */
  let focusWindowId = null;
  let focusContextValid = false;

  function clearFocusState() {
    focusContextValid = false;
    focusKind = "unknown";
    focusWindowId = null;
    focusedCardId = null;
    focusedSessionId = null;
  }

  function invalidateFocus() {
    clearFocusState();
    send();
  }

  /** Recheck the established exact owner against current complete-window admission facts.
   * This only revokes: event facts cannot publish new card membership or re-admit invalid proof.
   * @param {(workspace: Record<string, unknown>) => WorkspaceView | null} resolveView
   */
  function focusProofMatches(resolveView) {
    if (focusWindowId === null || !focusContextValid) return true;
    const established = getDisplaySessions().filter(
      (card) => card.windowId === focusWindowId && card.surfaceVisible !== false,
    );
    const current = workspace ? resolveView(workspace) : null;
    const owned =
      current?.sessions.filter(
        (card) => card.windowId === focusWindowId && card.surfaceVisible !== false,
      ) ?? [];
    return (
      current?.workspace?.id === workspace?.id &&
      established.length === 1 &&
      owned.length === 1 &&
      owned[0]?.cardId === established[0]?.cardId
    );
  }

  function allSessions() {
    return agentSessions.length > 0 ? [...snapshot.sessions, ...agentSessions] : snapshot.sessions;
  }

  function getDisplaySessions() {
    const rawSessions = allSessions();
    let cards;
    if (!isNiriSession()) {
      cards = projectSessionCards(rawSessions, null);
    } else {
      const sessions = rawSessions.filter((session) =>
        workspaceRecordKeys.has(sessionRecordKey(session)),
      );
      cards = projectSessionCards(sessions, workspaceCardIds).map((card) => {
        const placement = workspacePlacements.get(card.cardId);
        return placement ? { ...card, ...placement } : card;
      });
    }
    if (!akTasks) return cards;
    // Dead-session detection must consider every live session, including cards projected onto
    // other workspaces, so a claim is only orphaned when no live session anywhere holds it.
    const liveSessionIds = new Set(
      rawSessions.map((session) => String(session.sessionId ?? "")).filter(Boolean),
    );
    return joinAkTaskChips({
      cards,
      claims: akTasks.claims,
      deferred: akTasks.deferred,
      liveSessionIds,
      nowMs: Date.now(),
    }).cards;
  }

  function currentView() {
    revision += 1;
    const sessions = getDisplaySessions();
    // Keyboard NULL ownership is only a continuation of one still-admitted exact agent window.
    // A publisher ending (or becoming ambiguous) must not leave another window's cards eligible.
    if (
      (focusKind === "agent" || (focusKind === "none" && focusWindowId !== null)) &&
      (focusWindowId === null ||
        sessions.filter((card) => card.windowId === focusWindowId && card.surfaceVisible !== false)
          .length !== 1)
    ) {
      clearFocusState();
    }
    return {
      protocol: 1,
      type: "view",
      revision,
      visible: visibility.observe({
        workspaceId: workspace?.id ?? null,
        focus: isNiriSession() ? focusKind : "unknown",
        hasCards: workspace?.is_focused === true && sessions.length > 0,
      }),
      focusedSessionId,
      focusedCardId,
      generatedAt: snapshot.generatedAt,
      sessions,
      windows: directory,
    };
  }

  function send() {
    publish(currentView());
  }

  function retainValidFocus() {
    const targetId = focusedCardId ?? focusedSessionId;
    if (!targetId || !resolveSnapshotSession(getDisplaySessions(), targetId)) {
      focusedSessionId = null;
      focusedCardId = null;
    }
  }

  return {
    getDisplaySessions,
    /** Reserve ownership before sending; cancel on a failed write or panel exit. */
    requestKeyboard: (clickThrough = false) =>
      visibility.requestKeyboard(revision, clickThrough) ? revision : null,
    cancelKeyboard: () => visibility.resetKeyboard(),
    /** @param {number} request @param {boolean} active */
    keyboardChanged: (request, active) => visibility.keyboardChanged(request, active),
    isEligible: () => visibility.isEligible(),
    invalidateFocus,
    /** @param {number} windowId */
    invalidateWindowFocus(windowId) {
      if (windowId === focusWindowId) invalidateFocus();
    },
    /** @param {(workspace: Record<string, unknown>) => WorkspaceView | null} resolveView */
    revalidateWindowFocus(resolveView) {
      const valid = focusProofMatches(resolveView);
      if (!valid) invalidateFocus();
      return valid;
    },
    /** Authoritative focus-event ids, not app-id/title guesses or delayed panel acknowledgements.
     * @param {number | null} windowId
     * @param {(workspace: Record<string, unknown>) => WorkspaceView | null} [resolveView]
     */
    publishWindowFocus(windowId, resolveView) {
      const cards = getDisplaySessions();
      focusKind = !focusContextValid
        ? "unknown"
        : windowId === null
          ? "none"
          : classifyAdmittedWindowFocus(windowId, cards);
      const current =
        focusKind === "agent"
          ? cards.find((card) => card.windowId === windowId && card.surfaceVisible !== false)
          : null;
      focusedCardId = current ? String(current.cardId) : null;
      focusedSessionId = current ? String(current.sessionId) : null;
      if (focusKind === "agent") focusWindowId = windowId;
      else if (focusKind !== "none") focusWindowId = null;
      if (resolveView && !focusProofMatches(resolveView)) clearFocusState();
      send();
    },
    getRawSessions: allSessions,
    /** Broker-published records only, for comparisons against a broker snapshot. */
    getBrokerSessions: () => snapshot.sessions,
    /** @param {SessionRecord[]} records */
    setAgentSessions(records) {
      agentSessions = Array.isArray(records) ? records : [];
    },
    /**
     * Replace the read-only AK task data joined onto cards. An empty refresh clears every chip;
     * `null` data (AK never read) leaves cards untouched, which is how the strip stays unchanged
     * when AK is absent.
     * @param {{claims: import("../common/contracts.ts").AkTaskClaim[]; deferred: import("../common/contracts.ts").AkTaskDeferred[]} | null} state
     */
    setAkTasks(state) {
      akTasks = state;
      send();
    },
    /**
     * A card on this workspace, or else an entry of the window list, which spans every workspace.
     * @param {string} targetId
     */
    resolveTarget: (targetId) =>
      resolveSnapshotSession(getDisplaySessions(), targetId) ??
      directoryCards.get(targetId) ??
      null,
    /** @param {number} windowId */
    hasDirectoryWindow: (windowId) => directory.some((entry) => entry.windowId === windowId),
    /**
     * Replace the window list; it is published with the next view.
     * @param {{entries: import("../common/workspace-view.mjs").WindowDirectoryEntry[]; cards: Map<string, SessionRecord>}} next
     */
    setDirectory(next) {
      directory = next.entries;
      directoryCards = next.cards;
    },
    /** @param {WorkspaceView} view */
    publishWorkspaceView(view) {
      workspace = view.workspace ?? null;
      focusContextValid = Number.isInteger(workspace?.id) && workspace?.is_focused === true;
      focusKind = view.focusKind ?? "unknown";
      workspaceCardIds = new Set(view.sessions.map((session) => String(session.cardId ?? "")));
      workspaceRecordKeys = new Set(
        view.sessions.flatMap((session) =>
          Array.isArray(session.publisherRecordKeys)
            ? session.publisherRecordKeys.map(String)
            : [sessionRecordKey(session)],
        ),
      );
      workspacePlacements = new Map(
        view.sessions.map((session) => [
          String(session.cardId ?? ""),
          {
            placement: String(session.placement ?? "title"),
            surfaceVisible: session.surfaceVisible !== false,
            windowId: Number.isInteger(session.windowId) ? Number(session.windowId) : null,
            workspaceIdx: Number.isInteger(session.workspaceIdx)
              ? Number(session.workspaceIdx)
              : null,
          },
        ]),
      );
      focusedSessionId = view.focusedSessionId;
      focusedCardId = view.focusedCardId ?? null;
      if (focusKind === "agent")
        focusWindowId = workspacePlacements.get(focusedCardId ?? "")?.windowId ?? null;
      else if (focusKind !== "none") focusWindowId = null;
      send();
    },
    send,
    /** @param {SessionRecord} session */
    setFocused(session) {
      focusedSessionId = String(session.sessionId ?? "") || null;
      focusedCardId = String(session.cardId ?? "") || null;
      send();
    },
    /** @param {Snapshot} nextSnapshot */
    updateSnapshot(nextSnapshot) {
      snapshot = nextSnapshot;
      retainValidFocus();
      send();
    },
  };
}
