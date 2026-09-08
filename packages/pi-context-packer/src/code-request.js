/**
summary: "Validate explicit code discovery or hash-bound symbol expansion requests."
read_when:
  - "Changing the public code selection contract."
*/
import { hasControlCharacter } from "./context-intake-safety.js";
import { safeRelative } from "./ripwire-corpus.js";

export const CODE_QUERY_MAX_CHARS = 4000;

export const CODE_REQUEST_SCHEMA = {
  type: "object",
  description:
    'Ripwire discovery or hash-bound expansion. Select providers.ripwire="required"; automatic selection is off.',
  additionalProperties: false,
  properties: {
    refresh: {
      type: "boolean",
      description:
        "Resend unchanged code already in active context; rediscover first when a selection is stale.",
    },
    mode: {
      type: "string",
      enum: ["discover", "expand"],
      description:
        "Discover ranked locations, then expand one exact selection for its source body.",
    },
    selection: {
      type: "object",
      description:
        "For expand only: copy the exact repo-relative path, literal name, line and source SHA-256 from discovery.",
      additionalProperties: false,
      properties: {
        path: { type: "string", maxLength: 4096 },
        name: { type: "string", maxLength: 240 },
        line: { type: "integer", minimum: 1 },
        contentSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
      required: ["path", "name", "line", "contentSha256"],
    },
  },
  required: ["mode"],
};
export function normalizeCodeRequest(value) {
  if (value === undefined) return { mode: "discover" };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["mode", "selection", "refresh"].includes(key))
  )
    throw new Error("invalid_code_request");
  if (value.refresh !== undefined && typeof value.refresh !== "boolean")
    throw new Error("invalid_code_request");
  if (value.mode === "discover" && value.selection === undefined)
    return { mode: "discover", refresh: value.refresh === true };
  const x = value.selection;
  if (
    value.mode !== "expand" ||
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).length !== 4 ||
    !safeRelative(x.path) ||
    /[,]/u.test(x.path) ||
    typeof x.name !== "string" ||
    !/^[^,:]{1,240}$/u.test(x.name) ||
    hasControlCharacter(x.name) ||
    !Number.isSafeInteger(x.line) ||
    x.line < 1 ||
    !/^[a-f0-9]{64}$/u.test(x.contentSha256)
  )
    throw new Error("invalid_code_selection");
  return {
    mode: "expand",
    refresh: value.refresh === true,
    selection: { path: x.path, name: x.name, line: x.line, contentSha256: x.contentSha256 },
  };
}
