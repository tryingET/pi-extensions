// ---
// summary: "projects broker snapshots into presentation-ready native-panel views"
// read_when:
//   - "changing native panel card membership, focus, or transport revisions"
// ---

import { resolveSnapshotSession } from "../common/niri-focus.mjs";
import { projectSessionCards, sessionRecordKey } from "../common/session-cards.mjs";

/** @typedef {Record<string, unknown>} SessionRecord */
/** @typedef {{generatedAt: number; sessions: SessionRecord[]}} Snapshot */
/** @typedef {{workspace: Record<string, unknown> | null; sessions: SessionRecord[]; focusedSessionId: string | null; focusedCardId?: string | null}} WorkspaceView */
/** @typedef {{placement: string; surfaceVisible: boolean; windowId: number | null}} CardPlacement */
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
  let revision = 0;

  function allSessions() {
    return agentSessions.length > 0 ? [...snapshot.sessions, ...agentSessions] : snapshot.sessions;
  }

  function getDisplaySessions() {
    if (!isNiriSession()) return projectSessionCards(allSessions(), null);
    const sessions = allSessions().filter((session) =>
      workspaceRecordKeys.has(sessionRecordKey(session)),
    );
    return projectSessionCards(sessions, workspaceCardIds).map((card) => {
      const placement = workspacePlacements.get(card.cardId);
      return placement ? { ...card, ...placement } : card;
    });
  }

  function currentView() {
    revision += 1;
    const sessions = getDisplaySessions();
    return {
      protocol: 1,
      type: "view",
      revision,
      visible: isNiriSession() ? Boolean(workspace?.is_focused && sessions.length > 0) : true,
      focusedSessionId,
      focusedCardId,
      generatedAt: snapshot.generatedAt,
      sessions,
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
    getRawSessions: allSessions,
    /** Broker-published records only, for comparisons against a broker snapshot. */
    getBrokerSessions: () => snapshot.sessions,
    /** @param {SessionRecord[]} records */
    setAgentSessions(records) {
      agentSessions = Array.isArray(records) ? records : [];
    },
    /** @param {string} targetId */
    resolveTarget: (targetId) => resolveSnapshotSession(getDisplaySessions(), targetId),
    /** @param {WorkspaceView} view */
    publishWorkspaceView(view) {
      workspace = view.workspace ?? null;
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
          },
        ]),
      );
      focusedSessionId = view.focusedSessionId;
      focusedCardId = view.focusedCardId ?? null;
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
