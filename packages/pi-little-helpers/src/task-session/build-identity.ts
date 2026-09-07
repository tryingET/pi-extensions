import { readFileSync } from "node:fs";
import { bytesDigest, digest, parseJson, record, refuse } from "./json.js";
export function installedHostBuild() {
  const manifest = record(
    parseJson(readFileSync(new URL("./build-identity.json", import.meta.url))),
    ["schema", "files"],
  );
  if (
    manifest.schema !== "pi.task-session.build.v1" ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  )
    refuse("build_manifest_invalid");
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (
      !/^(?:[a-z0-9-]+\.(js|json|node)|host-v1|view-v1)$/.test(file) ||
      file === "build-identity.json" ||
      bytesDigest(readFileSync(new URL(file, import.meta.url))) !== hash
    )
      refuse("build_identity_changed");
  }
  return digest(manifest);
}
