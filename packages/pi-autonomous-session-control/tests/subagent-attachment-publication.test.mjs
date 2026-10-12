import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  publishBootstrapReceipt,
  readAttachmentBootstrap,
} from "../extensions/self/subagent-attachment-bootstrap.ts";
import {
  claimAttachment,
  prepareAttachment,
  readAttachment,
  readAttachmentTicket,
} from "../extensions/self/subagent-attachment-registry.ts";
import { getProcessStartTicks } from "../extensions/self/subagent-session-status.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

const viewer = fileURLToPath(
  new URL("../extensions/self/subagent-attachment-viewer.ts", import.meta.url),
);
function receipt(ticket) {
  return {
    schema: "asc.subagent-attachment.bootstrap.v1",
    key: ticket.key,
    generation: ticket.generation,
    nonce: ticket.nonce,
    viewerPid: process.pid,
    viewerStartedAt: getProcessStartTicks(process.pid),
    argv: ticket.argv,
  };
}
test("bootstrap publication is complete-before-visible and first-writer exclusive during concurrent read", () => {
  const f = fixture();
  try {
    const item = prepareAttachment(f.binding, viewer);
    claimAttachment(item);
    const ticket = readAttachmentTicket(item.ticketPath);
    const path = join(dirname(item.ticketPath), `bootstrap-${ticket.generation}.json`);
    const value = receipt(ticket);
    publishBootstrapReceipt(path, value, () => {
      assert.equal(existsSync(path), false);
      assert.equal(readAttachmentBootstrap(ticket), undefined);
      assert.equal(
        readAttachment(item).status,
        "claimed",
        "partial publication must not appear blocked",
      );
      assert.throws(() => publishBootstrapReceipt(path, { ...value, viewerPid: 99999999 }), {
        code: "EEXIST",
      });
      assert.equal(existsSync(path), false);
    });
    assert.deepEqual(readAttachmentBootstrap(ticket), value);
    const committed = readFileSync(path, "utf8");
    assert.throws(() => publishBootstrapReceipt(path, { ...value, viewerPid: 99999999 }), {
      code: "EEXIST",
    });
    assert.equal(readFileSync(path, "utf8"), committed, "first publication cannot be replaced");
  } finally {
    f.cleanup();
  }
});
test("failure before atomic publication leaves no malformed final receipt or false blocked result", () => {
  const f = fixture();
  try {
    const item = prepareAttachment(f.binding, viewer);
    claimAttachment(item);
    const ticket = readAttachmentTicket(item.ticketPath);
    const path = join(dirname(item.ticketPath), `bootstrap-${ticket.generation}.json`);
    assert.throws(
      () =>
        publishBootstrapReceipt(path, receipt(ticket), () => {
          throw new Error("fixture interrupts before publication");
        }),
      /fixture interrupts/,
    );
    assert.equal(existsSync(path), false);
    assert.equal(readAttachmentBootstrap(ticket), undefined);
    assert.equal(readAttachment(item).status, "claimed");
    assert.equal(
      claimAttachment(item).action,
      "blocked",
      "interrupted publication does not authorize another launch",
    );
  } finally {
    f.cleanup();
  }
});
