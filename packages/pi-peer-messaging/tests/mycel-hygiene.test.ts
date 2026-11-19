// ---
// summary: tests mycel-inspired file freshness pinning, hop guards, and replier-side reply contracts
// read_when:
//   - changing src/mycel-hygiene.ts, contracts.ts, or intercom-adapter.ts reply validation
// ---
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertPeerMessage,
  checkAttachmentFreshness,
  checkHopLimit,
  createStubPeerMessagingRuntime,
  pinFileAttachments,
  validateReplyContract,
} from "../index.ts";
import { createIntercomCompatibleAdapter } from "../src/intercom-adapter.ts";
import { formatMessageBody } from "../src/intercom-peer-format.ts";

test("pinFileAttachments stamps sha256 and detects unchanged, changed, and gone files", () => {
  const scratchRoot = "/data/ai-society-scratch";
  const dir = mkdtempSync(path.join(scratchRoot, "pi-peer-fresh-"));
  try {
    const filePath = path.join(dir, "spec.md");
    writeFileSync(filePath, "v1\n", "utf8");

    const pinned = pinFileAttachments([
      { type: "file", name: "spec.md", path: filePath, content: "v1\n" },
    ]);
    assert.ok(pinned?.[0]?.sha256);
    assert.equal(checkAttachmentFreshness(pinned[0]), "unchanged");

    const unchangedBody = formatMessageBody({
      id: "m-1",
      timestamp: 1000,
      content: { text: "Check spec", attachments: pinned },
    });
    assert.match(unchangedBody, /\(unchanged since sent\)/);

    writeFileSync(filePath, "v2 modified\n", "utf8");
    assert.equal(checkAttachmentFreshness(pinned[0]), "changed");
    const changedBody = formatMessageBody({
      id: "m-2",
      timestamp: 1001,
      content: { text: "Check spec", attachments: pinned },
    });
    assert.match(changedBody, /\(CHANGED since sent\)/);

    unlinkSync(filePath);
    assert.equal(checkAttachmentFreshness(pinned[0]), "gone");
    const goneBody = formatMessageBody({
      id: "m-3",
      timestamp: 1002,
      content: { text: "Check spec", attachments: pinned },
    });
    assert.match(goneBody, /\(gone since sent\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hop guard fails closed at maxHops in send and ask without touching runtime", async () => {
  assert.equal(checkHopLimit(0, 4).ok, true);
  assert.equal(checkHopLimit(3, 4).ok, true);
  assert.equal(checkHopLimit(4, 4).ok, false);

  let sendCalls = 0;
  let askCalls = 0;
  const runtime = createStubPeerMessagingRuntime({
    send: async () => {
      sendCalls += 1;
      return { delivered: true, messageId: "m-1" };
    },
    ask: async () => {
      askCalls += 1;
      return { id: "r-1", timestamp: 2000, content: { text: "ok" } };
    },
  });
  const adapter = createIntercomCompatibleAdapter({ now: () => 1000 });

  const sendRes = await adapter.execute(runtime, {
    action: "send",
    to: "worker",
    message: "looping relay",
    hops: 4,
    maxHops: 4,
  });
  assert.equal(sendRes.isError, true);
  assert.match(sendRes.content[0]?.text ?? "", /Hop limit reached/);
  assert.equal(sendCalls, 0);

  const askRes = await adapter.execute(runtime, {
    action: "ask",
    to: "worker",
    message: "looping ask",
    hops: 5,
  });
  assert.equal(askRes.isError, true);
  assert.match(askRes.content[0]?.text ?? "", /Hop limit reached/);
  assert.equal(askCalls, 0);
});

test("replier-side replyContract validates replies before sending and normalizes valid answers", async () => {
  assert.deepEqual(validateReplyContract({ type: "yes_no" }, "Yes"), {
    ok: true,
    normalized: "yes",
  });
  assert.equal(validateReplyContract({ type: "yes_no" }, "maybe").ok, false);
  assert.deepEqual(validateReplyContract({ type: "one_of", values: ["go", "hold"] }, "GO"), {
    ok: true,
    normalized: "go",
  });
  assert.equal(
    validateReplyContract(
      { type: "json_keys", required: ["decision", "reason"] },
      '{"decision":"ok"}',
    ).ok,
    false,
  );
  assert.equal(
    validateReplyContract(
      { type: "json_keys", required: ["decision", "reason"] },
      '{"decision":"ok","reason":"tested"}',
    ).ok,
    true,
  );

  const sentTexts: string[] = [];
  const runtime = createStubPeerMessagingRuntime({
    send: async ({ message }) => {
      sentTexts.push(message.content.text);
      return { delivered: true, messageId: message.id };
    },
  });
  const adapter = createIntercomCompatibleAdapter({ now: () => 1000 });
  const from = {
    id: "session-asker",
    name: "asker",
    addressLabel: "asker",
    cwd: "/tmp/repo",
    model: "test",
    pid: 123,
    startedAt: 900,
    lastActivity: 1000,
  };
  const inbound = {
    id: "q-1",
    timestamp: 1000,
    replyContract: { type: "yes_no" as const },
    content: { text: "Proceed with deploy?" },
  };
  assertPeerMessage(inbound);
  adapter.handleIncomingMessage(from, inbound);

  const badReply = await adapter.execute(runtime, {
    action: "reply",
    replyTo: "q-1",
    message: "maybe later",
  });
  assert.equal(badReply.isError, true);
  assert.match(badReply.content[0]?.text ?? "", /Reply refused before sending/);
  assert.equal(sentTexts.length, 0);

  const goodReply = await adapter.execute(runtime, {
    action: "reply",
    replyTo: "q-1",
    message: "YES",
  });
  assert.equal(goodReply.isError, undefined);
  assert.deepEqual(sentTexts, ["yes"]);
});
