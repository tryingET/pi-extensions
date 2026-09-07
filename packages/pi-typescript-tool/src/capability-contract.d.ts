// Derived from cv/pic v0.2.37 (Copyright Carlos Villela, Apache-2.0).
// Reduced/modified for read-only helpers; this is typing, not confinement. See NOTICE.
// Script scope is intentional: these names are global in the in-memory checker.
interface ToolDirectoryEntry {
  name: string;
  kind: "file" | "directory" | "other";
  /** File byte size; null for directories, symlinks and other entries. */
  size: number | null;
}
interface ToolFsCapability {
  /** Relative to session cwd. At most 500 entries; larger directories fail. */
  list(path?: string): Promise<ToolDirectoryEntry[]>;
  /** UTF-8 prefix. maxBytes: integer 1..65536, default 16000. Truncation is marked. */
  read(path: string, maxBytes?: number): Promise<string>;
}
interface ToolCapabilities {
  /** Read-only convenience API, NOT a sandbox; 128 calls and 1 MiB read budget per execution. */
  fs: ToolFsCapability;
}
/** Return plain JSON data, a string, or undefined. Other values fail serialization. */
type ToolProgram = (capabilities: ToolCapabilities) => unknown;
