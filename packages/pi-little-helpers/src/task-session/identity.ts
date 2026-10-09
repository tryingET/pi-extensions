import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bytesDigest, digest, refuse } from "./json.js";

// Pi 1.1.0 SDK: sha256 of each package.json and of its file tree (node_modules excluded).
const expected = {
  "@earendil-works/pi-ai": {
    manifest: "a8f10d5157b335379ae00edf9c25ae7a15bfc0f3a76107d4376a3779bb5b2995",
    tree: "8906de0bd093edbda72827d380f7456517ec34c904f3ab8e0d3b501da5434c94",
    entries: {
      "": "dist/index.js",
      "/compat": "dist/compat.js",
      "/api/openai-codex-responses": "dist/api/openai-codex-responses.js",
    },
  },
  "@earendil-works/pi-coding-agent": {
    manifest: "c662a36f8bc47843393a60dc8616a34dfcc8376e8fcc96dbc2f1020c60e38e2a",
    tree: "9f9d59490be5b181cea40745bea3459fd9f480fd6f2802cb42994a1ecb659651",
    entries: { "": "dist/index.js" },
  },
  "@earendil-works/pi-agent-core": {
    manifest: "424f45867d4aacd6466729cb915bdfc145c1160bcfbf83ece429ed0982fa606b",
    tree: "ed6485207ac6207d734d1014e4b487168ded738b71fef90bd5b059c3ac59a669",
    entries: { "": "dist/index.js" },
  },
  "@earendil-works/pi-tui": {
    manifest: "25d27adb55392f5bfa4f354f5b5e070f1d5dcb1bb3ef92af244b08541a3ba51d",
    tree: "fa151b969546306150988db8b60182615ed4b77006ff545be3393dbea2fb395f",
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
