/**
summary: "A mode's prompt may live in a sibling <key>.md next to <key>.json: read it safely, and write it back where it lives."
read_when:
  - "Changing where a mode's prompt text is stored, or how the prompt file is read, saved or deleted."
*/
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename } from "node:path";

/** The largest prompt, inline or in a prompt file (re-exported by mode-definitions). */
export const MODE_PROMPT_MAX_BYTES = 128 * 1024;
// The prompt limit applies to the prompt text once trimmed; the file may carry a byte order mark,
// line endings and surrounding blank lines on top, within this bound on what is read at all.
const PROMPT_FILE_MAX_BYTES = MODE_PROMPT_MAX_BYTES + 4096;
const BOM = "\uFEFF";

/** The prompt file beside a mode definition: `<key>.md` for `<key>.json`. */
export function promptFilePath(definitionPath: string): string {
  return definitionPath.replace(/\.json$/u, ".md");
}

/**
 * The text of a prompt file, or undefined when there is none. Opened without following a symbolic
 * link and without blocking, then checked on that same descriptor (a regular file within the size
 * limit) before anything is read: a link, FIFO, device or directory, or an oversized file, is refused
 * rather than read. A leading byte order mark is dropped.
 */
export function readPromptFile(path: string): string | undefined {
  let descriptor: number;
  try {
    // Where the platform has no O_NOFOLLOW (Windows), the link is refused up front instead.
    if (constants.O_NOFOLLOW === undefined && lstatSync(path).isSymbolicLink()) {
      throw Object.assign(new Error("symbolic link"), { code: "ELOOP" });
    }
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    if (code === "ELOOP") throw new Error(`${basename(path)} must not be a symbolic link`);
    throw error;
  }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) throw new Error(`${basename(path)} must be a regular file`);
    const tooLarge = () =>
      new Error(`${basename(path)} is larger than a ${MODE_PROMPT_MAX_BYTES}-byte prompt allows`);
    if (stat.size > PROMPT_FILE_MAX_BYTES) throw tooLarge();
    // Read on this descriptor, never past the limit, whatever the size became since the check.
    const buffer = Buffer.allocUnsafe(PROMPT_FILE_MAX_BYTES + 1);
    let length = 0;
    for (let read = -1; read !== 0 && length < buffer.length; length += read) {
      read = readSync(descriptor, buffer, length, buffer.length - length, null);
    }
    if (length > PROMPT_FILE_MAX_BYTES) throw tooLarge();
    const text = buffer.toString("utf8", 0, length);
    return text.startsWith(BOM) ? text.slice(1) : text;
  } finally {
    closeSync(descriptor);
  }
}

/** The prompt file's content for a prompt: a leading BOM of the prompt itself survives the reader. */
export function promptFileText(prompt: string, exact: boolean): string {
  const text = exact ? prompt : `${prompt}\n`;
  return text.startsWith(BOM) ? `${BOM}${text}` : text;
}

/** Whether a prompt file sits beside the definition (whatever it is: saving must not ignore it). */
export function hasPromptFile(definitionPath: string): boolean {
  try {
    lstatSync(promptFilePath(definitionPath));
    return true;
  } catch {
    return false;
  }
}

/** Atomically replaces `target` with `text`, refusing to write through a symbolic link. */
export function writeFileAtomically(target: string, text: string): void {
  try {
    if (lstatSync(target).isSymbolicLink())
      throw new Error(`${target} must not be a symbolic link`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}
