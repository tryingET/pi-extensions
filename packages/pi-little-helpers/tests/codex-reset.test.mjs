// summary: verifies codex reset parsing, authenticated api calls, confirmations, and idempotent retry behavior.
// read_when:
//   - changing codex reset credit status, redemption requests, cancellation, or ambiguous failure recovery.
import assert from "node:assert/strict";
import test from "node:test";

import { createCodexResetExtension } from "../extensions/codex-reset.ts";
import {
  CodexResetApiError,
  codexResetConsumeUrl,
  codexResetCreditsUrl,
  consumeCodexResetCredit,
  fetchCodexResetCredits,
  formatCodexResetCredits,
  parseCodexResetCredits,
  parseCodexResetResult,
} from "../lib/codex-reset.ts";

function fakeJwt(accountId) {
  return [
    "header",
    Buffer.from(
      JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
    ).toString("base64url"),
    "signature",
  ].join(".");
}

function createApiContext(accountId = "acct_reset") {
  return {
    model: { provider: "openai-codex", headers: {} },
    modelRegistry: {
      async getApiKeyAndHeaders() {
        return { ok: true, apiKey: fakeJwt(accountId), headers: {} };
      },
    },
  };
}

function registerExtension(extension) {
  const commands = new Map();
  const handlers = new Map();
  const entries = [];
  extension({
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    appendEntry(customType, data) {
      entries.push({ type: "custom", customType, data });
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
  });
  return { commands, entries, handlers };
}

function createCommandContext({ confirms = [] } = {}) {
  const notifications = [];
  const statuses = [];
  const confirmationCalls = [];
  return {
    notifications,
    statuses,
    confirmationCalls,
    ctx: {
      hasUI: true,
      ui: {
        notify(message, type = "info") {
          notifications.push({ message, type });
        },
        setStatus(key, value) {
          statuses.push({ key, value });
        },
        async confirm(title, message) {
          confirmationCalls.push({ title, message });
          return confirms.shift() ?? false;
        },
      },
    },
  };
}

test("reset payload parsers remain defensive", () => {
  assert.deepEqual(
    parseCodexResetCredits({
      available_count: "2",
      credits: [{ id: "credit-1", status: "available", expires_at: "2026-07-12T00:00:00Z" }, null],
    }),
    {
      availableCount: 2,
      credits: [
        {
          id: "credit-1",
          status: "available",
          expiresAt: "2026-07-12T00:00:00Z",
        },
      ],
    },
  );
  assert.equal(parseCodexResetCredits({ available_count: "nope" }), undefined);
  assert.deepEqual(parseCodexResetResult({ code: "reset", windows_reset: "2" }), {
    outcome: "reset",
    windowsReset: 2,
  });
  assert.deepEqual(parseCodexResetResult({ code: "new_server_code" }), { outcome: "unknown" });
});

test("reset status lists every available credit and its expiry", () => {
  const now = Date.parse("2026-07-11T00:00:00Z");
  assert.equal(
    formatCodexResetCredits(
      {
        availableCount: 3,
        credits: [
          { status: "redeemed", expiresAt: "2026-07-11T00:30:00Z" },
          { status: "available" },
          { status: "available", expiresAt: "2026-07-12T00:00:00Z" },
          { status: "available", expiresAt: "2026-07-11T02:00:00Z" },
        ],
      },
      now,
    ),
    [
      "Codex banked resets: 3",
      "1. expires in ~2h — 2026-07-11 02:00:00 UTC",
      "2. expires in ~1d — 2026-07-12 00:00:00 UTC",
      "3. expiry unknown",
    ].join("\n"),
  );
});

test("Codex reset API uses the active model auth and an idempotent request body", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === codexResetCreditsUrl()) {
      return new Response(JSON.stringify({ available_count: 1, credits: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: "reset", windows_reset: 2 }), { status: 200 });
  };
  const ctx = createApiContext("acct_headers");
  ctx.signal = new AbortController().signal;

  assert.deepEqual(await fetchCodexResetCredits(ctx, fetchImpl), {
    availableCount: 1,
    credits: [],
  });
  assert.deepEqual(await consumeCodexResetCredit(ctx, "stable-request-id", fetchImpl), {
    outcome: "reset",
    windowsReset: 2,
  });

  assert.deepEqual(
    calls.map((call) => call.url),
    [codexResetCreditsUrl(), codexResetConsumeUrl()],
  );
  assert.equal(calls[0].init.headers.get("chatgpt-account-id"), "acct_headers");
  assert.equal(calls[0].init.signal, ctx.signal);
  assert.equal(calls[1].init.headers.get("authorization")?.startsWith("Bearer "), true);
  assert.equal(calls[1].init.signal, ctx.signal);
  assert.deepEqual(JSON.parse(calls[1].init.body), { redeem_request_id: "stable-request-id" });
});

test("/codex-reset requires explicit confirmation before spending a credit", async () => {
  let consumeCalls = 0;
  const { commands } = registerExtension(
    createCodexResetExtension({
      async fetchCredits() {
        return { availableCount: 2, credits: [] };
      },
      async consumeCredit() {
        consumeCalls += 1;
        return { outcome: "reset", windowsReset: 2 };
      },
      createRequestId: () => "request-1",
    }),
  );
  const harness = createCommandContext({ confirms: [false] });

  await commands.get("codex-reset").handler("use", harness.ctx);

  assert.equal(consumeCalls, 0);
  assert.match(harness.confirmationCalls[0].message, /Spend one credit/);
  assert.match(harness.notifications.at(-1).message, /cancelled; no credit was spent/);
});

test("ambiguous failures retry with the same request id and then refresh", async () => {
  const requestIds = [];
  let fetchCount = 0;
  const { commands } = registerExtension(
    createCodexResetExtension({
      async fetchCredits() {
        fetchCount += 1;
        return { availableCount: fetchCount === 1 ? 1 : 0, credits: [] };
      },
      async consumeCredit(_ctx, requestId) {
        requestIds.push(requestId);
        if (requestIds.length === 1) throw new Error("connection dropped");
        return { outcome: "already_redeemed" };
      },
      createRequestId: () => "stable-redeem-id",
    }),
  );
  const harness = createCommandContext({ confirms: [true, true] });

  await commands.get("codex-reset").handler("", harness.ctx);

  assert.deepEqual(requestIds, ["stable-redeem-id", "stable-redeem-id"]);
  assert.equal(fetchCount, 2);
  assert.match(harness.notifications.at(-1).message, /already applied/);
  assert.match(harness.notifications.at(-1).message, /banked resets: 0/);
});

test("a declined ambiguous retry is reused by the next command", async () => {
  const requestIds = [];
  const { commands } = registerExtension(
    createCodexResetExtension({
      async fetchCredits() {
        return { availableCount: 1, credits: [] };
      },
      async consumeCredit(_ctx, requestId) {
        requestIds.push(requestId);
        if (requestIds.length === 1) throw new Error("connection dropped");
        return { outcome: "already_redeemed" };
      },
      createRequestId: () => "unresolved-request-id",
    }),
  );

  const first = createCommandContext({ confirms: [true, false] });
  await commands.get("codex-reset").handler("use", first.ctx);
  assert.match(first.notifications.at(-1).message, /remains unresolved/);

  const second = createCommandContext({ confirms: [true] });
  await commands.get("codex-reset").handler("use", second.ctx);
  assert.deepEqual(requestIds, ["unresolved-request-id", "unresolved-request-id"]);
  assert.equal(second.confirmationCalls[0].title, "Retry unresolved Codex reset?");
});

test("an unresolved request survives extension reload in the current session", async () => {
  const requestIds = [];
  const dependencies = {
    async fetchCredits() {
      return { availableCount: 1, credits: [] };
    },
    async consumeCredit(_ctx, requestId) {
      requestIds.push(requestId);
      if (requestIds.length === 1) throw new Error("connection dropped");
      return { outcome: "already_redeemed" };
    },
    createRequestId: () => "reload-stable-id",
  };
  const firstExtension = registerExtension(createCodexResetExtension(dependencies));
  const first = createCommandContext({ confirms: [true, false] });
  await firstExtension.commands.get("codex-reset").handler("use", first.ctx);

  const reloadedExtension = registerExtension(createCodexResetExtension(dependencies));
  await reloadedExtension.handlers.get("session_start")(
    {},
    { sessionManager: { getBranch: () => firstExtension.entries } },
  );
  const second = createCommandContext({ confirms: [true] });
  await reloadedExtension.commands.get("codex-reset").handler("use", second.ctx);

  assert.deepEqual(requestIds, ["reload-stable-id", "reload-stable-id"]);
  assert.equal(second.confirmationCalls[0].title, "Retry unresolved Codex reset?");
});

test("an aborted consume retains its request without prompting for an immediate retry", async () => {
  const requestIds = [];
  const abort = new Error("This operation was aborted");
  abort.name = "AbortError";
  const { commands } = registerExtension(
    createCodexResetExtension({
      async fetchCredits() {
        return { availableCount: 1, credits: [] };
      },
      async consumeCredit(_ctx, requestId) {
        requestIds.push(requestId);
        if (requestIds.length === 1) throw abort;
        return { outcome: "already_redeemed" };
      },
      createRequestId: () => "aborted-request-id",
    }),
  );

  const first = createCommandContext({ confirms: [true, true] });
  await commands.get("codex-reset").handler("use", first.ctx);
  assert.equal(first.confirmationCalls.length, 1);
  assert.match(first.notifications.at(-1).message, /may have reached the server/);

  const second = createCommandContext({ confirms: [true] });
  await commands.get("codex-reset").handler("use", second.ctx);
  assert.deepEqual(requestIds, ["aborted-request-id", "aborted-request-id"]);
});

test("an aborted status check ends without offering a retry or reporting an error", async () => {
  const abort = new Error("This operation was aborted");
  abort.name = "AbortError";
  const { commands } = registerExtension(
    createCodexResetExtension({
      async fetchCredits() {
        throw abort;
      },
    }),
  );
  const harness = createCommandContext({ confirms: [true] });

  await commands.get("codex-reset").handler("status", harness.ctx);

  assert.equal(harness.confirmationCalls.length, 0);
  assert.deepEqual(harness.notifications.at(-1), {
    message: "Codex reset check cancelled.",
    type: "info",
  });
});

test("definitive HTTP-style failures do not offer an idempotent retry", async () => {
  let consumeCalls = 0;
  const { commands } = registerExtension(
    createCodexResetExtension({
      async fetchCredits() {
        return { availableCount: 1, credits: [] };
      },
      async consumeCredit() {
        consumeCalls += 1;
        throw new CodexResetApiError("Codex reset failed (401): unauthorized", false);
      },
      createRequestId: () => "definitive-failure-id",
    }),
  );
  const harness = createCommandContext({ confirms: [true, true] });

  await commands.get("codex-reset").handler("use", harness.ctx);

  assert.equal(consumeCalls, 1);
  assert.equal(harness.confirmationCalls.length, 1);
  assert.doesNotMatch(harness.notifications.at(-1).message, /remains unresolved/);
});

test("status never offers or consumes a reset", async () => {
  let consumed = false;
  const { commands } = registerExtension(
    createCodexResetExtension({
      async fetchCredits() {
        return { availableCount: 3, credits: [] };
      },
      async consumeCredit() {
        consumed = true;
        return { outcome: "reset" };
      },
    }),
  );
  const harness = createCommandContext({ confirms: [true] });

  await commands.get("codex-reset").handler("status", harness.ctx);

  assert.equal(consumed, false);
  assert.equal(harness.confirmationCalls.length, 0);
  assert.equal(
    harness.notifications.at(-1).message,
    ["Codex banked resets: 3", "1. expiry unknown", "2. expiry unknown", "3. expiry unknown"].join(
      "\n",
    ),
  );
});
