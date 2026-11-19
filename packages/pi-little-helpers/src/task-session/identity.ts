import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bytesDigest, digest, refuse } from "./json.js";

// Pi 1.5.2 SDK: sha256 of each package.json and of its file tree (node_modules excluded).
const expected = {
  "@earendil-works/pi-ai": {
    manifest: "db02f15488aa28c3cce6bbdeabab7d3a43eaea8b293a9688570bc0b43b15f1b0",
    tree: "22cae3abde60ed06fa3e28bf95e5faa6e0967fc0ed7398b559cfc2fdba660397",
    entries: {
      "": "dist/index.js",
      "/compat": "dist/compat.js",
      "/api/openai-codex-responses": "dist/api/openai-codex-responses.js",
    },
  },
  "@earendil-works/pi-coding-agent": {
    manifest: "18b422b7d80f2caa2551d253c0a8409e1caa54b954bfb7d18252e507bb8a0318",
    tree: "79c28471288d1724b75c72b6f873cc04449437f6e6a51187d13f234aa68dc935",
    entries: { "": "dist/index.js" },
  },
  "@earendil-works/pi-agent-core": {
    manifest: "95152a1095f4677284afde73dcf7a8a1525f46be0831177611526c14cea2ccec",
    tree: "8ffc888fb563b37467256f55f32b563521b9460994a7dd2363961faaa2f26606",
    entries: { "": "dist/index.js" },
  },
  "@earendil-works/pi-tui": {
    manifest: "a69278408dbc23c0c6efe4079c99b012c14cf2bea78167b72334cdbe319ad4ec",
    tree: "db632218b8ee5ac754cdebf365d9cf15e1130aac8ae09d8de5644e06d2d5c1a1",
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
