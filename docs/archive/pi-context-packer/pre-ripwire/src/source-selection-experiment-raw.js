import { Buffer } from "node:buffer";

import {
  boundedText,
  invariant,
  isDigest,
  sha256Raw,
} from "./source-selection-experiment-utils.js";

const MAX_RAW_EVIDENCE_BYTES = 16 * 1024 * 1024;

export function validateRawText(value, digest, label, { allowEmpty = false } = {}) {
  invariant(
    typeof value === "string" &&
      Buffer.byteLength(value, "utf8") <= MAX_RAW_EVIDENCE_BYTES &&
      (allowEmpty || value.length > 0),
    `${label} must be bounded raw UTF-8 text`,
  );
  invariant(isDigest(digest) && digest === sha256Raw(value), `${label} digest mismatch`);
  return value;
}

export function parseRawJson(value, digest, label) {
  validateRawText(value, digest, label);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError(`${label} must be valid JSON`);
  }
  return parsed;
}

export function decodeBase64Evidence(value, digest, label) {
  invariant(
    boundedText(value, MAX_RAW_EVIDENCE_BYTES * 2) && /^[A-Za-z0-9+/]*={0,2}$/.test(value),
    `${label} must be canonical base64`,
  );
  const bytes = Buffer.from(value, "base64");
  invariant(bytes.toString("base64") === value, `${label} must be canonical base64`);
  invariant(bytes.length <= MAX_RAW_EVIDENCE_BYTES, `${label} exceeds the evidence bound`);
  invariant(isDigest(digest) && digest === sha256Raw(bytes), `${label} digest mismatch`);
  return bytes;
}
