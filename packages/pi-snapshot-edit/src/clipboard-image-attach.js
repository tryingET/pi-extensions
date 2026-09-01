/**
summary: "Lifts host clipboard image placeholders into user-message ImageContent without snapshotting bytes."
read_when:
  - "Changing paste-path allowlisting, mime sniffing, or input-transform image attachment."
*/
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { tmpdir as osTmpdir } from "node:os";
import { sep } from "node:path";

export const CLIPBOARD_IMAGE_LIFT_ENV = "PI_SNAPSHOT_EDIT_IMAGE_LIFT";
export const CLIPBOARD_IMAGE_LIFT_OPT_OUT = new Set(["0", "false", "off", "no"]);
export const MAX_CLIPBOARD_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_CLIPBOARD_IMAGES_PER_MESSAGE = 4;

const CLIPBOARD_PATH_RE =
  /(^|[\s"'`])(\/[^\s"'`]*pi-clipboard-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(?:png|jpe?g|webp|gif))\b/g;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function isClipboardImageLiftDisabled(env = process.env) {
  const value = env[CLIPBOARD_IMAGE_LIFT_ENV]?.trim().toLowerCase();
  return value !== undefined && CLIPBOARD_IMAGE_LIFT_OPT_OUT.has(value);
}

export function findClipboardImagePaths(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const found = [];
  for (const match of text.matchAll(CLIPBOARD_PATH_RE)) {
    const prefix = match[1] ?? "";
    const raw = match[2];
    found.push({
      raw,
      index: (match.index ?? 0) + prefix.length,
      length: raw.length,
    });
  }
  return found;
}

export function detectStillImageMimeType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (startsWith(bytes, [255, 216, 255]) && bytes[3] !== 247) return "image/jpeg";
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return isPng(bytes) && !isAnimatedPng(bytes) ? "image/png" : null;
  }
  const gifHead = ascii(bytes, 0, 6);
  if (gifHead === "GIF87a" || gifHead === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export function isPathInsideDir(targetPath, rootPath) {
  if (typeof targetPath !== "string" || typeof rootPath !== "string") return false;
  const rootWithSep = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
  return targetPath.startsWith(rootWithSep);
}

export async function liftClipboardImages(text, existingImages = [], options = {}) {
  const images = Array.isArray(existingImages) ? [...existingImages] : [];
  if (typeof text !== "string" || text.length === 0) {
    return { changed: false, text: text ?? "", images };
  }
  if (isClipboardImageLiftDisabled(options.env ?? process.env)) {
    return { changed: false, text, images };
  }

  const candidates = findClipboardImagePaths(text);
  if (candidates.length === 0) return { changed: false, text, images };

  const tmpRoot = await realpath(options.tmpDir ?? osTmpdir());
  const maxBytes = options.maxBytes ?? MAX_CLIPBOARD_IMAGE_BYTES;
  const maxImages = options.maxImages ?? MAX_CLIPBOARD_IMAGES_PER_MESSAGE;
  const replacements = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (replacements.length >= maxImages) break;
    if (seen.has(candidate.raw)) continue;
    seen.add(candidate.raw);
    const lifted = await liftOneClipboardImage(candidate.raw, tmpRoot, maxBytes);
    if (!lifted) continue;
    replacements.push({ ...candidate, ...lifted });
  }

  if (replacements.length === 0) return { changed: false, text, images };

  let nextText = text;
  for (const replacement of [...replacements].sort((left, right) => right.index - left.index)) {
    const marker = `<file name="${replacement.canonicalPath}"></file>`;
    nextText = `${nextText.slice(0, replacement.index)}${marker}${nextText.slice(replacement.index + replacement.length)}`;
    images.push({
      type: "image",
      mimeType: replacement.mimeType,
      data: replacement.data,
    });
  }

  return { changed: true, text: nextText, images };
}

async function liftOneClipboardImage(rawPath, tmpRoot, maxBytes) {
  try {
    const requested = await lstat(rawPath);
    if (!requested.isFile() && !requested.isSymbolicLink()) return null;
    const canonicalPath = await realpath(rawPath);
    if (!isPathInsideDir(canonicalPath, tmpRoot)) return null;
    const fileStat = await stat(canonicalPath);
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > maxBytes) return null;
    const bytes = await readFile(canonicalPath);
    const mimeType = detectStillImageMimeType(bytes);
    if (!mimeType) return null;
    return {
      canonicalPath,
      mimeType,
      data: bytes.toString("base64"),
    };
  } catch {
    return null;
  }
}

function isPng(buffer) {
  return (
    buffer.length >= 16 &&
    readUint32BE(buffer, PNG_SIGNATURE.length) === 13 &&
    ascii(buffer, 12, 4) === "IHDR"
  );
}

function isAnimatedPng(buffer) {
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const chunkLength = readUint32BE(buffer, offset);
    const chunkTypeOffset = offset + 4;
    if (ascii(buffer, chunkTypeOffset, 4) === "acTL") return true;
    if (ascii(buffer, chunkTypeOffset, 4) === "IDAT") return false;
    const nextOffset = offset + 8 + chunkLength + 4;
    if (nextOffset <= offset || nextOffset > buffer.length) return false;
    offset = nextOffset;
  }
  return false;
}

function startsWith(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function ascii(buffer, offset, length) {
  if (buffer.length < offset + length) return "";
  return Buffer.from(buffer.subarray(offset, offset + length)).toString("ascii");
}

function readUint32BE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) * 16777216 +
    ((buffer[offset + 1] ?? 0) << 16) +
    ((buffer[offset + 2] ?? 0) << 8) +
    (buffer[offset + 3] ?? 0)
  );
}
