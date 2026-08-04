export interface SessionCompactionHandoffGenerationContext {
  cwd?: string;
  model?: unknown;
  signal?: AbortSignal;
  sessionManager?: {
    getBranch?: () => unknown[];
  };
  modelRegistry?: {
    completeSimple?: (
      model: unknown,
      input: unknown,
      options?: { reasoning?: "low"; signal?: AbortSignal },
    ) => Promise<{ content?: Array<{ type?: string; text?: string }> }>;
  };
}

export function getSessionHandoffMessages(branch?: unknown[]): unknown[];

export function generateSessionCompactionHandoffPrompt(input?: {
  ctx?: SessionCompactionHandoffGenerationContext;
  goal?: string;
  runtimeContext?: string;
  signal?: AbortSignal;
}): Promise<string>;
