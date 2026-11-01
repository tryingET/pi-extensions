import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bytesDigest, digest, refuse } from "./json.js";

// Pi 1.4.0 SDK: sha256 of each package.json and of its file tree (node_modules excluded).
const expected = {
  "@earendil-works/pi-ai": {
    manifest: "36df91142c18a5912eafab0f2783bb4d88cdd101c5c5e7fd9173d4387cc5cced",
    tree: "c376650df4f6d0c9a99a18d456080d961bf501882ef258740c893acfb39637a5",
    entries: {
      "": "dist/index.js",
      "/compat": "dist/compat.js",
      "/api/openai-codex-responses": "dist/api/openai-codex-responses.js",
    },
  },
  "@earendil-works/pi-coding-agent": {
    manifest: "df6883685382d6a914e5797232744c26579fe7db5576ea0e9c859d018ca2d54e",
    tree: "992b967104c380172c03f564ce3c71246d6919889f19fe8b68ac379ebb98c2eb",
    entries: { "": "dist/index.js" },
  },
  "@earendil-works/pi-agent-core": {
    manifest: "3ee9a0f81587b917e7a010e4391fc10d2b04fa48091b693bffebe3b9b55e9f14",
    tree: "7747cfe931872097f91da1ce4a386796e9454c4d3705fe43d68defa364cdcd27",
    entries: { "": "dist/index.js" },
  },
  "@earendil-works/pi-tui": {
    manifest: "49362a3815b3f69728c68243609d63355aa54b4c374414c5b037560b41ca6038",
    tree: "3366636102b3ebf62bfb64bce7daf3ef682b8320337c41e57b1cb3ea2a7601bb",
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
