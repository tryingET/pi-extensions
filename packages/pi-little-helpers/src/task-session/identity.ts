import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bytesDigest, digest, refuse } from "./json.js";

const expected = {
  "@earendil-works/pi-ai": {
    manifest: "77fbac764e5c4bbb2bbc8212fd677208f8470a9363df09c8c1643e332351be9b",
    tree: "2768bbe738239569e831350fe110898fd0c0138aed0276e8fac9685cea86afe1",
    entries: {
      "": "dist/index.js",
      "/compat": "dist/compat.js",
      "/api/openai-codex-responses": "dist/api/openai-codex-responses.js",
    },
  },
  "@earendil-works/pi-coding-agent": {
    manifest: "db9fead11bd2ddf7a327d2c2d11b535f30d059241c251d376837d5ab638a5576",
    tree: "ef352b394b4cd698e44d9f93d4661ff62b630a5818f1c2c34447cfca43d93b35",
    entries: { "": "dist/index.js" },
  },
  "@earendil-works/pi-agent-core": {
    manifest: "bc1769075d1722922e64f6cf30f8f32ce8e40906946807a90fc50dada0509d47",
    tree: "f44507b351c4e1a257da2c0c4410ab50a74c59c19157a18c58646a0dac865f04",
    entries: { "": "dist/index.js" },
  },
  "@earendil-works/pi-tui": {
    manifest: "ebe367b1bf8c15ba72bba50fb9c7cb682a8693faa90366e11946bac969c9b399",
    tree: "a74a40631718c90a25641106bf104b4bca332817a7817c6d1f8732ef5de15a12",
    entries: { "": "dist/index.js" },
  },
};
function sourceTree(root: string, prefix = ""): Record<string, string> {
  const entries: Record<string, string> = Object.create(null);
  for (const e of readdirSync(root, { withFileTypes: true })) {
    // Dependency resolution is separately checked below; no extension-based executable omissions.
    if (e.name === "node_modules") {
      if (prefix) refuse("sdk_nested_dependency_unsupported");
      continue;
    }
    if (e.isSymbolicLink()) refuse("sdk_source_alias");
    const key = `${prefix}${e.name}`;
    if (e.isDirectory()) Object.assign(entries, sourceTree(join(root, e.name), `${key}/`));
    else if (e.isFile()) entries[key] = bytesDigest(readFileSync(join(root, e.name)));
    else refuse("sdk_source_kind_unsupported");
  }
  return Object.fromEntries(Object.entries(entries));
}
function dependency(owner: string, pkg: string): string {
  for (let dir = owner; ; dir = dirname(dir)) {
    const root = join(dir, "node_modules", pkg);
    if (existsSync(join(root, "package.json"))) return realpathSync(root);
    if (dirname(dir) === dir) refuse("sdk_dependency_unresolved");
  }
}
/** Builtin-only check BEFORE SDK import. Roots do not derive from mutable export targets. */
export function assertSdkIdentity(): void {
  const owner = dirname(fileURLToPath(import.meta.url));
  const roots = Object.fromEntries(
    Object.keys(expected).map((pkg) => [pkg, dependency(owner, pkg)]),
  );
  for (const [pkg, pin] of Object.entries(expected)) {
    const root = roots[pkg];
    if (bytesDigest(readFileSync(join(root, "package.json"))) !== pin.manifest)
      refuse("sdk_resolution_metadata_unsupported");
    if (digest(sourceTree(root)) !== pin.tree) refuse("sdk_identity_unsupported");
    for (const [suffix, entry] of Object.entries(pin.entries))
      if (import.meta.resolve(pkg + suffix) !== pathToFileURL(join(root, entry)).href)
        refuse("sdk_entrypoint_redirected");
  }
  for (const [parent, deps] of [
    [
      "@earendil-works/pi-coding-agent",
      ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-tui"],
    ],
    ["@earendil-works/pi-agent-core", ["@earendil-works/pi-ai"]],
  ] as const)
    for (const pkg of deps)
      if (dependency(join(roots[parent], "dist"), pkg) !== roots[pkg])
        refuse("sdk_dependency_identity_drift");
}
