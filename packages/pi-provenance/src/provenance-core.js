const PROVENANCE_SCHEMA = "pi.assistant_message.provenance.v1";
const SOURCE_OWNER = "pi-runtime";

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cloneJsonObject(value) {
  if (!isObject(value)) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isAssistantMessageEntry(entry) {
  return isObject(entry) && entry.type === "message" && entry.message?.role === "assistant";
}

function latest(entries, predicate) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (predicate(entry)) return entry;
  }
  return undefined;
}

export function findLatestAssistantMessageEntry(entries) {
  if (!Array.isArray(entries)) return undefined;
  return latest(entries, isAssistantMessageEntry);
}

export function buildAssistantMessageProvenance(entry, options = {}) {
  if (!isAssistantMessageEntry(entry)) {
    throw new Error("Expected a Pi session message entry with an assistant message");
  }

  const message = entry.message;
  const provider = asString(message.provider);
  const model = asString(message.model);
  const api = asString(message.api);

  if (!provider || !model || !api) {
    throw new Error("Assistant message is missing provider, model, or api provenance fields");
  }

  return {
    provenance_schema: options.schema ?? PROVENANCE_SCHEMA,
    source_owner: SOURCE_OWNER,
    capture_time: options.captureTime ?? new Date().toISOString(),
    pi_session: {
      session_id: asString(options.sessionId),
      session_file: asString(options.sessionFile),
      message_entry_id: asString(entry.id),
      message_parent_id: asString(entry.parentId),
      entry_timestamp: asString(entry.timestamp),
    },
    assistant_message: {
      provider,
      model,
      api,
      response_id: asString(message.responseId),
      message_timestamp: asNumber(message.timestamp),
      stop_reason: asString(message.stopReason),
      usage: cloneJsonObject(message.usage),
    },
  };
}

export function extractLatestAssistantMessageProvenance(sessionManager, options = {}) {
  if (!sessionManager || typeof sessionManager.getEntries !== "function") {
    throw new Error("A Pi sessionManager with getEntries() is required");
  }

  const entry = findLatestAssistantMessageEntry(sessionManager.getEntries());
  if (!entry) return undefined;

  return buildAssistantMessageProvenance(entry, {
    sessionId: sessionManager.getSessionId?.(),
    sessionFile: sessionManager.getSessionFile?.(),
    captureTime: options.captureTime,
    schema: options.schema,
  });
}

export function formatAssistantMessageProvenanceSummary(provenance) {
  const session = provenance.pi_session;
  const message = provenance.assistant_message;
  const entry = session.message_entry_id ?? "unknown-entry";
  const model = `${message.provider}/${message.model}`;
  const stopReason = message.stop_reason ?? "unknown-stop";
  return `${model} via ${message.api} (${stopReason}) at ${entry}`;
}

export { PROVENANCE_SCHEMA, SOURCE_OWNER };
