import path from "node:path";
import { BoundaryError } from "./errors.js";
import { WorkspacePath } from "./operations.js";

export function translatePiPathToWorkspace(sourceRoot, inputPath) {
  if (typeof sourceRoot !== "string" || !path.isAbsolute(sourceRoot)) {
    throw new BoundaryError(
      "INVALID_SOURCE_ROOT",
      "sourceRoot must be the captured absolute canonical repository root",
    );
  }
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    throw new BoundaryError("INVALID_INPUT_PATH", "inputPath must be non-empty text");
  }
  if (!path.isAbsolute(inputPath)) return WorkspacePath.parse(inputPath);

  const relative = path.relative(sourceRoot, inputPath);
  if (
    relative === "" ||
    relative === "."
  ) {
    return WorkspacePath.parse(".");
  }
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new BoundaryError(
      "HOST_PATH_OUTSIDE_SOURCE",
      `Absolute path is outside the captured source root: ${inputPath}`,
    );
  }
  return new WorkspacePath(relative.split(path.sep));
}
