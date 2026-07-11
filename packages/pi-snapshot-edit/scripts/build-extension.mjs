#!/usr/bin/env node

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const marker = process.env.PI_SNAPSHOT_EDIT_BUILD_MARKER || `release:${packageJson.version}`;
if (!/^[A-Za-z0-9._:-]{1,80}$/.test(marker)) {
  throw new Error("PI_SNAPSHOT_EDIT_BUILD_MARKER must be 1-80 safe ASCII characters");
}

const dist = path.join(root, "dist");
const output = path.join(dist, "snapshot-edit.js");
const temporary = `${output}.tmp`;
await mkdir(dist, { recursive: true });
await rm(temporary, { force: true });

const result = await build({
  absWorkingDir: root,
  entryPoints: ["extensions/snapshot-edit.ts"],
  outfile: temporary,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  charset: "utf8",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  treeShaking: true,
  metafile: true,
  logLevel: "warning",
  banner: {
    js: "/* @tryinget/pi-snapshot-edit — source-available under the restricted LICENSE included with this package; named Restricted Parties receive no rights. */",
  },
  define: {
    __PI_SNAPSHOT_EDIT_BUILD_MARKER__: JSON.stringify(marker),
  },
  external: [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-tui",
    "typebox",
  ],
});

const outputMetadata = Object.values(result.metafile.outputs)[0];
if (!outputMetadata) throw new Error("esbuild did not report the bundled output");
const packageOwnedImports = outputMetadata.imports.filter(
  (entry) =>
    entry.path.startsWith(".") || entry.path.startsWith("/") || entry.path.includes("/src/"),
);
if (packageOwnedImports.length) {
  throw new Error(
    `Bundled entry retained package-owned imports: ${JSON.stringify(packageOwnedImports)}`,
  );
}

const bytes = await readFile(temporary);
if (bytes.includes(Buffer.from("sourceMappingURL")))
  throw new Error("Bundle unexpectedly contains a sourcemap reference");
await writeFile(temporary, bytes, { mode: 0o644 });
await rename(temporary, output);
console.error(`Built dist/snapshot-edit.js (${bytes.length} bytes, marker ${marker})`);
