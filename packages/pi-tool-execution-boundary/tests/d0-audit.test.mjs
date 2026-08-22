import test from "node:test";
import assert from "node:assert/strict";
import { BoundedD0AuditQueue, sanitizeAuditEvent } from "../src/d0-audit.js";

test("D0 audit is bounded, content-minimized, and drop-accounted", () => {
  const queue = new BoundedD0AuditQueue({ maxEvents: 100 });
  for (let index = 0; index < 110; index += 1) {
    queue.record({ operation: "read", result: "success", durationMs: index, requestBytes: index, responseBytes: index * 2, path: "/secret", output: "secret" });
  }
  const status = queue.snapshot();
  assert.equal(status.queued, 100);
  assert.equal(status.dropped, 10);
  const events = queue.drain();
  assert.equal(events.length, 100);
  assert.equal("path" in events[0], false);
  assert.equal("output" in events[0], false);
});

test("sanitizer buckets values", () => {
  const event = sanitizeAuditEvent({ operation: "grep", result: "ok", durationMs: 21, requestBytes: 3, responseBytes: 513 });
  assert.equal(event.durationBucketMs, 25);
  assert.equal(event.requestBytesBucket, 4);
  assert.equal(event.responseBytesBucket, 1024);
});
