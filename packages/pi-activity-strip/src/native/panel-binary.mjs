// ---
// summary: "locates the native panel binary and verifies it against its reviewed artifact receipt"
// read_when:
//   - "changing which panel binary the controller starts or how its receipt is checked"
// ---

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @param {NodeJS.ProcessEnv} env */
export function resolvePanelBinary(env) {
  const override = env.PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN?.trim();
  const allowUnverified = env.PI_ACTIVITY_STRIP_ALLOW_UNVERIFIED_PANEL === "1";
  const candidates = [
    ...(override ? [override] : []),
    path.join(packageRoot, "native", "bin", "linux-x64-gnu", "pi-activity-strip-panel"),
    ...(allowUnverified
      ? [path.join(packageRoot, "native", "panel", "target", "release", "pi-activity-strip-panel")]
      : []),
  ].filter(Boolean);
  const binary = candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!binary) {
    throw new Error(`Native panel binary is unavailable. Checked: ${candidates.join(", ")}`);
  }
  if (allowUnverified) return binary;
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`Native panel requires Linux x64, got ${process.platform} ${process.arch}.`);
  }
  const artifactPath = path.join(path.dirname(binary), "artifact.json");
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  } catch {
    throw new Error(`Native panel receipt is unavailable: ${artifactPath}`);
  }
  const digest = createHash("sha256").update(fs.readFileSync(binary)).digest("hex");
  if (
    artifact.schema !== "pi-activity-strip-native-artifact.v1" ||
    artifact.target !== "x86_64-unknown-linux-gnu" ||
    artifact.sha256 !== digest
  ) {
    throw new Error("Native panel binary does not match its reviewed artifact receipt.");
  }
  return binary;
}
