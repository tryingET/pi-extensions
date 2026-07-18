import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const compiler = path.join(packageRoot, "node_modules", "typescript", "bin", "tsc");
const fixture = path.join(packageRoot, "tests", `.public-declaration-consumer-${process.pid}.ts`);

test("strict public consumers do not resolve into private vault implementation TypeScript", () => {
  writeFileSync(
    fixture,
    `import type { VaultDispatchRuntime } from "@tryinget/pi-vault-client/dispatch-runtime";
import type { VaultPromptPlaneRuntime } from "@tryinget/pi-vault-client/prompt-plane";

declare const dispatchRuntime: VaultDispatchRuntime;
declare const promptPlaneRuntime: VaultPromptPlaneRuntime;
void dispatchRuntime;
void promptPlaneRuntime;
`,
    "utf8",
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        compiler,
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "false",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--target",
        "ES2023",
        "--types",
        "node",
        "--pretty",
        "false",
        "--listFiles",
        fixture,
      ],
      { cwd: packageRoot, encoding: "utf8" },
    );
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.match(output, /src\/promptPlane\.d\.ts/);
    assert.match(output, /src\/dispatchRuntime\.d\.ts/);
    assert.match(output, /src\/vaultTypes\.d\.ts/);

    const privateImplementationSources = output
      .split(/\r?\n/u)
      .filter((line) => line.startsWith(path.join(packageRoot, "src", path.sep)))
      .filter((line) => line.endsWith(".ts") && !line.endsWith(".d.ts"));
    assert.deepEqual(privateImplementationSources, []);
  } finally {
    rmSync(fixture, { force: true });
  }
});
