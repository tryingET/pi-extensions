/**
 * Tests for TriggerBroker.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBroker, TriggerBroker } from "../src/TriggerBroker.js";

function makeApi(sessionKey) {
  return {
    setText: () => {},
    insertText: () => {},
    notify: () => {},
    select: async () => null,
    confirm: async () => false,
    input: async () => null,
    getText: () => "",
    close: () => {},
    ctx: sessionKey ? { sessionKey } : {},
  };
}

function contextFromText(text, sessionKey) {
  return {
    fullText: text,
    textBeforeCursor: text,
    textAfterCursor: "",
    cursorLine: 0,
    cursorColumn: text.length,
    totalLines: 1,
    isLive: true,
    ...(sessionKey ? { sessionKey } : {}),
  };
}

describe("TriggerBroker", () => {
  let broker;

  beforeEach(() => {
    resetBroker();
    broker = new TriggerBroker();
  });

  afterEach(() => {
    broker.clear();
  });

  describe("register", () => {
    it("should register a valid trigger", () => {
      const result = broker.register({
        id: "test-trigger",
        description: "Test trigger",
        match: /^\$\$\s*\//,
        handler: async () => {},
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.id, "test-trigger");
    });

    it("should reject trigger without id", () => {
      const result = broker.register({
        id: "",
        description: "Test",
        match: "test",
        handler: async () => {},
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes("id"));
    });

    it("should reject trigger without description", () => {
      const result = broker.register({
        id: "test",
        description: "",
        match: "test",
        handler: async () => {},
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes("description"));
    });

    it("should reject duplicate id without replaceIfExists", () => {
      broker.register({
        id: "test",
        description: "First",
        match: "test",
        handler: async () => {},
      });

      const result = broker.register({
        id: "test",
        description: "Second",
        match: "test2",
        handler: async () => {},
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes("already exists"));
    });

    it("should allow duplicate id with replaceIfExists", () => {
      broker.register({
        id: "test",
        description: "First",
        match: "test",
        handler: async () => {},
      });

      const result = broker.register(
        {
          id: "test",
          description: "Second",
          match: "test2",
          handler: async () => {},
        },
        { replaceIfExists: true },
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.replaced, "test");

      const trigger = broker.get("test");
      assert.strictEqual(trigger.description, "Second");
    });

    it("should skip duplicate id with skipIfExists", () => {
      broker.register({
        id: "test",
        description: "First",
        match: "test",
        handler: async () => {},
      });

      const result = broker.register(
        {
          id: "test",
          description: "Second",
          match: "test2",
          handler: async () => {},
        },
        { skipIfExists: true },
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.replaced, undefined);

      const trigger = broker.get("test");
      assert.strictEqual(trigger.description, "First");
    });
  });

  describe("unregister", () => {
    it("should remove a trigger", () => {
      broker.register({
        id: "test",
        description: "Test",
        match: "test",
        handler: async () => {},
      });

      assert.ok(broker.get("test"));
      const removed = broker.unregister("test");
      assert.strictEqual(removed, true);
      assert.strictEqual(broker.get("test"), undefined);
    });

    it("should return false for non-existent trigger", () => {
      const removed = broker.unregister("nonexistent");
      assert.strictEqual(removed, false);
    });
  });

  describe("list", () => {
    it("should list all triggers", () => {
      broker.register({ id: "a", description: "A", match: "a", handler: async () => {} });
      broker.register({ id: "b", description: "B", match: "b", handler: async () => {} });

      const list = broker.list();
      assert.strictEqual(list.length, 2);
    });
  });

  describe("diagnostics", () => {
    it("should return diagnostics for all triggers", () => {
      broker.register({
        id: "test",
        description: "Test trigger",
        match: /^\$\$\s*\//,
        handler: async () => {},
      });

      const diag = broker.diagnostics();
      assert.strictEqual(diag.length, 1);
      assert.strictEqual(diag[0].id, "test");
      assert.strictEqual(diag[0].matchType, "regex");
      assert.strictEqual(diag[0].enabled, true);
    });
  });

  describe("setEnabled", () => {
    it("should enable/disable a trigger", () => {
      broker.register({
        id: "test",
        description: "Test",
        match: "test",
        handler: async () => {},
      });

      broker.setEnabled("test", false);
      const diag = broker.diagnostics();
      assert.strictEqual(diag[0].enabled, false);

      broker.setEnabled("test", true);
      const diag2 = broker.diagnostics();
      assert.strictEqual(diag2[0].enabled, true);
    });

    it("should return false for non-existent trigger", () => {
      const result = broker.setEnabled("nonexistent", true);
      assert.strictEqual(result, false);
    });
  });

  describe("matching", () => {
    it("should match string prefix", async () => {
      let fired = false;
      broker.register({
        id: "test",
        description: "Test",
        match: "$$ /",
        handler: async () => {
          fired = true;
        },
      });

      broker.setAPI({
        setText: () => {},
        insertText: () => {},
        notify: () => {},
        select: async () => null,
        confirm: async () => false,
        input: async () => null,
        getText: () => "",
        close: () => {},
        ctx: {},
      });

      await broker.checkAndFire({
        fullText: "$$ /",
        textBeforeCursor: "$$ /",
        textAfterCursor: "",
        cursorLine: 0,
        cursorColumn: 4,
        totalLines: 1,
        isLive: true,
      });

      // Wait for debounce
      await new Promise((r) => setTimeout(r, 150));

      assert.strictEqual(fired, true);
    });

    it("should match regex pattern", async () => {
      let capturedMatch = null;
      broker.register({
        id: "test",
        description: "Test",
        match: /^\$\$\s*\/(.*)$/,
        handler: async (match) => {
          capturedMatch = match;
        },
      });

      broker.setAPI({
        setText: () => {},
        insertText: () => {},
        notify: () => {},
        select: async () => null,
        confirm: async () => false,
        input: async () => null,
        getText: () => "",
        close: () => {},
        ctx: {},
      });

      await broker.checkAndFire({
        fullText: "$$ /inv",
        textBeforeCursor: "$$ /inv",
        textAfterCursor: "",
        cursorLine: 0,
        cursorColumn: 7,
        totalLines: 1,
        isLive: true,
      });

      await new Promise((r) => setTimeout(r, 150));

      assert.ok(capturedMatch);
      assert.strictEqual(capturedMatch.matchedText, "$$ /inv");
    });

    it("should not fire if cursor not at end with requireCursorAtEnd", async () => {
      let fired = false;
      broker.register({
        id: "test",
        description: "Test",
        match: /\$\$\s*\//, // Regex that matches "$$ /" anywhere
        requireCursorAtEnd: true,
        handler: async () => {
          fired = true;
        },
      });

      broker.setAPI({
        setText: () => {},
        insertText: () => {},
        notify: () => {},
        select: async () => null,
        confirm: async () => false,
        input: async () => null,
        getText: () => "",
        close: () => {},
        ctx: {},
      });

      // The regex matches "$$ /" at position 0-4
      // But textBeforeCursor is "$$ / more text" (length 15)
      // So match.endIndex (4) != textBeforeCursor.length (15)
      // Therefore should NOT fire
      await broker.checkAndFire({
        fullText: "$$ / more text",
        textBeforeCursor: "$$ / more text",
        textAfterCursor: "",
        cursorLine: 0,
        cursorColumn: 15,
        totalLines: 1,
        isLive: true,
      });

      await new Promise((r) => setTimeout(r, 150));

      assert.strictEqual(fired, false);
    });

    it("should respect priority order", async () => {
      const order = [];
      broker.register({
        id: "low",
        description: "Low priority",
        priority: 1,
        match: "$$ /",
        handler: async () => {
          order.push("low");
        },
      });

      broker.register({
        id: "high",
        description: "High priority",
        priority: 10,
        match: "$$ /",
        handler: async () => {
          order.push("high");
        },
      });

      broker.setAPI({
        setText: () => {},
        insertText: () => {},
        notify: () => {},
        select: async () => null,
        confirm: async () => false,
        input: async () => null,
        getText: () => "",
        close: () => {},
        ctx: {},
      });

      await broker.checkAndFire({
        fullText: "$$ /",
        textBeforeCursor: "$$ /",
        textAfterCursor: "",
        cursorLine: 0,
        cursorColumn: 4,
        totalLines: 1,
        isLive: true,
      });

      await new Promise((r) => setTimeout(r, 150));

      // High priority fires first (and only one fires due to early return)
      assert.strictEqual(order.length, 1);
      assert.strictEqual(order[0], "high");
    });

    it("should fire a debounced trigger with the API captured for that dispatch", async () => {
      const seenSessionKeys = [];
      broker.register({
        id: "test",
        description: "Test",
        match: "$$ /",
        debounceMs: 20,
        handler: async (_match, _context, api) => {
          seenSessionKeys.push(api.ctx.sessionKey);
        },
      });

      const apiA = makeApi("editor-a");
      const apiB = makeApi("editor-b");
      broker.setAPI(apiA);

      const pending = broker.checkAndFire(contextFromText("$$ /", "editor-a"), apiA);
      broker.setAPI(apiB);

      await pending;

      assert.deepEqual(seenSessionKeys, ["editor-a"]);
    });

    it("should isolate debounce timers by trigger id and session key", async () => {
      const seenSessionKeys = [];
      broker.register({
        id: "test",
        description: "Test",
        match: "$$ /",
        debounceMs: 20,
        handler: async (_match, _context, api) => {
          seenSessionKeys.push(api.ctx.sessionKey);
        },
      });

      const apiA = makeApi("editor-a");
      const apiB = makeApi("editor-b");
      const [firedA, firedB] = await Promise.all([
        broker.checkAndFire(contextFromText("$$ /", "editor-a"), apiA),
        broker.checkAndFire(contextFromText("$$ /", "editor-b"), apiB),
      ]);

      assert.equal(firedA, true);
      assert.equal(firedB, true);
      assert.deepEqual(seenSessionKeys.sort(), ["editor-a", "editor-b"]);
    });

    it("should settle superseded debounce promises and only fire the latest input per session", async () => {
      const seenInputs = [];
      broker.register({
        id: "test",
        description: "Test",
        match: /^\/vault:(.*)$/,
        debounceMs: 20,
        handler: async (match, _context, api) => {
          seenInputs.push({
            query: match.groups?.[0] ?? "",
            sessionKey: api.ctx.sessionKey,
          });
        },
      });

      const api = makeApi("editor-a");
      broker.setAPI(api);

      const firstPending = broker.checkAndFire(contextFromText("/vault:n", "editor-a"), api);
      const secondPending = broker.checkAndFire(contextFromText("/vault:nex", "editor-a"), api);
      const [firstResult, secondResult] = await Promise.all([firstPending, secondPending]);

      assert.equal(firstResult, false);
      assert.equal(secondResult, true);
      assert.deepEqual(seenInputs, [{ query: "nex", sessionKey: "editor-a" }]);
    });
  });
});
