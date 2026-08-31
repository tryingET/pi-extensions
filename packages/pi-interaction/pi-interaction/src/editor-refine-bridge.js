// summary: Exposes a focus-bound, two-phase compare-and-swap bridge for the active Pi editor.
// read_when:
//   - Changing external editor refinement, focus binding, or editor mutation safety.

import { createEditorRefineEndpoint } from "./editor-refine-endpoint.js";
import { publisherToken, sessionToken } from "./editor-refine-identity.js";
import {
  EditorRefineProtocolError as BridgeError,
  EDITOR_REFINE_DESCRIPTOR_VERSION,
  EDITOR_REFINE_PROTOCOL_VERSION,
  isRefineMode,
  MAX_FRAME_BYTES,
  MAX_FRAMES_PER_CONNECTION,
  OUTCOME_TTL_MS,
  SNAPSHOT_TTL_MS,
  validateEditorText,
  validateEnvelope,
  validateRequestShape,
} from "./editor-refine-protocol.js";

export {
  isUniqueSessionPresence,
  linuxProcessStartTime,
  niriSessionFocusProof,
  resolveUniqueSessionPresence,
  sha256Text,
} from "./editor-refine-identity.js";
export { normalizeEditorText } from "./editor-refine-protocol.js";

/** @typedef {import("node:net").Socket} Socket */
/** @typedef {"none"|"applied"|"indeterminate"} Effect */
/** @typedef {Record<string, any>} ProtocolMessage */
/** @typedef {{ text: string, bytes: number, sha256: string }} ValidatedText */
/** @typedef {{ windowId: number, focusEpoch: string, terminalKey: string }} FocusProof */
/** @typedef {{ transactionId: string, mode: "light"|"rewrite", text: string, digest: string, editorGeneration: number, focus: FocusProof, deadline: number }} SnapshotState */
/** @typedef {{ buffer: string, chain: Promise<void>, terminal: boolean, frameCount: number, snapshot?: SnapshotState }} ConnectionState */
/** @typedef {{ status: string, effect: Effect, input_sha256: string, output_sha256: string, output_bytes?: number, readback_sha256?: string }} Outcome */
/** @typedef {Outcome & { recorded_at_ms: number }} StoredOutcome */
/** @typedef {{ sessionId: string, publisherId: string, runtimeDir: string, processStartTime: string, getEditorText: () => string, setEditorText: (text: string) => void, getEditorGeneration: () => number, isEditorActive: () => boolean, isIdle: () => boolean, hasPendingMessages: () => boolean, getFocusProof: () => FocusProof|null|Promise<FocusProof|null>, isProcessIdentityCurrent: () => boolean|Promise<boolean>, now?: () => number, notify?: (message: string, level: "info"|"warning"|"error") => void, setStatus?: (value: string|undefined) => void }} EditorRefineBridgeOptions */
/** @typedef {{ socketPath: string|undefined, descriptorPath: string|undefined, diagnostics: () => { sessionId: string, publisherId: string, publisherToken: string, socketPath: string|undefined, descriptorPath: string|undefined, activeTransaction: string|undefined, outcomeCount: number }, start: () => Promise<string>, stop: () => Promise<void> }} EditorRefineBridge */

/** @param {Socket} socket @param {Record<string, unknown>} payload @returns {boolean} */
function writeFrame(socket, payload) {
  if (socket.destroyed || !socket.writable) return false;
  try {
    socket.write(`${JSON.stringify(payload)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** @param {Socket} socket @param {ConnectionState} state @param {Record<string, unknown>} payload */
function terminalResponse(socket, state, payload) {
  if (state.terminal) return;
  state.terminal = true;
  state.buffer = "";
  writeFrame(socket, payload);
  socket.end();
}

/** @param {EditorRefineBridgeOptions} options @returns {EditorRefineBridge} */
export function createEditorRefineBridge(options) {
  const sessionId = String(options.sessionId ?? "");
  sessionToken(sessionId);
  const publisherId = String(options.publisherId ?? "");
  const exactPublisherToken = publisherToken(publisherId);
  const runtimeDir = String(options.runtimeDir ?? "");
  if (!runtimeDir.startsWith("/")) {
    throw new BridgeError("invalid_runtime_dir", "runtime dir must be absolute");
  }

  const now = options.now ?? Date.now;
  /** @type {Map<string, StoredOutcome>} */
  const outcomes = new Map();
  /** @type {Set<Socket>} */
  const connections = new Set();
  /** @type {{ transactionId: string, socket: Socket }|undefined} */
  let active;

  /** @param {string|undefined} value */
  const setStatus = (value) => {
    try {
      options.setStatus?.(value);
    } catch {}
  };

  /** @param {string} message @param {"info"|"warning"|"error"} level */
  const notify = (message, level) => {
    try {
      options.notify?.(message, level);
    } catch {
      // Notification is diagnostic only and never changes effect classification.
    }
  };

  /** @param {Socket|undefined} socket */
  const clearActive = (socket) => {
    if (active?.socket !== socket) return;
    active = undefined;
    setStatus(undefined);
  };

  const pruneOutcomes = () => {
    const cutoff = now() - OUTCOME_TTL_MS;
    for (const [id, outcome] of outcomes) {
      if (outcome.recorded_at_ms < cutoff) outcomes.delete(id);
    }
  };

  /** @returns {Promise<FocusProof>} */
  const requireEligible = async () => {
    if (!options.isIdle() || options.hasPendingMessages()) {
      throw new BridgeError("session_busy", "Pi session is not idle");
    }
    if (!options.isEditorActive()) {
      throw new BridgeError("editor_not_active", "owned Pi editor is not active");
    }
    if (!(await options.isProcessIdentityCurrent())) {
      throw new BridgeError("process_identity", "Pi process identity changed");
    }
    const focus = await options.getFocusProof();
    if (
      !focus ||
      !Number.isInteger(focus.windowId) ||
      focus.windowId <= 0 ||
      typeof focus.focusEpoch !== "string" ||
      !focus.focusEpoch ||
      typeof focus.terminalKey !== "string" ||
      !focus.terminalKey
    ) {
      throw new BridgeError("session_not_focused", "Pi session is not uniquely focused");
    }
    return focus;
  };

  /** @param {string} transactionId @param {Outcome} outcome */
  const recordOutcome = (transactionId, outcome) => {
    outcomes.set(transactionId, { ...outcome, recorded_at_ms: now() });
    pruneOutcomes();
  };

  /** @param {ProtocolMessage} message */
  const requireExactTarget = (message) => {
    if (
      message.session_id !== sessionId ||
      message.publisher_id !== publisherId ||
      message.pid !== process.pid ||
      message.process_start_time !== options.processStartTime
    ) {
      throw new BridgeError("target_mismatch", "request target does not match this publisher");
    }
  };

  /** @param {Socket} socket @param {ConnectionState} state @param {ProtocolMessage} message */
  const handleSnapshot = async (socket, state, message) => {
    validateEnvelope(message);
    requireExactTarget(message);
    if (!isRefineMode(message.mode)) {
      throw new BridgeError("invalid_mode", "unsupported refine mode");
    }
    if (state.snapshot) throw new BridgeError("duplicate_snapshot", "snapshot already established");
    if (active) throw new BridgeError("bridge_busy", "another editor transaction is active");
    if (outcomes.has(message.transaction_id)) {
      throw new BridgeError("transaction_replayed", "transaction id was already consumed");
    }

    const focus = await requireEligible();
    const snapshot = validateEditorText(options.getEditorText(), "editor snapshot");
    const editorGeneration = options.getEditorGeneration();
    if (!Number.isSafeInteger(editorGeneration) || editorGeneration < 0) {
      throw new BridgeError("editor_generation", "editor generation is invalid");
    }
    const deadline = now() + SNAPSHOT_TTL_MS;
    state.snapshot = {
      transactionId: message.transaction_id,
      mode: message.mode,
      text: snapshot.text,
      digest: snapshot.sha256,
      editorGeneration,
      focus,
      deadline,
    };
    active = { transactionId: message.transaction_id, socket };
    setStatus(`refining ${message.mode}…`);

    writeFrame(socket, {
      v: EDITOR_REFINE_PROTOCOL_VERSION,
      type: "snapshot",
      ok: true,
      transaction_id: message.transaction_id,
      session_id: sessionId,
      publisher_id: publisherId,
      publisher_token: exactPublisherToken,
      pid: process.pid,
      process_start_time: options.processStartTime,
      mode: message.mode,
      editor_sha256: snapshot.sha256,
      editor_bytes: snapshot.bytes,
      editor_generation: editorGeneration,
      focus_window_id: focus.windowId,
      focus_epoch: focus.focusEpoch,
      focus_terminal_key: focus.terminalKey,
      deadline_ms: deadline,
      text: snapshot.text,
    });
  };

  /** @param {Socket} socket @param {ConnectionState} state @param {ProtocolMessage} message */
  const handleCommit = async (socket, state, message) => {
    validateEnvelope(message);
    requireExactTarget(message);
    const snapshot = state.snapshot;
    if (!snapshot || active?.socket !== socket) {
      throw new BridgeError("snapshot_missing", "matching snapshot is not active");
    }
    const requireLiveTransaction = () => {
      if (state.terminal || state.snapshot !== snapshot || active?.socket !== socket) {
        throw new BridgeError("transaction_cancelled", "editor transaction was cancelled");
      }
    };
    if (message.transaction_id !== snapshot.transactionId) {
      throw new BridgeError("transaction_mismatch", "transaction does not match snapshot");
    }
    if (message.expected_editor_sha256 !== snapshot.digest) {
      throw new BridgeError("snapshot_mismatch", "expected editor digest does not match snapshot");
    }
    if (now() > snapshot.deadline) {
      throw new BridgeError("snapshot_expired", "snapshot deadline expired");
    }

    const replacement = validateEditorText(message.replacement, "replacement");
    if (message.replacement_sha256 !== replacement.sha256) {
      throw new BridgeError("replacement_mismatch", "replacement digest does not match payload");
    }
    if (replacement.text === snapshot.text) {
      throw new BridgeError("replacement_unchanged", "replacement does not change the editor");
    }

    const focus = await requireEligible();
    requireLiveTransaction();
    if (
      focus.windowId !== snapshot.focus.windowId ||
      focus.focusEpoch !== snapshot.focus.focusEpoch ||
      focus.terminalKey !== snapshot.focus.terminalKey
    ) {
      throw new BridgeError("focus_changed", "focus changed after snapshot");
    }
    if (options.getEditorGeneration() !== snapshot.editorGeneration) {
      throw new BridgeError("editor_changed", "editor generation changed after snapshot");
    }
    const current = validateEditorText(options.getEditorText(), "current editor");
    if (current.text !== snapshot.text || current.sha256 !== snapshot.digest) {
      throw new BridgeError("editor_changed", "editor changed after snapshot");
    }
    if (now() > snapshot.deadline) {
      throw new BridgeError("snapshot_expired", "snapshot deadline expired");
    }
    if (!options.isIdle() || options.hasPendingMessages()) {
      throw new BridgeError("session_busy", "Pi session became busy before commit");
    }
    if (!options.isEditorActive()) {
      throw new BridgeError("editor_not_active", "owned Pi editor changed before commit");
    }
    requireLiveTransaction();

    /** @type {ValidatedText} */
    let readback;
    try {
      options.setEditorText(replacement.text);
      readback = validateEditorText(options.getEditorText(), "editor readback");
    } catch {
      recordOutcome(snapshot.transactionId, {
        status: "effect_indeterminate",
        effect: "indeterminate",
        input_sha256: snapshot.digest,
        output_sha256: replacement.sha256,
      });
      throw new BridgeError(
        "commit_indeterminate",
        "editor commit outcome is indeterminate",
        "indeterminate",
      );
    }

    if (readback.text !== replacement.text || readback.sha256 !== replacement.sha256) {
      recordOutcome(snapshot.transactionId, {
        status: "effect_indeterminate",
        effect: "indeterminate",
        input_sha256: snapshot.digest,
        output_sha256: replacement.sha256,
        readback_sha256: readback.sha256,
      });
      throw new BridgeError(
        "readback_mismatch",
        "editor readback differs after commit",
        "indeterminate",
      );
    }

    /** @type {Outcome} */
    const outcome = {
      status: "committed",
      effect: "applied",
      input_sha256: snapshot.digest,
      output_sha256: replacement.sha256,
      output_bytes: replacement.bytes,
    };
    recordOutcome(snapshot.transactionId, outcome);
    clearActive(socket);
    state.snapshot = undefined;
    notify(`Refined ${snapshot.mode}; Ctrl+- restores the previous editor text.`, "info");
    terminalResponse(socket, state, {
      v: EDITOR_REFINE_PROTOCOL_VERSION,
      type: "commit",
      ok: true,
      transaction_id: snapshot.transactionId,
      session_id: sessionId,
      publisher_id: publisherId,
      publisher_token: exactPublisherToken,
      ...outcome,
    });
  };

  /** @param {Socket} socket @param {ConnectionState} state @param {ProtocolMessage} message */
  const handleStatus = (socket, state, message) => {
    validateEnvelope(message);
    requireExactTarget(message);
    pruneOutcomes();
    const outcome = outcomes.get(message.transaction_id);
    terminalResponse(socket, state, {
      v: EDITOR_REFINE_PROTOCOL_VERSION,
      type: "status",
      ok: true,
      transaction_id: message.transaction_id,
      session_id: sessionId,
      publisher_id: publisherId,
      publisher_token: exactPublisherToken,
      found: Boolean(outcome),
      retry_safe: false,
      outcome: outcome
        ? {
            status: outcome.status,
            effect: outcome.effect,
            input_sha256: outcome.input_sha256,
            output_sha256: outcome.output_sha256,
            output_bytes: outcome.output_bytes,
            readback_sha256: outcome.readback_sha256,
          }
        : null,
    });
  };

  /** @param {Socket} socket @param {ConnectionState} state @param {ProtocolMessage} message */
  const handleMessage = async (socket, state, message) => {
    validateRequestShape(message);
    if (message.type === "snapshot") return handleSnapshot(socket, state, message);
    if (message.type === "commit") return handleCommit(socket, state, message);
    if (message.type === "status" && !state.snapshot) return handleStatus(socket, state, message);
    throw new BridgeError("invalid_request", "unsupported request type");
  };

  /** @param {Socket} socket */
  const handleConnection = (socket) => {
    connections.add(socket);
    socket.setEncoding("utf8");
    socket.setTimeout(SNAPSHOT_TTL_MS + 750);
    /** @type {ConnectionState} */
    const state = {
      buffer: "",
      chain: Promise.resolve(),
      terminal: false,
      frameCount: 0,
      snapshot: undefined,
    };

    socket.on("data", (chunk) => {
      if (state.terminal) return;
      state.buffer += String(chunk);
      if (Buffer.byteLength(state.buffer, "utf8") > MAX_FRAME_BYTES) {
        clearActive(socket);
        state.snapshot = undefined;
        terminalResponse(socket, state, {
          v: EDITOR_REFINE_PROTOCOL_VERSION,
          type: "error",
          ok: false,
          code: "frame_too_large",
          effect: "none",
        });
        return;
      }

      let newline = state.buffer.indexOf("\n");
      while (newline >= 0 && !state.terminal) {
        const line = state.buffer.slice(0, newline);
        state.buffer = state.buffer.slice(newline + 1);
        state.frameCount += 1;
        if (state.frameCount > MAX_FRAMES_PER_CONNECTION) {
          clearActive(socket);
          state.snapshot = undefined;
          terminalResponse(socket, state, {
            v: EDITOR_REFINE_PROTOCOL_VERSION,
            type: "error",
            ok: false,
            code: "too_many_frames",
            effect: "none",
          });
          break;
        }
        state.chain = state.chain
          .then(async () => {
            if (state.terminal) return;
            /** @type {ProtocolMessage} */
            let message;
            try {
              message = JSON.parse(line);
            } catch {
              throw new BridgeError("invalid_json", "request is not valid JSON");
            }
            await handleMessage(socket, state, message);
          })
          .catch((error) => {
            if (state.terminal) return;
            const bridgeError =
              error instanceof BridgeError
                ? error
                : new BridgeError("internal_error", "bridge failed");
            if (bridgeError.effect !== "indeterminate") clearActive(socket);
            state.snapshot = undefined;
            terminalResponse(socket, state, {
              v: EDITOR_REFINE_PROTOCOL_VERSION,
              type: "error",
              ok: false,
              code: bridgeError.code,
              effect: bridgeError.effect,
            });
          });
        newline = state.buffer.indexOf("\n");
      }
    });

    socket.on("timeout", () => socket.destroy());
    socket.on("close", () => {
      connections.delete(socket);
      clearActive(socket);
      state.snapshot = undefined;
      state.terminal = true;
      state.buffer = "";
    });
    socket.on("error", () => {
      // Connection errors are represented by close; never log editor content.
    });
  };

  const endpoint = createEditorRefineEndpoint({
    runtimeDir,
    sessionId,
    publisherId,
    processStartTime: options.processStartTime,
    protocolVersion: EDITOR_REFINE_PROTOCOL_VERSION,
    descriptorVersion: EDITOR_REFINE_DESCRIPTOR_VERSION,
    snapshotTtlMs: SNAPSHOT_TTL_MS,
    outcomeTtlMs: OUTCOME_TTL_MS,
    now,
    onConnection: handleConnection,
    beforeStop: () => {
      for (const socket of connections) socket.destroy();
      connections.clear();
      clearActive(active?.socket);
    },
    onServerError: () => {
      setStatus(undefined);
      notify("Editor refine bridge server became unavailable", "error");
    },
  });

  return {
    get socketPath() {
      return endpoint.socketPath;
    },
    get descriptorPath() {
      return endpoint.descriptorPath;
    },
    diagnostics() {
      pruneOutcomes();
      return {
        sessionId,
        publisherId,
        publisherToken: exactPublisherToken,
        socketPath: endpoint.socketPath,
        descriptorPath: endpoint.descriptorPath,
        activeTransaction: active?.transactionId,
        outcomeCount: outcomes.size,
      };
    },
    start: () => endpoint.start(),
    stop: () => endpoint.stop(),
  };
}
