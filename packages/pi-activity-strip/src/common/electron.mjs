import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_ELECTRON_CANDIDATES } from "./constants.mjs";

async function canExecute(targetPath) {
  try {
    await access(targetPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(binaryName) {
  for (const entry of String(process.env.PATH ?? "")
    .split(":")
    .filter(Boolean)) {
    const candidate = path.join(entry, binaryName);
    if (await canExecute(candidate)) return candidate;
  }
  return null;
}

export async function locateElectron(explicitPath = null) {
  if (explicitPath) {
    if (await canExecute(explicitPath)) return explicitPath;
    throw new Error(`Configured Electron binary is not executable: ${explicitPath}`);
  }

  const envBinary = process.env.GLIMPSE_ELECTRON_BIN || process.env.PI_ACTIVITY_STRIP_ELECTRON_BIN;
  if (envBinary) {
    if (await canExecute(envBinary)) return envBinary;
    throw new Error(`Configured Electron binary is not executable: ${envBinary}`);
  }

  const localBinary = path.resolve(process.cwd(), "node_modules", ".bin", "electron");
  if (await canExecute(localBinary)) return localBinary;

  for (const candidate of DEFAULT_ELECTRON_CANDIDATES) {
    const found = await findOnPath(candidate);
    if (found) return found;
  }

  throw new Error(
    "Could not find an Electron binary. Install electron (or electron39 on Arch) or set GLIMPSE_ELECTRON_BIN / PI_ACTIVITY_STRIP_ELECTRON_BIN.",
  );
}
