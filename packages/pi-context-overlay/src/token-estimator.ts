import type { AgentMessage } from "@mariozechner/pi-agent-core";

export const estimateTokensFromText = (text: string): number => Math.ceil(text.length / 4);

const textFromUnknownContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const t = (block as { type?: string }).type;
    if (t === "text") parts.push(String((block as { text?: string }).text ?? ""));
    if (t === "thinking") parts.push(String((block as { thinking?: string }).thinking ?? ""));
    if (t === "toolCall") {
      const name = String((block as { name?: string }).name ?? "");
      const args = JSON.stringify((block as { arguments?: unknown }).arguments ?? {});
      parts.push(`${name} ${args}`);
    }
  }
  return parts.join("\n");
};

export const estimateMessageTokens = (message: AgentMessage): number => {
  const role = (message as { role: string }).role;

  if (role === "bashExecution") {
    const command = String((message as { command?: string }).command ?? "");
    const output = String((message as { output?: string }).output ?? "");
    return estimateTokensFromText(`${command}\n${output}`);
  }

  if (role === "branchSummary" || role === "compactionSummary") {
    const summary = String((message as { summary?: string }).summary ?? "");
    return estimateTokensFromText(summary);
  }

  const content = (message as { content?: unknown }).content;
  return estimateTokensFromText(textFromUnknownContent(content));
};
