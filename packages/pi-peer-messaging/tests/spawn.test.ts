// ---
// summary: verifies production launcher declaration and package-relative resolution across npm layouts
// read_when:
//   - changing broker launcher dependencies or installed-package startup
// ---
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { getBrokerLaunchSpec, getTsxCliPath } from "../src/spawn.ts";

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-launch-"));
  const packageRoot = path.join(root, "node_modules/@tryinget/pi-peer-messaging");
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    '{"name":"@tryinget/pi-peer-messaging"}',
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, packageRoot };
}
function loader(parent: string) {
  const root = path.join(parent, "node_modules/tsx");
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "tsx",
      exports: { "./cli": "./dist/cli.mjs" },
    }),
  );
  const cli = path.join(root, "dist/cli.mjs");
  fs.writeFileSync(cli, "// fixture only\n");
  return cli;
}

test("broker loader is a production dependency, not a checkout-only dev dependency", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies?.tsx, "4.23.13");
  assert.equal(manifest.devDependencies.tsx, undefined);
});
for (const layout of ["nested", "hoisted"] as const) {
  test(`broker resolves the supported tsx/cli export in a ${layout} installation`, (t) => {
    const { root, packageRoot } = fixture(t);
    const expected = loader(layout === "nested" ? packageRoot : root);
    assert.equal(getTsxCliPath(packageRoot), expected);
    const direct = getBrokerLaunchSpec({
      runtimeDir: root,
      packageRoot,
      platform: "linux",
      nodePath: "/node",
    });
    assert.deepEqual(direct, {
      kind: "direct",
      command: "/node",
      args: [expected, path.join(packageRoot, "src/broker-entry.ts")],
    });
    const windows = getBrokerLaunchSpec({
      runtimeDir: root,
      packageRoot,
      platform: "win32",
      nodePath: "C:/node path/node.exe",
    });
    assert.equal(windows.kind, "windows-launcher");
    if (windows.kind === "windows-launcher") {
      assert.equal(windows.command, "wscript.exe");
      assert.equal(
        windows.launcherCommandLine,
        `"C:/node path/node.exe" "${expected}" "${path.join(packageRoot, "src/broker-entry.ts")}"`,
      );
    }
  });
}
test("nearest installed dependency wins over a hoisted version", (t) => {
  const { root, packageRoot } = fixture(t);
  loader(root);
  const nested = loader(packageRoot);
  assert.equal(getTsxCliPath(packageRoot), nested);
});
test("missing launcher fails during resolution rather than returning a nonexistent file", (t) => {
  const { packageRoot } = fixture(t);
  assert.throws(() => getTsxCliPath(packageRoot), /Cannot find module.*tsx\/cli/);
});
