// summary: durable exclusive Phase-3 pair reservation; no automatic release or retry, including crashes.
import { constants } from "node:fs";
import { mkdir, open, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonString, sha256Hex } from "./dispatch-receipt.ts";
import {
  resolveVisibleLaunchReceiptsDir,
  validateVisibleLaunchIdentity,
} from "./visible-launch-receipt.ts";

export async function reserveVisibleLaunchPair(
  input: {
    agent: string;
    task: number;
    runId: string;
    requestSha256: string;
  },
  dir?: string,
): Promise<{ reserved: true; path: string } | { reserved: false; runId?: string }> {
  validateVisibleLaunchIdentity(input.agent, input.runId);
  if (
    !Number.isSafeInteger(input.task) ||
    input.task <= 0 ||
    !/^[a-f0-9]{64}$/u.test(input.requestSha256)
  ) {
    throw new Error("Invalid launch reservation identity");
  }
  const home = resolveVisibleLaunchReceiptsDir(dir);
  await mkdir(home, { recursive: true, mode: 0o700 });
  const canonicalHome = await realpath(home);
  const path = join(canonicalHome, `pair-${input.agent}.ak-${input.task}.reservation.json`);
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // Corrupt/incomplete reservations also block. Never infer an expired process or retry permission.
    try {
      const previous = JSON.parse(await readFile(path, "utf8"));
      validateVisibleLaunchIdentity(previous.agent, previous.runId);
      if (previous.agent === input.agent && previous.task === input.task)
        return { reserved: false, runId: previous.runId };
    } catch {
      /* fail closed */
    }
    return { reserved: false };
  }
  try {
    const facts = {
      schema: "pi-agent-registry.visible-launch-reservation/1",
      ...input,
      recordedAt: new Date().toISOString(),
    };
    await handle.writeFile(
      `${canonicalJsonString({ ...facts, sha256: sha256Hex(canonicalJsonString(facts)) })}\n`,
    );
    await handle.sync();
    await handle.chmod(0o400);
  } finally {
    await handle.close();
  }
  const directory = await open(canonicalHome, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  return { reserved: true, path };
}
