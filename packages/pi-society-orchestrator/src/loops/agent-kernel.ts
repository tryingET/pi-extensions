// ---
// summary: "Small Agent Kernel CLI wrapper used by loop execution and evidence recording."
// read_when:
//   - "Changing loop-owned AK command or evidence boundary behavior."
// ---

import { resolveAkPath, runAkCommandAsync } from "../runtime/ak.ts";
import {
  type EvidenceEntry,
  type EvidenceWriteResult,
  recordEvidence,
} from "../runtime/evidence.ts";

// ============================================================================
// AGENT-KERNEL CLI WRAPPER
// ============================================================================

export class AgentKernel {
  private akPath: string;
  private societyDb?: string;
  private cwd?: string;

  constructor(
    akPath: string = resolveAkPath({ cwd: process.cwd() }),
    societyDb?: string,
    cwd?: string,
  ) {
    this.akPath = akPath;
    this.societyDb = societyDb;
    this.cwd = cwd;
  }

  async taskReady(
    signal?: AbortSignal,
  ): Promise<Array<{ id: number; title: string; repo: string }>> {
    const output = await this.run(["task", "ready", "--format", "json"], signal);
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  async taskClaim(
    taskId: number,
    agent: string,
    lease: number = 3600,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      await this.run(
        ["task", "claim", String(taskId), "--agent", agent, "--lease", String(lease)],
        signal,
      );
      return true;
    } catch {
      return false;
    }
  }

  async taskComplete(
    taskId: number,
    result: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      await this.run(
        ["task", "complete", String(taskId), "--result", JSON.stringify(result)],
        signal,
      );
      return true;
    } catch {
      return false;
    }
  }

  evidenceRecord(params: EvidenceEntry, signal?: AbortSignal): Promise<EvidenceWriteResult> {
    return recordEvidence(params, signal, {
      akPath: this.akPath,
      societyDb: this.societyDb || process.env.SOCIETY_DB || process.env.AK_DB || "",
      cwd: this.cwd,
    });
  }

  private async run(args: string[], signal?: AbortSignal): Promise<string> {
    const result = await runAkCommandAsync({
      akPath: this.akPath,
      societyDb: this.societyDb || process.env.SOCIETY_DB || process.env.AK_DB || "",
      args,
      cwd: this.cwd,
      signal,
    });

    if (!result.ok) {
      throw new Error(result.stderr || `ak exited with error`);
    }

    return result.stdout;
  }
}
