import * as os from "node:os";
import * as path from "node:path";

export function resolveSocietyDbPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
  homeDir = os.homedir(),
): string {
  return env.SOCIETY_DB || env.AK_DB || path.join(homeDir, "ai-society", "society.v2.db");
}
