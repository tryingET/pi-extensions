// ---
// summary: "verifies learned surface-to-window memory, its invalidation, and Niri-instance-bound persistence"
// read_when:
//   - "changing hidden-tab placement memory or its persistence rules"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  bindingKeysFor,
  createSurfaceBindingStore,
  parseTerminalTitleBinding,
  SURFACE_BINDINGS_SCHEMA,
  sessionBindingKey,
} from "../src/common/surface-bindings.mjs";

const token = "019fa4d071427fb48d30f98e951f0513";
const ghostty = (id, title, pid = 4000, app_id = "com.mitchellh.ghostty") => ({
  id,
  title,
  pid,
  app_id,
  workspace_id: 2,
});

function memoryFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    readFileSync: (filePath) => {
      if (!files.has(filePath)) throw new Error("ENOENT");
      return files.get(filePath);
    },
    writeFileSync: (filePath, content) => files.set(filePath, String(content)),
    renameSync: (from, to) => {
      files.set(to, files.get(from));
      files.delete(from);
    },
    mkdirSync: () => {},
    unlinkSync: (filePath) => files.delete(filePath),
  };
}

test("title binding parsing accepts only the canonical surface segment before a full token", () => {
  assert.deepEqual(parseTerminalTitleBinding(`π - dspx · gs:main:0x10 · ${token}`), null);
  assert.deepEqual(parseTerminalTitleBinding(`π - dspx · gs:main:16 · ${token}`), {
    family: "main",
    surfaceId: "16",
    sessionToken: token,
    terminalKey: "ghostty:main:16",
    sessionKey: `pi-session:${token}`,
  });
  assert.deepEqual(bindingKeysFor(parseTerminalTitleBinding(`x · gs:main:16 · ${token}`)), [
    "ghostty:main:16",
    `pi-session:${token}`,
  ]);
  assert.deepEqual(bindingKeysFor(null), []);
  assert.equal(sessionBindingKey(token.toUpperCase()), `pi-session:${token}`);
  assert.equal(sessionBindingKey("short"), "");
  assert.equal(parseTerminalTitleBinding(`π - dspx · gs:main:16 · ${token.slice(0, 8)}`), null);
  assert.equal(parseTerminalTitleBinding("π - dspx · 019fa4d071427fb48d30f98e951f0513"), null);
  assert.equal(parseTerminalTitleBinding(`gs:main:18446744073709551616 · ${token}`), null);
});

test("bindings learn from visible titles, follow surfaces across windows, and prune dead windows", () => {
  let now = 1000;
  const store = createSurfaceBindingStore({ instanceKey: "niri-a", now: () => now });
  const visible = ghostty(44, `π - dspx · gs:main:16 · ${token}`);
  assert.deepEqual(store.observeWindows([visible, ghostty(45, "plain shell")]), [
    "ghostty:main:16",
    `pi-session:${token}`,
  ]);
  assert.deepEqual(store.lookup("ghostty:main:16"), {
    windowId: 44,
    windowPid: 4000,
    appId: "com.mitchellh.ghostty",
    observedAt: 1000,
  });
  assert.deepEqual(store.observeWindows([visible]), [], "an unchanged binding is not re-learned");

  now = 2000;
  assert.deepEqual(store.observeWindows([ghostty(45, visible.title)]), [
    "ghostty:main:16",
    `pi-session:${token}`,
  ]);
  assert.equal(store.lookup("ghostty:main:16")?.windowId, 45, "the latest window wins");
  assert.equal(
    store.lookup(`pi-session:${token}`)?.windowId,
    45,
    "the session token is remembered alongside the drifting surface id",
  );

  assert.deepEqual(
    store.observeWindows([ghostty(46, `π - other · gs:legacy:17 · ${token}`)]),
    [],
    "a family/app-id mismatch never binds",
  );
  assert.deepEqual(
    store.observeWindows([
      ghostty(46, `π - other · gs:legacy:17 · ${token}`, 4001, "com.tryinget.ghosttysidequest"),
    ]),
    ["ghostty:legacy:17", `pi-session:${token}`],
  );
  assert.equal(store.size, 3);

  assert.deepEqual(store.prune([]), [], "an empty observation never prunes");
  assert.deepEqual(
    store.prune([ghostty(45, "now a shell tab"), ghostty(46, "x", 4002)]).sort(),
    ["ghostty:legacy:17", `pi-session:${token}`].sort(),
  );
  assert.equal(store.lookup("ghostty:main:16")?.windowId, 45);
  assert.deepEqual(store.prune([ghostty(99, "unrelated")]), ["ghostty:main:16"]);
  assert.equal(store.size, 0);
});

test("bindings persist atomically and reload only for the same Niri instance", () => {
  const fs = memoryFs();
  const filePath = "/state/pi-activity-strip/surface-bindings.json";
  const store = createSurfaceBindingStore({ instanceKey: "niri-a", filePath, fs, now: () => 5 });
  assert.equal(store.persist(), false, "nothing dirty means no write");
  store.observeWindows([ghostty(44, `π - dspx · gs:main:16 · ${token}`)]);
  assert.equal(store.persist(), true);
  assert.equal(store.persist(), false);
  assert.deepEqual([...fs.files.keys()], [filePath]);
  const saved = JSON.parse(fs.files.get(filePath));
  assert.equal(saved.schema, SURFACE_BINDINGS_SCHEMA);
  assert.equal(saved.instanceKey, "niri-a");
  assert.equal(saved.bindings["ghostty:main:16"].windowId, 44);
  assert.equal(saved.bindings[`pi-session:${token}`].windowId, 44);

  const reloaded = createSurfaceBindingStore({ instanceKey: "niri-a", filePath, fs });
  assert.equal(reloaded.lookup("ghostty:main:16")?.windowId, 44);
  const otherInstance = createSurfaceBindingStore({ instanceKey: "niri-b", filePath, fs });
  assert.equal(otherInstance.size, 0, "window ids from another compositor run are never reused");

  fs.files.set(filePath, "{not json");
  assert.equal(createSurfaceBindingStore({ instanceKey: "niri-a", filePath, fs }).size, 0);
  fs.files.set(
    filePath,
    JSON.stringify({
      schema: SURFACE_BINDINGS_SCHEMA,
      instanceKey: "niri-a",
      bindings: { "ghostty:main:1": { windowId: "44", windowPid: 4000, appId: "x" } },
    }),
  );
  assert.equal(
    createSurfaceBindingStore({ instanceKey: "niri-a", filePath, fs }).size,
    0,
    "malformed entries are dropped",
  );
  fs.files.delete(filePath);

  const failing = {
    ...fs,
    renameSync: () => {},
    writeFileSync: () => {
      throw new Error("EACCES");
    },
  };
  const unwritable = createSurfaceBindingStore({ instanceKey: "niri-a", filePath, fs: failing });
  unwritable.observeWindows([ghostty(44, `π - dspx · gs:main:16 · ${token}`)]);
  assert.equal(unwritable.persist(), false);
});
