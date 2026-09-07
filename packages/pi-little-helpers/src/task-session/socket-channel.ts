import { Socket } from "node:net";
import { encodeFrame, FrameDecoder } from "./channel.js";
import { refuse } from "./json.js";
import { native } from "./native.js";
export interface PrivateChannel {
  receive(deadline: number): Promise<unknown>;
  send(value: unknown, deadline: number): Promise<void>;
  finish(): void;
}
/** Called only after native adoption. There is no caller-selected descriptor. */
export function openAdoptedChannel(): PrivateChannel {
  const socket = new Socket({ fd: native().detachChannel(), readable: true, writable: true }),
    decoder = new FrameDecoder();
  const queue: unknown[] = [];
  let error: Error | undefined,
    wake: (() => void) | undefined,
    receiving = false;
  const fail = (reason: string) => {
    error ??= new Error(reason);
    wake?.();
  };
  socket.on("data", (chunk) => {
    try {
      queue.push(...decoder.push(chunk));
      if (queue.length > 4) refuse("protocol_queue_limit");
      wake?.();
    } catch {
      fail("protocol_framing_invalid");
      socket.destroy();
    }
  });
  socket.on("error", () => fail("supervisor_lost"));
  socket.on("end", () => {
    try {
      decoder.end();
      fail("supervisor_lost");
    } catch {
      fail("truncated_frame");
    }
  });
  return {
    async receive(deadline) {
      if (receiving) refuse("parallel_protocol_read");
      receiving = true;
      const timer = setTimeout(() => fail("startup_timeout"), Math.max(0, deadline - Date.now()));
      try {
        for (;;) {
          if (Date.now() >= deadline) refuse("startup_timeout");
          if (error && error.message !== "supervisor_lost") throw error;
          if (queue.length) return queue.shift();
          if (error) throw error;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        clearTimeout(timer);
        wake = undefined;
        receiving = false;
      }
    },
    async send(value, deadline) {
      if (error) throw error;
      if (Date.now() >= deadline) refuse("startup_timeout");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("startup_timeout")),
          Math.max(0, deadline - Date.now()),
        );
        socket.write(encodeFrame(value), (e) => {
          clearTimeout(timer);
          e ? reject(new Error("supervisor_lost")) : resolve();
        });
      });
    },
    finish() {
      if (queue.length) refuse("unsolicited_protocol_frame");
      socket.destroy();
    },
  };
}
