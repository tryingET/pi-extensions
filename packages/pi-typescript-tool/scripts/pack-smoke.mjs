// Provider-free test of the real tarball; no Pi session, settings, installation or network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), "pi-typescript-pack-"));
try {
  execFileSync("tar", ["-xzf", resolve(process.argv[2]), "-C", scratch]);
  const root = join(scratch, "package");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.private, true);
  assert.equal(pkg["x-pi-template"].releaseConfigMode, "none");
  assert.deepEqual(pkg.dependencies, { typescript: "6.0.3" });
  assert.equal(pkg.peerDependencies.typebox, "*");
  assert.match(await readFile(join(root, "NOTICE"), "utf8"), /Carlos Villela/);
  assert.match(
    await readFile(join(root, "external/LICENSE-Apache-2.0.txt"), "utf8"),
    /Apache License/,
  );
  // Only declared production dependencies + host-supplied typebox are available
  // from the extracted artifact. No blanket node_modules link hides missing files.
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(root, "node_modules"));
  for (const dependency of ["typescript", "typebox"]) {
    await symlink(
      join(packageRoot, "node_modules", dependency),
      join(root, "node_modules", dependency),
      "dir",
    );
  }
  const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false });
  const factory = await jiti.import(join(root, pkg.pi.extensions[0]), { default: true });
  const tools = [];
  factory({ registerTool: (tool) => tools.push(tool) });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "typescript");
  const ctx = { cwd: root };
  const result = await tools[0].execute(
    "pack",
    {
      code: 'async ({fs}) => (await fs.read("package.json", 1024)).includes("@tryinget/pi-typescript-tool")',
    },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(result.content[0].text, "true");
  assert.deepEqual(result.details, { kind: "program" });
  await assert.rejects(
    tools[0].execute(
      "pack-error",
      { code: 'async ({fs}) => fs.write("x", "y")' },
      undefined,
      undefined,
      ctx,
    ),
    /validation failed/,
  );
  for (const code of [
    "(() => 42) satisfies ToolProgram",
    "(() => 42) as ToolProgram",
    "(() => 42)!",
    "() => { let calls = 0; function mark(_value: Function) { calls++; } @mark class Answer { value = 41; } return new Answer().value + calls; }",
  ]) {
    const transformed = await tools[0].execute(
      "pack-transform",
      { code },
      undefined,
      undefined,
      ctx,
    );
    assert.deepEqual(transformed.content, [{ type: "text", text: "42" }]);
    assert.deepEqual(transformed.details, { kind: "program" });
  }
  await assert.rejects(
    tools[0].execute(
      "pack-wrapper-error",
      { code: "(() => 42) satisfies () => string" },
      undefined,
      undefined,
      ctx,
    ),
    /validation failed/,
  );
  await writeFile(join(root, "large.txt"), "é".repeat(20000));
  const prefix = await tools[0].execute(
    "pack-default-read",
    { code: 'async ({fs}) => fs.read("large.txt")' },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(prefix.content[0].text, "é".repeat(8000).concat("\n… truncated"));
  assert.ok(Buffer.byteLength(prefix.content[0].text, "utf8") <= 16384);
  console.log(
    "Pack smoke: 9 checks passed (load, fs execution, gate rejection, 4 transforms, wrapper typing, default read); provider-free, no live Pi verification.",
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
