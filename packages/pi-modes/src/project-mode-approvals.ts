/**
summary: "Remembers which exact project-scoped mode definitions the operator confirmed, and says which modes in a selection still need confirming."
read_when:
  - "Changing how project modes are gated before activation or composition, or where confirmations are stored."
*/
import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { modeDefinitionFingerprint, type ResolvedMode } from "./mode-definitions.ts";
import { countHiddenCharacters, displaySafe } from "./untrusted-text.ts";

export const PROJECT_MODE_APPROVALS_FILE = "mode-approvals.json";
const SCHEMA_VERSION = 1;
const MAX_APPROVALS_BYTES = 1024 * 1024;
// Most recently confirmed files kept; older ones are asked about again.
const MAX_APPROVALS = 2048;
// Another Pi session can write between our read and rename; verify and retry instead of locking.
const WRITE_ATTEMPTS = 5;
const MAX_SYMLINK_HOPS = 40;
const EXCERPT_CHARS = 160;

interface ApprovalsFile {
  schemaVersion: number;
  // Canonical mode file path -> approval digest the operator confirmed, least recent first.
  approvals: Record<string, string>;
}

type ApprovalsRead =
  | { state: "ok"; approvals: Map<string, string> }
  | { state: "missing" | "newer"; approvals: Map<string, string> }
  // Malformed content, kept byte for byte so it can be saved aside before the record is rewritten.
  | { state: "invalid"; approvals: Map<string, string>; bytes: Buffer }
  // Not safe to rewrite: an I/O error, not a regular file, or larger than any record we write.
  | { state: "unreadable"; approvals: Map<string, string>; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readApprovalsFile(path: string): ApprovalsRead {
  let bytes: Buffer;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return { state: "unreadable", approvals: new Map(), reason: "not a file" };
    if (stat.size > MAX_APPROVALS_BYTES) {
      return { state: "unreadable", approvals: new Map(), reason: "larger than 1 MiB" };
    }
    bytes = readFileSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT"
      ? { state: "missing", approvals: new Map() }
      : { state: "unreadable", approvals: new Map(), reason: code ?? String(error) };
  }
  const invalid = { state: "invalid" as const, approvals: new Map<string, string>(), bytes };
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return invalid;
  }
  if (!isRecord(parsed)) return invalid;
  if (typeof parsed.schemaVersion === "number" && parsed.schemaVersion > SCHEMA_VERSION) {
    return { state: "newer", approvals: new Map() };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION || !isRecord(parsed.approvals)) return invalid;
  const entries = Object.entries(parsed.approvals);
  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === "string")) {
    return invalid;
  }
  return { state: "ok", approvals: new Map(entries) };
}

/**
 * Confirmed project mode definitions. A missing, unreadable, oversized, malformed or newer record
 * yields none, so every project mode stays blocked until confirmed: the record only widens trust.
 */
export function readProjectModeApprovals(path: string): Map<string, string> {
  return readApprovalsFile(path).approvals;
}

/**
 * What a confirmation covers: the exact definition and what it replaces, so a mode confirmed while
 * it replaced nothing is asked about again once it takes over a built-in, global or outer mode.
 */
export function projectApprovalDigest(mode: ResolvedMode): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        modeDefinitionFingerprint(mode).digest,
        mode.shadows ?? null,
        mode.shadowedPath ?? null,
      ]),
    )
    .digest("hex");
}

export function isProjectModeApproved(
  mode: ResolvedMode,
  approvals: ReadonlyMap<string, string>,
): boolean {
  return (
    mode.scope !== "project" ||
    (!!mode.path && approvals.get(mode.path) === projectApprovalDigest(mode))
  );
}

/**
 * Resolves `link` from the real directory `base` one component at a time, the way the kernel does:
 * each existing prefix through the OS realpath, then `..` from that real directory. A lexical
 * resolve would send a `..` after a symlinked directory somewhere no read of the record looks.
 */
function followLink(base: string, link: string): string {
  let current = base;
  let missing: string | undefined;
  for (const part of link.split("/")) {
    if (part === "" || part === ".") continue;
    // A missing directory is created on write, but `..` out of one cannot be resolved by the kernel
    // (or by any read of the record) until then, and would point somewhere else once it exists.
    if (missing && part === "..") {
      throw new Error(`the record link ${link} leaves the missing directory ${missing}`);
    }
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    const next = join(current, part);
    try {
      current = realpathSync.native(next);
    } catch {
      // Not there yet: writing creates it.
      current = next;
      missing = next;
    }
  }
  return current;
}

/** The file a record path really names: symlinks (dotfiles) are written through, even dangling. */
function recordTarget(path: string): string {
  let target = path;
  for (let hop = 0; hop < MAX_SYMLINK_HOPS; hop += 1) {
    let link: string;
    try {
      if (!lstatSync(target).isSymbolicLink()) return target;
      link = readlinkSync(target);
    } catch {
      // Missing: this path is the target.
      return target;
    }
    target = followLink(isAbsolute(link) ? "/" : realpathSync.native(dirname(target)), link);
  }
  throw new Error(`${path}: too many levels of symbolic links`);
}

function serialize(approvals: ReadonlyMap<string, string>): string {
  const body: ApprovalsFile = {
    schemaVersion: SCHEMA_VERSION,
    approvals: Object.fromEntries(approvals),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

/**
 * Keeps the record within MAX_APPROVALS entries and MAX_APPROVALS_BYTES by forgetting the least
 * recently confirmed files; a forgotten file is only asked about again.
 */
function bounded(approvals: Map<string, string>, keep: ReadonlySet<string>): string {
  let text = serialize(approvals);
  let exact = Buffer.byteLength(text);
  const fits = () => approvals.size <= MAX_APPROVALS && exact <= MAX_APPROVALS_BYTES;
  if (fits()) return text;
  const entryBytes = (file: string) =>
    Buffer.byteLength(`    ${JSON.stringify(file)}: ${JSON.stringify(approvals.get(file))},\n`);
  // Least recently confirmed first, without looking at the files: a stat on an unreachable mount
  // could hang every confirmation once the record is full.
  const order = [...approvals.keys()].filter((file) => !keep.has(file));
  let estimate = exact;
  for (const file of order) {
    if (fits()) break;
    estimate -= entryBytes(file);
    approvals.delete(file);
    // Serialize only once the running estimate (close, not exact) says the record fits.
    if (approvals.size <= MAX_APPROVALS && estimate <= MAX_APPROVALS_BYTES) {
      text = serialize(approvals);
      exact = Buffer.byteLength(text);
      estimate = exact;
    }
  }
  if (!fits()) {
    throw new Error(`The confirmed mode paths alone exceed ${MAX_APPROVALS_BYTES} bytes`);
  }
  return text;
}

function recordProblem(target: string, current: ApprovalsRead): string | undefined {
  if (current.state === "newer") {
    return `${target} uses a newer format; update pi-modes before confirming project modes`;
  }
  if (current.state === "unreadable") return `Cannot use ${target} (${current.reason})`;
  return undefined;
}

/** Why a confirmation could not be recorded now: checked before the operator is asked. */
export function projectModeRecordProblem(path: string): string | undefined {
  try {
    const target = recordTarget(path);
    const problem = recordProblem(target, readApprovalsFile(target));
    if (problem) return problem;
    // The nearest existing directory must be writable (a read-only sandbox or file system is not).
    let directory = dirname(target);
    while (!existsSync(directory) && dirname(directory) !== directory)
      directory = dirname(directory);
    accessSync(directory, constants.W_OK);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Records the current definitions of `modes` as confirmed, replacing older digests for their files.
 * The write is atomic; if another session's write replaced ours, it merges and writes again. A
 * writer that read before our rename can still drop our entry afterwards: that costs the operator a
 * repeated confirmation, never a wrong approval.
 */
export function recordProjectModeApprovals(path: string, modes: readonly ResolvedMode[]): void {
  const confirmed = modes
    .filter((mode) => mode.scope === "project" && mode.path)
    .map((mode) => [mode.path as string, projectApprovalDigest(mode)] as const);
  if (confirmed.length === 0) return;
  const target = recordTarget(path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const current = readApprovalsFile(target);
    const problem = recordProblem(target, current);
    if (problem) throw new Error(`${problem}; nothing was recorded`);
    if (current.state === "invalid") {
      // Saves the malformed bytes we read, never whatever another session has written since.
      writeFileSync(`${target}.invalid-${Date.now()}-${randomUUID().slice(0, 8)}`, current.bytes, {
        flag: "wx",
        mode: 0o600,
      });
    }
    // Drops entries whose file is gone from a directory being confirmed now (a renamed or deleted
    // mode). Other directories are not visited: a stat on an unreachable mount can hang, and an entry
    // out of view (another checkout, a sandbox) keeps its approval until the bound forgets it.
    const touched = new Set(confirmed.map(([file]) => dirname(file)));
    const approvals = new Map(
      [...current.approvals].filter(([file]) => !touched.has(dirname(file)) || existsSync(file)),
    );
    // Most recent last, so the bound forgets the oldest confirmations first.
    for (const [file, digest] of confirmed) {
      approvals.delete(file);
      approvals.set(file, digest);
    }
    const text = bounded(approvals, new Set(confirmed.map(([file]) => file)));
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, text, { flag: "wx", mode: 0o600 });
      renameSync(temporary, target);
    } finally {
      rmSync(temporary, { force: true });
    }
    // Read back through the configured path, as every later read does.
    const written = readProjectModeApprovals(path);
    if (confirmed.every(([file, digest]) => written.get(file) === digest)) return;
  }
  throw new Error(`Could not record the confirmation in ${target}; try again`);
}

/** Project-scoped modes among `keys` whose exact current definition has not been confirmed. */
export function unconfirmedProjectModes(
  keys: readonly string[],
  modes: readonly ResolvedMode[],
  approvals: ReadonlyMap<string, string>,
): ResolvedMode[] {
  return keys
    .map((key) => modes.find((mode) => mode.key === key))
    .filter((mode): mode is ResolvedMode => mode?.scope === "project")
    .filter((mode) => !isProjectModeApproved(mode, approvals));
}

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * The start of a prompt for the dialog, at most EXCERPT_CHARS code points. Visible spacing is
 * collapsed so no run of spaces can fill it, and only that spacing is trimmed, so a hidden character
 * at either end is still marked. Whole graphemes are kept, so no emoji or marker is split; one that
 * would not fit ends the excerpt, and a single oversized grapheme is cut.
 */
function promptExcerpt(prompt: string): { excerpt: string; shown: number; total: number } {
  const text = prompt
    .replace(/\r\n/g, "\n")
    .replace(/[\t\n\p{Zs}]+/gu, " ")
    .replace(/^ | $/g, "");
  const total = [...text].length;
  let kept = "";
  let shown = 0;
  for (const { segment } of GRAPHEMES.segment(text)) {
    const size = [...segment].length;
    if (shown + size > EXCERPT_CHARS) {
      if (shown === 0) {
        kept = [...segment].slice(0, EXCERPT_CHARS).join("");
        shown = EXCERPT_CHARS;
      }
      break;
    }
    kept += segment;
    shown += size;
  }
  return { excerpt: displaySafe(kept), shown, total };
}

const EFFECT: Record<ResolvedMode["promptStrategy"], string> = {
  append: "adds its text to the system prompt",
  replace_base: "replaces the base system prompt",
  replace_final: "replaces the entire system prompt",
};

/** What a project mode takes over, in the words every message uses. */
export function describeReplacement(mode: ResolvedMode): string {
  if (!mode.shadows) return "";
  if (mode.shadows === "project") {
    return `replaces the "${mode.key}" mode from ${mode.shadowedPath ? displaySafe(mode.shadowedPath) : "an outer directory"}`;
  }
  return `replaces the ${mode.shadows} "${mode.key}" mode`;
}

// An overlay's label reaches the model too, as the heading of its prompt text; a base's does not.
function hiddenWarning(mode: ResolvedMode): string {
  const label = mode.promptStrategy === "append" ? countHiddenCharacters(mode.label) : 0;
  const hidden = label + countHiddenCharacters(mode.systemPrompt);
  return hidden > 0 ? `${hidden} hidden character${hidden === 1 ? "" : "s"} the model reads` : "";
}

export function projectConfirmationTitle(modes: readonly ResolvedMode[]): string {
  return modes.length === 1
    ? `Use project mode "${modes[0]?.key}"?`
    : `Use ${modes.length} project modes?`;
}

/** What the operator agrees to: source, effect, definition digest, an excerpt, and what it replaces. */
export function projectConfirmationBody(modes: readonly ResolvedMode[]): string {
  const lines = modes.map((mode) => {
    const digest = modeDefinitionFingerprint(mode).digest.slice(0, 12);
    const { excerpt, shown, total } = promptExcerpt(mode.systemPrompt);
    const replaces = describeReplacement(mode);
    const hidden = hiddenWarning(mode);
    const labelOnly = mode.promptStrategy === "append" ? 0 : countHiddenCharacters(mode.label);
    return [
      `${mode.key} ("${displaySafe(mode.label)}") ${EFFECT[mode.promptStrategy]}; from ${mode.path ? displaySafe(mode.path) : "an unknown file"}${mode.promptPath ? `, prompt in ${displaySafe(mode.promptPath)}` : ""} (definition ${digest}).${replaces ? ` It ${replaces}.` : ""}`,
      `  Prompt, ${shown < total ? `first ${shown} of ${total}` : total} characters: "${excerpt}${shown < total ? "…" : ""}"`,
      ...(hidden ? [`  Warning: it contains ${hidden}, marked ⟨n hidden⟩ where shown above.`] : []),
      ...(labelOnly
        ? [
            `  Its label has ${labelOnly} hidden character${labelOnly === 1 ? "" : "s"}; a base mode's label is not sent to the model.`,
          ]
        : []),
    ].join("\n");
  });
  return [
    ...lines,
    "To read all of it first, cancel and run /mode-preview. Continue only if you trust this; you are asked again when it changes, and until then it is not used.",
  ].join("\n");
}

export function describeProjectModes(modes: readonly ResolvedMode[]): string {
  return modes
    .map((mode) => {
      const details = [
        mode.path ? displaySafe(mode.path) : "unknown file",
        mode.promptPath ? `prompt in ${displaySafe(mode.promptPath)}` : "",
        describeReplacement(mode),
        hiddenWarning(mode),
      ].filter(Boolean);
      return `${mode.key} (${details.join(", ")})`;
    })
    .join(", ");
}

export function projectConfirmationError(modes: readonly ResolvedMode[], flag: string): string {
  return `Project mode${modes.length === 1 ? "" : "s"} not confirmed: ${describeProjectModes(modes)}. Review with /mode-preview, then repeat with ${flag} to accept the current definition${modes.length === 1 ? "" : "s"}.`;
}
