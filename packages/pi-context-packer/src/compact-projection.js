/**
summary: "Project omission and next-tool details without exposing raw sensitive text."
read_when:
  - "You change compact packet detail redaction or token and byte estimates."
*/

const ESTIMATED_BYTES_PER_TOKEN = 4;

export const projectionTextBytes = (value) =>
  Buffer.byteLength(typeof value === "string" ? value : "");

export const projectionTextTokens = (value) =>
  Math.ceil(projectionTextBytes(value) / ESTIMATED_BYTES_PER_TOKEN);

export const compactOmissionProjections = (omissions = [], options = {}) => {
  const detailRefPrefix = options.detailRefPrefix ?? "packet.omissions";
  return omissions.map((omission, omissionIndex) => ({
    ...(options.includeRef ? { ref: `${detailRefPrefix}[${omissionIndex}]` } : {}),
    provider: omission.provider,
    reason: omission.reason,
    detailRef: `${detailRefPrefix}[${omissionIndex}].detail`,
    detailOmitted: Boolean(omission.detail),
    detailEstimatedTokens: projectionTextTokens(omission.detail ?? ""),
    detailBytes: projectionTextBytes(omission.detail),
  }));
};

export const compactNextToolSuggestionProjections = (suggestions = [], options = {}) => {
  const reasonRefPrefix = options.reasonRefPrefix ?? "packet.nextToolSuggestions";
  return suggestions.map((suggestion, suggestionIndex) => ({
    tool: suggestion.tool,
    reasonRef: `${reasonRefPrefix}[${suggestionIndex}].reason`,
    reasonOmitted: Boolean(suggestion.reason),
    reasonEstimatedTokens: projectionTextTokens(suggestion.reason ?? ""),
    reasonBytes: projectionTextBytes(suggestion.reason),
    nonAuthorization: suggestion.nonAuthorization,
  }));
};
