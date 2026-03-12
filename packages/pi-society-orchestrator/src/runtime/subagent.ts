import { superviseProcess } from "./process-supervisor.ts";

export interface SpawnPiSubagentParams {
  tools: string;
  systemPrompt: string;
  objective: string;
  model: string;
  sessionFile: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputChars?: number;
  maxEventBufferBytes?: number;
}

export interface SpawnPiSubagentResult {
  output: string;
  exitCode: number;
  elapsed: number;
  stderr?: string;
  aborted?: boolean;
  timedOut?: boolean;
  outputTruncated?: boolean;
}

const DEFAULT_PI_SUBAGENT_TIMEOUT_MS =
  Number.parseInt(process.env.PI_ORCH_SUBAGENT_TIMEOUT_MS || "", 10) || 10 * 60 * 1000;
const DEFAULT_PI_OUTPUT_CHARS =
  Number.parseInt(process.env.PI_ORCH_SUBAGENT_OUTPUT_CHARS || "", 10) || 64_000;
const DEFAULT_PI_EVENT_BUFFER_BYTES =
  Number.parseInt(process.env.PI_ORCH_SUBAGENT_EVENT_BUFFER_BYTES || "", 10) || 256 * 1024;

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (item): item is { type: string; text?: string } =>
        typeof item === "object" && item !== null && "type" in item,
    )
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("");
}

function consumePiEventLine(params: {
  line: string;
  appendTextDelta: (value: string) => void;
  setFinalAssistantText: (value: string) => void;
}): string | undefined {
  if (!params.line.trim()) {
    return undefined;
  }

  try {
    const event = JSON.parse(params.line);
    if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      params.appendTextDelta(event.assistantMessageEvent.delta || "");
      return undefined;
    }

    if (event.type === "message_end" && event.message?.role === "assistant") {
      const text = extractAssistantText(event.message.content);
      if (text) {
        params.setFinalAssistantText(text);
      }
    }

    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function buildCombinedSystemPrompt(params: {
  agentSystemPrompt: string;
  cognitiveToolContent: string;
  contextHeading?: string;
  contextBody?: string;
  extraSections?: string[];
}): string {
  const sections = [params.agentSystemPrompt.trim(), params.cognitiveToolContent.trim()];

  if (params.contextBody) {
    sections.push(`## ${params.contextHeading || "OBJECTIVE"}\n\n${params.contextBody}`);
  }

  if (params.extraSections) {
    for (const section of params.extraSections) {
      const trimmed = section.trim();
      if (trimmed) {
        sections.push(trimmed);
      }
    }
  }

  return sections.filter(Boolean).join("\n\n---\n\n");
}

export async function spawnPiSubagent(
  params: SpawnPiSubagentParams,
): Promise<SpawnPiSubagentResult> {
  const args = [
    "--mode",
    "json",
    "-p",
    "--no-extensions",
    "--model",
    params.model,
    "--tools",
    params.tools,
    "--thinking",
    "off",
    "--append-system-prompt",
    params.systemPrompt,
    "--session",
    params.sessionFile,
    params.objective,
  ];

  const maxOutputChars = params.maxOutputChars ?? DEFAULT_PI_OUTPUT_CHARS;
  const maxEventBufferBytes = params.maxEventBufferBytes ?? DEFAULT_PI_EVENT_BUFFER_BYTES;

  let stdoutBuffer = "";
  let streamedAssistantText = "";
  let finalAssistantText = "";
  let assistantOutputTruncated = false;
  const parseErrors: string[] = [];

  const appendAssistantText = (value: string) => {
    const bounded = appendBoundedString(streamedAssistantText, value, maxOutputChars);
    streamedAssistantText = bounded.value;
    assistantOutputTruncated = assistantOutputTruncated || bounded.truncated;
  };

  const setFinalAssistantText = (value: string) => {
    const bounded = appendBoundedString("", value, maxOutputChars);
    finalAssistantText = bounded.value;
    assistantOutputTruncated = assistantOutputTruncated || bounded.truncated;
  };

  const result = await superviseProcess({
    command: "pi",
    args,
    env: { ...process.env },
    signal: params.signal,
    timeoutMs: params.timeoutMs ?? DEFAULT_PI_SUBAGENT_TIMEOUT_MS,
    onStdoutData: (chunk) => {
      stdoutBuffer += chunk;
      if (Buffer.byteLength(stdoutBuffer, "utf-8") > maxEventBufferBytes) {
        parseErrors.push(
          `Pi JSON event buffer exceeded ${maxEventBufferBytes} bytes without a newline delimiter.`,
        );
        stdoutBuffer = "";
        return;
      }

      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        const parseError = consumePiEventLine({
          line,
          appendTextDelta: appendAssistantText,
          setFinalAssistantText,
        });
        if (parseError) {
          parseErrors.push(parseError);
        }
      }
    },
  });

  if (stdoutBuffer.trim()) {
    const parseError = consumePiEventLine({
      line: stdoutBuffer,
      appendTextDelta: appendAssistantText,
      setFinalAssistantText,
    });
    if (parseError) {
      parseErrors.push(parseError);
    }
  }

  const parseErrorSummary =
    parseErrors.length > 0 ? `Failed to parse ${parseErrors.length} pi JSON event line(s).` : "";
  const parseErrorDetails = parseErrors.slice(0, 3).join("\n");
  const truncationSummary = [
    result.stdoutTruncated ? "Process stdout capture truncated." : "",
    result.stderrTruncated ? "Process stderr capture truncated." : "",
    assistantOutputTruncated ? `Assistant output truncated to ${maxOutputChars} characters.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const combinedStderr = [result.stderr, parseErrorSummary, parseErrorDetails, truncationSummary]
    .filter(Boolean)
    .join("\n");
  const fallbackOutput = result.aborted
    ? "Subagent aborted."
    : result.timedOut
      ? `Subagent timed out after ${params.timeoutMs ?? DEFAULT_PI_SUBAGENT_TIMEOUT_MS}ms.`
      : combinedStderr || `pi exited with code ${result.exitCode}`;

  const protocolFailed = parseErrors.length > 0;
  const protocolAwareOutput = protocolFailed
    ? [streamedAssistantText || finalAssistantText, parseErrorSummary]
        .filter(Boolean)
        .join("\n\n") || fallbackOutput
    : streamedAssistantText || finalAssistantText || fallbackOutput;
  const output = assistantOutputTruncated
    ? `${protocolAwareOutput}\n\n...[assistant output truncated]`
    : protocolAwareOutput;

  return {
    output,
    exitCode: protocolFailed ? 1 : result.exitCode,
    elapsed: result.elapsed,
    stderr: combinedStderr || undefined,
    aborted: result.aborted,
    timedOut: result.timedOut,
    outputTruncated: assistantOutputTruncated || result.stdoutTruncated || result.stderrTruncated,
  };
}

function appendBoundedString(
  current: string,
  addition: string,
  maxChars: number,
): { value: string; truncated: boolean } {
  if (maxChars <= 0) {
    return { value: "", truncated: current.length > 0 || addition.length > 0 };
  }

  if (current.length >= maxChars) {
    return { value: current, truncated: addition.length > 0 };
  }

  const remaining = maxChars - current.length;
  if (addition.length <= remaining) {
    return { value: current + addition, truncated: false };
  }

  return {
    value: current + addition.slice(0, remaining),
    truncated: true,
  };
}
