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
import {
  agentSourceMatches,
  publisherSet,
  selectionContradictsSource,
  sourceIdentity,
  visibleCardsForWindow,
} from "./interaction-context.mjs";
import { createNeutralSource } from "./panel-neutral-source.mjs";
import { createPanelPresentation } from "./panel-presentation.mjs";
import { PANEL_PROTOCOL } from "./panel-protocol.mjs";

/** @typedef {Record<string, unknown>} SessionRecord */
/** @typedef {{generatedAt: number; sessions: SessionRecord[]}} Snapshot */
/** @typedef {{workspace: Record<string, unknown> | null; sessions: SessionRecord[]; focusedSessionId: string | null; focusedCardId?: string | null; focusWindowId?: number | null; focusKind?: import("./focus-visibility.mjs").FocusKind}} WorkspaceView */
/** @typedef {{placement: string; surfaceVisible: boolean; windowId: number | null; workspaceIdx: number | null}} CardPlacement */
/** @typedef {{isNiriSession: () => boolean; publish: (view: Record<string, unknown> & {type: string; sessions: SessionRecord[]}) => void; getWindowFacts?: (id: number) => Record<string, unknown> | null; env?: NodeJS.ProcessEnv; hotkey?: string | null}} NativePanelProjectionOptions */

/** @param {NativePanelProjectionOptions} options */
export function createNativePanelProjection({
  isNiriSession,
  publish,
  getWindowFacts = () => null,
  env = process.env,
  hotkey = null,
}) {
  /** @type {Snapshot} */
  let snapshot = { generatedAt: Date.now(), sessions: [] };
  /** Process-discovered agent tabs publish no telemetry. @type {SessionRecord[]} */
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
  /** Read-only AK data; absent until first read. @type {{claims: import("../common/contracts.ts").AkTaskClaim[]; deferred: import("../common/contracts.ts").AkTaskDeferred[]} | null} */
  let akTasks = null;
  /** All-workspace window list. @type {import("../common/workspace-view.mjs").WindowDirectoryEntry[]} */
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
  /** Exact source, retained across explicit panel NULL focus. @type {number | null} */
  let focusWindowId = null;
  /** One exact card, or a presence app owning none. @type {"agent" | "neutral" | null} */
  let focusSourceKind = null;
  let focusContextValid = false;

  const neutralSource = createNeutralSource(getWindowFacts, env);
  const presentation = createPanelPresentation({
    getWindowFacts,
    getCards: getDisplaySessions,
    getRawSessions: allSessions,
    env,
  });

  function ensureNeutralSource() {
    if (
      focusSourceKind !== "neutral" ||
      neutralSource.holds(workspace?.id, focusWindowId, getDisplaySessions())
    )
      return true;
    invalidateFocus();
    return false;
  }

  function clearFocusState() {
    focusContextValid = false;
    focusKind = "unknown";
    focusWindowId = null;
    focusSourceKind = null;
    neutralSource.clear();
    focusedCardId = null;
    focusedSessionId = null;
  }

  function invalidateFocus() {
    presentation.clear();
    clearFocusState();
    send();
  }

  /** Recheck the established exact owner against current complete-window admission facts.
   * This only revokes: event facts cannot publish new card membership or re-admit invalid proof.
   * @param {(workspace: Record<string, unknown>) => WorkspaceView | null} resolveView
   */
  function focusProofMatches(resolveView) {
    if (focusWindowId === null || !focusContextValid) return true;
    const current = workspace ? resolveView(workspace) : null;
    if (focusSourceKind === "neutral") {
      return (
        current?.workspace?.id === workspace?.id &&
        neutralSource.holds(workspace?.id, focusWindowId, current?.sessions ?? [])
      );
    }
    return agentSourceMatches(getDisplaySessions(), current, workspace?.id, focusWindowId);
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
    if (
      selectionContradictsSource(workspace, focusWindowId) ||
      (focusSourceKind === "neutral" &&
        !neutralSource.holds(workspace?.id, focusWindowId, sessions))
    )
      clearFocusState();
    // Keyboard NULL ownership is only a continuation of one still-admitted exact agent window.
    // A publisher ending (or becoming ambiguous) must not leave another window's cards eligible.
    if (
      focusSourceKind !== "neutral" &&
      (focusKind === "agent" || (focusKind === "none" && focusWindowId !== null)) &&
      (focusWindowId === null || visibleCardsForWindow(sessions, focusWindowId).length !== 1)
    ) {
      clearFocusState();
    }
    let owner =
      focusSourceKind === "neutral"
        ? undefined
        : sessions.find((card) => card.windowId === focusWindowId && card.surfaceVisible !== false);
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
    const sourceHeld = focusSourceKind === "neutral" ? focusWindowId !== null : owner !== undefined;
    const context =
      focusContextValid &&
      workspace?.is_focused === true &&
      ["agent", "neutral", "none"].includes(focusKind) &&
      sourceHeld
        ? focusSourceKind === "neutral"
          ? neutralSource.context(workspace?.id, focusWindowId)
          : sourceIdentity(workspace?.id, focusWindowId, owner)
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
      visible: presentation.visible(visibility.observe(facts), workspace, focusWindowId),
      focusedSessionId,
      focusedCardId,
      generatedAt: snapshot.generatedAt,
      sessions,
      windows: directory,
      hotkey,
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
      source: focusSourceKind,
      contextValid: focusContextValid,
      eligible: visibility.isEligible(),
      interactionEpoch,
      keyboardAuthorization: visibility.keyboardMode(),
    }),
    /** Reserve ownership before sending; cancel on a failed write or panel exit. */
    requestKeyboard: (clickThrough = false) => {
      if (!ensureNeutralSource()) return null;
      const request = ++nextKeyboardRequest;
      if (!visibility.requestKeyboard(request, clickThrough)) return null;
      intentGeneration += 1;
      return request;
    },
    /** @param {number} epoch @param {number} token @param {boolean} clickThrough */
    requestHoverKeyboard(epoch, token, clickThrough) {
      if (!ensureNeutralSource() || epoch !== interactionEpoch) return null;
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
      if (!ensureNeutralSource()) return null;
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
      const sourceKind = focusSourceKind;
      return {
        workspaceId: sourceWorkspaceId,
        windowId: sourceWindowId,
        allowUnlisted: visibility.keyboardMode() === "explicit",
        isCurrent: () =>
          generation === intentGeneration &&
          epoch === interactionEpoch &&
          focusContextValid &&
          context === interactionContext &&
          sourceKind === focusSourceKind &&
          ["agent", "neutral", "none"].includes(focusKind),
        /** @param {WorkspaceView | null} view */
        matchesSource(view) {
          if (!view || view.workspace?.id !== sourceWorkspaceId) return false;
          if (selectionContradictsSource(view.workspace, sourceWindowId)) return false;
          const kind = view.focusKind ?? "unknown";
          const owned = visibleCardsForWindow(view.sessions, sourceWindowId);
          if (sourceKind === "neutral")
            return (
              (kind === "none" || (kind === "neutral" && view.focusWindowId === sourceWindowId)) &&
              neutralSource.holds(sourceWorkspaceId, sourceWindowId, view.sessions) &&
              neutralSource.context(sourceWorkspaceId, sourceWindowId) === context
            );
          if (!["agent", "none"].includes(kind)) return false;
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
    /** Revocation-only layout metadata; never admit seat focus or a replacement source.
     * @param {number} id @param {number | null} windowId
     * @param {(workspace: Record<string, unknown>) => WorkspaceView | null} resolveView */
    observeWorkspaceSelection(id, windowId, resolveView) {
      if (workspace?.id !== id) return;
      workspace = { ...workspace, active_window_id: windowId };
      presentation.prepare(workspace, windowId, resolveView);
      send();
    },
    /** @param {number} windowId */
    invalidateWindowFocus(windowId) {
      if (windowId === focusWindowId || presentation.involves(windowId)) invalidateFocus();
    },
    /** @param {(workspace: Record<string, unknown>) => WorkspaceView | null} resolveView */
    revalidateWindowFocus(resolveView) {
      const valid = focusProofMatches(resolveView) && presentation.holds(workspace, resolveView);
      if (!valid) invalidateFocus();
      return valid;
    },
    /** Authoritative focus-event ids, not app-id/title guesses or delayed panel acknowledgements.
     * @param {number | null} windowId
     * @param {(workspace: Record<string, unknown>) => WorkspaceView | null} [resolveView]
     */
    publishWindowFocus(windowId, resolveView) {
      if (windowId !== null && resolveView) presentation.prepare(workspace, windowId, resolveView);
      const cards = getDisplaySessions();
      const facts = windowId === null ? null : getWindowFacts(windowId);
      focusKind = !focusContextValid
        ? "unknown"
        : windowId === null
          ? "none"
          : classifyAdmittedWindowFocus(
              windowId,
              cards,
              facts?.workspace_id === workspace?.id ? facts : null,
              env,
            );
      // NULL is the panel holding the keyboard (or a layer surface above the source): the source
      // window and its current card stand, so the ring and scroll position do not move under it.
      if (focusKind !== "none") {
        const current =
          focusKind === "agent"
            ? cards.find((card) => card.windowId === windowId && card.surfaceVisible !== false)
            : null;
        focusedCardId = current ? String(current.cardId) : null;
        focusedSessionId = current ? String(current.sessionId) : null;
      }
      if (focusKind === "agent" || focusKind === "neutral") {
        focusWindowId = windowId;
        focusSourceKind = focusKind;
        neutralSource.admit(focusKind === "neutral" ? facts : null);
      } else if (focusKind !== "none") {
        focusWindowId = null;
        focusSourceKind = null;
      }
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
    /** Replace read-only AK chips: empty clears them; null (never read) leaves cards untouched.
     * @param {{claims: import("../common/contracts.ts").AkTaskClaim[]; deferred: import("../common/contracts.ts").AkTaskDeferred[]} | null} state
     */
    setAkTasks(state) {
      akTasks = state;
      send();
    },
    /** Resolve a current card or a cross-workspace directory entry.
     * @param {string} targetId */
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
    /** Replace the window list, published with the next view.
     * @param {{entries: import("../common/workspace-view.mjs").WindowDirectoryEntry[]; cards: Map<string, SessionRecord>}} next
     */
    setDirectory(next) {
      directory = next.entries;
      directoryCards = next.cards;
    },
    /** @param {WorkspaceView} view */
    publishWorkspaceView(view) {
      presentation.prepareView(view, focusWindowId);
      const sameWorkspace = Number.isInteger(workspace?.id) && view.workspace?.id === workspace?.id;
      const retainedCardId = sameWorkspace ? focusedCardId : null;
      const retainedSessionId = sameWorkspace ? focusedSessionId : null;
      if (!sameWorkspace) {
        focusWindowId = null;
        focusSourceKind = null;
      }
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
      // Under NULL the established source keeps its current card (see publishWindowFocus).
      if (
        focusKind === "none" &&
        focusWindowId !== null &&
        retainedCardId &&
        workspaceCardIds.has(retainedCardId)
      ) {
        focusedCardId = retainedCardId;
        focusedSessionId = retainedSessionId;
      }
      if (focusKind === "agent") {
        focusWindowId = workspacePlacements.get(focusedCardId ?? "")?.windowId ?? null;
        focusSourceKind = focusWindowId === null ? null : "agent";
      } else if (focusKind === "neutral") {
        focusWindowId = Number.isInteger(view.focusWindowId) ? Number(view.focusWindowId) : null;
        focusSourceKind = focusWindowId === null ? null : "neutral";
        neutralSource.admit(focusWindowId === null ? null : getWindowFacts(focusWindowId));
      } else if (focusKind !== "none") {
        focusWindowId = null;
        focusSourceKind = null;
      }
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
