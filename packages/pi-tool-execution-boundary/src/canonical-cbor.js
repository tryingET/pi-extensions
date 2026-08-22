import { createHash } from "node:crypto";
import { BoundaryError } from "./errors.js";
import { ByteString, isPlainObject } from "./util.js";

function concat(parts) {
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}

function encodeUnsignedHeader(major, rawValue) {
  const value = typeof rawValue === "bigint" ? rawValue : BigInt(rawValue);
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new BoundaryError("CBOR_INTEGER_RANGE", "CBOR integer is outside uint64 range");
  }
  if (value < 24n) return Buffer.from([(major << 5) | Number(value)]);
  if (value <= 0xffn) return Buffer.from([(major << 5) | 24, Number(value)]);
  if (value <= 0xffffn) {
    const out = Buffer.allocUnsafe(3);
    out[0] = (major << 5) | 25;
    out.writeUInt16BE(Number(value), 1);
    return out;
  }
  if (value <= 0xffff_ffffn) {
    const out = Buffer.allocUnsafe(5);
    out[0] = (major << 5) | 26;
    out.writeUInt32BE(Number(value), 1);
    return out;
  }
  const out = Buffer.allocUnsafe(9);
  out[0] = (major << 5) | 27;
  out.writeBigUInt64BE(value, 1);
  return out;
}

function compareEncodedMapKeys(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  return Buffer.compare(left, right);
}

function encodeInteger(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new BoundaryError("CBOR_INTEGER_REQUIRED", "CBOR numbers must be safe integers");
    }
    value = BigInt(value);
  }
  if (typeof value !== "bigint") {
    throw new BoundaryError("CBOR_INTEGER_REQUIRED", "CBOR integer must be number or bigint");
  }
  return value >= 0n
    ? encodeUnsignedHeader(0, value)
    : encodeUnsignedHeader(1, -1n - value);
}

function encodeValue(value, seen) {
  if (value === null) return Buffer.from([0xf6]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);
  if (typeof value === "number" || typeof value === "bigint") return encodeInteger(value);

  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return concat([encodeUnsignedHeader(3, bytes.length), bytes]);
  }

  if (value instanceof ByteString || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = value instanceof ByteString ? value.toBuffer() : Buffer.from(value);
    return concat([encodeUnsignedHeader(2, bytes.length), bytes]);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new BoundaryError("CBOR_CYCLE", "CBOR value contains a cycle");
    seen.add(value);
    const encoded = concat([
      encodeUnsignedHeader(4, value.length),
      ...value.map((item) => encodeValue(item, seen)),
    ]);
    seen.delete(value);
    return encoded;
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) throw new BoundaryError("CBOR_CYCLE", "CBOR value contains a cycle");
    seen.add(value);
    const entries = Object.entries(value).map(([key, entry]) => {
      if (!/^(0|[1-9][0-9]*)$/.test(key)) {
        throw new BoundaryError(
          "CBOR_MAP_KEY",
          "Canonical semantic maps require unsigned-integer string keys",
          { key },
        );
      }
      const numericKey = BigInt(key);
      const encodedKey = encodeInteger(numericKey);
      return { encodedKey, encodedValue: encodeValue(entry, seen) };
    });
    entries.sort((left, right) => compareEncodedMapKeys(left.encodedKey, right.encodedKey));
    const encoded = concat([
      encodeUnsignedHeader(5, entries.length),
      ...entries.flatMap(({ encodedKey, encodedValue }) => [encodedKey, encodedValue]),
    ]);
    seen.delete(value);
    return encoded;
  }

  throw new BoundaryError(
    "CBOR_UNSUPPORTED_TYPE",
    `Unsupported semantic CBOR type: ${typeof value}`,
  );
}

export function encodeDeterministicCbor(value) {
  return encodeValue(value, new Set());
}

export function domainSeparatedDigest(domain, semanticBody) {
  if (typeof domain !== "string" || domain.length === 0 || domain.includes("\0")) {
    throw new BoundaryError(
      "INVALID_DIGEST_DOMAIN",
      "Digest domain must be a non-empty string without NUL",
    );
  }
  return createHash("sha256")
    .update(Buffer.from(`${domain}\0`, "utf8"))
    .update(encodeDeterministicCbor(semanticBody))
    .digest("hex");
}
