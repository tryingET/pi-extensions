/**
 * Shared test harness for self tool tests.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");
const EXTENSION_PATH = path.join(REPO_ROOT, "extensions", "self.ts");
const SELF_MODULE_DIR = path.join(REPO_ROOT, "extensions", "self");
const TEMP_TEST_ROOT = path.join(REPO_ROOT, ".tmp-self-tests");

export function createPiHarness() {
  const commands = new Map();
  const tools = new Map();
  const eventHandlers = new Map();
  const sentUserMessages = [];

  const pi = {
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    on(eventName, handler) {
      eventHandlers.set(eventName, handler);
    },
    sendUserMessage(text, options) {
      sentUserMessages.push({ text, options });
    },
  };

  return { pi, commands, tools, eventHandlers, sentUserMessages };
}

export async function loadExtensionWithMocks() {
  await mkdir(TEMP_TEST_ROOT, { recursive: true });

  const tempDir = await mkdtemp(path.join(TEMP_TEST_ROOT, "case-"));
  const underTestPath = path.join(tempDir, "self.ts");
  const underTestModuleDir = path.join(tempDir, "self");
  const mockModulePath = path.join(tempDir, "mock-pi-coding-agent.mjs");

  process.env.PI_SUBAGENT_SESSIONS_DIR = path.join(tempDir, "sessions");

  // Read extension source
  let source = await readFile(EXTENSION_PATH, "utf8");

  // Replace import with mock
  source = source.replace(
    /from\s+"@mariozechner\/pi-coding-agent"/g,
    'from "./mock-pi-coding-agent.mjs"',
  );

  // Create mock module
  await writeFile(
    mockModulePath,
    `
    export const Type = {
      Object: (props) => ({ type: "object", ...props }),
      String: (props) => ({ type: "string", ...props }),
      Optional: (type, props) => ({ type: "optional", inner: type, ...props }),
      Record: (key, value) => ({ type: "record", key, value }),
      Unknown: () => ({ type: "unknown" }),
      Integer: (props) => ({ type: "integer", ...props }),
      Array: (type, props) => ({ type: "array", items: type, ...props }),
    };
    `,
  );

  // Copy self module directory
  await mkdir(underTestModuleDir, { recursive: true });
  const moduleFiles = [
    "types.ts",
    "perception.ts",
    "query-resolver.ts",
    "runtime-invariants.ts",
    "state.ts",
    "prompt-vault-compat.ts",
    "edge-contract-kernel.ts",
    "memory.ts",
    "memory-lifecycle.ts",
  ];

  for (const file of moduleFiles) {
    const srcPath = path.join(SELF_MODULE_DIR, file);
    const destPath = path.join(underTestModuleDir, file);
    let content = await readFile(srcPath, "utf8");
    // Fix relative imports
    if (file !== "types.ts") {
      content = content.replace(/from\s+"\.\.\/types\.ts"/g, 'from "./types.ts"');
      content = content.replace(/from\s+"\.\.\/perception\.ts"/g, 'from "./perception.ts"');
    }
    await writeFile(destPath, content);
  }

  // Copy resolvers subdirectory
  const resolversSrcDir = path.join(SELF_MODULE_DIR, "resolvers");
  const resolversDestDir = path.join(underTestModuleDir, "resolvers");
  await mkdir(resolversDestDir, { recursive: true });
  const resolverFiles = [
    "helpers.ts",
    "perception.ts",
    "direction.ts",
    "crystallization.ts",
    "protection.ts",
    "action.ts",
  ];

  for (const file of resolverFiles) {
    const srcPath = path.join(resolversSrcDir, file);
    const destPath = path.join(resolversDestDir, file);
    let content = await readFile(srcPath, "utf8");
    // Fix relative imports from ../types.ts to ../perception.ts
    content = content.replace(/from\s+"\.\.\/types\.ts"/g, 'from "../types.ts"');
    content = content.replace(/from\s+"\.\.\/perception\.ts"/g, 'from "../perception.ts"');
    await writeFile(destPath, content);
  }

  // Provide minimal subagent modules so self.ts can be imported in isolation.
  await writeFile(
    path.join(underTestModuleDir, "subagent.ts"),
    `export function clearSubagentSessions() {}

export function createSubagentState(sessionsDir) {
  return {
    sessionsDir,
    activeCount: 0,
    completedCount: 0,
    maxConcurrent: 5,
    reservedSessionNames: new Set(),
  };
}

export function registerSubagentCommands(pi) {
  pi.registerCommand("subagent-clear", {
    description: "stub",
    handler: async () => {},
  });
  pi.registerCommand("subagent-status", {
    description: "stub",
    handler: async () => {},
  });
}

export function registerSubagentTool(pi, state) {
  pi.registerTool({
    name: "dispatch_subagent",
    label: "Dispatch Subagent (stub)",
    description: "stub",
    parameters: {},
    async execute() {
      return {
        content: [{ type: "text", text: "stub" }],
        details: { status: "done", sessionsDir: state.sessionsDir },
      };
    },
  });
}
`,
  );

  await writeFile(
    path.join(underTestModuleDir, "subagent-dashboard.ts"),
    `export function registerSubagentDashboard() {}
`,
  );

  await writeFile(
    path.join(underTestModuleDir, "subagent-model-selection.ts"),
    `export const DEFAULT_SUBAGENT_MODEL = "openai-codex/gpt-5.4";

export function resolveSubagentModel() {
  return DEFAULT_SUBAGENT_MODEL;
}

export function resolveSubagentModelSelection() {
  return {
    requestedModel: DEFAULT_SUBAGENT_MODEL,
    effectiveModel: DEFAULT_SUBAGENT_MODEL,
    source: "default",
  };
}
`,
  );

  // Update imports in extension to use local modules
  source = source.replace(/from\s+"\.\/self\//g, 'from "./self/');

  await writeFile(underTestPath, source);

  // Import and execute extension
  const moduleUrl = pathToFileURL(underTestPath).href;
  const module = await import(moduleUrl);

  return { tempDir, module, default: module.default };
}

export function createMockContext(overrides = {}) {
  return {
    hasUI: false,
    isIdle: () => true,
    ...overrides,
  };
}

export async function cleanup(tempDir) {
  await rm(tempDir, { recursive: true, force: true });
}
