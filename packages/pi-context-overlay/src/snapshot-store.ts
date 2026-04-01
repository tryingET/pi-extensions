import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextUsage } from "@mariozechner/pi-coding-agent";
import { buildGroups } from "./classifier.js";
import type { ContextSnapshot } from "./types.js";

export class ContextSnapshotStore {
  private systemPrompt = "";
  private messages: AgentMessage[] = [];
  private usage: ContextUsage | undefined;
  private listeners = new Set<() => void>();

  replaceSnapshot(params: {
    systemPrompt: string;
    messages: AgentMessage[];
    usage: ContextUsage | undefined;
  }): void {
    this.systemPrompt = params.systemPrompt;
    this.messages = structuredClone(params.messages);
    this.usage = params.usage;
    this.emit();
  }

  onBeforeAgentStart(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
    this.emit();
  }

  onContext(messages: AgentMessage[]): void {
    this.messages = structuredClone(messages);
    this.emit();
  }

  onUsage(usage: ContextUsage | undefined): void {
    this.usage = usage;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  buildSnapshot(modelLabel: string): ContextSnapshot {
    const groups = buildGroups(this.systemPrompt, this.messages, this.usage?.tokens);
    const estimated = groups.reduce((acc, g) => acc + g.tokens, 0);

    return {
      timestamp: Date.now(),
      modelLabel,
      systemPrompt: this.systemPrompt,
      messages: this.messages,
      usage: this.usage,
      totalEstimatedTokens: estimated,
      groups,
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
