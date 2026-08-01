import type { Static, TSchema } from "typebox";

export interface PiTextContent {
  type: "text";
  text: string;
}

export interface PiToolResult<TDetails = unknown> {
  content: PiTextContent[];
  details: TDetails;
}

export type PiToolUpdateCallback<TDetails = unknown> = (
  update: PiToolResult<TDetails>,
) => void | Promise<void>;

export interface PiExtensionContext {
  cwd: string;
  hasUI: boolean;
  ui: {
    confirm(title: string, message: string): Promise<boolean>;
    notify(message: string, level: "info" | "warning" | "error"): void;
  };
}

export interface PiToolDefinition<TParameters extends TSchema = TSchema, TDetails = unknown> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: TParameters;
  execute(
    toolCallId: string,
    params: Static<TParameters>,
    signal: AbortSignal | undefined,
    onUpdate: PiToolUpdateCallback<TDetails> | undefined,
    context: PiExtensionContext,
  ): Promise<PiToolResult<TDetails>>;
}

export interface PiCommandDefinition {
  description: string;
  handler(args: string, context: PiExtensionContext): Promise<void>;
}

export interface PiCodeModeApi {
  registerTool<TParameters extends TSchema = TSchema, TDetails = unknown>(
    tool: PiToolDefinition<TParameters, TDetails>,
  ): void;
  registerCommand(name: string, command: PiCommandDefinition): void;
  on(
    event: "session_start" | "session_shutdown",
    handler: (...args: unknown[]) => Promise<void> | void,
  ): void;
}
