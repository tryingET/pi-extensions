import { randomUUID } from "node:crypto";
import { mkdir, open, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import type { ResolvedConfig } from "./config.ts";
import { isRecord } from "./config.ts";
import { readCodexAuth } from "./usage.ts";

const OPENAI_IMAGE_TOOL = "openai_image";
const OPENAI_IMAGE_COMMAND = "openai-image";
const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_INPUT_IMAGES = 8;
const MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_INPUT_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 40 * 1024 * 1024;
const MAX_ERROR_BODY_BYTES = 16 * 1024;

export const IMAGE_SAVE_MODES = ["none", "project", "global", "custom"] as const;
export const IMAGE_ACTIONS = ["auto", "generate", "edit"] as const;
export const IMAGE_OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;

export type ImageSaveMode = (typeof IMAGE_SAVE_MODES)[number];
export type ImageAction = (typeof IMAGE_ACTIONS)[number];
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[number];

const ToolImageAction = Type.Union(
  [Type.Literal("auto"), Type.Literal("generate"), Type.Literal("edit")],
  {
    description:
      "Whether to generate a new image, edit/reference provided images, or let the model decide.",
  },
);
const ToolImageOutputFormat = Type.Union(
  [Type.Literal("png"), Type.Literal("jpeg"), Type.Literal("webp")],
  { description: "Generated image format." },
);
const ToolImageSaveMode = Type.Union(
  [Type.Literal("none"), Type.Literal("project"), Type.Literal("global"), Type.Literal("custom")],
  { description: "Where to save the generated image." },
);

const TOOL_PARAMS = Type.Object(
  {
    prompt: Type.String({
      description:
        "Image generation/editing prompt. Pass the user's wording verbatim unless they explicitly ask you to refine or expand it.",
    }),
    action: Type.Optional(ToolImageAction),
    images: Type.Optional(
      Type.Array(Type.String(), {
        description: "Local image paths to use as edit targets or references.",
      }),
    ),
    model: Type.Optional(
      Type.String({
        description:
          "OpenAI Codex model to drive the hosted image_generation tool. Defaults to current openai-codex model or config default.",
      }),
    ),
    outputFormat: Type.Optional(ToolImageOutputFormat),
    save: Type.Optional(ToolImageSaveMode),
    saveDir: Type.Optional(
      Type.String({ description: "Directory to save image when save=custom." }),
    ),
  },
  { additionalProperties: false },
);

type ToolParams = Static<typeof TOOL_PARAMS>;

type CodexImageCredentials = {
  accessToken: string;
  accountId: string;
  source: "modelRegistry" | "authFile";
};

type ImageInput = {
  path: string;
  data: string;
  mimeType: string;
};

export type CodexImageResult = {
  id: string;
  status: string;
  prompt: string;
  revisedPrompt?: string;
  data: string;
  mimeType: string;
  savedPath?: string;
  model: string;
  action: ImageAction;
  outputFormat: ImageOutputFormat;
};

type ExtractedImageResult = Omit<
  CodexImageResult,
  "prompt" | "savedPath" | "model" | "action" | "outputFormat"
>;

export type ImageGenerationDebug = {
  authFound: boolean;
  authSource?: string;
  accountId?: string;
  endpoint: string;
  defaultModel: string;
  defaultSave: ImageSaveMode;
  enabled: boolean;
  lastStatus?: string;
  lastError?: string;
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function extractAccountIdFromJwt(token: string): string | undefined {
  try {
    const [, payload] = token.split(".");
    if (!payload) return undefined;
    const parsed = JSON.parse(decodeBase64Url(payload)) as unknown;
    if (!isRecord(parsed)) return undefined;
    const auth = parsed["https://api.openai.com/auth"];
    if (!isRecord(auth)) return undefined;
    const accountId = auth.chatgpt_account_id;
    return typeof accountId === "string" && accountId.trim() ? accountId.trim() : undefined;
  } catch {
    return undefined;
  }
}

function parseRegistryCredentials(
  raw: string | undefined,
): Omit<CodexImageCredentials, "source"> | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed)) {
      const accessToken =
        typeof parsed.access === "string"
          ? parsed.access
          : typeof parsed.token === "string"
            ? parsed.token
            : undefined;
      const accountId =
        typeof parsed.accountId === "string"
          ? parsed.accountId
          : typeof parsed.account_id === "string"
            ? parsed.account_id
            : undefined;
      if (accessToken?.trim() && accountId?.trim())
        return { accessToken: accessToken.trim(), accountId: accountId.trim() };
    }
  } catch {
    // Plain bearer token is expected for openai-codex in pi.
  }
  const accountId = extractAccountIdFromJwt(value);
  return accountId ? { accessToken: value, accountId } : undefined;
}

async function getCredentials(ctx: ExtensionContext): Promise<CodexImageCredentials> {
  const registryToken = await ctx.modelRegistry
    .getApiKeyForProvider("openai-codex")
    .catch(() => undefined);
  const registryCredentials = parseRegistryCredentials(registryToken);
  if (registryCredentials) return { ...registryCredentials, source: "modelRegistry" };
  const auth = readCodexAuth();
  if (auth) return { ...auth, source: "authFile" };
  throw new Error("Missing openai-codex OAuth credentials. Run /login openai-codex.");
}

function resolveModel(
  params: Pick<ToolParams, "model">,
  ctx: ExtensionContext,
  cfg: ResolvedConfig,
): string {
  const model = params.model?.trim();
  if (model) return model.includes("/") ? model.split("/").pop() || model : model;
  if (ctx.model?.provider === "openai-codex") return ctx.model.id;
  return cfg.image.defaultModel;
}

function resolveImageConfig(cfg: ResolvedConfig, params: ToolParams) {
  const action = params.action ?? "auto";
  const outputFormat = params.outputFormat ?? cfg.image.outputFormat;
  const save = params.save ?? cfg.image.defaultSave;
  return { action, outputFormat, save };
}

function imageMimeType(path: string, outputFormat?: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (outputFormat === "jpeg") return "image/jpeg";
  if (outputFormat === "webp") return "image/webp";
  return "image/png";
}

function extensionForFormat(format: ImageOutputFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

async function readExpectedFileBytes(
  expectedBytes: number,
  readAt: (buffer: Buffer, offset: number, length: number, position: number) => Promise<number>,
): Promise<{ buffer: Buffer; bytesRead: number }> {
  const buffer = Buffer.allocUnsafe(expectedBytes + 1);
  let bytesRead = 0;
  while (bytesRead < buffer.length) {
    const count = await readAt(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
    if (count === 0) break;
    bytesRead += count;
  }
  return { buffer, bytesRead };
}

async function readBoundedImageFile(
  path: string,
  afterOpen?: () => Promise<void> | void,
): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error(`Input image is not a regular file: ${path}`);
    if (before.size > BigInt(MAX_INPUT_IMAGE_BYTES)) {
      throw new Error(`Input image exceeds ${MAX_INPUT_IMAGE_BYTES} bytes: ${path}`);
    }

    await afterOpen?.();
    const expectedBytes = Number(before.size);
    const { buffer, bytesRead } = await readExpectedFileBytes(
      expectedBytes,
      async (target, offset, length, position) =>
        (await handle.read(target, offset, length, position)).bytesRead,
    );
    const after = await handle.stat({ bigint: true });
    const currentPath = await stat(path, { bigint: true }).catch(() => undefined);
    const openedFileChanged =
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      bytesRead !== expectedBytes;
    const pathChanged =
      !currentPath || currentPath.dev !== before.dev || currentPath.ino !== before.ino;
    if (openedFileChanged || pathChanged) {
      throw new Error(`Input image changed while reading: ${path}`);
    }
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function readImageInputs(paths: string[] | undefined, cwd: string): Promise<ImageInput[]> {
  const requested = (paths ?? []).map((value) => value.trim()).filter(Boolean);
  if (requested.length > MAX_INPUT_IMAGES) {
    throw new Error(`At most ${MAX_INPUT_IMAGES} input images are allowed.`);
  }
  const inputs: ImageInput[] = [];
  let totalBytes = 0;
  for (const trimmed of requested) {
    const path = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
    const bytes = await readBoundedImageFile(path);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_INPUT_IMAGE_BYTES) {
      throw new Error(`Input images exceed ${MAX_TOTAL_INPUT_IMAGE_BYTES} total bytes.`);
    }
    inputs.push({ path, data: bytes.toString("base64"), mimeType: imageMimeType(path) });
  }
  return inputs;
}

function resolveSaveDir(
  mode: ImageSaveMode,
  params: Pick<ToolParams, "saveDir">,
  cwd: string,
): string | undefined {
  if (mode === "none") return undefined;
  if (mode === "project") return join(cwd, ".pi", "generated-images");
  if (mode === "global")
    return join(
      process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent"),
      "generated-images",
    );
  const dir = params.saveDir?.trim() || process.env.PI_IMAGE_SAVE_DIR?.trim();
  if (!dir) throw new Error("save=custom requires saveDir or PI_IMAGE_SAVE_DIR.");
  return dir;
}

async function saveImage(
  data: string,
  format: ImageOutputFormat,
  outputDir: string,
  id: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_") || randomUUID().slice(0, 8);
  const path = join(outputDir, `openai-image-${timestamp}-${safeId}.${extensionForFormat(format)}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path, Buffer.from(data, "base64"));
  return path;
}

function buildRequest(
  params: ToolParams,
  model: string,
  cfg: ResolvedConfig,
  images: ImageInput[],
) {
  const { action, outputFormat } = resolveImageConfig(cfg, params);
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: params.prompt }];
  for (const image of images) {
    content.push({
      type: "input_image",
      detail: "auto",
      image_url: `data:${image.mimeType};base64,${image.data}`,
    });
  }
  const tool: Record<string, unknown> = { type: "image_generation", output_format: outputFormat };
  if (action !== "auto") tool.action = action;
  return {
    model,
    instructions: "",
    input: [{ role: "user", content }],
    tools: [tool],
    tool_choice: { type: "image_generation" },
    parallel_tool_calls: false,
    store: false,
    stream: true,
    include: [],
    client_metadata: { "x-codex-installation-id": "pi-better-openai" },
  };
}

function dataUrlParts(value: string, fallbackMimeType: string): { data: string; mimeType: string } {
  const match = value.match(/^data:([^;,]+);base64,(.*)$/s);
  if (match) return { mimeType: match[1] || fallbackMimeType, data: match[2].trim() };
  return { data: value.trim(), mimeType: fallbackMimeType };
}

function asImageResultItem(
  value: unknown,
):
  | { id?: string; status?: string; revised_prompt?: string; result?: string; b64_json?: string }
  | undefined {
  if (!isRecord(value) || value.type !== "image_generation_call") return undefined;
  return value as {
    id?: string;
    status?: string;
    revised_prompt?: string;
    result?: string;
    b64_json?: string;
  };
}

function isImageContent(
  value: unknown,
): value is { type: "image"; data: string; mimeType: string } {
  return (
    isRecord(value) &&
    value.type === "image" &&
    typeof value.data === "string" &&
    typeof value.mimeType === "string"
  );
}

function extractImageFromEvent(
  event: unknown,
  fallbackMimeType: string,
): ExtractedImageResult | undefined {
  if (!isRecord(event)) return undefined;
  const item = asImageResultItem(event.item) ?? asImageResultItem(event);
  if (item) {
    const raw =
      typeof item.result === "string" && item.result.trim()
        ? item.result
        : typeof item.b64_json === "string"
          ? item.b64_json
          : undefined;
    if (!raw) return undefined;
    const { data, mimeType } = dataUrlParts(raw, fallbackMimeType);
    return {
      id: typeof item.id === "string" ? item.id : `ig_${randomUUID().slice(0, 8)}`,
      status: typeof item.status === "string" ? item.status : "completed",
      revisedPrompt: typeof item.revised_prompt === "string" ? item.revised_prompt : undefined,
      data,
      mimeType,
    };
  }
  const partial = event.partial_image_b64 ?? event.b64_json;
  if (typeof partial === "string" && partial.trim()) {
    const { data, mimeType } = dataUrlParts(partial, fallbackMimeType);
    return { id: `ig_${randomUUID().slice(0, 8)}`, status: "completed", data, mimeType };
  }
  return undefined;
}

async function parseSseForImage(
  response: Response,
  fallbackMimeType: string,
  signal?: AbortSignal,
): Promise<ExtractedImageResult> {
  if (!response.body) throw new Error("No response body from Codex image request.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedBytes = 0;
  let lastImage: ExtractedImageResult | undefined;
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Image request was aborted.");
      const { done, value } = await reader.read();
      if (done) break;
      if (receivedBytes + value.byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Codex image response exceeded ${MAX_RESPONSE_BYTES} bytes.`);
      }
      receivedBytes += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n")
          .trim();
        if (data && data !== "[DONE]") {
          let event: unknown;
          try {
            event = JSON.parse(data);
          } catch {
            event = undefined;
          }
          const image = extractImageFromEvent(event, fallbackMimeType);
          if (image?.data) {
            lastImage = image;
            if (image.status === "completed") {
              await reader.cancel().catch(() => undefined);
              return image;
            }
          }
          if (isRecord(event) && event.type === "response.failed") {
            const error =
              isRecord(event.response) && isRecord(event.response.error)
                ? event.response.error
                : undefined;
            const message =
              typeof error?.message === "string" ? error.message : "Codex image request failed.";
            throw new Error(message);
          }
          if (isRecord(event) && event.type === "error") {
            const message =
              typeof event.message === "string" ? event.message : JSON.stringify(event);
            throw new Error(`Codex image error: ${message}`);
          }
        }
        idx = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (lastImage) return lastImage;
  throw new Error("No image_generation_call result returned by Codex.");
}

async function requestCodexImage(
  params: ToolParams,
  ctx: ExtensionContext,
  cfg: ResolvedConfig,
  requestSignal?: AbortSignal,
): Promise<CodexImageResult> {
  if (!cfg.image.enabled) throw new Error("OpenAI image generation is disabled in config.");
  const credentials = await getCredentials(ctx);
  const model = resolveModel(params, ctx, cfg);
  const { action, outputFormat, save } = resolveImageConfig(cfg, params);
  const images = await readImageInputs(params.images, ctx.cwd || process.cwd());
  const request = buildRequest(params, model, cfg, images);
  const timeoutSignal = AbortSignal.timeout(cfg.image.timeoutMs);
  const baseSignal = requestSignal ?? ctx.signal;
  const signal = baseSignal ? AbortSignal.any([baseSignal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(CODEX_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${credentials.accessToken}`,
      "chatgpt-account-id": credentials.accountId,
      "OpenAI-Beta": "responses=experimental",
      accept: "text/event-stream",
      "content-type": "application/json",
      originator: "codex_cli_rs",
      "User-Agent": "codex_cli_rs/0.0.0 (pi-better-openai)",
    },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const text = await readBoundedResponseText(response, MAX_ERROR_BODY_BYTES).catch(() => "");
    throw new Error(
      `Codex image request failed (${response.status}): ${text || response.statusText}`,
    );
  }
  const parsed = await parseSseForImage(
    response,
    imageMimeType(`image.${outputFormat}`, outputFormat),
    signal,
  );
  const saveDir = resolveSaveDir(save, params, ctx.cwd || process.cwd());
  const savedPath = saveDir
    ? await saveImage(parsed.data, outputFormat, saveDir, parsed.id)
    : undefined;
  return { ...parsed, prompt: params.prompt, savedPath, model, action, outputFormat };
}

function displayPath(path: string): string {
  const home = homedir();
  if (!home) return path;
  if (path === home) return "~";
  const homePrefix = home.endsWith(sep) ? home : `${home}${sep}`;
  return path.startsWith(homePrefix) ? `~/${path.slice(homePrefix.length)}` : path;
}

function textFromMessageContent(content: unknown): string | undefined {
  if (typeof content === "string") return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => (part as { text: string }).text)
    .join("\n")
    .trim();
  return text || undefined;
}

function latestUserPromptFromEntries(entries: unknown[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      !isRecord(entry) ||
      entry.type !== "message" ||
      !isRecord(entry.message) ||
      entry.message.role !== "user"
    )
      continue;
    const text = textFromMessageContent(entry.message.content);
    if (text) return text;
  }
  return undefined;
}

function resolveToolPrompt(params: ToolParams, ctx: ExtensionContext): string {
  return params.prompt.trim() || latestUserPromptFromEntries(ctx.sessionManager.getEntries()) || "";
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const boundedMax = Math.max(0, maxBytes);
  const probeLimit = boundedMax + 1;
  let total = 0;
  let truncated = false;
  try {
    while (total < probeLimit) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = probeLimit - total;
      chunks.push(value.subarray(0, remaining));
      total += Math.min(value.byteLength, remaining);
      if (value.byteLength > remaining) {
        truncated = true;
        break;
      }
    }
    truncated ||= total > boundedMax;
    if (truncated) await reader.cancel().catch(() => undefined);
  } finally {
    reader.releaseLock();
  }
  const combined = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).subarray(0, boundedMax);
  return `${combined.toString("utf8")}${truncated ? "…[truncated]" : ""}`;
}

function resultText(result: CodexImageResult): string {
  const parts = [
    `Generated image using OpenAI image_generation tool via openai-codex/${result.model}.`,
    `Action: ${result.action}.`,
    `Prompt: ${result.prompt}`,
  ];
  if (result.revisedPrompt) parts.push(`Revised prompt: ${result.revisedPrompt}`);
  if (result.savedPath) parts.push(`Saved: ${displayPath(result.savedPath)}`);
  return parts.join("\n");
}

export function registerOpenAIImage(
  pi: ExtensionAPI,
  getConfig: (ctx: ExtensionContext) => ResolvedConfig,
): { getDebug: (ctx: ExtensionContext) => Promise<ImageGenerationDebug> } {
  let lastStatus: string | undefined;
  let lastError: string | undefined;

  async function generate(
    params: ToolParams,
    ctx: ExtensionContext,
    requestSignal?: AbortSignal,
  ): Promise<CodexImageResult> {
    try {
      lastStatus = "requesting";
      lastError = undefined;
      const result = await requestCodexImage(params, ctx, getConfig(ctx), requestSignal);
      lastStatus = `completed (${result.id})`;
      return result;
    } catch (error) {
      lastStatus = "error";
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async function getDebug(ctx: ExtensionContext): Promise<ImageGenerationDebug> {
    const cfg = getConfig(ctx);
    let credentials: CodexImageCredentials | undefined;
    try {
      credentials = await getCredentials(ctx);
    } catch {
      credentials = undefined;
    }
    return {
      authFound: credentials !== undefined,
      authSource: credentials?.source,
      accountId: credentials?.accountId,
      endpoint: CODEX_RESPONSES_URL,
      defaultModel: ctx.model?.provider === "openai-codex" ? ctx.model.id : cfg.image.defaultModel,
      defaultSave: cfg.image.defaultSave,
      enabled: cfg.image.enabled,
      lastStatus,
      lastError,
    };
  }

  void import("@earendil-works/pi-tui")
    .then(({ Box, Container, Image, Text }) => {
      pi.registerMessageRenderer<CodexImageResult>("openai-image", (message, _options, theme) => {
        const result = message.details;
        const text =
          result && isRecord(result)
            ? resultText(result as CodexImageResult)
            : typeof message.content === "string"
              ? message.content
              : message.content
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("\n");
        let image: { data: string; mimeType: string; savedPath?: string } | undefined;
        if (
          result &&
          isRecord(result) &&
          typeof result.data === "string" &&
          typeof result.mimeType === "string"
        ) {
          image = {
            data: result.data,
            mimeType: result.mimeType,
            savedPath: typeof result.savedPath === "string" ? result.savedPath : undefined,
          };
        } else if (Array.isArray(message.content)) {
          const imagePart = message.content.find(isImageContent);
          if (imagePart) image = { data: imagePart.data, mimeType: imagePart.mimeType };
        }

        const container = new Container();
        const box = new Box(1, 1, (line) => theme.bg("customMessageBg", line));
        box.addChild(
          new Text(`${theme.fg("accent", theme.bold("[openai-image]"))}\n\n${text}`, 0, 0),
        );
        if (image) {
          box.addChild(
            new Image(
              image.data,
              image.mimeType,
              { fallbackColor: (line) => theme.fg("dim", line) },
              {
                maxWidthCells: 80,
                maxHeightCells: 24,
                filename:
                  "savedPath" in image && typeof image.savedPath === "string"
                    ? image.savedPath
                    : undefined,
              },
            ),
          );
        }
        container.addChild(box);
        return container;
      });
    })
    .catch(() => undefined);

  pi.registerCommand(OPENAI_IMAGE_COMMAND, {
    description: "Generate an image with OpenAI Codex image generation",
    handler: async (args, ctx) => {
      const prompt = args.trim();
      if (!prompt) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /openai-image <prompt>", "error");
        return;
      }
      if (ctx.hasUI) ctx.ui.notify("Requesting OpenAI image...", "info");
      const result = await generate({ prompt }, ctx);
      pi.sendMessage({
        customType: "openai-image",
        content: [
          { type: "text", text: resultText(result) },
          { type: "image", data: result.data, mimeType: result.mimeType },
        ],
        display: true,
        details: result,
      });
    },
  });

  pi.registerTool({
    name: OPENAI_IMAGE_TOOL,
    label: "OpenAI image",
    description:
      "Generate or edit images through OpenAI Codex subscription auth using the hosted image_generation tool. Supports local reference/edit images and saves to the project by default.",
    promptSnippet: "Generate or edit raster images via OpenAI Codex subscription auth.",
    promptGuidelines: [
      "Use openai_image when the user asks to generate or edit a raster image, photo, illustration, mockup, texture, sprite, or bitmap asset.",
      "Pass the user's image prompt verbatim. Do not embellish, rewrite, add camera/style details, or add negative prompt terms unless the user explicitly asks you to refine the prompt.",
      "Use openai_image with images for local reference images or edit targets; save project assets into the workspace when requested.",
    ],
    parameters: TOOL_PARAMS,
    async execute(_toolCallId, params: ToolParams, signal, onUpdate, ctx) {
      const cfg = getConfig(ctx);
      const model = resolveModel(params, ctx, cfg);
      const requestParams = { ...params, prompt: resolveToolPrompt(params, ctx) };
      onUpdate?.({
        content: [
          {
            type: "text",
            text: `Requesting OpenAI image_generation via openai-codex/${model}...`,
          },
        ],
        details: undefined,
      });
      const result = await generate(requestParams, ctx, signal);
      return {
        content: [
          { type: "text", text: resultText(result) },
          { type: "image", data: result.data, mimeType: result.mimeType },
        ],
        details: result,
      };
    },
  });

  return { getDebug };
}

export const _imageTest = {
  CODEX_RESPONSES_URL,
  DEFAULT_TIMEOUT_MS,
  MAX_INPUT_IMAGES,
  MAX_INPUT_IMAGE_BYTES,
  MAX_TOTAL_INPUT_IMAGE_BYTES,
  MAX_ERROR_BODY_BYTES,
  OPENAI_IMAGE_TOOL,
  OPENAI_IMAGE_COMMAND,
  extractAccountIdFromJwt,
  imageMimeType,
  dataUrlParts,
  extractImageFromEvent,
  displayPath,
  latestUserPromptFromEntries,
  resolveToolPrompt,
  readExpectedFileBytes,
  readBoundedImageFile,
  readImageInputs,
  readBoundedResponseText,
  buildRequest,
};
