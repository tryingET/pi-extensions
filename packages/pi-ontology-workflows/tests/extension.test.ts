import assert from "node:assert/strict";
import test from "node:test";
import extension, { parseOntologyManifestCommandArgs } from "../extensions/ontology-workflows.ts";
import { createTempDirectoryWithoutGit } from "./helpers.ts";

function registerExtensionHarness() {
  const tools: string[] = [];
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  const events: string[] = [];

  extension({
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    registerCommand(
      name: string,
      command: { handler: (args: string, ctx: unknown) => Promise<void> },
    ) {
      commands.set(name, command);
    },
    on(event: string) {
      events.push(event);
    },
  } as never);

  return { tools, commands, events };
}

test("extension registers the compact ontology workflow surface", () => {
  const { tools, commands, events } = registerExtensionHarness();

  assert.deepEqual(tools.sort(), ["ontology_change", "ontology_inspect", "ontology_proposal"]);
  assert.deepEqual(
    [...commands.keys()],
    ["ontology-status", "ontology-bootstrap", "ontology-manifest"],
  );
  assert.deepEqual(events.sort(), ["before_agent_start", "session_start", "session_start"]);
});

test("/ontology-manifest help opens usage text", async () => {
  const { commands } = registerExtensionHarness();
  let editorTitle = "";
  let editorText = "";

  await commands.get("ontology-manifest")?.handler("help", {
    cwd: process.cwd(),
    hasUI: true,
    ui: {
      async editor(title: string, text: string) {
        editorTitle = title;
        editorText = text;
      },
      notify() {},
      confirm() {
        throw new Error("confirm should not be called for help");
      },
      setStatus() {},
      setWidget() {},
    },
  });

  assert.equal(editorTitle, "Ontology Manifest");
  assert.match(editorText, /# \/ontology-manifest/);
  assert.match(editorText, /default <profile>/);
});

test("/ontology-manifest fails closed outside git repos", async () => {
  const { commands } = registerExtensionHarness();
  const cwd = await createTempDirectoryWithoutGit();
  let notification = "";
  let level = "";

  await commands.get("ontology-manifest")?.handler("show", {
    cwd,
    hasUI: true,
    ui: {
      notify(text: string, kind: string) {
        notification = text;
        level = kind;
      },
      async editor() {},
      async confirm() {
        return true;
      },
      setStatus() {},
      setWidget() {},
    },
  });

  assert.match(notification, /requires a git repo root/);
  assert.equal(level, "error");
});

test("parseOntologyManifestCommandArgs handles show/help/default/profile/reset forms", () => {
  assert.deepEqual(parseOntologyManifestCommandArgs(""), { kind: "show" });
  assert.deepEqual(parseOntologyManifestCommandArgs("help"), { kind: "help" });
  assert.deepEqual(parseOntologyManifestCommandArgs("show"), { kind: "show" });

  assert.deepEqual(parseOntologyManifestCommandArgs("reset"), {
    kind: "apply",
    request: {
      mode: "apply",
      artifactKind: "manifest",
      operation: "upsert",
      scope: "repo",
    },
  });

  assert.deepEqual(parseOntologyManifestCommandArgs("default review"), {
    kind: "apply",
    request: {
      mode: "apply",
      artifactKind: "manifest",
      operation: "upsert",
      scope: "repo",
      manifestDefaultProfile: "review",
    },
  });

  assert.deepEqual(
    parseOntologyManifestCommandArgs(
      "profile review --include core,company --exclude repo --budget 1600",
    ),
    {
      kind: "apply",
      request: {
        mode: "apply",
        artifactKind: "manifest",
        operation: "upsert",
        scope: "repo",
        manifestProfiles: {
          review: {
            include_layers: ["core", "company"],
            exclude_layers: ["repo"],
            budget: 1600,
          },
        },
      },
    },
  );
});

test("parseOntologyManifestCommandArgs fails clearly on invalid input", () => {
  assert.throws(() => parseOntologyManifestCommandArgs("default"), /requires a profile name/);
  assert.throws(() => parseOntologyManifestCommandArgs("profile"), /requires a profile name/);
  assert.throws(
    () => parseOntologyManifestCommandArgs("profile review --budget nope"),
    /positive integer/,
  );
  assert.throws(
    () => parseOntologyManifestCommandArgs("profile review --wat"),
    /unknown \/ontology-manifest argument/,
  );
});
