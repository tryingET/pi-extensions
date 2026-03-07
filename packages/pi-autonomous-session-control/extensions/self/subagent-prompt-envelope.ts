/**
 * Prompt envelope contract for dispatch_subagent.
 */

export interface PromptEnvelopeInput {
  prompt_name?: string;
  prompt_content?: string;
  prompt_tags?: string[];
  prompt_source?: string;
}

export interface PromptEnvelopeApplied {
  systemPrompt?: string;
  prompt_name?: string;
  prompt_source?: string;
  prompt_tags?: string[];
  prompt_applied: boolean;
  prompt_warning?: string;
}

const DEFAULT_PROMPT_SOURCE = "vault-client";

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePromptTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) {
    return undefined;
  }

  const normalized = tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim();
}

function buildPromptEnvelopeHeader(envelope: {
  prompt_name?: string;
  prompt_source: string;
  prompt_tags?: string[];
}): string {
  const tags = envelope.prompt_tags?.map(sanitizeHeaderValue).join(", ") ?? "none";
  const name = sanitizeHeaderValue(envelope.prompt_name || "unnamed");
  const source = sanitizeHeaderValue(envelope.prompt_source);

  return ["[Prompt Envelope]", `name: ${name}`, `source: ${source}`, `tags: ${tags}`, ""].join(
    "\n",
  );
}

function buildPromptWarning(
  input: PromptEnvelopeInput,
  hasUsableContent: boolean,
): string | undefined {
  const hasNonEmptyTags =
    Array.isArray(input.prompt_tags) && input.prompt_tags.some((tag) => tag.trim().length > 0);
  const metadataProvided =
    hasText(input.prompt_name) || hasText(input.prompt_source) || hasNonEmptyTags;
  const contentProvided = typeof input.prompt_content === "string";

  if (contentProvided && !hasUsableContent) {
    return "prompt_content was provided but empty; no prompt was injected. Provide non-empty prompt_content to apply a prompt envelope.";
  }

  if (!hasUsableContent && metadataProvided) {
    return "Prompt envelope metadata was provided without prompt_content; no prompt was injected. Pass prompt_content from vault_retrieve output to apply the envelope.";
  }

  return undefined;
}

export function applyPromptEnvelope(
  systemPrompt: string | undefined,
  envelope: PromptEnvelopeInput,
): PromptEnvelopeApplied {
  const prompt_tags = normalizePromptTags(envelope.prompt_tags);
  const promptContentProvided = typeof envelope.prompt_content === "string";
  const promptHasUsableContent = hasText(envelope.prompt_content);
  const hasEnvelopeFields =
    hasText(envelope.prompt_name) ||
    promptContentProvided ||
    hasText(envelope.prompt_source) ||
    Boolean(prompt_tags?.length);

  const prompt_name = hasText(envelope.prompt_name)
    ? sanitizeHeaderValue(envelope.prompt_name)
    : undefined;
  const prompt_source = hasEnvelopeFields
    ? hasText(envelope.prompt_source)
      ? sanitizeHeaderValue(envelope.prompt_source)
      : DEFAULT_PROMPT_SOURCE
    : undefined;
  const prompt_warning = buildPromptWarning(envelope, promptHasUsableContent);

  if (!promptHasUsableContent) {
    return {
      systemPrompt,
      prompt_name,
      prompt_source,
      prompt_tags,
      prompt_applied: false,
      prompt_warning,
    };
  }

  const promptHeader = buildPromptEnvelopeHeader({
    prompt_name,
    prompt_source: prompt_source || DEFAULT_PROMPT_SOURCE,
    prompt_tags,
  });

  const combinedPrompt = systemPrompt?.trim()
    ? `${promptHeader}${envelope.prompt_content}\n\n---\n\n${systemPrompt}`
    : `${promptHeader}${envelope.prompt_content}`;

  return {
    systemPrompt: combinedPrompt,
    prompt_name,
    prompt_source: prompt_source || DEFAULT_PROMPT_SOURCE,
    prompt_tags,
    prompt_applied: true,
  };
}
