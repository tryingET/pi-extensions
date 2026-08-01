import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { SchedulerHandoff } from "./workstation-scheduler.ts";

export type AudioFormat = "wav" | "mp3" | "flac";

export type AudioInputPolicy = {
  request_format?: string;
  formats?: AudioFormat[];
  max_bytes?: number;
  max_encoded_bytes?: number;
  transport?: string;
  authorization_mode?: string;
};

export type ArmedAudio = {
  nonce: string;
  marker: string;
  providerId: string;
  modelId: string;
  payloadModel: string;
  format: AudioFormat;
  data: Buffer;
  expiresAt: number;
  expiryTimer?: ReturnType<typeof setTimeout>;
  scheduler?: SchedulerHandoff;
};

export type ParsedAudioSend = {
  path: string;
  prompt: string;
};

const MARKER_PREFIX = "[pi-workstation-audio:v1:";
const MARKER_RE = /\[pi-workstation-audio:v1:[0-9a-f-]{36}\]/g;
const DEFAULT_PROMPT = "Please analyze the attached audio and respond to its content.";
const DEFAULT_FORMATS: AudioFormat[] = ["wav", "mp3", "flac"];
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_TTL_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function stripMatchingQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value.at(-1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseAudioSendArgs(raw: string): ParsedAudioSend {
  const separator = raw.indexOf(" -- ");
  const rawPath = (separator >= 0 ? raw.slice(0, separator) : raw).trim();
  const prompt = (separator >= 0 ? raw.slice(separator + 4) : "").trim() || DEFAULT_PROMPT;
  const path = stripMatchingQuotes(rawPath);
  if (!path) throw new Error("usage: audio-send <path> -- <prompt>");
  return { path, prompt };
}

export function audioMarker(nonce: string): string {
  return `${MARKER_PREFIX}${nonce}]`;
}

export function hasAudioMarker(messages: unknown, marker: string): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => {
    if (!isRecord(message) || message.role !== "user") return false;
    const content = message.content;
    if (typeof content === "string") return content.includes(marker);
    return (
      Array.isArray(content) &&
      content.some(
        (block) =>
          isRecord(block) &&
          block.type === "text" &&
          typeof block.text === "string" &&
          block.text.includes(marker),
      )
    );
  });
}

export function latestUserAudioMarker(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message) || message.role !== "user") continue;
    const content = message.content;
    const texts =
      typeof content === "string"
        ? [content]
        : Array.isArray(content)
          ? content
              .filter(
                (block) =>
                  isRecord(block) && block.type === "text" && typeof block.text === "string",
              )
              .map((block) => String(block.text))
          : [];
    const matches = texts.flatMap((text) => [...text.matchAll(MARKER_RE)].map((match) => match[0]));
    return matches.length === 1 ? matches[0] : matches.length > 1 ? "multiple" : undefined;
  }
  return undefined;
}

function resolveAudioPath(rawPath: string, cwd: string): string {
  const expanded =
    rawPath === "~"
      ? homedir()
      : rawPath.startsWith("~/")
        ? join(homedir(), rawPath.slice(2))
        : rawPath;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function extensionFormat(path: string): AudioFormat | undefined {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".wav")) return "wav";
  if (normalized.endsWith(".mp3")) return "mp3";
  if (normalized.endsWith(".flac")) return "flac";
  return undefined;
}

function hasExpectedMagic(data: Buffer, format: AudioFormat): boolean {
  if (format === "wav") {
    return (
      data.length >= 12 &&
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WAVE"
    );
  }
  if (format === "flac")
    return data.length >= 4 && data.subarray(0, 4).toString("ascii") === "fLaC";
  return (
    (data.length >= 3 && data.subarray(0, 3).toString("ascii") === "ID3") ||
    (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0)
  );
}

function sameOpenedFile(before: Stats, after: Stats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs
  );
}

export async function readBoundedAudio(
  rawPath: string,
  cwd: string,
  policy: AudioInputPolicy,
): Promise<{ data: Buffer; format: AudioFormat }> {
  if (policy.request_format !== "openai-chat-input-audio" || policy.transport !== "inline-base64") {
    throw new Error("selected model does not declare the supported inline audio request contract");
  }
  const format = extensionFormat(rawPath);
  const formats = policy.formats?.length ? policy.formats : DEFAULT_FORMATS;
  if (!format || !formats.includes(format))
    throw new Error(`audio format must be one of: ${formats.join(", ")}`);

  const maxBytes = positiveInteger(policy.max_bytes, DEFAULT_MAX_BYTES);
  const maxEncodedBytes = positiveInteger(policy.max_encoded_bytes, 4 * Math.ceil(maxBytes / 3));
  const path = resolveAudioPath(rawPath, cwd);
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error("audio input must be a regular file");
    if (before.size <= 0) throw new Error("audio input must not be empty");
    if (before.size > maxBytes) throw new Error(`audio input exceeds max_bytes=${maxBytes}`);
    const data = await handle.readFile();
    const after = await handle.stat();
    if (!sameOpenedFile(before, after) || data.length !== before.size) {
      data.fill(0);
      throw new Error("audio input changed while it was being read");
    }
    if (!hasExpectedMagic(data, format)) {
      data.fill(0);
      throw new Error(`audio bytes do not match .${format}`);
    }
    const encodedBytes = 4 * Math.ceil(data.length / 3);
    if (encodedBytes > maxEncodedBytes) {
      data.fill(0);
      throw new Error(`audio input exceeds max_encoded_bytes=${maxEncodedBytes}`);
    }
    return { data, format };
  } finally {
    await handle.close();
  }
}

function countInputAudioBlocks(messages: unknown[]): number {
  let count = 0;
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.content)) continue;
    count += message.content.filter(
      (block) => isRecord(block) && block.type === "input_audio",
    ).length;
  }
  return count;
}

function audioMarkersInContent(content: unknown): string[] {
  const texts =
    typeof content === "string"
      ? [content]
      : Array.isArray(content)
        ? content
            .filter(
              (block) => isRecord(block) && block.type === "text" && typeof block.text === "string",
            )
            .map((block) => String(block.text))
        : [];
  return texts.flatMap((text) => [...text.matchAll(MARKER_RE)].map((match) => match[0]));
}

function transformMarkedUserContent(
  content: unknown,
  marker: string,
  audioBlock: unknown,
): unknown {
  if (typeof content === "string") {
    const text = content.replace(marker, "").trim();
    return [{ type: "text", text }, audioBlock];
  }
  if (!Array.isArray(content)) throw new Error("latest audio user content is unsupported");
  const transformed = content.map((block) =>
    isRecord(block) && block.type === "text" && typeof block.text === "string"
      ? { ...block, text: block.text.replaceAll(marker, "").trim() }
      : block,
  );
  transformed.push(audioBlock);
  return transformed;
}

export function transformAudioPayload(payload: unknown, attachment: ArmedAudio): unknown {
  if (Date.now() >= attachment.expiresAt)
    throw new Error("audio attachment expired before dispatch");
  if (!isRecord(payload) || !Array.isArray(payload.messages))
    throw new Error("audio provider payload has no messages array");
  if (payload.model !== attachment.payloadModel)
    throw new Error("audio provider payload model drifted before dispatch");
  if (Array.isArray(payload.tools) && payload.tools.length > 0)
    throw new Error("audio provider payload must not contain tools");
  if (countInputAudioBlocks(payload.messages) !== 0)
    throw new Error("audio provider payload already contains input_audio blocks");

  let latestUserIndex = -1;
  const markers: string[] = [];
  for (let index = 0; index < payload.messages.length; index += 1) {
    const message = payload.messages[index];
    if (!isRecord(message) || message.role !== "user") continue;
    latestUserIndex = index;
    markers.push(...audioMarkersInContent(message.content));
  }
  if (latestUserIndex < 0) throw new Error("audio provider payload has no user message");
  const latestUser = payload.messages[latestUserIndex];
  if (!isRecord(latestUser)) throw new Error("latest audio user message is invalid");
  const latestMarkers = audioMarkersInContent(latestUser.content);
  if (latestMarkers.length !== 1 || latestMarkers[0] !== attachment.marker) {
    throw new Error("audio marker must appear exactly once in the latest user message");
  }
  if (markers.length !== 1 || markers[0] !== attachment.marker) {
    throw new Error(`audio marker match count must be 1, got ${markers.length}`);
  }

  const audioBlock = {
    type: "input_audio",
    input_audio: { data: attachment.data.toString("base64"), format: attachment.format },
  };
  const messages = payload.messages.map((message, index) =>
    index === latestUserIndex
      ? {
          ...latestUser,
          content: transformMarkedUserContent(latestUser.content, attachment.marker, audioBlock),
        }
      : message,
  );
  if (countInputAudioBlocks(messages) !== 1)
    throw new Error("final audio provider payload must contain exactly one input_audio block");
  return { ...payload, tools: undefined, messages };
}

export function armAudio(options: {
  providerId: string;
  modelId: string;
  payloadModel: string;
  format: AudioFormat;
  data: Buffer;
  ttlMs?: number;
  expiresAt?: number;
  scheduler?: SchedulerHandoff;
}): ArmedAudio {
  const nonce = randomUUID();
  return {
    ...options,
    nonce,
    marker: audioMarker(nonce),
    expiresAt: Math.min(
      options.expiresAt ?? Number.POSITIVE_INFINITY,
      Date.now() + positiveInteger(options.ttlMs, DEFAULT_TTL_MS),
    ),
  };
}

export function clearArmedAudio(attachment: ArmedAudio | undefined): undefined {
  if (attachment?.expiryTimer) clearTimeout(attachment.expiryTimer);
  attachment?.data.fill(0);
  return undefined;
}
