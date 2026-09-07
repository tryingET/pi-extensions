import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bytesDigest, digest, refuse } from "./json.js";

const expected = {
  "@earendil-works/pi-ai": "32f2e666812efc043a5965319af4fdcf30ace874307b433248b8a101aabd4c67",
  "@earendil-works/pi-coding-agent":
    "7761f978ee571ba9c3bcbcf8a0d1361cfd8849e3f295eb6a1963dca12c1ad077",
  "@earendil-works/pi-agent-core":
    "9af6a8981eb5485879a42a70686302aad19d3a9e939e6631c4286d72c4e782ce",
  "@earendil-works/pi-tui": "f95ab4fe80cb2368c74ad7a0d8e5605f851f72a06fa827d26a13eb9b64e02138",
};
function sourceTree(root: string, prefix = ""): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isSymbolicLink()) refuse("sdk_source_alias");
    if (e.isDirectory())
      Object.assign(entries, sourceTree(join(root, e.name), `${prefix + e.name}/`));
    else if (e.name.endsWith(".js"))
      entries[prefix + e.name] = bytesDigest(readFileSync(join(root, e.name)));
  }
  return entries;
}
function dependency(owner: string, pkg: string): string {
  for (let dir = owner; ; dir = dirname(dir)) {
    const path = join(dir, "node_modules", pkg, "dist");
    if (existsSync(path)) return realpathSync(path);
    if (dirname(dir) === dir) refuse("sdk_dependency_unresolved");
  }
}
/** Builtin-only integrity preflight; safe BEFORE any SDK import or credential read. */
export function assertSdkIdentity(): void {
  const roots = Object.fromEntries(
    Object.keys(expected).map((pkg) => [
      pkg,
      realpathSync(dirname(fileURLToPath(import.meta.resolve(pkg)))),
    ]),
  );
  for (const [pkg, hash] of Object.entries(expected)) {
    const root = roots[pkg];
    if (
      JSON.parse(readFileSync(join(root, "../package.json"), "utf8")).version !== "0.84.4" ||
      digest(sourceTree(root)) !== hash
    )
      refuse("sdk_identity_unsupported");
  }
  // Do not verify a hoisted copy while the SDK secretly resolves a different nested dependency.
  for (const [owner, deps] of [
    [
      "@earendil-works/pi-coding-agent",
      ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-tui"],
    ],
    ["@earendil-works/pi-agent-core", ["@earendil-works/pi-ai"]],
  ] as const)
    for (const pkg of deps)
      if (dependency(roots[owner], pkg) !== roots[pkg]) refuse("sdk_dependency_identity_drift");
}
