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

const longestBacktickRun = (text) => {
  const runs = String(text).match(/`+/gu) ?? [];
  return runs.reduce((max, run) => Math.max(max, run.length), 0);
};

export const markdownFence = (label, content) => {
  const fenceLength = Math.max(3, longestBacktickRun(content) + 1, longestBacktickRun(label) + 1);
  const fence = "`".repeat(fenceLength);
  return [fence, `# ${label}`, content, fence].join("\n");
};
