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
import { publisherSet, sourceIdentity } from "./interaction-context.mjs";
import { PANEL_PROTOCOL } from "./panel-protocol.mjs";

/** @typedef {Record<string, unknown>} SessionRecord */
/** @typedef {{generatedAt: number; sessions: SessionRecord[]}} Snapshot */
/** @typedef {{workspace: Record<string, unknown> | null; sessions: SessionRecord[]; focusedSessionId: string | null; focusedCardId?: string | null; focusKind?: import("./focus-visibility.mjs").FocusKind}} WorkspaceView */
/** @typedef {{placement: string; surfaceVisible: boolean; windowId: number | null; workspaceIdx: number | null}} CardPlacement */
/** @typedef {{isNiriSession: () => boolean; publish: (view: Record<string, unknown> & {type: string; sessions: SessionRecord[]}) => void}} NativePanelProjectionOptions */

/** Keep exact-window and visibility cardinality identical at every ownership proof.
 * @param {SessionRecord[]} sessions @param {number | null} windowId */
function visibleCardsForWindow(sessions, windowId) {
  return sessions.filter((card) => card.windowId === windowId && card.surfaceVisible !== false);
}

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
  let nextKeyboardRequest = 0;
  let interactionEpoch = 0;
  let intentGeneration = 0;
  let consumedJumpRequest = -1;
  /** @type {string | null} */
  let interactionContext = null;
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
    const established = visibleCardsForWindow(getDisplaySessions(), focusWindowId);
    const current = workspace ? resolveView(workspace) : null;
    const owned = visibleCardsForWindow(current?.sessions ?? [], focusWindowId);
    return (
      current?.workspace?.id === workspace?.id &&
      established.length === 1 &&
      owned.length === 1 &&
      owned[0]?.cardId === established[0]?.cardId &&
      JSON.stringify(publisherSet(owned[0])) === JSON.stringify(publisherSet(established[0]))
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
      (focusWindowId === null || visibleCardsForWindow(sessions, focusWindowId).length !== 1)
    ) {
      clearFocusState();
    }
    let owner = sessions.find(
      (card) => card.windowId === focusWindowId && card.surfaceVisible !== false,
    );
    const rawOwner = owner
      ? projectSessionCards(allSessions(), null).find((card) => card.cardId === owner?.cardId)
      : undefined;
    // Newly added publishers cannot inherit an admission established for a smaller set.
    if (owner && JSON.stringify(publisherSet(owner)) !== JSON.stringify(publisherSet(rawOwner))) {
      clearFocusState();
      owner = undefined;
    }
    const facts = {
      workspaceId: workspace?.id ?? null,
      focus: isNiriSession() ? focusKind : "unknown",
      hasCards: workspace?.is_focused === true && sessions.length > 0,
    };
    // Source identity outlives the action's own keyboard release/NULL, not an app switch or
    // admission loss. Presentation visibility and capture ownership are independent facts.
    const context =
      focusContextValid &&
      workspace?.is_focused === true &&
      ["agent", "none"].includes(focusKind) &&
      owner
        ? sourceIdentity(workspace?.id, focusWindowId, owner)
        : null;
    if (context !== interactionContext) {
      interactionEpoch += 1;
      visibility.resetKeyboard();
      interactionContext = context;
    }
    return {
      protocol: PANEL_PROTOCOL,
      type: "view",
      revision,
      interactionEpoch,
      visible: visibility.observe(facts),
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
    // Observe existing fields only: no publish, epoch advancement, admission or query access.
    diagnostics: () => ({
      focus: focusKind,
      contextValid: focusContextValid,
      eligible: visibility.isEligible(),
      interactionEpoch,
      keyboardAuthorization: visibility.keyboardMode(),
    }),
    /** Reserve ownership before sending; cancel on a failed write or panel exit. */
    requestKeyboard: (clickThrough = false) => {
      const request = ++nextKeyboardRequest;
      if (!visibility.requestKeyboard(request, clickThrough)) return null;
      intentGeneration += 1;
      return request;
    },
    /** @param {number} epoch @param {number} token @param {boolean} clickThrough */
    requestHoverKeyboard(epoch, token, clickThrough) {
      if (epoch !== interactionEpoch) return null;
      const request = ++nextKeyboardRequest;
      if (!visibility.requestKeyboard(request, clickThrough, "hover", token)) return null;
      intentGeneration += 1;
      return request;
    },
    getInteractionEpoch: () => interactionEpoch,
    keyboardMode: () => visibility.keyboardMode(),
    /** @param {number} request */
    ownsKeyboardRequest: (request) => visibility.ownsRequest(request),
    /** @param {number} token */
    cancelHoverKeyboard(token) {
      const cancelled = visibility.cancelHover(token);
      if (cancelled) intentGeneration += 1;
      return cancelled;
    },
    cancelKeyboard() {
      intentGeneration += 1;
      visibility.resetKeyboard();
    },
    /** One accepted action, not a lease to capture keys. Own release must not cancel it.
     * @param {number} request @param {number} epoch */
    acceptJumpIntent(request, epoch) {
      if (
        !visibility.ownsRequest(request) ||
        !visibility.isEligible() ||
        epoch !== interactionEpoch ||
        !interactionContext ||
        !focusContextValid ||
        focusWindowId === null ||
        consumedJumpRequest === request
      )
        return null;
      consumedJumpRequest = request;
      const context = interactionContext;
      const generation = intentGeneration;
      const sourceWorkspaceId = workspace?.id;
      const sourceWindowId = focusWindowId;
      return {
        workspaceId: sourceWorkspaceId,
        windowId: sourceWindowId,
        allowUnlisted: visibility.keyboardMode() === "explicit",
        isCurrent: () =>
          generation === intentGeneration &&
          epoch === interactionEpoch &&
          focusContextValid &&
          context === interactionContext &&
          ["agent", "none"].includes(focusKind),
        /** @param {WorkspaceView | null} view */
        matchesSource(view) {
          if (
            !view ||
            view.workspace?.id !== sourceWorkspaceId ||
            !["agent", "none"].includes(view.focusKind ?? "unknown")
          )
            return false;
          const owned = visibleCardsForWindow(view.sessions, sourceWindowId);
          return (
            owned.length === 1 &&
            (view.focusKind !== "agent" || view.focusedCardId === owned[0]?.cardId) &&
            sourceIdentity(sourceWorkspaceId, sourceWindowId, owned[0]) === context
          );
        },
      };
    },
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
    /** @param {number} windowId */
    getDirectoryWindowIdentities: (windowId) =>
      directory
        .filter((entry) => entry.windowId === windowId)
        .map((entry) =>
          sourceIdentity(entry.workspaceId, windowId, directoryCards.get(entry.cardId)),
        ),
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
