// summary: Verifies narrow activation, compatibility exports, synchronous registration, and manual dispatch.
// read_when:
//   - Changing the input-trigger activation entrypoint or dependency boundaries.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TriggerEditor } from "@tryinget/pi-editor-registry";
import interactionExtension, {
  getBroker,
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  registerPickerInteraction,
  resetBroker,
  runFzfProbe,
  selectFuzzyCandidate,
  splitQueryAndContext,
} from "../extensions/input-triggers.ts";
import registerInteractionExtension from "../extensions/register-input-triggers.ts";
import interactionPackageExtension, * as interactionPackage from "../index.ts";

const FACADE_SOURCE = readFileSync(
  new URL("../extensions/input-triggers.ts", import.meta.url),
  "utf8",
);
const REGISTRATION_SOURCE = readFileSync(
  new URL("../extensions/register-input-triggers.ts", import.meta.url),
  "utf8",
);
const PACKAGE_JSON = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".ts"))) {
      files.push(fullPath);
    }
  }

  return files;
}

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("Pi activates the narrow registration entrypoint while publishing the compatibility facade", () => {
  assert.deepEqual(PACKAGE_JSON.pi.extensions, ["./extensions/register-input-triggers.ts"]);
  assert.ok(PACKAGE_JSON.files.includes("extensions/register-input-triggers.ts"));
  assert.ok(PACKAGE_JSON.files.includes("extensions/input-triggers.ts"));
});

test("narrow activation keeps editor construction static and imports only the broker subpath", () => {
  assert.match(REGISTRATION_SOURCE, /from\s+"@tryinget\/pi-editor-registry"/);
  assert.match(
    REGISTRATION_SOURCE,
    /import\s+\{\s*getBroker\s*\}\s+from\s+"@tryinget\/pi-trigger-adapter\/broker"/,
  );
  assert.match(REGISTRATION_SOURCE, /new\s+TriggerEditor\(/);
  assert.doesNotMatch(REGISTRATION_SOURCE, /import\s*\(/);
  assert.doesNotMatch(REGISTRATION_SOURCE, /@tryinget\/pi-interaction-kit/);
  assert.doesNotMatch(REGISTRATION_SOURCE, /from\s+"@tryinget\/pi-trigger-adapter"/);
});

test("fresh-process activation excludes picker, schema, and interaction-kit modules", () => {
  const loaderPath = fileURLToPath(new URL("./module-trace-loader.mjs", import.meta.url));
  const registrationUrl = new URL("../extensions/register-input-triggers.ts", import.meta.url).href;
  const traceDir = mkdtempSync(join(tmpdir(), "pi-interaction-module-trace-"));
  const tracePath = join(traceDir, "modules.txt");

  try {
    const child = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        "--experimental-strip-types",
        "--experimental-loader",
        loaderPath,
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(registrationUrl)})`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PI_INTERACTION_MODULE_TRACE: tracePath },
      },
    );

    assert.equal(child.status, 0, child.stderr || child.stdout);
    const loadedModules = readFileSync(tracePath, "utf8").trim().split("\n");

    assert.ok(loadedModules.some((url) => url.endsWith("/register-input-triggers.ts")));
    assert.ok(loadedModules.some((url) => url.endsWith("/pi-trigger-adapter/broker.js")));
    assert.ok(
      loadedModules.some((url) => url.endsWith("/pi-trigger-adapter/src/TriggerBroker.js")),
    );
    for (const excluded of [
      "/pi-trigger-adapter/index.js",
      "/pi-trigger-adapter/src/register.js",
      "/pi-trigger-adapter/src/schemas.js",
      "/pi-interaction-kit/",
    ]) {
      assert.ok(
        !loadedModules.some((url) => url.includes(excluded)),
        `activation unexpectedly loaded ${excluded}`,
      );
    }
  } finally {
    rmSync(traceDir, { recursive: true, force: true });
  }
});

test("historical facade preserves all helper exports and default registration", () => {
  assert.equal(interactionExtension, registerInteractionExtension);
  for (const helper of [
    getBroker,
    rankCandidatesFallback,
    rankCandidatesWithFzf,
    registerPickerInteraction,
    resetBroker,
    runFzfProbe,
    selectFuzzyCandidate,
    splitQueryAndContext,
  ]) {
    assert.equal(typeof helper, "function");
  }

  assert.match(FACADE_SOURCE, /from\s+"@tryinget\/pi-trigger-adapter"/);
  assert.match(FACADE_SOURCE, /from\s+"@tryinget\/pi-interaction-kit"/);
});

test("package root preserves the composed public export surface", () => {
  assert.equal(typeof interactionPackageExtension, "function");
  for (const name of [
    "createEditorRegistry",
    "createInteractionRuntime",
    "getBroker",
    "getInteractionRuntime",
    "rankCandidatesFallback",
    "rankCandidatesWithFzf",
    "registerPickerInteraction",
    "resetBroker",
    "resetInteractionRuntime",
    "runFzfProbe",
    "selectFuzzyCandidate",
    "splitQueryAndContext",
  ]) {
    assert.equal(typeof interactionPackage[name], "function", name);
  }
});

test("registration synchronously installs all six commands and both built-in triggers", () => {
  const previousExamples = process.env.PI_INTERACTION_EXAMPLES;
  delete process.env.PI_INTERACTION_EXAMPLES;
  resetBroker();

  try {
    const commands = new Map();
    const events = new Map();
    registerInteractionExtension({
      on(name, handler) {
        events.set(name, handler);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
    });

    assert.deepEqual(
      [...commands.keys()],
      [
        "triggers",
        "trigger-enable",
        "trigger-disable",
        "trigger-diag",
        "trigger-pick",
        "trigger-reload",
      ],
    );
    assert.equal(typeof events.get("session_start"), "function");
    assert.deepEqual(
      getBroker()
        .list()
        .map((trigger) => trigger.id),
      ["bash-command-picker", "file-picker"],
    );
  } finally {
    resetBroker();
    restoreEnv("PI_INTERACTION_EXAMPLES", previousExamples);
  }
});

test("session start mounts a statically imported TriggerEditor on first factory use", async () => {
  const previousExamples = process.env.PI_INTERACTION_EXAMPLES;
  process.env.PI_INTERACTION_EXAMPLES = "0";
  resetBroker();

  try {
    const events = new Map();
    registerInteractionExtension({
      on(name, handler) {
        events.set(name, handler);
      },
      registerCommand() {},
    });

    let editorFactory;
    const notifications = [];
    await events.get("session_start")(
      {},
      {
        hasUI: true,
        cwd: process.cwd(),
        ui: {
          setEditorComponent(factory) {
            editorFactory = factory;
          },
          notify(message, level) {
            notifications.push({ message, level });
          },
        },
      },
    );

    assert.equal(typeof editorFactory, "function");
    const editor = editorFactory({}, {}, {});
    assert.ok(editor instanceof TriggerEditor);
    assert.strictEqual(editor.broker, getBroker());
    assert.deepEqual(notifications, [{ message: "Interaction runtime enabled", level: "info" }]);
  } finally {
    resetBroker();
    restoreEnv("PI_INTERACTION_EXAMPLES", previousExamples);
  }
});

test("built-in example triggers do not own PTX's canonical $$ slash surface", () => {
  assert.doesNotMatch(REGISTRATION_SOURCE, /id:\s*"ptx-template-picker"/);
  assert.doesNotMatch(
    REGISTRATION_SOURCE,
    /description:\s*"Show prompt-template picker while typing \$\$ \/<query>"/,
  );
});

test("/trigger-pick invokes the selected registered trigger through broker semantics", async () => {
  const previousExamples = process.env.PI_INTERACTION_EXAMPLES;
  process.env.PI_INTERACTION_EXAMPLES = "0";
  resetBroker();

  try {
    const broker = getBroker();
    broker.register({
      id: "behavioral-picker",
      description: "Behavioral picker test",
      match: "never-needed-for-manual-dispatch",
      debounceMs: 0,
      showInPicker: true,
      pickerLabel: "Behavioral picker",
      handler: async (_match, context, api) => {
        assert.equal(context.isLive, false);
        api.setText("trigger handler actually ran");
      },
    });

    const commands = new Map();
    interactionExtension({
      on() {},
      registerCommand(name, command) {
        commands.set(name, command);
      },
    });

    let editorText = "original editor text";
    const notifications = [];
    await commands.get("trigger-pick").handler("", {
      hasUI: true,
      cwd: process.cwd(),
      ui: {
        async select(_title, options) {
          return options.find((option) => option.startsWith("Behavioral picker"));
        },
        setEditorText(text) {
          editorText = text;
        },
        getEditorText() {
          return editorText;
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
        async confirm() {
          return false;
        },
        async input() {
          return undefined;
        },
      },
    });

    assert.equal(editorText, "trigger handler actually ran");
    assert.equal(broker.diagnostics()[0].fireCount, 1);
    assert.deepEqual(notifications.at(-1), {
      message: "Triggered: behavioral-picker",
      level: "info",
    });
  } finally {
    resetBroker();
    restoreEnv("PI_INTERACTION_EXAMPLES", previousExamples);
  }
});

test("source files do not import vault-client internals via relative source paths", () => {
  const roots = [
    new URL("../index.ts", import.meta.url),
    ...collectSourceFiles(new URL("../extensions", import.meta.url).pathname).map(
      (path) => new URL(`file://${path}`),
    ),
    ...collectSourceFiles(new URL("../src", import.meta.url).pathname).map(
      (path) => new URL(`file://${path}`),
    ),
  ];

  const disallowed =
    /(?:from|import\()\s*["'][^"']*vault-client\/(?:src|dist\/src|packages\/[^"']*\/src)/;

  for (const fileUrl of roots) {
    const source = readFileSync(fileUrl, "utf8");
    assert.doesNotMatch(
      source,
      disallowed,
      `disallowed vault-client internal import in ${fileUrl}`,
    );
  }
});
