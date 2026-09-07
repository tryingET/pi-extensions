import { createHash } from "node:crypto";

export function refuse(code: string): never {
  throw new Error(code);
}
// biome-ignore lint/suspicious/noExplicitAny: schema validators check each field after exact-key validation.
export function record(value: unknown, keys: readonly string[]): Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
  )
    refuse("invalid_fields");
  // biome-ignore lint/suspicious/noExplicitAny: private dynamic schema boundary, not a public request type.
  return value as Record<string, any>;
}
export function text(value: unknown, max = 65536): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    Buffer.byteLength(value) > max ||
    !value.isWellFormed() ||
    value.includes("\0")
  )
    refuse("invalid_string");
  return value;
}
export function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max)
    refuse("invalid_integer");
  return value as number;
}
export function id(value: unknown): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(text(value, 128))) refuse("invalid_id");
  return value as string;
}
export function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    if (!value.isWellFormed()) refuse("invalid_unicode");
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => {
        if (!/^[\x20-\x7e]+$/.test(k)) refuse("invalid_key");
        return `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`;
      })
      .join(",")}}`;
  }
  refuse("invalid_json_value");
}
export const digest = (value: unknown): string =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const bytesDigest = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

/** Bounded recursive parser: JSON.parse alone silently accepts duplicate object keys. */
export function parseJson(bytes: Uint8Array | string, max = 1048576): unknown {
  if (Buffer.byteLength(bytes) > max) refuse("input_too_large");
  const s =
    typeof bytes === "string"
      ? bytes
      : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (s.charCodeAt(0) === 0xfeff) refuse("bom_forbidden");
  let i = 0;
  const ws = () => {
    while ([" ", "\t", "\n", "\r"].includes(s[i] ?? "") && i < s.length) i++;
  };
  const str = (): string => {
    const start = i++;
    while (i < s.length) {
      if (s[i] === "\\") {
        i += 2;
        continue;
      }
      if (s[i++] === '"') {
        const v = JSON.parse(s.slice(start, i));
        if (!v.isWellFormed() || Buffer.byteLength(v) > 65536) refuse("invalid_string");
        return v;
      }
    }
    refuse("invalid_json");
  };
  const value = (depth: number): unknown => {
    if (depth > 16) refuse("input_too_deep");
    ws();
    if (s[i] === '"') return str();
    if (s[i] === "{") {
      i++;
      ws();
      const result: Record<string, unknown> = {};
      const seen = new Set<string>();
      if (s[i] === "}") {
        i++;
        return result;
      }
      for (;;) {
        ws();
        if (s[i] !== '"') refuse("invalid_json");
        const key = str();
        if (!/^[\x20-\x7e]+$/.test(key) || seen.has(key)) refuse("duplicate_or_invalid_key");
        seen.add(key);
        ws();
        if (s[i++] !== ":") refuse("invalid_json");
        Object.defineProperty(result, key, {
          value: value(depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
        ws();
        const c = s[i++];
        if (c === "}") return result;
        if (c !== ",") refuse("invalid_json");
      }
    }
    if (s[i] === "[") {
      i++;
      ws();
      const result: unknown[] = [];
      if (s[i] === "]") {
        i++;
        return result;
      }
      for (;;) {
        if (result.length >= 4096) refuse("array_too_large");
        result.push(value(depth + 1));
        ws();
        const c = s[i++];
        if (c === "]") return result;
        if (c !== ",") refuse("invalid_json");
      }
    }
    for (const [literal, v] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (s.startsWith(literal, i)) {
        i += literal.length;
        return v;
      }
    }
    const n = /^(0|[1-9][0-9]*)/.exec(s.slice(i));
    if (!n) refuse("invalid_json");
    i += n[0].length;
    const v = Number(n[0]);
    if (!Number.isSafeInteger(v)) refuse("invalid_integer");
    return v;
  };
  const result = value(0);
  ws();
  if (i !== s.length) refuse("invalid_json");
  return result;
}
