import { existsSync, rmSync } from "node:fs";
import { copyFile, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const SUBAGENT_CHILD_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
const DEFAULT_AGENT_DIR = join(homedir(), ".pi", "agent");
const ISOLATED_SETTINGS_CONTENT = "{}\n";

export interface IsolatedSubagentAgentDir {
  agentDir: string;
  cleanup(): Promise<void>;
  cleanupSync(): void;
}

export async function createIsolatedSubagentAgentDir(options?: {
  sourceAgentDir?: string;
  tempParentDir?: string;
}): Promise<IsolatedSubagentAgentDir> {
  const sourceAgentDir = resolveSubagentSourceAgentDir(options?.sourceAgentDir);
  const tempParentDir = options?.tempParentDir || tmpdir();
  const agentDir = await mkdtemp(join(tempParentDir, "pi-subagent-agent-dir-"));

  try {
    await copyTopLevelAgentFiles(sourceAgentDir, agentDir);
    await writeFile(join(agentDir, "settings.json"), ISOLATED_SETTINGS_CONTENT, "utf-8");
  } catch (error) {
    await rm(agentDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  return {
    agentDir,
    cleanup: async () => {
      await rm(agentDir, { recursive: true, force: true });
    },
    cleanupSync: () => {
      if (existsSync(agentDir)) {
        rmSync(agentDir, { recursive: true, force: true });
      }
    },
  };
}

export function resolveSubagentSourceAgentDir(sourceAgentDir?: string): string {
  const override = sourceAgentDir?.trim() || process.env[SUBAGENT_CHILD_AGENT_DIR_ENV]?.trim();
  return override || DEFAULT_AGENT_DIR;
}

async function copyTopLevelAgentFiles(
  sourceAgentDir: string,
  targetAgentDir: string,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(sourceAgentDir);
  } catch (error) {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (entry === "settings.json") {
      continue;
    }

    const sourcePath = join(sourceAgentDir, entry);
    let isFile = false;
    try {
      isFile = (await stat(sourcePath)).isFile();
    } catch (error) {
      if (isMissingPathError(error)) {
        continue;
      }
      throw error;
    }

    if (!isFile) {
      continue;
    }

    await copyFile(sourcePath, join(targetAgentDir, entry));
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
