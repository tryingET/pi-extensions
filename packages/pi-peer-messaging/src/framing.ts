/**
summary: "Writes and incrementally decodes four-byte length-prefixed JSON frames for the local peer socket."
read_when:
  - "Changing peer socket framing, partial-frame buffering, JSON parsing, or frame handler errors."
*/
import type { Socket } from "node:net";

export function writeFramedMessage(socket: Socket, message: unknown): void {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  socket.write(Buffer.concat([header, payload]));
}

export function createFramedMessageReader(
  onMessage: (message: unknown) => void,
  onError: (error: Error) => void,
): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);

  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const messageLength = buffer.readUInt32BE(0);
      if (buffer.length < 4 + messageLength) {
        break;
      }

      const payload = buffer.subarray(4, 4 + messageLength);
      buffer = buffer.subarray(4 + messageLength);

      let message: unknown;
      try {
        message = JSON.parse(payload.toString("utf8"));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        onError(new Error(`Failed to parse peer-messaging frame: ${reason}`, { cause: error }));
        return;
      }

      try {
        onMessage(message);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        onError(new Error(`Failed to handle peer-messaging frame: ${reason}`, { cause: error }));
        return;
      }
    }
  };
}
