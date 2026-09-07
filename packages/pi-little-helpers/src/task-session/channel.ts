import { readSync, writeSync } from "node:fs";
import { join } from "node:path";
import { canonical, digest, parseJson, refuse } from "./json.js";
import { native } from "./native.js";
import { durableWrite } from "./state.js";
export interface WireMessage {
  protocol: string;
  kind: string;
  binding: Record<string, string>;
  // biome-ignore lint/suspicious/noExplicitAny: each phase is validated against the AK producer schema before use.
  body: Record<string, any>;
}
export function encodeFrame(value: unknown): Buffer {
  const body = Buffer.from(canonical(value));
  if (body.length > 1048576) refuse("frame_too_large");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(body.length);
  return Buffer.concat([prefix, body]);
}
/** Incremental decoder retains no CLOSED across channel instances; maximum one bounded frame buffer. */
export class FrameDecoder {
  #bytes = Buffer.alloc(0);
  push(chunk: Uint8Array): unknown[] {
    if (this.#bytes.length + chunk.length > 1048580) refuse("frame_too_large");
    this.#bytes = Buffer.concat([this.#bytes, chunk]);
    const out: unknown[] = [];
    while (this.#bytes.length >= 4) {
      const length = this.#bytes.readUInt32BE(0);
      if (length < 1 || length > 1048576) refuse("frame_too_large");
      if (this.#bytes.length < length + 4) break;
      out.push(parseJson(this.#bytes.subarray(4, 4 + length)));
      this.#bytes = this.#bytes.subarray(4 + length);
    }
    return out;
  }
  end(): void {
    if (this.#bytes.length) refuse("truncated_frame");
  }
}
/** The channel driver never invents a CLOSED or unlocks AK. Loss leaves inherited custody alive. */
export class AdmissionChannel {
  #phase = "prepared";
  #admission: WireMessage | undefined;
  #t1: WireMessage | undefined;
  #denied = false;
  #closedVerified = false;
  get closedVerified() {
    return this.#closedVerified;
  }
  constructor(
    private readonly prepared: WireMessage,
    private readonly interpret: (value: unknown) => WireMessage,
  ) {
    this.prepared = interpret(structuredClone(prepared));
    if (prepared.kind !== "PREPARED") refuse("invalid_prepared");
  }
  admission(value: unknown): WireMessage {
    const message = this.decode(value);
    if (
      this.#phase !== "prepared" ||
      message.kind !== "ADMISSION_RESULT" ||
      digest(message.binding) !== digest(this.prepared.binding)
    )
      return this.fail("admission_binding_or_phase");
    this.#admission = message;
    const b = message.body,
      p = this.prepared.body;
    const admitted =
      b.outcome === "ADMITTED" &&
      b.effects === "committed_verified" &&
      b.readback_digest &&
      b.claim &&
      b.accounting &&
      b.accounting.task_version_after === b.claim.version &&
      b.accounting.task_version_before + 1 === b.accounting.task_version_after &&
      b.accounting.restored_evidence_attachments_preserved === true &&
      b.accounting.governance_receipt_ids.length >= 1 &&
      b.accounting.event_ids.length >= 1 &&
      b.claim.task_id === p.task_id &&
      b.claim.repo === p.repo &&
      b.claim.claimed_by === p.actor &&
      b.baseline_digest === p.baseline_digest &&
      Date.now() < p.startup_deadline_ms &&
      Date.parse(b.claim.lease_expires_at) > Date.now();
    this.#denied = !admitted;
    this.#t1 = {
      protocol: message.protocol,
      kind: "T1_PUBLISHED",
      binding: structuredClone(message.binding),
      body: {
        outcome: admitted ? "ADMITTED" : "DENIED",
        admission_digest: digest(message),
        no_dispatch: true,
      },
    };
    this.#phase = "admission";
    return structuredClone(this.#t1);
  }
  publish(attemptDirectory: string): WireMessage {
    if (this.#phase !== "admission" || !this.#t1) return this.fail("invalid_t1_phase");
    try {
      durableWrite(join(attemptDirectory, "t1.json"), this.#t1, true);
    } catch {
      return this.fail("t1_persistence_failed");
    }
    this.#phase = "t1";
    return structuredClone(this.#t1);
  }
  closed(value: unknown): number {
    const m = this.decode(value);
    if (
      this.#phase !== "t1" ||
      m.kind !== "CLOSED" ||
      digest(m.binding) !== digest(this.prepared.binding) ||
      m.body.t1_digest !== digest(this.#t1) ||
      m.body.outcome !== this.#t1?.body.outcome
    )
      return this.fail("closed_binding_or_phase");
    this.#phase = "consumed";
    this.#closedVerified = true;
    if (
      this.#denied ||
      m.body.outcome !== "ADMITTED" ||
      Date.now() >= this.prepared.body.startup_deadline_ms
    )
      return this.fail("closed_denied_or_expired");
    const lease = Date.parse(this.#admission?.body.claim.lease_expires_at);
    if (!Number.isFinite(lease) || lease <= Date.now()) return this.fail("lease_expired");
    return lease;
  }
  lost(): void {
    this.#denied = true;
    this.#phase = "lost";
  }
  private decode(value: unknown): WireMessage {
    try {
      return this.interpret(value);
    } catch {
      return this.fail("protocol_shape_denied");
    }
  }
  private fail(code: string): never {
    this.lost();
    return refuse(code);
  }
}
export function adoptPrivateChannel() {
  native().adoptCustody(); // MUST be first operation in fixed host executable, before SDK imports.
  const decoder = new FrameDecoder();
  return Object.freeze({
    receive(): unknown {
      // Fixed stdio descriptors selected by AK producer. No caller FD argument.
      for (;;) {
        const byte = Buffer.alloc(1);
        const n = readSync(0, byte);
        if (!n) {
          decoder.end();
          refuse("supervisor_lost");
        }
        const frames = decoder.push(byte);
        if (frames.length) return frames[0];
      }
    },
    send(value: unknown): void {
      const bytes = encodeFrame(value);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(0, bytes, offset);
    },
    closeCustodyAfterClosed(): void {
      native().closeCustody();
    },
  });
}
