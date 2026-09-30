/**
summary: "Remembers which exact project-scoped mode definitions the operator confirmed, and says which modes in a selection still need confirming."
read_when:
  - "Changing how project modes are gated before activation or composition, or where confirmations are stored."
*/
import { createHash, randomUUID } from "node:crypto";
import {
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
import { dirname, resolve } from "node:path";
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
  // Malformed content, kept so it can be saved aside before the record is rewritten.
  | { state: "invalid"; approvals: Map<string, string>; text: string }
  // Not safe to rewrite: an I/O error, not a regular file, or larger than any record we write.
  | { state: "unreadable"; approvals: Map<string, string>; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readApprovalsFile(path: string): ApprovalsRead {
  let text: string;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return { state: "unreadable", approvals: new Map(), reason: "not a file" };
    if (stat.size > MAX_APPROVALS_BYTES) {
      return { state: "unreadable", approvals: new Map(), reason: "larger than 1 MiB" };
    }
    text = readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT"
      ? { state: "missing", approvals: new Map() }
      : { state: "unreadable", approvals: new Map(), reason: code ?? String(error) };
  }
  const invalid = { state: "invalid" as const, approvals: new Map<string, string>(), text };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
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

/** The file a record path really names: symlinks (dotfiles) are written through, even dangling. */
function recordTarget(path: string): string {
  let target = path;
  for (let hop = 0; hop < MAX_SYMLINK_HOPS; hop += 1) {
    try {
      if (!lstatSync(target).isSymbolicLink()) return target;
      // Relative to the link's real directory, as the kernel resolves it (`..` included).
      target = resolve(realpathSync(dirname(target)), readlinkSync(target));
    } catch {
      // Missing: this path is the target.
      return target;
    }
  }
  throw new Error(`${path}: too many levels of symbolic links`);
}

/**
 * An entry is dropped only when its directory is visible and the file is gone. A file that is merely
 * out of view (another checkout, a sandbox, an unmounted volume) keeps its approval.
 */
function deleted(file: string): boolean {
  return !existsSync(file) && existsSync(dirname(file));
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
 * recently confirmed files, those out of view first; a forgotten file is only asked about again.
 */
function bounded(approvals: Map<string, string>, keep: ReadonlySet<string>): string {
  let text = serialize(approvals);
  let exact = Buffer.byteLength(text);
  const fits = () => approvals.size <= MAX_APPROVALS && exact <= MAX_APPROVALS_BYTES;
  if (fits()) return text;
  const entryBytes = (file: string) =>
    Buffer.byteLength(`    ${JSON.stringify(file)}: ${JSON.stringify(approvals.get(file))},\n`);
  const candidates = [...approvals.keys()].filter((file) => !keep.has(file));
  const visible = new Set(candidates.filter((file) => existsSync(file)));
  const order = [
    ...candidates.filter((file) => !visible.has(file)),
    ...candidates.filter((file) => visible.has(file)),
  ];
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
    if (current.state === "newer") {
      throw new Error(
        `${target} uses a newer format; update pi-modes before confirming project modes`,
      );
    }
    if (current.state === "unreadable") {
      throw new Error(`Cannot use ${target} (${current.reason}); nothing was recorded`);
    }
    if (current.state === "invalid") {
      // Saves the malformed bytes we read, never whatever another session has written since.
      writeFileSync(`${target}.invalid-${Date.now()}-${randomUUID().slice(0, 8)}`, current.text, {
        flag: "wx",
        mode: 0o600,
      });
    }
    const approvals = new Map([...current.approvals].filter(([file]) => !deleted(file)));
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
    const written = readProjectModeApprovals(target);
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

// The label reaches the model too, as the heading of the mode's prompt text.
function hiddenWarning(mode: ResolvedMode): string {
  const hidden = countHiddenCharacters(mode.label) + countHiddenCharacters(mode.systemPrompt);
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
    // Cut by code points before marking, so neither a surrogate pair nor a marker is split.
    const characters = [...mode.systemPrompt.replace(/[\t\n\r ]+/g, " ").trim()];
    const cut = characters.length > EXCERPT_CHARS;
    const excerpt = displaySafe(characters.slice(0, EXCERPT_CHARS).join(""));
    const replaces = describeReplacement(mode);
    const hidden = hiddenWarning(mode);
    return [
      `${mode.key} ("${displaySafe(mode.label)}") ${EFFECT[mode.promptStrategy]}; from ${mode.path ? displaySafe(mode.path) : "an unknown file"} (definition ${digest}).${replaces ? ` It ${replaces}.` : ""}`,
      `  Prompt, ${cut ? `first ${EXCERPT_CHARS} of ${characters.length}` : characters.length} characters: "${excerpt}${cut ? "…" : ""}"`,
      ...(hidden ? [`  Warning: it contains ${hidden}, marked ⟨n hidden⟩ where shown above.`] : []),
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
