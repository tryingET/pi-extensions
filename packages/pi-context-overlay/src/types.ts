// ---
// summary: "Defines context group, item, and snapshot contracts shared by the overlay classifier, store, and UI."
// read_when:
//   - "Changing context-overlay data shapes, group identifiers, usage fields, or item metadata."
// ---
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ContextUsage } from "@earendil-works/pi-coding-agent";

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
  /** Count of user messages emitted before this item; 0 for system items. */
  turnIndex?: number;
  /** Position in classifier emission order (window stack). */
  ordinal?: number;
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
