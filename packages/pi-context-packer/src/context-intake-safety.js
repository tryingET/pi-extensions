const GENERATED_OR_VENDOR_PARTS = new Set(["node_modules", "dist", "build", "coverage"]);
const HIDDEN_OR_INTERNAL_PARTS = new Set(["__pycache__"]);

export const hasControlCharacter = (value) =>
  Array.from(value).some((character) => character.charCodeAt(0) < 32);

export const hasSchemeOrDrivePrefix = (value) => /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);

export const repoRelativePathSafetyIssue = (value, label = "path seed") => {
  if (typeof value !== "string" || !value.trim()) return `${label} is empty`;
  if (hasControlCharacter(value)) return `${label} contains control characters`;
  if (hasSchemeOrDrivePrefix(value)) return "URI or drive-letter path seed omitted";
  if (value.startsWith("/") || value.startsWith("~"))
    return "absolute/home-relative path seed omitted";
  if (value.includes("\\")) return "path seed must use repo-relative POSIX separators";

  const parts = value.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    return "current-directory or parent-traversing path seed omitted";
  }
  if (parts.some((part) => part.startsWith(".") || HIDDEN_OR_INTERNAL_PARTS.has(part))) {
    return "hidden/internal path seed omitted";
  }
  if (parts.some((part) => GENERATED_OR_VENDOR_PARTS.has(part))) {
    return "generated/vendor path seed omitted";
  }
  return undefined;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const signalPattern = (signal) =>
  signal.toLowerCase().trim().split(/\s+/u).map(escapeRegExp).join("[\\s_-]+");

export const boundedSignalMatches = (haystack, signal) =>
  new RegExp(`(^|[^a-z0-9])${signalPattern(signal)}([^a-z0-9]|$)`, "iu").test(haystack);

export const includesBoundedSignal = (haystack, signals) =>
  signals.some((signal) => boundedSignalMatches(haystack, signal));

const replaceControlCharacters = (value) =>
  Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("");

export const markdownInlineLabel = (value, fallback = "unnamed", maxLength = 240) => {
  const text = replaceControlCharacters(String(value ?? ""))
    .replace(/</gu, "‹")
    .replace(/>/gu, "›")
    .replace(/\s+/gu, " ")
    .trim();
  if (!text) return fallback;
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
};

const longestBacktickRun = (text) => {
  const runs = String(text).match(/`+/gu) ?? [];
  return runs.reduce((max, run) => Math.max(max, run.length), 0);
};

const UNSAFE_DETAIL_SIGNALS =
  /\b(token|password|passwd|api[_-]?key|credential|customer-[a-z0-9_-]+)\b/iu;
const ABSOLUTE_POSIX_PATH_SIGNAL = /(^|[\s"'`=(:,;])\/[\w./~+-]+/u;
const WINDOWS_PATH_SIGNAL = /(^|[\s"'`=(:,;])(?:[A-Za-z]:\\|\\\\)[^\s"'`<>|]+/u;

const safeErrorCode = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  return /^[A-Za-z0-9_.-]{1,40}$/u.test(text) ? text : undefined;
};

const safeErrorSignal = (value) => {
  if (typeof value !== "string") return undefined;
  return /^[A-Z0-9_]{1,40}$/u.test(value) ? value : undefined;
};

export const subprocessFailureDetail = (toolLabel, error, action = "run") => {
  const parts = [];
  const errorLike = error && typeof error === "object" ? error : {};
  const code = safeErrorCode(errorLike.code);
  const signal = safeErrorSignal(errorLike.signal);
  if (code) parts.push(`code=${code}`);
  if (signal) parts.push(`signal=${signal}`);
  if (errorLike.killed === true) parts.push("terminated=true");
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/timed out|timeout|ETIMEDOUT/iu.test(message)) parts.push("timeout=true");
  const suffix = parts.length ? ` (${Array.from(new Set(parts)).join(", ")})` : "";
  return `${toolLabel} ${action} failed${suffix}; raw subprocess error output omitted from packet surfaces`;
};

export const publicOmissionDetail = (detail, fallback = "omission detail withheld") => {
  const text = typeof detail === "string" ? detail : String(detail ?? "");
  if (!text.trim()) return fallback;
  if (text.length > 1000) return `${fallback}; raw detail exceeded safe public length`;
  if (hasControlCharacter(text)) return `${fallback}; raw detail contained control characters`;
  if (
    UNSAFE_DETAIL_SIGNALS.test(text) ||
    ABSOLUTE_POSIX_PATH_SIGNAL.test(text) ||
    WINDOWS_PATH_SIGNAL.test(text)
  ) {
    return `${fallback}; raw detail contained local path or secret-like text`;
  }
  return text;
};

export const markdownFence = (label, content) => {
  const safeLabel = markdownInlineLabel(label);
  const fenceLength = Math.max(
    3,
    longestBacktickRun(content) + 1,
    longestBacktickRun(safeLabel) + 1,
  );
  const fence = "`".repeat(fenceLength);
  return [fence, `# ${safeLabel}`, content, fence].join("\n");
};
