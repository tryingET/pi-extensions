/**
summary: "Reads openai-codex OAuth access and account credentials from the active Pi auth file."
read_when:
  - "Changing Better OpenAI auth-file location, accepted credential fields, or OAuth validation."
*/
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
export const AUTH_FILE = join(AGENT_DIR, "auth.json");

export function readCodexAuth(): { accessToken: string; accountId: string } | undefined {
  try {
    const auth = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as Record<
      string,
      | {
          type?: string;
          access?: string | null;
          accountId?: string | null;
          account_id?: string | null;
        }
      | undefined
    >;
    const entry = auth["openai-codex"];
    if (entry?.type !== "oauth") return undefined;
    const accessToken = entry.access?.trim();
    const accountId = (entry.accountId ?? entry.account_id)?.trim();
    return accessToken && accountId ? { accessToken, accountId } : undefined;
  } catch {
    return undefined;
  }
}
