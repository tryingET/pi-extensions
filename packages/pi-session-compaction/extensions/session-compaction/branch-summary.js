/**
summary: "Builds optional branch-summary instructions from prompt contracts, focus text, and files-touched manifests."
read_when:
  - "Changing branch-summary prompt loading, files-touched inclusion, focus handling, or augmentation failure behavior."
 * Non-live branch-tree summary augmentation helpers.
 *
 * These helpers prepare optional `session_before_tree` custom instructions, but
 * this package still does not register a live hook or Pi extension entrypoint.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectFilesTouched, renderFilesTouchedManifestBlock } from "./files-touched.js";
import { loadConfig } from "./handler.js";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadBranchSummaryPromptContract(extensionDir = EXTENSION_DIR) {
  const promptPath = path.join(extensionDir, "branch-summary-prompt.md");
  try {
    const raw = await readFile(promptPath, "utf8");
    return normalizeText(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load pi-session-compaction branch-summary prompt from ${promptPath}: ${message}`,
    );
  }
}

export function includeFilesTouchedInBranchSummary(config = {}) {
  if (typeof config.includeBranchFilesTouched === "boolean")
    return config.includeBranchFilesTouched;
  if (typeof config.includeFilesTouchedInBranchSummary === "boolean") {
    return config.includeFilesTouchedInBranchSummary;
  }

  const value = config.includeFilesTouched;
  if (typeof value === "boolean") return value;
  if (isObject(value) && typeof value.inBranchSummary === "boolean") return value.inBranchSummary;
  if (isObject(value) && typeof value.enabled === "boolean") return value.enabled;
  return false;
}

export function buildBranchSummaryInstructions(params = {}) {
  const promptContract = normalizeText(params.promptContract);
  const focusText = normalizeText(params.focusText);
  const filesTouchedManifestBlock = normalizeText(params.filesTouchedManifestBlock);

  if (!promptContract && !filesTouchedManifestBlock) return undefined;

  if (promptContract) {
    const sections = [promptContract];

    if (focusText) {
      sections.push(
        [
          "## Additional focus",
          "Incorporate this user-provided focus while staying faithful to the actual branch history.",
          "",
          focusText,
        ].join("\n"),
      );
    }

    if (filesTouchedManifestBlock) {
      sections.push(
        [
          "## Authoritative files touched",
          "The included files-touched block is authoritative. Reproduce it verbatim in the summary body. Do not change its heading, legend, ordering, spacing, or fenced block contents.",
          "",
          filesTouchedManifestBlock,
        ].join("\n"),
      );
    }

    return {
      customInstructions: sections.join("\n\n").trim(),
      replaceInstructions: true,
    };
  }

  const sections = [
    "Also include the authoritative files-touched block below while preserving the stock branch-summary structure.",
  ];

  if (focusText) {
    sections.push(["User focus:", focusText].join("\n"));
  }

  sections.push(
    [
      "Authoritative files touched: reproduce this block verbatim in the summary body. Do not change its heading, legend, ordering, spacing, or fenced block contents.",
      "",
      filesTouchedManifestBlock,
    ].join("\n"),
  );

  return {
    customInstructions: sections.join("\n\n").trim(),
    replaceInstructions: false,
  };
}

function notify(ctx, message, level = "warning") {
  if (ctx?.hasUI && typeof ctx.ui?.notify === "function") ctx.ui.notify(message, level);
}

export async function runSessionTreeAugmentation(event, ctx, deps = {}) {
  const runtimeDeps = {
    collectFilesTouched,
    loadConfig,
    loadBranchSummaryPrompt: loadBranchSummaryPromptContract,
    ...deps,
  };

  if (event.signal?.aborted) return undefined;
  if (!event.preparation?.userWantsSummary) return undefined;

  const entriesToSummarize = Array.isArray(event.preparation?.entriesToSummarize)
    ? event.preparation.entriesToSummarize
    : [];
  if (entriesToSummarize.length === 0) return undefined;

  try {
    const config = await runtimeDeps.loadConfig(EXTENSION_DIR);
    const promptContract = await runtimeDeps.loadBranchSummaryPrompt(EXTENSION_DIR);
    const filesTouchedManifestBlock = includeFilesTouchedInBranchSummary(config)
      ? renderFilesTouchedManifestBlock(
          runtimeDeps.collectFilesTouched(entriesToSummarize, ctx?.cwd),
        )
      : undefined;

    return buildBranchSummaryInstructions({
      promptContract,
      focusText: event.preparation.customInstructions,
      filesTouchedManifestBlock,
    });
  } catch (error) {
    if (event.signal?.aborted) return undefined;
    const message = error instanceof Error ? error.message : String(error);
    notify(ctx, `Session tree summary augmentation failed: ${message}`, "warning");
    return undefined;
  }
}
