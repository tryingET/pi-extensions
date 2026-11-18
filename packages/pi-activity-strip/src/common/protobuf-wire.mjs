// ---
// summary: "reads protobuf wire format without a schema, for harness records stored as opaque protobuf blobs"
// read_when:
//   - "changing how an adapter reads a field out of a protobuf blob it does not own"
// ---

/**
 * The harness that writes these blobs owns their schema and ships no descriptor we can load, so a
 * reader here only walks the wire format: tag, wire type, value. Every malformed or truncated input
 * yields an empty result instead of an error, because the bytes come from another program's store.
 */

const MAX_DEPTH = 8;
const decoder = new TextDecoder("utf-8", { fatal: false });

/** @param {Uint8Array} bytes @param {number} offset @returns {[number, number] | null} */
function readVarint(bytes, offset) {
  let value = 0;
  let scale = 1;
  for (let index = offset; index < bytes.length && index < offset + 10; index += 1) {
    const byte = bytes[index] ?? 0;
    value += (byte & 0x7f) * scale;
    if (byte < 0x80) return [value, index + 1];
    scale *= 128;
  }
  return null;
}

/**
 * @typedef {{field: number; wire: number; value: number | Uint8Array}} ProtoField
 */

/**
 * One level of fields, or null when the bytes are not a well-formed message. Varints above 2^53 lose
 * precision; nothing read here is that large except ids, which are never read as numbers.
 * @param {Uint8Array | null | undefined} bytes
 * @returns {ProtoField[] | null}
 */
export function protoFields(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  /** @type {ProtoField[]} */
  const fields = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    if (!tag) return null;
    const [key, next] = tag;
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (field <= 0) return null;
    offset = next;
    if (wire === 0) {
      const value = readVarint(bytes, offset);
      if (!value) return null;
      fields.push({ field, wire, value: value[0] });
      offset = value[1];
    } else if (wire === 1 || wire === 5) {
      const size = wire === 1 ? 8 : 4;
      if (offset + size > bytes.length) return null;
      fields.push({ field, wire, value: bytes.subarray(offset, offset + size) });
      offset += size;
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      if (!length) return null;
      const end = length[1] + length[0];
      if (end > bytes.length) return null;
      fields.push({ field, wire, value: bytes.subarray(length[1], end) });
      offset = end;
    } else {
      return null;
    }
  }
  return fields;
}

/**
 * Every value found at a field path such as [20, 7, 2]; length-delimited values along the way are
 * read as nested messages.
 * @param {Uint8Array | null | undefined} bytes
 * @param {readonly number[]} path
 * @returns {Array<number | Uint8Array>}
 */
export function protoValues(bytes, path) {
  if (path.length === 0 || path.length > MAX_DEPTH) return [];
  const fields = protoFields(bytes);
  if (!fields) return [];
  const [head, ...rest] = path;
  const matches = fields.filter((entry) => entry.field === head);
  if (rest.length === 0) return matches.map((entry) => entry.value);
  return matches.flatMap((entry) =>
    entry.value instanceof Uint8Array ? protoValues(entry.value, rest) : [],
  );
}

/** @param {Uint8Array | null | undefined} bytes @param {readonly number[]} path */
export function protoString(bytes, path) {
  // Protobuf: the last occurrence of a singular field wins.
  const value = protoValues(bytes, path)
    .filter((entry) => entry instanceof Uint8Array)
    .at(-1);
  return value instanceof Uint8Array ? decoder.decode(value) : "";
}

/** @param {Uint8Array | null | undefined} bytes @param {readonly number[]} path */
export function protoNumber(bytes, path) {
  const value = protoValues(bytes, path)
    .filter((entry) => typeof entry === "number")
    .at(-1);
  return typeof value === "number" ? value : 0;
}

/**
 * Milliseconds of every google.protobuf.Timestamp (seconds = 1, nanos = 2) at a path.
 * @param {Uint8Array | null | undefined} bytes
 * @param {readonly number[]} path
 */
export function protoTimestampsMs(bytes, path) {
  return protoValues(bytes, path)
    .filter((entry) => entry instanceof Uint8Array)
    .map((entry) => {
      const seconds = protoNumber(/** @type {Uint8Array} */ (entry), [1]);
      const nanos = protoNumber(/** @type {Uint8Array} */ (entry), [2]);
      return seconds > 0 ? seconds * 1000 + Math.floor(nanos / 1e6) : 0;
    })
    .filter((value) => value > 0);
}
