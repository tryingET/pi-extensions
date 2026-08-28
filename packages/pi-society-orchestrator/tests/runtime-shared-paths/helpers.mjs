/**
 * summary: "Shared helpers for the runtime-shared-paths test suite (footer polling, session usage fixtures, execution-seam case fixtures)."
 * read_when:
 *   - "changing shared fixtures across the runtime-shared-paths split test files."
 */
import { loadExecutionSeamCase } from "../../../../governance/execution-seam-cases/index.mjs";

export async function waitForFooterMatch(footer, width, pattern, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let rendered = footer.render(width)[0];
  while (!pattern.test(rendered) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    rendered = footer.render(width)[0];
  }
  return rendered;
}

export const timeoutEmptyOutputCase = loadExecutionSeamCase("timeout-empty-output");
export const timeoutWhitespaceOutputCase = loadExecutionSeamCase("timeout-whitespace-output");
export const assistantProtocolSemanticErrorCase = loadExecutionSeamCase(
  "assistant-protocol-semantic-error",
);
export const assistantProtocolParseErrorCase = loadExecutionSeamCase(
  "assistant-protocol-parse-error",
);
export const assistantProtocolIncompleteCase = loadExecutionSeamCase(
  "assistant-protocol-incomplete",
);

export function createSessionUsageManager() {
  return {
    id: "runtime-status-test-session",
    getEntries() {
      return [
        {
          type: "message",
          message: {
            role: "assistant",
            usage: {
              input: 1200,
              output: 400,
              cacheRead: 300,
              cacheWrite: 200,
            },
          },
        },
      ];
    },
  };
}

export function createContextUsage() {
  return {
    tokens: 20000,
    contextWindow: 128000,
    percent: 15.625,
  };
}
