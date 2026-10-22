// A per-operation output lifetime, not a no-filesystem-write claim.
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { RocsInspectionCleanupError } from "../ports/rocs-port.ts";

/**
 * ROCS_OUTPUT_ROOT must be inside --repo and disjoint from ontology source.
 * ROCS checks that source boundary and creates its own ownership marker.
 * We own only this fresh 0700 directory; never reuse or clean ambient outputs.
 * Like the runner, this assumes trusted same-uid code (not hostile rename races).
 */
export async function withInspectionOutput<T>(
  repoPath: string,
  operation: (outputRoot: string) => Promise<T>,
): Promise<T> {
  const repo = await fs.realpath(repoPath);
  const parent = await fs.stat(repo);
  const output = await fs.mkdtemp(path.join(repo, ".pi-ontology-inspect-"));
  const handle = await fs
    .open(output, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    .catch((error) => {
      throw new RocsInspectionCleanupError(
        [error],
        `ROCS inspection output pin failed; inspect uncleaned path: ${output}`,
      );
    });
  const failures: unknown[] = [];
  let value: T | undefined;
  let cleanupFailed = false;
  try {
    const owned = await handle.stat();
    try {
      value = await operation(output);
    } catch (error) {
      failures.push(error);
    }
    const currentParent = await fs.lstat(repo);
    const current = await fs.lstat(output);
    if (
      !currentParent.isDirectory() ||
      currentParent.dev !== parent.dev ||
      currentParent.ino !== parent.ino ||
      !current.isDirectory() ||
      current.dev !== owned.dev ||
      current.ino !== owned.ino
    ) {
      throw new Error("private output ownership changed; refusing cleanup");
    }
    // rm does not follow symlinks inside this private tree. The child must have
    // exited before operation settles, including cancellation and process errors.
    await fs.rm(output, { recursive: true });
  } catch (error) {
    cleanupFailed = true;
    failures.push(error);
  } finally {
    try {
      await handle.close();
    } catch (error) {
      cleanupFailed = true;
      failures.push(error);
    }
  }
  if (cleanupFailed) {
    throw new RocsInspectionCleanupError(
      failures,
      `ROCS inspection output cleanup failed at ${output}`,
    );
  }
  if (failures.length) throw failures[0];
  return value as T;
}
