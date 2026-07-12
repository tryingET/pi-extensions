// summary: "Provides Pi session, UI, and Replay Fabric stubs for rewind runtime tests."
// read_when:
//   - "Extending rewind runtime event or recovery projection coverage."

import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

export class SessionManagerStub {
  constructor({ sessionFile, id, cwd, parentSession }) {
    this.sessionFile = sessionFile;
    this.header = {
      type: "session",
      version: 3,
      id,
      timestamp: new Date().toISOString(),
      cwd,
      parentSession,
    };
    this.entries = [];
    this.leafId = null;
    this.flush();
  }

  flush() {
    mkdirSync(path.dirname(this.sessionFile), { recursive: true });
    const lines = `${[this.header, ...this.entries].map((entry) => JSON.stringify(entry)).join("\n")}
`;
    writeFileSync(this.sessionFile, lines);
  }

  appendMessage(role, text) {
    const entry = {
      type: "message",
      id: `${role}-${this.entries.length + 1}`,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      message: {
        role,
        content: [{ type: "text", text }],
      },
    };
    this.entries.push(entry);
    this.leafId = entry.id;
    this.flush();
    return entry;
  }

  appendCompaction(summary = "summary") {
    const entry = {
      type: "compaction",
      id: `compaction-${this.entries.length + 1}`,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      summary,
      firstKeptEntryId: this.entries[0]?.id ?? null,
      tokensBefore: 10,
      fromHook: true,
    };
    this.entries.push(entry);
    this.leafId = entry.id;
    this.flush();
    return entry;
  }

  appendCustomEntry(customType, data) {
    const entry = {
      type: "custom",
      id: `${customType}-${this.entries.length + 1}`,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      customType,
      data,
    };
    this.entries.push(entry);
    this.leafId = entry.id;
    this.flush();
    return entry;
  }

  getCwd() {
    return this.header.cwd;
  }

  getSessionId() {
    return this.header.id;
  }

  getSessionFile() {
    return this.sessionFile;
  }

  getHeader() {
    return { parentSession: this.header.parentSession };
  }

  getEntries() {
    return [...this.entries];
  }

  getBranch() {
    return [...this.entries];
  }

  getEntry(entryId) {
    return this.entries.find((entry) => entry.id === entryId);
  }

  getLeafId() {
    return this.leafId;
  }

  getLeafEntry() {
    return this.entries.find((entry) => entry.id === this.leafId);
  }
}

export function createPiHarness(sessionManager, hasUI = true) {
  const commands = new Map();
  const handlers = new Map();
  const notifications = [];
  const selections = [];
  const selectionPrompts = [];
  const statuses = [];

  const pi = {
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    appendEntry(customType, data) {
      sessionManager.appendCustomEntry(customType, data);
    },
  };

  const ctx = {
    cwd: sessionManager.getCwd(),
    hasUI,
    sessionManager,
    isIdle: () => true,
    signal: undefined,
    abort() {},
    hasPendingMessages: () => false,
    shutdown() {},
    getContextUsage: () => undefined,
    compact() {},
    getSystemPrompt: () => "",
    ui: {
      notify(message, level = "info") {
        notifications.push({ message, level });
      },
      setStatus(key, text) {
        statuses.push({ key, text });
      },
      theme: {
        fg(_color, text) {
          return text;
        },
      },
      select: async (title, options) => {
        selectionPrompts.push({ title, options: [...options] });
        return selections.shift();
      },
      confirm: async () => false,
      input: async () => undefined,
      onTerminalInput: () => () => {},
      setWorkingMessage() {},
      setHiddenThinkingLabel() {},
      setWidget() {},
      setFooter() {},
      setHeader() {},
      setTitle() {},
      custom: async () => undefined,
      pasteToEditor() {},
      setEditorText() {},
      getEditorText: () => "",
      editor: async () => undefined,
      setEditorComponent() {},
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false }),
      getToolsExpanded: () => false,
      setToolsExpanded() {},
    },
  };

  return {
    commands,
    ctx,
    handlers,
    notifications,
    pi,
    selections,
    selectionPrompts,
    statuses,
    enqueueSelection(choice) {
      selections.push(choice);
    },
  };
}

export async function withReplayFabricEnv(baseUrl, fn) {
  const previousUrl = process.env.ASC_REWIND_REPLAY_FABRIC_URL;
  const previousSource = process.env.ASC_REWIND_REPLAY_FABRIC_SOURCE;
  process.env.ASC_REWIND_REPLAY_FABRIC_URL = baseUrl;
  process.env.ASC_REWIND_REPLAY_FABRIC_SOURCE = "asc-rewind-test";

  try {
    await fn();
  } finally {
    if (previousUrl === undefined) {
      delete process.env.ASC_REWIND_REPLAY_FABRIC_URL;
    } else {
      process.env.ASC_REWIND_REPLAY_FABRIC_URL = previousUrl;
    }

    if (previousSource === undefined) {
      delete process.env.ASC_REWIND_REPLAY_FABRIC_SOURCE;
    } else {
      process.env.ASC_REWIND_REPLAY_FABRIC_SOURCE = previousSource;
    }
  }
}

export async function startRecordingReplayFabricServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/milestones/recovery") {
      res.writeHead(404);
      res.end();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected TCP listener");
  }

  return {
    requests,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}
