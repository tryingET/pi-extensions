import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { translatePiPathToWorkspace } from "../src/path-translation.js";

test("translates relative and in-root absolute paths", () => {
  const root = path.resolve("/tmp/project");
  assert.equal(translatePiPathToWorkspace(root, "src/a.ts").toString(), "src/a.ts");
  assert.equal(translatePiPathToWorkspace(root, path.join(root, "src/a.ts")).toString(), "src/a.ts");
  assert.equal(translatePiPathToWorkspace(root, root).toString(), ".");
});

test("rejects absolute paths outside the captured source root and prefix collisions", () => {
  const root = path.resolve("/tmp/project");
  assert.throws(() => translatePiPathToWorkspace(root, "/etc/passwd"), /outside/);
  assert.throws(() => translatePiPathToWorkspace(root, "/tmp/project-other/x"), /outside/);
});
