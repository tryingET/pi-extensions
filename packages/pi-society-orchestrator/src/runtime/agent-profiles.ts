export interface AgentDef {
  name: string;
  description: string;
  tools: string;
  systemPrompt: string;
}

export const AGENT_PROFILES: Record<string, AgentDef> = {
  scout: {
    name: "scout",
    description: "Fast recon and codebase exploration",
    tools: "read,grep,find,ls",
    systemPrompt: `You are a scout agent. Investigate the codebase quickly and report findings concisely.
Do NOT modify any files. Focus on structure, patterns, and key entry points.`,
  },
  builder: {
    name: "builder",
    description: "Implementation and code generation",
    tools: "read,write,edit,bash",
    systemPrompt: `You are a builder agent. Implement changes precisely and correctly.
Focus on working code that passes tests. Follow existing patterns.`,
  },
  reviewer: {
    name: "reviewer",
    description: "Code review and quality checks",
    tools: "read,bash,grep,find,ls",
    systemPrompt: `You are a code reviewer agent. Review code for bugs, security issues, style problems.
Run tests if available. Be concise and use bullet points. Do NOT modify files.`,
  },
  researcher: {
    name: "researcher",
    description: "Documentation and pattern discovery",
    tools: "read,bash",
    systemPrompt: `You are a research agent. Search for relevant documentation, examples, patterns.
Synthesize findings into actionable knowledge. Cite sources when possible.`,
  },
};
