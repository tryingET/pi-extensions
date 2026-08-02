// summary: "Tests snapshot-edit extension registration, overrides, ownership guards, and legacy-call failures."
// read_when:
//   - "Changing snapshot-edit tool registration, override semantics, or argument preparation."

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import snapshotEditExtension from "../extensions/snapshot-edit.ts";

function createMockPi({
  readOwner = "builtin",
  editOwner = "builtin",
  includeRead = true,
  includeEdit = true,
  initialActiveTools = ["read", "edit"],
  flagEnabled = false,
} = {}) {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  const flags = new Map();
  const catalog = new Map();
  if (includeRead) {
    catalog.set("read", {
      name: "read",
      sourceInfo: { source: readOwner, path: `<${readOwner}:read>` },
    });
  }
  if (includeEdit) {
    catalog.set("edit", {
      name: "edit",
      sourceInfo: { source: editOwner, path: `<${editOwner}:edit>` },
    });
  }
  let activeTools = [...initialActiveTools];
  const api = {
    registerTool(tool) {
      tools.set(tool.name, tool);
      catalog.set(tool.name, {
        name: tool.name,
        sourceInfo: { source: "pi-snapshot-edit", path: "extensions/snapshot-edit.ts" },
      });
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerFlag(name, flag) {
      flags.set(name, flag);
    },
    getFlag() {
      return flagEnabled;
    },
    getAllTools() {
      return [...catalog.values()];
    },
    getActiveTools() {
      return [...activeTools];
    },
    setActiveTools(next) {
      activeTools = [...next];
    },
    on(name, handler) {
      handlers.set(name, handler);
    },
  };
  return { api, tools, commands, handlers, flags, getActiveTools: () => activeTools };
}

async function withOverrideEnv(value, operation) {
  const previous = process.env.PI_SNAPSHOT_EDIT_OVERRIDE;
  if (value === undefined) delete process.env.PI_SNAPSHOT_EDIT_OVERRIDE;
  else process.env.PI_SNAPSHOT_EDIT_OVERRIDE = value;
  try {
    await operation();
  } finally {
    if (previous === undefined) delete process.env.PI_SNAPSHOT_EDIT_OVERRIDE;
    else process.env.PI_SNAPSHOT_EDIT_OVERRIDE = previous;
  }
}

test("extension registers host-compatible namespaced tools and edits duplicate lines", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);

  assert.deepEqual([...pi.tools.keys()], ["snapshot_read", "snapshot_edit"]);
  assert.equal(pi.commands.has("snapshot-edit"), true);
  assert.equal(pi.flags.has("snapshot-edit-override"), true);
  assert.equal(pi.handlers.has("session_shutdown"), true);
  assert.match(pi.tools.get("snapshot_edit").promptSnippet, /exact-selector edits/);

  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-extension-"));
  const path = join(directory, "duplicate.txt");
  await writeFile(path, "same\nsame\n", "utf8");
  const context = { cwd: directory };
  try {
    const readResult = await pi.tools
      .get("snapshot_read")
      .execute("read-call", { path: "duplicate.txt" }, undefined, undefined, context);
    const base = readResult.details.revision;
    assert.equal(base, "amber");

    const editResult = await pi.tools.get("snapshot_edit").execute(
      "edit-call",
      {
        path: "duplicate.txt",
        base,
        edits: [{ op: "replace", oldText: "same", occurrence: 2, newText: "changed" }],
      },
      undefined,
      undefined,
      context,
    );
    assert.equal(editResult.details.baseRevision, "amber");
    const preview = editResult.content[0].text;
    assert.match(preview, /revision:apple\nsame\nchanged\n/);
    assert.doesNotMatch(preview, /\d+│/u);
    assert.equal(await readFile(path, "utf8"), "same\nchanged\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("explicit override command replaces standard names and preserves snapshot semantics", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);
  await pi.commands.get("snapshot-edit").handler("override", { hasUI: false });

  assert.deepEqual([...pi.tools.keys()], ["snapshot_read", "snapshot_edit", "read", "edit"]);
  assert.deepEqual(pi.getActiveTools(), ["read", "edit"]);
  assert.equal(typeof pi.tools.get("read").renderResult, "function");
  assert.equal(typeof pi.tools.get("edit").renderResult, "function");

  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-override-"));
  const path = join(directory, "duplicate.txt");
  await writeFile(path, "repeat\nrepeat\n", "utf8");
  const context = { cwd: directory };
  try {
    const readResult = await pi.tools
      .get("read")
      .execute("standard-read", { path: "duplicate.txt" }, undefined, undefined, context);
    const editArguments = {
      path: "duplicate.txt",
      base: readResult.details.revision,
      edits: [{ op: "replace", oldText: "repeat", occurrence: 2, newText: "selected" }],
    };
    const prepared = pi.tools.get("edit").prepareArguments(editArguments);
    assert.deepEqual(prepared, editArguments);
    await pi.tools.get("edit").execute("standard-edit", prepared, undefined, undefined, context);
    assert.equal(await readFile(path, "utf8"), "repeat\nselected\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("standard read override fails closed for images instead of bypassing host authority", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);
  await pi.commands.get("snapshot-edit").handler("override", { hasUI: false });
  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-image-"));
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(join(directory, "pixel.png"), png);
  try {
    await assert.rejects(
      pi.tools
        .get("read")
        .execute("image-read", { path: "pixel.png" }, undefined, undefined, { cwd: directory }),
      /Binary file is not supported/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("default startup replaces standard tools while preserving host active-tool selection", async () => {
  await withOverrideEnv(undefined, async () => {
    const pi = createMockPi({ initialActiveTools: ["bash", "snapshot_read"] });
    snapshotEditExtension(pi.api);
    assert.equal(pi.tools.has("read"), false);
    await pi.handlers.get("session_start")();
    assert.equal(pi.tools.has("read"), true);
    assert.equal(pi.tools.has("edit"), true);
    assert.deepEqual(pi.getActiveTools(), ["bash", "snapshot_read"]);
  });
});

test("legacy explicit enable surfaces may activate standard tools", async (t) => {
  await t.test("environment", async () => {
    await withOverrideEnv("1", async () => {
      const pi = createMockPi({ initialActiveTools: ["bash"] });
      snapshotEditExtension(pi.api);
      await pi.handlers.get("session_start")();
      assert.deepEqual(pi.getActiveTools(), ["bash", "read", "edit"]);
    });
  });
  await t.test("flag", async () => {
    await withOverrideEnv(undefined, async () => {
      const pi = createMockPi({ initialActiveTools: ["bash"], flagEnabled: true });
      snapshotEditExtension(pi.api);
      await pi.handlers.get("session_start")();
      assert.deepEqual(pi.getActiveTools(), ["bash", "read", "edit"]);
    });
  });
  await t.test("command after default startup", async () => {
    await withOverrideEnv(undefined, async () => {
      const pi = createMockPi({ initialActiveTools: ["bash"] });
      snapshotEditExtension(pi.api);
      await pi.handlers.get("session_start")();
      assert.deepEqual(pi.getActiveTools(), ["bash"]);
      await pi.commands.get("snapshot-edit").handler("override", { hasUI: false });
      assert.deepEqual(pi.getActiveTools(), ["bash", "read", "edit"]);
    });
  });
});

test("documented environment opt-outs retain namespaced-only tools", async (t) => {
  for (const value of ["0", "false", "off", "no"]) {
    await t.test(value, async () => {
      await withOverrideEnv(value, async () => {
        const pi = createMockPi();
        snapshotEditExtension(pi.api);
        await pi.handlers.get("session_start")();
        assert.deepEqual([...pi.tools.keys()], ["snapshot_read", "snapshot_edit"]);
      });
    });
  }
});

test("default override refuses non-built-in read and edit owners", async (t) => {
  for (const name of ["read", "edit"]) {
    await t.test(name, async () => {
      await withOverrideEnv(undefined, async () => {
        const pi = createMockPi({ [`${name}Owner`]: "ssh-extension" });
        snapshotEditExtension(pi.api);
        await assert.rejects(
          pi.handlers.get("session_start")(),
          new RegExp(`non-built-in owners.*${name}:ssh-extension`),
        );
        assert.equal(pi.tools.has("read"), false);
        assert.equal(pi.tools.has("edit"), false);
      });
    });
  }
});

test("default startup stays namespaced-only when host selection omits a built-in owner", async (t) => {
  for (const name of ["read", "edit"]) {
    await t.test(name, async () => {
      await withOverrideEnv(undefined, async () => {
        const pi = createMockPi({ [`include${name[0].toUpperCase()}${name.slice(1)}`]: false });
        snapshotEditExtension(pi.api);
        await pi.handlers.get("session_start")();
        assert.deepEqual([...pi.tools.keys()], ["snapshot_read", "snapshot_edit"]);
      });
    });
  }
});

test("explicit override still refuses a missing built-in owner", async (t) => {
  for (const name of ["read", "edit"]) {
    const options = { [`include${name[0].toUpperCase()}${name.slice(1)}`]: false };
    const expected = new RegExp(`positively identified built-in ${name} owner`);

    await t.test(`${name}: environment`, async () => {
      await withOverrideEnv("1", async () => {
        const pi = createMockPi(options);
        snapshotEditExtension(pi.api);
        await assert.rejects(pi.handlers.get("session_start")(), expected);
      });
    });
    await t.test(`${name}: flag`, async () => {
      await withOverrideEnv(undefined, async () => {
        const pi = createMockPi({ ...options, flagEnabled: true });
        snapshotEditExtension(pi.api);
        await assert.rejects(pi.handlers.get("session_start")(), expected);
      });
    });
    await t.test(`${name}: command`, async () => {
      const pi = createMockPi(options);
      snapshotEditExtension(pi.api);
      await assert.rejects(
        pi.commands.get("snapshot-edit").handler("override", { hasUI: false }),
        expected,
      );
    });
  }
});

test("nested Protocol B oldText survives preparation", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);
  await pi.commands.get("snapshot-edit").handler("override", { hasUI: false });
  const editTool = pi.tools.get("edit");
  const current = {
    path: "example.ts",
    base: "amber",
    edits: [{ op: "replace", oldText: "duplicate", occurrence: 2, newText: "changed" }],
  };
  assert.deepEqual(editTool.prepareArguments(current), current);
});

test("top-level legacy and resumed line-coordinate calls get precise reread guidance", async () => {
  const pi = createMockPi();
  snapshotEditExtension(pi.api);
  await pi.commands.get("snapshot-edit").handler("override", { hasUI: false });
  const editTool = pi.tools.get("edit");
  for (const [input, pattern] of [
    [{ path: "example.ts", oldText: "old", newText: "new" }, /resumed top-level.*Call read again/],
    [
      {
        path: "example.ts",
        base: "amber",
        edits: [{ op: "replace", startLine: 1, endLine: 1, newText: "new" }],
      },
      /retired line coordinates.*Call read again/,
    ],
  ]) {
    const prepared = editTool.prepareArguments(input);
    await assert.rejects(
      editTool.execute("legacy", prepared, undefined, undefined, { cwd: process.cwd() }),
      pattern,
    );
  }
});
