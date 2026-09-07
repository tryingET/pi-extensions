import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

for (const mutation of [
  "approved",
  "compat-redirect",
  "main-redirect",
  "legacy-main-outside",
  "add-mjs",
  "add-cjs",
  "source-tamper",
  "nested-dependency",
]) {
  test(`I02 isolated SDK package integrity: ${mutation}`, () => {
    const root = mkdtempSync(join(tmpdir(), "task5480-sdk-resolution-"));
    try {
      writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
      for (const pkg of ["pi-ai", "pi-coding-agent", "pi-agent-core", "pi-tui"]) {
        const name = `@earendil-works/${pkg}`;
        const source = dirname(dirname(fileURLToPath(import.meta.resolve(name))));
        cpSync(source, join(root, "node_modules", name), {
          recursive: true,
          filter: (s) => !relative(source, s).split(sep).includes("node_modules"),
        });
      }
      mkdirSync(join(root, "probe"));
      for (const f of ["identity.js", "json.js"])
        cpSync(
          fileURLToPath(new URL(`../dist/task-session/${f}`, import.meta.url)),
          join(root, "probe", f),
        );
      const ai = join(root, "node_modules/@earendil-works/pi-ai"),
        manifestPath = join(ai, "package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const approvedCompat = readFileSync(join(ai, "dist/compat.js"));
      const marker = join(root, "unreviewed-executed");
      const newCode = `import {writeFileSync} from "node:fs";writeFileSync(${JSON.stringify(marker)},"bad");`;
      if (mutation.endsWith("redirect")) {
        writeFileSync(join(ai, "dist/unreviewed.mjs"), newCode);
        manifest.exports[mutation === "compat-redirect" ? "./compat" : "."].import =
          "./dist/unreviewed.mjs";
        writeFileSync(manifestPath, JSON.stringify(manifest));
        assert.equal(JSON.parse(readFileSync(manifestPath, "utf8")).version, "0.84.4");
        assert.deepEqual(readFileSync(join(ai, "dist/compat.js")), approvedCompat);
      } else if (mutation === "legacy-main-outside") {
        const path = join(root, "node_modules/@earendil-works/pi-tui/package.json");
        const metadata = JSON.parse(readFileSync(path, "utf8"));
        metadata.main = "../../../outside.mjs";
        writeFileSync(path, JSON.stringify(metadata));
        writeFileSync(join(root, "outside.mjs"), newCode);
      } else if (mutation === "nested-dependency") {
        const nested = join(
          root,
          "node_modules/@earendil-works/pi-coding-agent/dist/core/node_modules/unreviewed",
        );
        mkdirSync(nested, { recursive: true });
        writeFileSync(join(nested, "index.mjs"), newCode);
      } else if (mutation === "add-mjs" || mutation === "add-cjs") {
        writeFileSync(join(ai, `unreviewed.${mutation.slice(4)}`), newCode);
      } else if (mutation === "source-tamper")
        writeFileSync(
          join(ai, "dist/compat.js"),
          Buffer.concat([approvedCompat, Buffer.from("\n// synthetic tamper\n")]),
        );
      const code = `import {assertSdkIdentity} from './probe/identity.js';assertSdkIdentity();${mutation.endsWith("redirect") ? `await import('@earendil-works/pi-ai${mutation === "compat-redirect" ? "/compat" : ""}');` : ""}`;
      writeFileSync(
        join(root, "check.mjs"),
        code +
          (mutation === "legacy-main-outside" ? 'await import("@earendil-works/pi-tui");' : ""),
      );
      const child = spawnSync(process.execPath, [join(root, "check.mjs")], {
        cwd: root,
        encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: root, TMPDIR: tmpdir() },
      });
      if (mutation === "approved") assert.equal(child.status, 0, child.stderr);
      else {
        assert.notEqual(child.status, 0);
        assert.match(
          child.stderr,
          /sdk_(resolution_metadata|identity|nested_dependency)_unsupported/,
        );
      }
      assert.equal(existsSync(marker), false, "unreviewed export must never execute");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
