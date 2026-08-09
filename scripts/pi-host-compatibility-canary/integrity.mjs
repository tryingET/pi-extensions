// ---
// summary: "Provides identity-safe filesystem primitives and integrity errors for the Pi host compatibility canary."
// read_when:
//   - "Changing canary identity checks or handle-safe temporary directory removal."
// ---
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

export class IntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "IntegrityError";
    this.code = "PI_HOST_COMPAT_INTEGRITY";
  }
}

export function isIntegrityError(error) {
  return error?.code === "PI_HOST_COMPAT_INTEGRITY";
}

export function identityOf(stats) {
  return { dev: String(stats.dev), ino: String(stats.ino) };
}

export function identitiesMatch(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

export function removeDirectoryByHandle(directoryPath, expectedIdentity) {
  const flags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(directoryPath, flags);
  const fdRoot = `${process.platform === "linux" ? "/proc/self/fd" : "/dev/fd"}/${fd}`;
  try {
    const openedIdentity = identityOf(fstatSync(fd, { bigint: true }));
    if (!identitiesMatch(openedIdentity, expectedIdentity)) {
      throw new IntegrityError("directory identity changed before handle-safe removal");
    }
    for (const child of readdirSync(fdRoot, { withFileTypes: true })) {
      const childPath = path.join(fdRoot, child.name);
      const childStats = lstatSync(childPath, { bigint: true });
      if (childStats.isDirectory() && !childStats.isSymbolicLink()) {
        removeDirectoryByHandle(childPath, identityOf(childStats));
      } else {
        unlinkSync(childPath);
      }
    }
  } finally {
    closeSync(fd);
  }
  const finalStats = lstatSync(directoryPath, { bigint: true, throwIfNoEntry: false });
  if (!finalStats || !identitiesMatch(identityOf(finalStats), expectedIdentity)) {
    throw new IntegrityError("directory identity changed before final removal");
  }
  rmdirSync(directoryPath);
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
