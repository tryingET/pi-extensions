import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextUsage } from "@mariozechner/pi-coding-agent";

export type ContextGroupId =
  | "system.base"
  | "system.agents"
  | "system.otherFiles"
  | "summary.compaction"
  | "summary.branch"
  | "message.user"
  | "message.assistantText"
  | "message.assistantThinking"
  | "tool.call"
  | "tool.result"
  | "message.custom"
  | "message.bashExecution"
  | "other";

export interface ContextItem {
  id: string;
  groupId: ContextGroupId;
  label: string;
  tokens: number;
  chars: number;
  preview: string;
  path?: string;
  toolName?: string;
  messageRole?: string;
}

export interface ContextGroup {
  id: ContextGroupId;
  label: string;
  tokens: number;
  percent: number;
  count: number;
  items: ContextItem[];
}

export interface ContextSnapshot {
  timestamp: number;
  modelLabel: string;
  systemPrompt: string;
  messages: AgentMessage[];
  usage?: ContextUsage;
  totalEstimatedTokens: number;
  groups: ContextGroup[];
}
