import { createHash } from "node:crypto";

const encoder = new TextEncoder();

export function invariant(condition, message) {
  if (!condition) throw new TypeError(message);
}

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function exactKeys(value, required, optional = [], label = "object") {
  invariant(isRecord(value), `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${label}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${label}.${key} is unknown`);
}

export function compareUtf8(left, right) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function validUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

export function boundedText(value, maximum, nonblank = false) {
  return (
    typeof value === "string" &&
    validUnicode(value) &&
    [...value].length <= maximum &&
    (!nonblank || /\S/.test(value))
  );
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    invariant(validUnicode(value), "canonical JSON requires Unicode scalar-value strings");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "canonical JSON requires finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(isRecord(value), `canonical JSON does not support ${typeof value}`);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function sha256Digest(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

export function sha256Raw(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function isDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

export function isCommit(value) {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
}

export function isSafePath(value) {
  const hasControl =
    typeof value === "string" &&
    [...value].some((character) => {
      const code = character.codePointAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    });
  if (
    !boundedText(value, 4096, true) ||
    Buffer.byteLength(value, "utf8") > 4096 ||
    value.trim() !== value ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\\") ||
    hasControl
  ) {
    return false;
  }
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}

export function normalizeText(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

export function unique(values) {
  return new Set(values).size === values.length;
}

export function mean(values) {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

export function portableText(value) {
  return !(
    /(?:^|[\s'"(=])\/(?:home|Users|tmp|private\/tmp|var\/folders|usr|etc|opt|root|srv|mnt|media)\//.test(
      value,
    ) ||
    /(?:^|[\s'"(=])[A-Za-z]:[\\/]/.test(value) ||
    /file:\/\//i.test(value)
  );
}
