import { type RunAkCommandResult, runAkCommandAsync } from "./ak.ts";
import { type BoundaryResult, isReadOnlySql, querySqliteJsonAsync } from "./boundaries.ts";

const DEFAULT_EVIDENCE_PREVIEW_LIMIT = 20;

export interface SocietyRuntimeConfig {
  akPath: string;
  societyDb: string;
  runAk?: (params: {
    akPath: string;
    societyDb: string;
    args: string[];
    signal?: AbortSignal;
  }) => Promise<RunAkCommandResult>;
  querySqliteJson?: <T>(
    dbPath: string,
    sql: string,
    signal?: AbortSignal,
  ) => Promise<BoundaryResult<T[]>>;
}

export interface EvidencePreview {
  text: string;
  entryCount: number;
  truncated: boolean;
}

export async function runSocietyDiagnosticQuery<T>(
  query: string,
  config: SocietyRuntimeConfig,
  signal?: AbortSignal,
): Promise<BoundaryResult<T[]>> {
  if (!isReadOnlySql(query)) {
    return {
      ok: false,
      error: "society_query only allows read-only SELECT/WITH/EXPLAIN/PRAGMA statements.",
    };
  }

  return (config.querySqliteJson || querySqliteJsonAsync)<T>(config.societyDb, query, signal);
}

export async function previewRecentEvidence(
  config: SocietyRuntimeConfig,
  signal?: AbortSignal,
  limit: number = DEFAULT_EVIDENCE_PREVIEW_LIMIT,
): Promise<BoundaryResult<EvidencePreview>> {
  const akResult = await (config.runAk || runAkCommandAsync)({
    akPath: config.akPath,
    societyDb: config.societyDb,
    args: ["evidence", "search"],
    signal,
  });

  if (!akResult.ok) {
    return {
      ok: false,
      error: akResult.stderr || "ak evidence search failed",
      stdout: akResult.stdout,
      stderr: akResult.stderr,
    };
  }

  const blocks = splitAkEvidenceBlocks(akResult.stdout);
  const maxEntries = Math.max(1, limit);
  const limitedBlocks = blocks.slice(0, maxEntries);

  return {
    ok: true,
    value: {
      text: limitedBlocks.join("\n\n"),
      entryCount: blocks.length,
      truncated: blocks.length > maxEntries,
    },
  };
}

export function splitAkEvidenceBlocks(text: string): string[] {
  const blocks: string[] = [];
  let currentBlock: string[] = [];

  const flush = () => {
    const block = currentBlock.join("\n").trim();
    if (block) {
      blocks.push(block);
    }
    currentBlock = [];
  };

  for (const line of text.split("\n")) {
    if (line.startsWith("#") && currentBlock.length > 0) {
      flush();
    }

    if (line.trim().length === 0 && currentBlock.length === 0) {
      continue;
    }

    currentBlock.push(line);
  }

  flush();
  return blocks;
}
