/**
summary: "Test harness for pi-modes project-mode trust: an isolated agent directory and project, and a fake Pi host that records dialogs, notifications, status, editor previews and the composed turn prompt."
read_when:
  - "Writing tests that drive the mode extension like Pi does."
*/
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import modeExtension from "../extensions/mode.ts";
import { loadModes } from "../src/mode-definitions.ts";
import { MODE_STATE_TYPE_V3, type ModeSelection } from "../src/modes.ts";

interface RegisteredCommand {
  handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
}
type EventHandler = (event: Record<string, unknown>, ctx: ExtensionCommandContext) => unknown;
type SelectorFactory = (...args: unknown[]) => { render(width: number): string[] };
type EntryRenderer = (
  entry: { data?: unknown },
  options: { expanded: boolean },
  theme: unknown,
) => { render(width: number): string[] };

export function modeFile(key: string, systemPrompt: string, promptStrategy = "append") {
  return JSON.stringify({ schemaVersion: 2, key, label: key, promptStrategy, systemPrompt });
}

// Real .pi/modes above the temp root would join every harness composition: skip those tests there.
export function ancestorModes(): string | false {
  for (let current = tmpdir(); ; current = dirname(current)) {
    if (existsSync(join(current, ".pi", "modes"))) return `.pi/modes exists at ${current}`;
    if (dirname(current) === current) return false;
  }
}
export const harnessOptions = { skip: ancestorModes() };

// Startup acknowledgements live on globalThis for the Pi process; a new process starts without.
export function newProcess(): void {
  delete (globalThis as Record<symbol, unknown>)[
    Symbol.for("tryinget.pi.modes.project-acknowledgements.v1")
  ];
}

// A trusted project with its own .pi/modes and an isolated Pi agent directory.
export function project(files: Record<string, string>) {
  newProcess();
  const root = mkdtempSync(join(tmpdir(), "pi-modes-trust-"));
  const agentDir = join(root, "agent");
  const cwd = join(root, "repo");
  mkdirSync(join(agentDir, "modes"), { recursive: true });
  mkdirSync(join(cwd, ".pi", "modes"), { recursive: true });
  const write = (name: string, body: string) =>
    writeFileSync(join(cwd, ".pi", "modes", name), body);
  for (const [name, body] of Object.entries(files)) write(name, body);
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const load = () =>
    loadModes({
      globalDir: join(agentDir, "modes"),
      projectDirs: [join(cwd, ".pi", "modes")],
      projectTrusted: true,
    }).modes;
  return {
    root,
    cwd,
    agentDir,
    write,
    writeGlobal: (name: string, body: string) => writeFileSync(join(agentDir, "modes", name), body),
    approvalsPath: join(agentDir, "mode-approvals.json"),
    mode: (key: string) => {
      const found = load().find((mode) => mode.key === key);
      assert.ok(found, `no mode ${key}`);
      return found;
    },
    restore() {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function harness(
  cwd: string,
  options: {
    mode?: "rpc" | "tui";
    answers?: boolean[];
    onConfirm?: () => void;
    entries?: unknown[];
    // Given the rows the /mode selector renders, what the operator applies.
    selector?: (rows: string[]) => ModeSelection | null;
  } = {},
) {
  const entries: unknown[] = [...(options.entries ?? [])];
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, EventHandler[]>();
  const notifications: string[] = [];
  const statuses: Array<string | undefined> = [];
  const dialogs: Array<{ title: string; body: string }> = [];
  const editors: Array<{ title: string; text: string }> = [];
  const answers = [...(options.answers ?? [])];
  const renderers = new Map<string, EntryRenderer>();
  const pi = {
    registerEntryRenderer(type: string, renderer: EntryRenderer) {
      renderers.set(type, renderer);
    },
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
    cwd,
    isProjectTrusted: () => true,
    sessionManager: { getBranch: () => entries },
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      setStatus: (_key: string, text?: string) => statuses.push(text),
      notify: (message: string) => notifications.push(message),
      custom: async (factory: SelectorFactory) => {
        const component = factory(
          { requestRender() {} },
          {
            fg: (_color: string, text: string) => text,
            bg: (_color: string, text: string) => text,
            bold: (text: string) => text,
          },
          { matches: () => false },
          () => {},
        );
        return options.selector?.(component.render(120)) ?? null;
      },
      editor: async (title: string, text: string) => {
        editors.push({ title, text });
        return undefined;
      },
      confirm: async (title: string, body: string) => {
        dialogs.push({ title, body });
        options.onConfirm?.();
        return answers.shift() ?? false;
      },
    },
    getSystemPromptOptions: () => ({ cwd, selectedTools: ["read"] }),
    getSystemPrompt: () => "HOST",
  } as unknown as ExtensionCommandContext;
  const command = (name: string) => {
    const found = commands.get(name);
    assert.ok(found, `no command ${name}`);
    return async (args: string): Promise<void> => {
      await found.handler(args, ctx);
    };
  };
  const run = (name: string, event: Record<string, unknown>) =>
    handlers.get(name)?.[0]?.(event, ctx);
  const activeState = () =>
    (
      [...entries]
        .reverse()
        .find((entry) => (entry as { customType?: string }).customType === MODE_STATE_TYPE_V3) as
        | { data: { overlayKeys: string[]; driftPolicy: string } }
        | undefined
    )?.data;
  const activeOverlays = () => activeState()?.overlayKeys ?? [];
  // What the model receives this turn.
  const turnPrompt = async () => {
    const result = (await run("before_agent_start", {
      systemPrompt: "HOST",
      systemPromptOptions: { cwd, selectedTools: ["read"] },
    })) as { systemPrompt?: string } | undefined;
    return result?.systemPrompt ?? "HOST";
  };
  return {
    entries,
    notifications,
    statuses,
    dialogs,
    editors,
    renderers,
    answers,
    command,
    run,
    activeState,
    activeOverlays,
    turnPrompt,
  };
}
