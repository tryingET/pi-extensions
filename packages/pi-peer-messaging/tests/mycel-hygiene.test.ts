// ---
// summary: tests mycel-inspired explicit-path file freshness, hop guards, non-valid reply placeholders, own-key reply contracts, and inform/id ergonomics
// read_when:
//   - changing src/mycel-hygiene.ts, contracts.ts, intercom-peer-format.ts, or intercom-adapter.ts
// ---
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertPeerMessage,
  checkAttachmentFreshness,
  checkHopLimit,
  createStubPeerMessagingRuntime,
  formatReplyContractExample,
  isValidSha256Hex,
  MAX_ALLOWED_HOPS_CEILING,
  pinFileAttachments,
  validateReplyContract,
} from "../index.ts";
import { createIntercomCompatibleAdapter } from "../src/intercom-adapter.ts";
import {
  formatElapsedSeconds,
  formatMessageBody,
  shortSessionId,
} from "../src/intercom-peer-format.ts";

test("pinFileAttachments pins only explicit absolute paths, rejects malformed sha256, and reports honest freshness wording", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-peer-fresh-"));
  try {
    const filePath = path.join(dir, "spec.md");
    writeFileSync(filePath, "v1\n", "utf8");

    // Display name without explicit path MUST NOT be hashed against local cwd (e.g., package.json)
    const unpinned = pinFileAttachments([
      { type: "file", name: "package.json", content: "unrelated\n" },
    ]);
    const firstUnpinned = unpinned?.[0];
    assert.ok(firstUnpinned);
    assert.equal(firstUnpinned.sha256, undefined);
    assert.equal(checkAttachmentFreshness(firstUnpinned), undefined);

    // Malformed sha256 hex returns "not_checked" rather than false "changed"
    assert.equal(isValidSha256Hex("deadbeef"), false);
    assert.equal(
      checkAttachmentFreshness({
        type: "file",
        name: "spec.md",
        path: filePath,
        sha256: "deadbeef",
        content: "v1\n",
      }),
      "not_checked",
    );

    const pinned = pinFileAttachments([
      { type: "file", name: "spec.md", path: filePath, content: "v1\n" },
    ]);
    assert.ok(pinned?.[0]?.sha256);
    assert.equal(isValidSha256Hex(pinned[0].sha256), true);
    assert.equal(checkAttachmentFreshness(pinned[0]), "unchanged");

    const unchangedBody = formatMessageBody({
      id: "m-1",
      timestamp: 1000,
      content: { text: "Check spec", attachments: pinned },
    });
    assert.match(unchangedBody, /\(unchanged on disk since sent\)/);
    assert.doesNotMatch(unchangedBody, /changed\/missing on disk/);

    writeFileSync(filePath, "v2 modified\n", "utf8");
    assert.equal(checkAttachmentFreshness(pinned[0]), "changed");
    const changedBody = formatMessageBody({
      id: "m-2",
      timestamp: 1001,
      content: { text: "Check spec", attachments: pinned },
    });
    assert.match(changedBody, /1\/1 pinned file\(s\) changed\/missing on disk since sent/);
    assert.match(
      changedBody,
      /\(CHANGED on disk since sent — attachment text below is caller-supplied\)/,
    );

    unlinkSync(filePath);
    assert.equal(checkAttachmentFreshness(pinned[0]), "missing");
    const missingBody = formatMessageBody({
      id: "m-3",
      timestamp: 1002,
      content: { text: "Check spec", attachments: pinned },
    });
    assert.match(
      missingBody,
      /\(missing on disk since sent — attachment text below is caller-supplied\)/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hop guard fails closed at maxHops, enforces ceiling, and replies propagate causal hop depth", async () => {
  assert.equal(checkHopLimit(0, 4).ok, true);
  assert.equal(checkHopLimit(3, 4).ok, true);
  assert.equal(checkHopLimit(4, 4).ok, false);
  assert.equal(checkHopLimit(0, MAX_ALLOWED_HOPS_CEILING).ok, true);
  assert.equal(checkHopLimit(50, 1000).ok, false);

  const sentMessages: Array<{ hops?: number; maxHops?: number }> = [];
  const runtime = createStubPeerMessagingRuntime({
    send: async ({ message }) => {
      sentMessages.push({ hops: message.hops, maxHops: message.maxHops });
      return { delivered: true, messageId: message.id };
    },
    ask: async () => ({ id: "r-1", timestamp: 2000, content: { text: "ok" } }),
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
  assert.equal(sentMessages.length, 0);

  // Incoming message with hops=1 -> reply propagates hops=2 and maxHops=3
  adapter.handleIncomingMessage(
    {
      id: "session-12345678-aaaa",
      name: "asker",
      addressLabel: "asker",
      cwd: "/repo",
      model: "test",
      pid: 1,
      startedAt: 100,
      lastActivity: 1000,
    },
    { id: "q-hop", timestamp: 1000, hops: 1, maxHops: 3, content: { text: "ping" } },
  );
  const replyRes = await adapter.execute(runtime, {
    action: "reply",
    replyTo: "q-hop",
    message: "pong",
  });
  assert.equal(replyRes.isError, undefined);
  assert.deepEqual(sentMessages, [{ hops: 2, maxHops: 3 }]);
});

test("reply placeholders are non-valid, own-key JSON preserves raw text, and asker enforces contract", async () => {
  const yesNoPlaceholder = formatReplyContractExample({ type: "yes_no" });
  assert.equal(yesNoPlaceholder, "<yes|no>");
  assert.equal(validateReplyContract({ type: "yes_no" }, yesNoPlaceholder).ok, false);

  const oneOfPlaceholder = formatReplyContractExample({
    type: "one_of",
    values: ["SEEN", "SKIP"],
  });
  assert.equal(oneOfPlaceholder, "<SEEN|SKIP>");
  assert.equal(
    validateReplyContract({ type: "one_of", values: ["SEEN", "SKIP"] }, oneOfPlaceholder).ok,
    false,
  );

  const jsonPlaceholder = formatReplyContractExample({
    type: "json_keys",
    required: ["status", "reason"],
  });
  assert.equal(
    validateReplyContract({ type: "json_keys", required: ["status", "reason"] }, jsonPlaceholder)
      .ok,
    false,
  );

  assert.deepEqual(validateReplyContract({ type: "any" }, "  keep indent\n"), {
    ok: true,
    normalized: "  keep indent\n",
  });
  // Inherited prototype key ("toString") must NOT satisfy json_keys!
  assert.equal(
    validateReplyContract({ type: "json_keys", required: ["toString"] }, '{"ok":true}').ok,
    false,
  );
  assert.equal(
    validateReplyContract({ type: "json_keys", required: ["status"] }, '{"meta":{"status":"ok"}}')
      .ok,
    false,
  );
  const bigIntJson = '{"status":"ok","id":9007199254740993}';
  assert.deepEqual(validateReplyContract({ type: "json_keys", required: ["status"] }, bigIntJson), {
    ok: true,
    normalized: bigIntJson,
  });

  // Asker-side enforcement catches incompatible peer returning prose to a typed ask
  const badPeerRuntime = createStubPeerMessagingRuntime({
    ask: async ({ message }) => ({
      id: "r-bad",
      timestamp: 2000,
      replyTo: message.id,
      content: { text: "maybe" },
    }),
  });
  const adapter = createIntercomCompatibleAdapter({ now: () => 1000 });
  const askRes = await adapter.execute(badPeerRuntime, {
    action: "ask",
    to: "worker",
    message: "Deploy?",
    replyContract: { type: "yes_no" },
  });
  assert.equal(askRes.isError, true);
  assert.match(askRes.content[0]?.text ?? "", /violated replyContract/);
});

test("plain send stays answerable, expectsReply:false informs stay out of pending, and shortSessionId strips nodecode prefix", async () => {
  assert.equal(shortSessionId("session-01a1f2a2-1a67-7251"), "01a1f2a2");
  assert.equal(shortSessionId("session-nodecode-abcd1234"), "abcd1234");
  assert.equal(shortSessionId("worker-abcd1234"), "worker-a");
  assert.equal(formatElapsedSeconds(1000, 46_000), "45s ago");
  assert.equal(formatElapsedSeconds(1000, 121_000), "2m ago");
  assert.equal(formatElapsedSeconds(1000, 90_000_000), "1d ago");

  const outbound: Array<{ expectsReply?: boolean }> = [];
  const runtime = createStubPeerMessagingRuntime({
    send: async ({ message }) => {
      outbound.push({ expectsReply: message.expectsReply });
      return { delivered: true, messageId: message.id };
    },
  });

  const captured: Array<{ replyCommand?: string }> = [];
  const adapter = createIntercomCompatibleAdapter({
    now: () => 1000,
    onIncomingMessage: (entry) => captured.push({ replyCommand: entry.replyCommand }),
  });

  // Plain send MUST NOT force expectsReply: false (keeps send -> reply working)
  const plainSend = await adapter.execute(runtime, {
    action: "send",
    to: "worker",
    message: "Can you check this?",
  });
  assert.equal(plainSend.isError, undefined);
  assert.equal(outbound[0]?.expectsReply, undefined);

  // Explicit expectsReply: false with replyContract is rejected
  const conflictingSend = await adapter.execute(runtime, {
    action: "send",
    to: "worker",
    message: "FYI?",
    expectsReply: false,
    replyContract: { type: "yes_no" },
  });
  assert.equal(conflictingSend.isError, true);

  // Explicit expectsReply: false inform sends cleanly and stays out of pending on receiver
  const informSend = await adapter.execute(runtime, {
    action: "send",
    to: "worker",
    message: "FYI done.",
    expectsReply: false,
  });
  assert.equal(informSend.isError, undefined);
  assert.equal(outbound[1]?.expectsReply, false);

  const inform = {
    id: "inf-1",
    timestamp: 1000,
    expectsReply: false,
    content: { text: "FYI done." },
  };
  assertPeerMessage(inform);
  adapter.handleIncomingMessage(
    {
      id: "session-99998888",
      name: "worker",
      addressLabel: "worker",
      cwd: "/repo",
      model: "test",
      pid: 2,
      startedAt: 100,
      lastActivity: 1000,
    },
    inform,
  );
  assert.equal(captured[0]?.replyCommand, undefined);
  const pending = await adapter.execute(createStubPeerMessagingRuntime(), { action: "pending" });
  assert.match(pending.content[0]?.text ?? "", /No unresolved inbound messages/);
});
