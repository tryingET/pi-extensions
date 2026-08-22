import { BoundaryError } from "./errors.js";

export function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new BoundaryError("INVALID_OBJECT", `${label} must be a plain object`);
  }
  return value;
}

export function rejectUnknownFields(value, allowed, label) {
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new BoundaryError(
        "UNKNOWN_FIELD",
        `${label} contains unknown field: ${key}`,
        { label, key },
      );
    }
  }
}

export function assertString(value, label, { min = 0, max = 4096, pattern } = {}) {
  if (typeof value !== "string") {
    throw new BoundaryError("INVALID_STRING", `${label} must be a string`);
  }
  const length = Buffer.byteLength(value, "utf8");
  if (length < min || length > max) {
    throw new BoundaryError(
      "STRING_OUT_OF_RANGE",
      `${label} UTF-8 length must be within ${min}..${max}`,
      { label, length, min, max },
    );
  }
  if (value.includes("\0")) {
    throw new BoundaryError("NUL_NOT_ALLOWED", `${label} must not contain NUL`);
  }
  if (pattern && !pattern.test(value)) {
    throw new BoundaryError("STRING_PATTERN_MISMATCH", `${label} has an invalid format`);
  }
  return value;
}

export function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new BoundaryError("INVALID_BOOLEAN", `${label} must be boolean`);
  }
  return value;
}

export function assertInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new BoundaryError(
      "INTEGER_OUT_OF_RANGE",
      `${label} must be a safe integer within ${min}..${max}`,
      { label, value, min, max },
    );
  }
  return value;
}

export function assertNumber(value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new BoundaryError(
      "NUMBER_OUT_OF_RANGE",
      `${label} must be a finite number within ${min}..${max}`,
      { label, value, min, max },
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

export function assertEnum(value, label, values) {
  if (!values.includes(value)) {
    throw new BoundaryError(
      "INVALID_ENUM",
      `${label} must be one of: ${values.join(", ")}`,
      { label, value, values },
    );
  }
  return value;
}

export class ByteString {
  #bytes;

  constructor(value) {
    this.#bytes = Buffer.from(value);
    Object.freeze(this);
  }

  get length() {
    return this.#bytes.length;
  }

  toBuffer() {
    return Buffer.from(this.#bytes);
  }

  toHex() {
    return this.#bytes.toString("hex");
  }

  equals(other) {
    return other instanceof ByteString && this.#bytes.equals(other.#bytes);
  }
}

export function deepFreeze(value) {
  if (value instanceof ByteString) return value;
  if (ArrayBuffer.isView(value)) {
    throw new TypeError("Mutable ArrayBuffer views must be converted to ByteString before freezing");
  }
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) {
      deepFreeze(item);
    }
  }
  return value;
}

export function stableUtf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function cloneBytes(value) {
  return value instanceof ByteString ? value : new ByteString(value);
}
