import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveNodeHeaders } from "../scripts/task-session-node-headers.mjs";

const headers = ["node_api.h", "node_api_types.h", "js_native_api.h", "js_native_api_types.h"];
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "node-headers-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const execPath = join(root, "node version/bin/node");
  mkdirSync(dirname(execPath), { recursive: true });
  writeFileSync(execPath, "fixture");
  const include = join(root, "node version/include/node");
  const provision = (directory = include) => {
    mkdirSync(directory, { recursive: true });
    for (const name of headers) writeFileSync(join(directory, name), "fixture");
    return directory;
  };
  return { root, execPath, include, provision };
}

test("Node headers follow the actual executable, including symlinks and spaces", (t) => {
  const f = fixture(t);
  f.provision();
  const system = f.provision(join(f.root, "system"));
  const alias = join(f.root, "node-alias");
  symlinkSync(f.execPath, alias);
  assert.equal(
    resolveNodeHeaders({ execPath: alias, env: {}, systemDirectories: [system] }),
    realpathSync(f.include),
  );
});

test("Node headers retain the provisioned system fallback", (t) => {
  const f = fixture(t);
  const system = f.provision(join(f.root, "system"));
  assert.equal(
    resolveNodeHeaders({ execPath: f.execPath, env: {}, systemDirectories: [system] }),
    system,
  );
});

test("explicit Node include paths are validated without falling back", (t) => {
  const f = fixture(t);
  f.provision();
  assert.equal(
    resolveNodeHeaders({ env: { NODE_INCLUDE_DIR: f.include } }),
    realpathSync(f.include),
  );
  for (const override of ["", "relative", join(f.root, "missing")]) {
    assert.throws(
      () => resolveNodeHeaders({ execPath: f.execPath, env: { NODE_INCLUDE_DIR: override } }),
      /node_headers_invalid/,
    );
  }
  rmSync(join(f.include, "node_api_types.h"));
  assert.throws(
    () => resolveNodeHeaders({ env: { NODE_INCLUDE_DIR: f.include } }),
    /node_headers_invalid/,
  );
});

test("missing build headers fail explicitly without download or compiler fallback", (t) => {
  const f = fixture(t);
  assert.throws(
    () => resolveNodeHeaders({ execPath: f.execPath, env: {}, systemDirectories: [] }),
    /node_headers_unavailable/,
  );
  const script = readFileSync(
    new URL("../scripts/task-session-build.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(script, /-I\/usr\/include\/node/);
  assert.ok(
    script.indexOf("resolveNodeHeaders()") < script.indexOf('mkdirSync("dist/task-session"'),
  );
});

test("provisioned headers compile and load the actual native source", (t) => {
  // The native addon is intentionally Linux x64 only.
  if (process.platform !== "linux" || process.arch !== "x64")
    return t.skip("Linux x64 native build only");
  const directory = mkdtempSync(join(tmpdir(), "native build smoke "));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, "custody.node");
  const include = resolveNodeHeaders();
  const built = spawnSync(
    "/usr/bin/cc",
    [
      "-shared",
      "-fPIC",
      "-O2",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-Wno-misleading-indentation",
      "-I",
      include,
      "-DNAPI_VERSION=8",
      "-o",
      output,
      fileURLToPath(new URL("../src/task-session/native.c", import.meta.url)),
    ],
    { encoding: "utf8" },
  );
  assert.equal(built.status, 0, built.stderr);
  const native = createRequire(import.meta.url)(output);
  const lock = join(directory, "lock");
  writeFileSync(lock, "", { mode: 0o600 });
  const handle = native.openMutex(lock);
  try {
    assert.equal(native.tryLock(handle), true);
    native.unlockMutex(handle);
  } finally {
    native.closeMutex(handle);
  }
});
