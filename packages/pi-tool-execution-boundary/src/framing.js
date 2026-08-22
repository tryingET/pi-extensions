import { BoundaryError } from "./errors.js";

export const DEFAULT_MAX_FRAME_BYTES = 4 * 1024 * 1024;

export function encodeLengthPrefixedFrame(payload, { maxFrameBytes = DEFAULT_MAX_FRAME_BYTES } = {}) {
  const bytes = Buffer.from(payload);
  if (bytes.length === 0 || bytes.length > maxFrameBytes) {
    throw new BoundaryError(
      "FRAME_SIZE_INVALID",
      `Frame payload must be within 1..${maxFrameBytes} bytes`,
      { length: bytes.length },
    );
  }
  const frame = Buffer.allocUnsafe(4 + bytes.length);
  frame.writeUInt32BE(bytes.length, 0);
  bytes.copy(frame, 4);
  return frame;
}

export class LengthPrefixedFrameDecoder {
  #buffer = Buffer.alloc(0);
  #maxFrameBytes;
  #maxBufferedBytes;

  constructor({
    maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
    maxBufferedBytes = maxFrameBytes * 2 + 4,
  } = {}) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
      throw new BoundaryError("INVALID_FRAME_LIMIT", "maxFrameBytes must be positive");
    }
    if (!Number.isSafeInteger(maxBufferedBytes) || maxBufferedBytes < maxFrameBytes + 4) {
      throw new BoundaryError(
        "INVALID_BUFFER_LIMIT",
        "maxBufferedBytes must fit one maximum frame and header",
      );
    }
    this.#maxFrameBytes = maxFrameBytes;
    this.#maxBufferedBytes = maxBufferedBytes;
  }

  push(chunk) {
    const bytes = Buffer.from(chunk);
    if (bytes.length === 0) return [];
    if (this.#buffer.length + bytes.length > this.#maxBufferedBytes) {
      this.#buffer = Buffer.alloc(0);
      throw new BoundaryError(
        "FRAME_BUFFER_OVERFLOW",
        `Buffered protocol data exceeds ${this.#maxBufferedBytes} bytes`,
      );
    }
    this.#buffer = Buffer.concat([this.#buffer, bytes]);
    const frames = [];
    while (this.#buffer.length >= 4) {
      const length = this.#buffer.readUInt32BE(0);
      if (length === 0 || length > this.#maxFrameBytes) {
        this.#buffer = Buffer.alloc(0);
        throw new BoundaryError(
          "FRAME_SIZE_INVALID",
          `Declared frame length ${length} is outside 1..${this.#maxFrameBytes}`,
        );
      }
      if (this.#buffer.length < 4 + length) break;
      frames.push(Buffer.from(this.#buffer.subarray(4, 4 + length)));
      this.#buffer = Buffer.from(this.#buffer.subarray(4 + length));
    }
    return frames;
  }

  end() {
    if (this.#buffer.length !== 0) {
      const trailing = this.#buffer.length;
      this.#buffer = Buffer.alloc(0);
      throw new BoundaryError(
        "TRUNCATED_FRAME",
        `Protocol stream ended with ${trailing} trailing bytes`,
      );
    }
  }

  get bufferedBytes() {
    return this.#buffer.length;
  }
}
