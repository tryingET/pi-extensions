import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import modeExtension from "../extensions/mode.ts";
import { MODE_STATE_TYPE, MODE_STATE_TYPE_V2, MODE_STATE_TYPE_V3 } from "../src/modes.ts";

interface RegisteredCommand {
  handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
}

type EventHandler = (event: Record<string, unknown>, ctx: ExtensionCommandContext) => unknown;

function harness(
  initialEntries: unknown[] = [],
  options: { mode?: "rpc" | "tui"; confirm?: boolean; onConfirm?: () => void } = {},
) {
  const entries = [...initialEntries];
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, EventHandler[]>();
  const notifications: Array<{ message: string; type: string }> = [];
  const statuses: Array<string | undefined> = [];
  const pi = {
    registerEntryRenderer() {},
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
    on(name: string, handler: EventHandler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    appendEntry(customType: string, data: unknown) {
      entries.push({ type: "custom", customType, data });
    },
  } as unknown as ExtensionAPI;
  modeExtension(pi);
  const ctx = {
    mode: options.mode ?? "rpc",
    hasUI: true,
    cwd: process.cwd(),
    isProjectTrusted: () => false,
    sessionManager: { getBranch: () => entries },
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      setStatus: (_key: string, value: string | undefined) => statuses.push(value),
      notify: (message: string, type: string) => notifications.push({ message, type }),
      confirm: async () => {
        options.onConfirm?.();
        return options.confirm ?? false;
      },
    },
    getSystemPromptOptions: () => ({ cwd: process.cwd(), selectedTools: ["read"] }),
    getSystemPrompt: () => "HOST",
  } as unknown as ExtensionCommandContext;
  return { entries, commands, handlers, notifications, statuses, ctx };
}

test("session_start freezes a legacy v1 append slot into fingerprinted v3", async () => {
  const h = harness([{ type: "custom", customType: MODE_STATE_TYPE, data: { key: "review" } }]);
  const handler = h.handlers.get("session_start")?.[0];
  assert.ok(handler);
  await handler({ reason: "reload" }, h.ctx);
  const latest = h.entries.at(-1) as { customType: string; data: unknown };
  assert.equal(latest.customType, MODE_STATE_TYPE_V3);
  assert.deepEqual(
    {
      baseKey: (latest.data as { baseKey: unknown }).baseKey,
      overlayKeys: (latest.data as { overlayKeys: unknown }).overlayKeys,
    },
    { baseKey: null, overlayKeys: ["review"] },
  );
  assert.equal((latest.data as { driftPolicy: string }).driftPolicy, "block");
  assert.match(
    (latest.data as { fingerprints: Record<string, { digest: string }> }).fingerprints.review
      .digest,
    /^[a-f0-9]{64}$/,
  );
});

test("headless direct syntax persists v3 and rejects invalid removals", async () => {
  const h = harness();
  const command = h.commands.get("mode");
  assert.ok(command);
  await command.handler("set native --overlay review --overlay explain", h.ctx);
  const state = h.entries.find(
    (entry) => (entry as { customType?: string }).customType === MODE_STATE_TYPE_V3,
  ) as { data: { baseKey: string | null; overlayKeys: string[]; source: string } };
  assert.deepEqual(
    { baseKey: state.data.baseKey, overlayKeys: state.data.overlayKeys },
    { baseKey: null, overlayKeys: ["review", "explain"] },
  );
  assert.equal(state.data.source, "command");
  await assert.rejects(async () => {
    await command.handler("-missing", h.ctx);
  }, /not an append overlay/);
});

test("headless exact activation requires explicit acknowledgement and status/preview emit JSON", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-extension-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  mkdirSync(join(root, "modes"), { recursive: true });
  writeFileSync(
    join(root, "modes", "exact.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "exact",
      label: "Exact",
      promptStrategy: "replace_final",
      systemPrompt: " EXACT ",
    }),
  );
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (value?: unknown) => output.push(String(value));
  try {
    const h = harness();
    const mode = h.commands.get("mode");
    assert.ok(mode);
    await assert.rejects(async () => {
      await mode.handler("exact", h.ctx);
    }, /requires --confirm-exact/);
    await mode.handler("exact --confirm-exact", h.ctx);
    const latest = h.entries.at(-1) as { customType: string; data: { baseKey: string | null } };
    assert.equal(latest.customType, MODE_STATE_TYPE_V3);
    assert.equal(latest.data.baseKey, "exact");

    await h.commands.get("mode-status")?.handler("--json", h.ctx);
    await h.commands.get("mode-preview")?.handler("--json", h.ctx);
    const status = JSON.parse(output.at(-2) ?? "{}") as { composition?: { sha256?: string } };
    const preview = JSON.parse(output.at(-1) ?? "{}") as { prompt?: string };
    assert.match(status.composition?.sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(preview.prompt, " EXACT ");
    await mode.handler("save portable", h.ctx);
    await mode.handler("export portable", h.ctx);
    const exported = JSON.parse(output.at(-1) ?? "{}") as {
      preset?: Record<string, unknown>;
      encoded?: string;
    };
    assert.equal(exported.preset?.key, "portable");
    assert.equal("scope" in (exported.preset ?? {}), false);
    assert.equal("path" in (exported.preset ?? {}), false);
    assert.match(exported.encoded ?? "", /^[A-Za-z0-9_-]+$/);

    const denied = harness([], { mode: "tui", confirm: false });
    await denied.commands.get("mode")?.handler("exact", denied.ctx);
    assert.equal(
      denied.entries.some(
        (entry) => (entry as { customType?: string }).customType === MODE_STATE_TYPE_V3,
      ),
      false,
    );
    const allowed = harness([], { mode: "tui", confirm: true });
    await allowed.commands.get("mode")?.handler("exact", allowed.ctx);
    assert.equal(
      (allowed.entries.at(-1) as { customType?: string }).customType,
      MODE_STATE_TYPE_V3,
    );
  } finally {
    console.log = originalLog;
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicitly reactivating the same keys refreshes drifted fingerprints", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-reactivate-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const modesDir = join(root, "modes");
  mkdirSync(modesDir, { recursive: true });
  const path = join(modesDir, "builder.json");
  const definition = (systemPrompt: string) => ({
    schemaVersion: 2,
    key: "builder",
    label: "Builder",
    promptStrategy: "replace_base",
    systemPrompt,
  });
  writeFileSync(path, JSON.stringify(definition("OLD")));
  try {
    const h = harness();
    const command = h.commands.get("mode");
    const before = h.handlers.get("before_agent_start")?.[0];
    assert.ok(command && before);
    await command.handler("builder", h.ctx);
    writeFileSync(path, JSON.stringify(definition("NEW")));
    const blocked = (await before(
      {
        systemPrompt: "HOST",
        systemPromptOptions: { cwd: process.cwd(), selectedTools: ["read"] },
      },
      h.ctx,
    )) as { systemPrompt: string };
    assert.equal(blocked.systemPrompt, "HOST");
    const entryCount = h.entries.length;
    await command.handler("builder", h.ctx);
    assert.equal(h.entries.length, entryCount + 1);
    const reactivated = (await before(
      {
        systemPrompt: "HOST",
        systemPromptOptions: { cwd: process.cwd(), selectedTools: ["read"] },
      },
      h.ctx,
    )) as { systemPrompt: string };
    assert.match(reactivated.systemPrompt, /^NEW/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("before_agent_start composes ordered overlays from branch state", async () => {
  const h = harness([
    {
      type: "custom",
      customType: MODE_STATE_TYPE_V2,
      data: { baseKey: null, overlayKeys: ["review", "explain"] },
    },
  ]);
  const handler = h.handlers.get("before_agent_start")?.[0];
  assert.ok(handler);
  const result = (await handler(
    {
      systemPrompt: "HOST",
      systemPromptOptions: { cwd: process.cwd(), selectedTools: ["read"] },
    },
    h.ctx,
  )) as { systemPrompt: string };
  assert.match(result.systemPrompt, /^HOST/);
  assert.ok(
    result.systemPrompt.indexOf("overlay 1: Review") <
      result.systemPrompt.indexOf("overlay 2: Explain"),
  );
});

test("same-key replace_final drift cannot reactivate through commands or presets without acknowledgement", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-exact-drift-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const modesDir = join(root, "modes");
  mkdirSync(modesDir, { recursive: true });
  const path = join(modesDir, "builder.json");
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 2,
      key: "builder",
      label: "Builder",
      promptStrategy: "replace_base",
      systemPrompt: "OLD",
    }),
  );
  try {
    const h = harness();
    const command = h.commands.get("mode");
    assert.ok(command);
    await command.handler("builder", h.ctx);
    await command.handler("save builder-preset", h.ctx);
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 2,
        key: "builder",
        label: "Builder",
        promptStrategy: "replace_final",
        systemPrompt: "NEW EXACT",
      }),
    );
    const before = h.handlers.get("before_agent_start")?.[0];
    assert.ok(before);
    await h.commands.get("mode-policy")?.handler("allow", h.ctx);
    const blockedUnderAllow = (await before(
      { systemPrompt: "HOST", systemPromptOptions: { cwd: process.cwd() } },
      h.ctx,
    )) as { systemPrompt: string };
    assert.equal(blockedUnderAllow.systemPrompt, "HOST");
    await assert.rejects(async () => {
      await command.handler("builder", h.ctx);
    }, /requires --confirm-exact/);
    await assert.rejects(async () => {
      await command.handler("use builder-preset", h.ctx);
    }, /requires --confirm-exact/);
    await command.handler("builder --confirm-exact", h.ctx);
    const result = (await before(
      { systemPrompt: "HOST", systemPromptOptions: { cwd: process.cwd() } },
      h.ctx,
    )) as { systemPrompt: string };
    assert.equal(result.systemPrompt, "NEW EXACT");
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("policy changes and inactive deletion preserve drift fingerprints", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-policy-drift-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const modesDir = join(root, "modes");
  mkdirSync(modesDir, { recursive: true });
  const builderPath = join(modesDir, "builder.json");
  const definition = (systemPrompt: string) => ({
    schemaVersion: 2,
    key: "builder",
    label: "Builder",
    promptStrategy: "replace_base",
    systemPrompt,
  });
  writeFileSync(builderPath, JSON.stringify(definition("OLD")));
  writeFileSync(
    join(modesDir, "unused.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "unused",
      label: "Unused",
      promptStrategy: "append",
      systemPrompt: "UNUSED",
    }),
  );
  try {
    const h = harness([], { mode: "tui", confirm: true });
    await h.commands.get("mode")?.handler("builder", h.ctx);
    const approved = (h.entries.at(-1) as { data: { fingerprints: unknown } }).data.fingerprints;
    writeFileSync(builderPath, JSON.stringify(definition("NEW")));
    await h.commands.get("mode-policy")?.handler("block", h.ctx);
    const policyState = h.entries.at(-1) as {
      data: { source: string; fingerprints: unknown; driftPolicy: string };
    };
    assert.equal(policyState.data.source, "policy");
    assert.deepEqual(policyState.data.fingerprints, approved);
    const before = h.handlers.get("before_agent_start")?.[0];
    assert.ok(before);
    const promptAfterBlock = (await before(
      { systemPrompt: "HOST", systemPromptOptions: { cwd: process.cwd() } },
      h.ctx,
    )) as { systemPrompt: string };
    assert.equal(promptAfterBlock.systemPrompt, "HOST");

    const entriesBeforeInactiveDelete = h.entries.length;
    await h.commands.get("mode-delete")?.handler("unused", h.ctx);
    assert.equal(h.entries.length, entriesBeforeInactiveDelete);
    const promptAfterDelete = (await before(
      { systemPrompt: "HOST", systemPromptOptions: { cwd: process.cwd() } },
      h.ctx,
    )) as { systemPrompt: string };
    assert.equal(promptAfterDelete.systemPrompt, "HOST");
    await h.commands.get("mode-policy")?.handler("warn", h.ctx);
    const promptAfterWarn = (await before(
      { systemPrompt: "HOST", systemPromptOptions: { cwd: process.cwd() } },
      h.ctx,
    )) as { systemPrompt: string };
    assert.match(promptAfterWarn.systemPrompt, /^NEW/);
    await h.commands.get("mode-policy")?.handler("block", h.ctx);
    const promptAfterRestoredBlock = (await before(
      { systemPrompt: "HOST", systemPromptOptions: { cwd: process.cwd() } },
      h.ctx,
    )) as { systemPrompt: string };
    assert.equal(promptAfterRestoredBlock.systemPrompt, "HOST");
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("exact confirmation is bound to the definition snapshot that is persisted", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-confirm-snapshot-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const modesDir = join(root, "modes");
  mkdirSync(modesDir, { recursive: true });
  const path = join(modesDir, "exact.json");
  const definition = (systemPrompt: string) => ({
    schemaVersion: 2,
    key: "exact",
    label: "Exact",
    promptStrategy: "replace_final",
    systemPrompt,
  });
  writeFileSync(path, JSON.stringify(definition("OLD EXACT")));
  let changed = false;
  try {
    const h = harness([], {
      mode: "tui",
      confirm: true,
      onConfirm: () => {
        if (changed) return;
        changed = true;
        writeFileSync(path, JSON.stringify(definition("NEW EXACT")));
      },
    });
    await h.commands.get("mode")?.handler("exact", h.ctx);
    assert.equal(
      h.entries.some(
        (entry) => (entry as { customType?: string }).customType === MODE_STATE_TYPE_V3,
      ),
      false,
    );
    assert.ok(
      h.notifications.some((notification) =>
        /changed after confirmation/.test(notification.message),
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("deleting an inactive mode never rewrites a role-drifted active selection", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-delete-role-drift-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  const modesDir = join(root, "modes");
  mkdirSync(modesDir, { recursive: true });
  const builderPath = join(modesDir, "builder.json");
  const builder = (promptStrategy: "replace_base" | "append") => ({
    schemaVersion: 2,
    key: "builder",
    label: "Builder",
    promptStrategy,
    systemPrompt: "BUILDER",
  });
  writeFileSync(builderPath, JSON.stringify(builder("replace_base")));
  writeFileSync(
    join(modesDir, "unused.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "unused",
      label: "Unused",
      promptStrategy: "append",
      systemPrompt: "UNUSED",
    }),
  );
  try {
    const h = harness([], { mode: "tui", confirm: true });
    await h.commands.get("mode")?.handler("builder", h.ctx);
    writeFileSync(builderPath, JSON.stringify(builder("append")));
    const entriesBeforeDelete = h.entries.length;
    await h.commands.get("mode-delete")?.handler("unused", h.ctx);
    assert.equal(h.entries.length, entriesBeforeDelete);
    const latest = h.entries.at(-1) as { data: { baseKey: string | null } };
    assert.equal(latest.data.baseKey, "builder");
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("startup exact-final requires a separate environment acknowledgement", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-startup-exact-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  const previousMode = process.env.PI_MODE;
  const previousConfirmation = process.env.PI_MODE_CONFIRM_EXACT;
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.PI_MODE = "exact";
  delete process.env.PI_MODE_CONFIRM_EXACT;
  mkdirSync(join(root, "modes"), { recursive: true });
  writeFileSync(
    join(root, "modes", "exact.json"),
    JSON.stringify({
      schemaVersion: 2,
      key: "exact",
      label: "Exact",
      promptStrategy: "replace_final",
      systemPrompt: "EXACT",
    }),
  );
  try {
    const denied = harness();
    await denied.handlers.get("session_start")?.[0]?.({ reason: "startup" }, denied.ctx);
    assert.equal(
      (denied.entries.at(-1) as { data: { baseKey: string | null } }).data.baseKey,
      null,
    );

    process.env.PI_MODE_CONFIRM_EXACT = "1";
    const allowed = harness();
    await allowed.handlers.get("session_start")?.[0]?.({ reason: "startup" }, allowed.ctx);
    assert.equal(
      (allowed.entries.at(-1) as { data: { baseKey: string | null } }).data.baseKey,
      "exact",
    );
  } finally {
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    if (previousMode === undefined) delete process.env.PI_MODE;
    else process.env.PI_MODE = previousMode;
    if (previousConfirmation === undefined) delete process.env.PI_MODE_CONFIRM_EXACT;
    else process.env.PI_MODE_CONFIRM_EXACT = previousConfirmation;
    rmSync(root, { recursive: true, force: true });
  }
});

test("commands reject unknown arguments without mutating drift state", async () => {
  const h = harness();
  const count = h.entries.length;
  await assert.rejects(async () => {
    await h.commands.get("mode-reapprove")?.handler("--bogus", h.ctx);
  }, /Usage: \/mode-reapprove/);
  await assert.rejects(async () => {
    await h.commands.get("mode-status")?.handler("--bogus", h.ctx);
  }, /Usage: \/mode-status/);
  assert.equal(h.entries.length, count);
});
