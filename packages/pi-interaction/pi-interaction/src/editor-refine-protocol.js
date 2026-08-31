// summary: Defines the closed editor-refine protocol, text bounds, and request validation.
// read_when:
//   - Changing editor refine message fields, modes, text normalization, or limits.

import { sha256Text } from "./editor-refine-identity.js";

export const EDITOR_REFINE_PROTOCOL_VERSION = 1;
export const EDITOR_REFINE_DESCRIPTOR_VERSION = 1;
export const MAX_EDITOR_BYTES = 64 * 1024;
export const MAX_FRAME_BYTES = 160 * 1024;
export const MAX_FRAMES_PER_CONNECTION = 2;
export const SNAPSHOT_TTL_MS = 2500;
export const OUTCOME_TTL_MS = 30_000;

const TRANSACTION_ID = /^[0-9a-f]{32}$/;
const MODES = new Set(["light", "rewrite"]);
const TARGET_FIELDS = ["session_id", "publisher_id", "pid", "process_start_time"];
const REQUEST_FIELDS = {
  snapshot: ["v", "type", "transaction_id", "mode", ...TARGET_FIELDS],
  commit: [
    "v",
    "type",
    "transaction_id",
    "expected_editor_sha256",
    "replacement",
    "replacement_sha256",
    ...TARGET_FIELDS,
  ],
  status: ["v", "type", "transaction_id", ...TARGET_FIELDS],
};

/** @typedef {"none"|"applied"|"indeterminate"} Effect */
/** @typedef {Record<string, any>} ProtocolMessage */
/** @typedef {{ text: string, bytes: number, sha256: string }} ValidatedText */

export class EditorRefineProtocolError extends Error {
  /** @param {string} code @param {string} message @param {Effect} [effect] */
  constructor(code, message, effect = "none") {
    super(message);
    this.name = "EditorRefineProtocolError";
    this.code = code;
    this.effect = effect;
  }
}

/** @param {unknown} text @returns {string} */
export function normalizeEditorText(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "    ");
}

/** @param {unknown} text @param {string} label @returns {ValidatedText} */
export function validateEditorText(text, label) {
  if (typeof text !== "string") {
    throw new EditorRefineProtocolError("invalid_text", `${label} must be text`);
  }
  const normalized = normalizeEditorText(text);
  const bytes = Buffer.byteLength(normalized, "utf8");
  if (bytes === 0 || bytes > MAX_EDITOR_BYTES || normalized.includes("\0")) {
    throw new EditorRefineProtocolError("invalid_text", `${label} is empty or out of bounds`);
  }
  return { text: normalized, bytes, sha256: sha256Text(normalized) };
}

/** @param {unknown} value @returns {value is "light"|"rewrite"} */
export function isRefineMode(value) {
  return typeof value === "string" && MODES.has(value);
}

/** @param {ProtocolMessage} message */
export function validateEnvelope(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new EditorRefineProtocolError("invalid_request", "request must be an object");
  }
  if (message.v !== EDITOR_REFINE_PROTOCOL_VERSION) {
    throw new EditorRefineProtocolError("unsupported_protocol", "unsupported protocol version");
  }
  if (!TRANSACTION_ID.test(message.transaction_id ?? "")) {
    throw new EditorRefineProtocolError("invalid_transaction", "invalid transaction id");
  }
}

/** @param {ProtocolMessage} message */
export function validateRequestShape(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new EditorRefineProtocolError("invalid_request", "request must be an object");
  }
  const type = String(message.type ?? "");
  if (!Object.hasOwn(REQUEST_FIELDS, type)) {
    throw new EditorRefineProtocolError("invalid_request", "unsupported request type");
  }
  const allowed = REQUEST_FIELDS[/** @type {keyof typeof REQUEST_FIELDS} */ (type)];
  const allowedSet = new Set(allowed);
  if (
    allowed.some((field) => !(field in message)) ||
    Object.keys(message).some((field) => !allowedSet.has(field))
  ) {
    throw new EditorRefineProtocolError(
      "invalid_request",
      "request fields differ from the closed schema",
    );
  }
}
