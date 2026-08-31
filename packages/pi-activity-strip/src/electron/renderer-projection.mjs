// ---
// summary: "owns raw broker snapshots, terminal-card projection, focus state, and renderer delivery"
// read_when:
//   - "changing renderer card membership, focused-card state, or snapshot delivery"
// ---

import { resolveSnapshotSession } from "../common/niri-focus.mjs";
import { projectSessionCards, sessionRecordKey } from "../common/session-cards.mjs";

export function createRendererProjection({ isNiriSession, getWindow, isUsableWindow }) {
  let snapshot = { generatedAt: Date.now(), sessions: [] };
  let focusedSessionId = null;
  let focusedCardId = null;
  let workspaceCardIds = new Set();
  let workspaceRecordKeys = new Set();

  function getDisplaySessions() {
    const sessions = isNiriSession()
      ? snapshot.sessions.filter((session) => workspaceRecordKeys.has(sessionRecordKey(session)))
      : snapshot.sessions;
    return projectSessionCards(sessions, isNiriSession() ? workspaceCardIds : null);
  }

  function send() {
    const window = getWindow();
    if (!isUsableWindow(window)) return;
    window.webContents.send("pi-activity-strip:snapshot", {
      ...snapshot,
      sessions: getDisplaySessions(),
      focusedSessionId,
      focusedCardId,
    });
  }

  function retainValidFocus() {
    if (!resolveSnapshotSession(getDisplaySessions(), focusedCardId ?? focusedSessionId)) {
      focusedSessionId = null;
      focusedCardId = null;
    }
  }

  return {
    getDisplaySessions,
    getRawSessions: () => snapshot.sessions,
    resolveTarget: (targetId) => resolveSnapshotSession(getDisplaySessions(), targetId),
    publishWorkspaceView(view) {
      workspaceCardIds = new Set(view.sessions.map((session) => String(session.cardId ?? "")));
      workspaceRecordKeys = new Set(
        view.sessions.flatMap((session) =>
          Array.isArray(session.publisherRecordKeys)
            ? session.publisherRecordKeys.map(String)
            : [sessionRecordKey(session)],
        ),
      );
      focusedSessionId = view.focusedSessionId;
      focusedCardId = view.focusedCardId ?? null;
      send();
      return Boolean(view.workspace?.is_focused);
    },
    send,
    setFocused(session) {
      focusedSessionId = String(session.sessionId ?? "") || null;
      focusedCardId = String(session.cardId ?? "") || null;
      send();
    },
    updateSnapshot(nextSnapshot) {
      snapshot = nextSnapshot;
      retainValidFocus();
      send();
    },
  };
}
