import { BoundaryError } from "./errors.js";

export class BoundedD0AuditQueue {
  #queue = [];
  #dropped = 0;
  #accepted = 0;
  #maxEvents;

  constructor({ maxEvents = 10_000 } = {}) {
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 100 || maxEvents > 1_000_000) {
      throw new BoundaryError("INVALID_AUDIT_CAPACITY", "maxEvents must be within 100..1000000");
    }
    this.#maxEvents = maxEvents;
  }

  record(event) {
    const safe = sanitizeAuditEvent(event);
    this.#accepted += 1;
    if (this.#queue.length >= this.#maxEvents) {
      this.#queue.shift();
      this.#dropped += 1;
    }
    this.#queue.push(safe);
  }

  drain(max = this.#queue.length) {
    if (!Number.isSafeInteger(max) || max < 0) {
      throw new BoundaryError("INVALID_DRAIN_COUNT", "Audit drain count must be a non-negative integer");
    }
    return this.#queue.splice(0, max);
  }

  snapshot() {
    return Object.freeze({
      queued: this.#queue.length,
      capacity: this.#maxEvents,
      accepted: this.#accepted,
      dropped: this.#dropped,
    });
  }
}

function bucketBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  let bucket = 1;
  while (bucket < value && bucket < 1_073_741_824) bucket *= 2;
  return bucket;
}

function bucketDuration(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const buckets = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000];
  return buckets.find((bucket) => value <= bucket) ?? 300_000;
}

export function sanitizeAuditEvent(event) {
  if (!event || typeof event !== "object") {
    throw new BoundaryError("INVALID_AUDIT_EVENT", "Audit event must be an object");
  }
  return Object.freeze({
    schema: "pi-tool-boundary-d0-audit/v1",
    operation: String(event.operation ?? "unknown"),
    result: String(event.result ?? "unknown"),
    durationBucketMs: bucketDuration(Number(event.durationMs ?? 0)),
    requestBytesBucket: bucketBytes(Number(event.requestBytes ?? 0)),
    responseBytesBucket: bucketBytes(Number(event.responseBytes ?? 0)),
  });
}
