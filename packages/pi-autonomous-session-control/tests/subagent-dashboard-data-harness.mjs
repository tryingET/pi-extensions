import { writeFile } from "node:fs/promises";
import { getSessionStatusPath } from "../extensions/self/subagent-session.ts";

export async function writeStatus(
  sessionsDir,
  sessionName,
  status,
  updatedAt,
  objective,
  extras = {},
) {
  await writeFile(
    getSessionStatusPath(sessionsDir, sessionName),
    JSON.stringify({
      sessionName,
      status,
      pid: process.pid,
      ppid: process.ppid,
      createdAt: updatedAt,
      updatedAt,
      objective,
      sessionKind: "subagent",
      ...extras,
    }),
  );
}
