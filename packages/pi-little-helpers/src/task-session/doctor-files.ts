// Linux account-local diagnostic reads only. No mutex, writes, arbitrary root or producer calls.
import {
  type BigIntStats,
  constants as C,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

const MAX_BYTES = 1048576;
// Linux x86_64 UAPI O_PATH: asm-generic/fcntl.h (1 << 21), glibc __O_PATH 010000000.
// Node22/26 do not export this flag. Never trust numeric pass-through without the
// per-observation kernel-semantic probe below, before opening any candidate leaf.
const LINUX_X64_O_PATH = 0o10000000;
export class ObservationFault extends Error {}
const fail = (code: string): never => {
  throw new ObservationFault(code);
};
interface Opened {
  fd: number;
  edge: string;
  before: BigIntStats;
  bytes?: Buffer;
}
const same = (a: BigIntStats, b: BigIntStats) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.mode === b.mode &&
  a.uid === b.uid &&
  a.gid === b.gid &&
  a.nlink === b.nlink;
export const coordinates = (s: BigIntStats) => ({ dev: String(s.dev), ino: String(s.ino) });

/** Pin each directory component with O_NOFOLLOW, including ancestors. /proc/self/fd is
 * a kernel-provided reference to OUR open directory, not a caller-supplied alias. Keep all
 * descriptors until the observation ends and recheck each named edge before returning. */
export class ObservationFiles {
  private opened: Opened[] = [];
  private directories = new Map<string, Opened>();
  private pathOnlyChecked = false;
  constructor(private uid: number) {}
  private open(edge: string, directory: boolean): Opened {
    if (this.opened.length >= 128) fail("observation_capacity_exceeded");
    const fd = openSync(
      edge,
      directory
        ? C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK | C.O_DIRECTORY
        : LINUX_X64_O_PATH | C.O_NOFOLLOW,
    );
    // Track before fstat so every failure still closes the descriptor.
    try {
      const before = fstatSync(fd, { bigint: true });
      if (directory ? !before.isDirectory() : !before.isFile()) fail("unsafe_file_kind");
      const item = { fd, edge, before };
      this.opened.push(item);
      return item;
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  }
  directory(path: string): Opened {
    const cached = this.directories.get(path);
    if (cached) return cached;
    if (path.length > 4096 || resolve(path) !== path || path.split("/").length > 64)
      fail("unsafe_account_path");
    const edge =
      path === "/" ? "/" : `/proc/self/fd/${this.directory(dirname(path)).fd}/${basename(path)}`;
    const item = this.open(edge, true);
    this.directories.set(path, item);
    return item;
  }
  private requirePathOnly(parent: Opened): void {
    if (this.pathOnlyChecked) return;
    if (process.platform !== "linux" || process.arch !== "x64") fail("path_only_open_unsupported");
    // This is OUR already-held directory's procfs symlink, not a candidate device/FIFO.
    // O_PATH|O_NOFOLLOW must pin the symlink itself; ordinary NOFOLLOW would return ELOOP.
    let probe: number | undefined;
    try {
      probe = openSync(`/proc/self/fd/${parent.fd}`, LINUX_X64_O_PATH | C.O_NOFOLLOW);
      if (!fstatSync(probe, { bigint: true }).isSymbolicLink()) fail("path_only_open_unsupported");
      let denied = false;
      try {
        readSync(probe, Buffer.alloc(1), 0, 1, 0);
      } catch (error) {
        denied = (error as NodeJS.ErrnoException).code === "EBADF";
      }
      if (!denied) fail("path_only_open_unsupported");
      this.pathOnlyChecked = true;
    } catch {
      fail("path_only_open_unsupported");
    } finally {
      if (probe !== undefined) closeSync(probe);
    }
  }
  private checkPrivate(s: BigIntStats, directory: boolean): void {
    if (
      s.uid !== BigInt(this.uid) ||
      (s.mode & 0o777n) !== (directory ? 0o700n : 0o600n) ||
      (!directory && s.nlink !== 1n)
    )
      fail("private_identity_invalid");
  }
  privateDirectory(path: string): BigIntStats {
    const item = this.directory(path);
    this.checkPrivate(item.before, true);
    return item.before;
  }
  privateFile(path: string): Opened {
    const parent = this.directory(dirname(path));
    this.checkPrivate(parent.before, true);
    this.requirePathOnly(parent);
    const item = this.open(`/proc/self/fd/${parent.fd}/${basename(path)}`, false);
    this.checkPrivate(item.before, false);
    return item;
  }
  private boundedBytes(item: Opened): Buffer {
    if (fstatSync(item.fd, { bigint: true }).size > BigInt(MAX_BYTES)) fail("input_too_large");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const n = readSync(item.fd, buffer, size, buffer.length - size, size);
      if (n === 0) break;
      size += n;
    }
    if (size > MAX_BYTES) fail("input_too_large");
    return buffer.subarray(0, size);
  }
  read(path: string): Buffer {
    const pin = this.privateFile(path); // O_PATH: no FIFO handshake or device-driver open.
    if (this.opened.length >= 128) fail("observation_capacity_exceeded");
    // Only reopen our held, verified regular inode. NOFOLLOW is intentionally absent on
    // this kernel-owned procfs reference; the original pathname is never reopened for IO.
    const fd = openSync(`/proc/self/fd/${pin.fd}`, C.O_RDONLY | C.O_NONBLOCK);
    let item: Opened;
    try {
      const before = fstatSync(fd, { bigint: true });
      if (!before.isFile() || !same(pin.before, before)) fail("private_identity_changed");
      this.checkPrivate(before, false);
      item = { fd, edge: pin.edge, before };
      this.opened.push(item);
    } catch (error) {
      closeSync(fd);
      throw error;
    }
    item.bytes = this.boundedBytes(item);
    return item.bytes;
  }
  stable(): boolean {
    try {
      for (const item of this.opened) {
        const now = fstatSync(item.fd, { bigint: true });
        const named = lstatSync(item.edge, { bigint: true });
        if (!same(item.before, now) || !same(now, named)) return false;
        if (
          now.isFile() &&
          (item.before.size !== now.size ||
            item.before.mtimeNs !== now.mtimeNs ||
            item.before.ctimeNs !== now.ctimeNs)
        )
          return false;
        if (item.bytes && !item.bytes.equals(this.boundedBytes(item))) return false;
      }
      // Recheck after rereading bytes: a later file read could race an earlier path check.
      return this.opened.every(({ fd, edge, before }) => {
        const now = fstatSync(fd, { bigint: true });
        return (
          same(before, now) &&
          same(now, lstatSync(edge, { bigint: true })) &&
          (!now.isFile() ||
            (before.size === now.size &&
              before.mtimeNs === now.mtimeNs &&
              before.ctimeNs === now.ctimeNs))
        );
      });
    } catch {
      return false;
    }
  }
  close(): void {
    for (const { fd } of this.opened.reverse()) closeSync(fd);
  }
}

/** Never render arbitrary exception strings (including file contents/parser messages). */
export function observationReason(error: unknown): string {
  if (error instanceof ObservationFault) return error.message;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "missing";
  if (code === "EACCES" || code === "EPERM") return "access_denied";
  if (code === "ELOOP" || code === "ENOTDIR") return "unsafe_path";
  return "unavailable_or_invalid";
}
