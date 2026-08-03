// summary: Verifies extension package boundaries, exports, and manual trigger dispatch behavior.
// read_when:
//   - Changing the input-trigger entrypoint or dependency boundaries.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import interactionExtension, { getBroker, resetBroker } from "../extensions/input-triggers.ts";

const SOURCE = readFileSync(new URL("../extensions/input-triggers.ts", import.meta.url), "utf8");

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

test("extension entrypoint imports split package surfaces", () => {
  assert.match(SOURCE, /from\s+"@tryinget\/pi-editor-registry"/);
  assert.match(SOURCE, /from\s+"@tryinget\/pi-trigger-adapter"/);
  assert.match(SOURCE, /from\s+"@tryinget\/pi-interaction-kit"/);
});

test("extension entrypoint re-exports helper primitives without duplicates", () => {
  assert.match(SOURCE, /registerPickerInteraction/);
  assert.match(SOURCE, /rankCandidatesWithFzf/);
  assert.match(SOURCE, /selectFuzzyCandidate/);
  assert.match(SOURCE, /splitQueryAndContext/);
  assert.doesNotMatch(SOURCE, /getBroker\s*,\s*getBroker/);
  assert.doesNotMatch(SOURCE, /resetBroker\s*,\s*resetBroker/);
});

test("built-in example triggers do not own PTX's canonical $$ slash surface", () => {
  assert.doesNotMatch(SOURCE, /id:\s*"ptx-template-picker"/);
  assert.doesNotMatch(
    SOURCE,
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
    if (previousExamples === undefined) delete process.env.PI_INTERACTION_EXAMPLES;
    else process.env.PI_INTERACTION_EXAMPLES = previousExamples;
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
