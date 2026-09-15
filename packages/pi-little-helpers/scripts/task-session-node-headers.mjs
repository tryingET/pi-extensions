/** Resolve already-provisioned Node-API headers at build time; never download them. */
import { realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const headers = ["node_api.h", "node_api_types.h", "js_native_api.h", "js_native_api_types.h"];

function complete(directory) {
  try {
    return headers.every((name) => statSync(join(directory, name)).isFile());
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return false;
    throw error;
  }
}

export function resolveNodeHeaders({
  execPath = process.execPath,
  env = process.env,
  systemDirectories = ["/usr/include/node", "/usr/local/include/node"],
} = {}) {
  const override = env.NODE_INCLUDE_DIR;
  // An explicit operator path is authoritative: do not hide typos by falling back.
  if (override !== undefined) {
    if (!isAbsolute(override) || !complete(override)) {
      throw new Error(
        "node_headers_invalid: NODE_INCLUDE_DIR must name an absolute complete Node-API include directory",
      );
    }
    return realpathSync(override);
  }
  const prefix = resolve(dirname(realpathSync(execPath)), "..");
  const candidates = [join(prefix, "include/node"), ...systemDirectories];
  for (const candidate of candidates) {
    if (complete(candidate)) return realpathSync(candidate);
  }
  throw new Error(
    "node_headers_unavailable: provision Node development headers or set NODE_INCLUDE_DIR to their absolute include directory; no download was attempted",
  );
}
