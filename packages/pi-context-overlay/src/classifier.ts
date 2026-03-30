import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateMessageTokens, estimateTokensFromText } from "./token-estimator.js";
import type { ContextGroup, ContextGroupId, ContextItem } from "./types.js";

const groupLabel: Record<ContextGroupId, string> = {
  "system.base": "System prompt (base)",
  "system.agents": "AGENTS/CLAUDE context files",
  "system.otherFiles": "Other system context files",
  "summary.compaction": "Compaction summaries",
  "summary.branch": "Branch summaries",
  "message.user": "User messages",
  "message.assistantText": "Assistant text",
  "message.assistantThinking": "Assistant thinking",
  "tool.call": "Tool calls",
  "tool.result": "Tool results",
  "message.custom": "Custom messages",
  "message.bashExecution": "User bash messages",
  other: "Other",
};

const mkItem = (partial: Omit<ContextItem, "id">, index: number): ContextItem => ({
  id: `${partial.groupId}:${index}`,
  ...partial,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return undefined;
};

const extractPathFromArgs = (args: unknown): string | undefined => {
  if (!isRecord(args)) return undefined;

  const directKeys = [
    "path",
    "file",
    "filePath",
    "target",
    "targetPath",
    "oldPath",
    "newPath",
    "directory",
    "dir",
  ] as const;
  for (const key of directKeys) {
    const maybe = readString(args[key]);
    if (maybe) return maybe;
  }

  for (const key of ["paths", "files"] as const) {
    const value = args[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const maybe = readString(item);
        if (maybe) return maybe;
      }
    }
  }

  return undefined;
};

interface ContextFilePart {
  path: string;
  content: string;
}

const extractSystemParts = (
  systemPrompt: string,
): { base: string; agentsFiles: ContextFilePart[]; otherFiles: ContextFilePart[] } => {
  const projectContextIdx = systemPrompt.indexOf("# Project Context");
  if (projectContextIdx < 0) {
    return { base: systemPrompt, agentsFiles: [], otherFiles: [] };
  }

  const base = systemPrompt.slice(0, projectContextIdx).trimEnd();
  const tail = systemPrompt.slice(projectContextIdx);

  const lines = tail.split("\n");
  const agentsFiles: ContextFilePart[] = [];
  const otherFiles: ContextFilePart[] = [];

  let currentHeader: string | undefined;
  let currentBuffer: string[] = [];

  const flush = () => {
    if (!currentHeader) return;
    const body = currentBuffer.join("\n").trim();
    const filePath = currentHeader.replace(/^##\s+/, "").trim();
    const filePart: ContextFilePart = { path: filePath, content: body };
    const bucket = /AGENTS\.md$|CLAUDE\.md$/i.test(filePath) ? agentsFiles : otherFiles;
    bucket.push(filePart);
    currentBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentHeader = line;
      continue;
    }
    if (currentHeader) currentBuffer.push(line);
  }
  flush();

  return { base, agentsFiles, otherFiles };
};

export const buildGroups = (
  systemPrompt: string,
  messages: AgentMessage[],
  totalContextTokens?: number,
): ContextGroup[] => {
  const items: ContextItem[] = [];
  let i = 0;

  const sys = extractSystemParts(systemPrompt);

  if (sys.base.trim()) {
    const chars = sys.base.length;
    items.push(
      mkItem(
        {
          groupId: "system.base",
          label: "base prompt",
          chars,
          tokens: estimateTokensFromText(sys.base),
          preview: sys.base.slice(0, 180),
        },
        i++,
      ),
    );
  }

  for (const file of sys.agentsFiles) {
    const full = `## ${file.path}\n${file.content}`;
    items.push(
      mkItem(
        {
          groupId: "system.agents",
          label: file.path,
          chars: full.length,
          tokens: estimateTokensFromText(full),
          preview: full.slice(0, 180),
          path: file.path,
        },
        i++,
      ),
    );
  }

  for (const file of sys.otherFiles) {
    const full = `## ${file.path}\n${file.content}`;
    items.push(
      mkItem(
        {
          groupId: "system.otherFiles",
          label: file.path,
          chars: full.length,
          tokens: estimateTokensFromText(full),
          preview: full.slice(0, 180),
          path: file.path,
        },
        i++,
      ),
    );
  }

  const toolCallPathById = new Map<string, string>();

  for (const message of messages) {
    const role = (message as { role: string }).role;
    const tokens = estimateMessageTokens(message);

    if (role === "compactionSummary") {
      const summary = String((message as { summary?: string }).summary ?? "");
      items.push(
        mkItem(
          {
            groupId: "summary.compaction",
            label: "compaction summary",
            chars: summary.length,
            tokens,
            preview: summary.slice(0, 180),
            messageRole: role,
          },
          i++,
        ),
      );
      continue;
    }

    if (role === "branchSummary") {
      const summary = String((message as { summary?: string }).summary ?? "");
      items.push(
        mkItem(
          {
            groupId: "summary.branch",
            label: "branch summary",
            chars: summary.length,
            tokens,
            preview: summary.slice(0, 180),
            messageRole: role,
          },
          i++,
        ),
      );
      continue;
    }

    if (role === "user") {
      items.push(
        mkItem(
          {
            groupId: "message.user",
            label: "user",
            chars: 0,
            tokens,
            preview: "user message",
            messageRole: role,
          },
          i++,
        ),
      );
      continue;
    }

    if (role === "assistant") {
      const content = (message as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const t = (block as { type?: string }).type;
          if (t === "text") {
            const text = String((block as { text?: string }).text ?? "");
            items.push(
              mkItem(
                {
                  groupId: "message.assistantText",
                  label: "assistant text",
                  chars: text.length,
                  tokens: estimateTokensFromText(text),
                  preview: text.slice(0, 180),
                  messageRole: role,
                },
                i++,
              ),
            );
          } else if (t === "thinking") {
            const thinking = String((block as { thinking?: string }).thinking ?? "");
            items.push(
              mkItem(
                {
                  groupId: "message.assistantThinking",
                  label: "assistant thinking",
                  chars: thinking.length,
                  tokens: estimateTokensFromText(thinking),
                  preview: thinking.slice(0, 180),
                  messageRole: role,
                },
                i++,
              ),
            );
          } else if (t === "toolCall") {
            const toolCall = block as {
              id?: string;
              name?: string;
              arguments?: unknown;
            };
            const name = String(toolCall.name ?? "tool");
            const args = toolCall.arguments ?? {};
            const argsJson = JSON.stringify(args);
            const preview = `${name} ${argsJson}`;
            const path = extractPathFromArgs(args);

            if (toolCall.id && path) {
              toolCallPathById.set(toolCall.id, path);
            }

            items.push(
              mkItem(
                {
                  groupId: "tool.call",
                  label: name,
                  chars: preview.length,
                  tokens: estimateTokensFromText(preview),
                  preview: preview.slice(0, 180),
                  toolName: name,
                  messageRole: role,
                  path,
                },
                i++,
              ),
            );
          }
        }
      }
      continue;
    }

    if (role === "toolResult") {
      const toolResult = message as {
        toolName?: string;
        toolCallId?: string;
      };
      const toolName = String(toolResult.toolName ?? "tool");
      const path = toolResult.toolCallId ? toolCallPathById.get(toolResult.toolCallId) : undefined;

      items.push(
        mkItem(
          {
            groupId: "tool.result",
            label: toolName,
            chars: 0,
            tokens,
            preview: `result: ${toolName}`,
            toolName,
            messageRole: role,
            path,
          },
          i++,
        ),
      );
      continue;
    }

    if (role === "custom") {
      const customType = String((message as { customType?: string }).customType ?? "custom");
      items.push(
        mkItem(
          {
            groupId: "message.custom",
            label: customType,
            chars: 0,
            tokens,
            preview: customType,
            messageRole: role,
          },
          i++,
        ),
      );
      continue;
    }

    if (role === "bashExecution") {
      items.push(
        mkItem(
          {
            groupId: "message.bashExecution",
            label: "bash execution",
            chars: 0,
            tokens,
            preview: "user bash",
            messageRole: role,
          },
          i++,
        ),
      );
      continue;
    }

    items.push(
      mkItem(
        {
          groupId: "other",
          label: role,
          chars: 0,
          tokens,
          preview: role,
          messageRole: role,
        },
        i++,
      ),
    );
  }

  const sum = items.reduce((acc, item) => acc + item.tokens, 0);
  const denom =
    totalContextTokens && totalContextTokens > 0 ? totalContextTokens : Math.max(1, sum);

  const byGroup = new Map<ContextGroupId, ContextItem[]>();
  for (const item of items) {
    const arr = byGroup.get(item.groupId) ?? [];
    arr.push(item);
    byGroup.set(item.groupId, arr);
  }

  const groups: ContextGroup[] = [];
  for (const [id, gItems] of byGroup.entries()) {
    const tokens = gItems.reduce((acc, x) => acc + x.tokens, 0);
    groups.push({
      id,
      label: groupLabel[id],
      tokens,
      percent: (tokens / denom) * 100,
      count: gItems.length,
      items: gItems.sort((a, b) => b.tokens - a.tokens),
    });
  }

  return groups.sort((a, b) => b.tokens - a.tokens);
};
