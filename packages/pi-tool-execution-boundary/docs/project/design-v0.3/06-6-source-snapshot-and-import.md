## 6. Source snapshot and import

### 6.1 Release 0.1 import mode

The only source mode is:

```text
mode: committed-clean-tree/v1
```

The selected source is an exact commit object. The canonical worktree MUST be clean by `git status --porcelain=v2 -z --untracked-files=all`, with replacement refs and lazy object fetching disabled.

### 6.2 Trusted Git invocation environment

The daemon invokes an absolute, operator-selected Git binary with:

```text
env -i
HOME=<daemon-empty-home>
XDG_CONFIG_HOME=<daemon-empty-xdg>
GIT_CONFIG_NOSYSTEM=1
GIT_CONFIG_GLOBAL=/dev/null
GIT_CONFIG_COUNT=<fixed overrides>
GIT_OPTIONAL_LOCKS=0
GIT_TERMINAL_PROMPT=0
GIT_NO_REPLACE_OBJECTS=1
GIT_NO_LAZY_FETCH=1
LC_ALL=C.UTF-8
PATH=<fixed trusted path>
```

Fixed config overrides MUST include:

```text
core.hooksPath=<daemon-readonly-empty-hooks>
credential.helper=
protocol.file.allow=never
protocol.ext.allow=never
protocol.ssh.allow=never
protocol.http.allow=never
protocol.https.allow=never
filter.lfs.required=false
filter.lfs.clean=
filter.lfs.smudge=
submodule.recurse=false
```

No Git command in the import path invokes a transport, hook, filter, checkout, submodule, LFS process, external diff, credential helper, pager, editor, or shell alias.

### 6.3 Source preflight

The daemon MUST:

1. Resolve the repository root using trusted Git plumbing.
2. Resolve `<selection>^{commit}` to one exact object ID.
3. Verify the required tree objects and blobs are locally present.
4. Reject replacement refs and promisor-object fetch needs.
5. Verify clean index/worktree and zero untracked files.
6. Enumerate the selected tree with `git ls-tree -r -z --full-tree`.
7. Reject gitlinks (`160000`) and unsupported modes.
8. Validate every path against the path profile.
9. Read raw blob bytes with `git cat-file --batch` without `--filters`, `--textconv`, or symlink following.
10. Re-stat the repository and selected commit identity before finalizing the snapshot; any identity change aborts and restarts preflight.

### 6.4 Path profile

Release 0.1 accepts paths that:

- are non-empty relative paths;
- contain valid UTF-8 normalized to NFC;
- contain no NUL, CR, LF, C0 control, DEL, or terminal escape bytes;
- contain no empty, `.` or `..` component;
- contain no component named `.git` under ASCII case-folding;
- are no longer than 4,096 bytes total and 255 bytes per component;
- do not collide after NFC normalization or ASCII case folding;
- fit configured file-count and total-byte limits.

This is intentionally narrower than Git's byte-oriented path model. Unsupported repositories fail rather than receiving lossy filename conversion.

### 6.5 Supported tree entries

| Git mode | Release 0.1 behavior |
|---|---|
| `100644` | regular non-executable file |
| `100755` | regular executable file |
| `120000` | relative symlink only; target must remain beneath `/workspace` after lexical normalization |
| `160000` | rejected |
| other | rejected |

Absolute symlink targets and relative targets escaping `/workspace` are rejected at import.

### 6.6 `SourceSnapshotV1`

The host creates a canonical manifest:

```ts
interface SourceSnapshotV1 {
  schema: "pi-tool-boundary-source/v1";
  sourceMode: "committed-clean-tree/v1";
  sourceRepositoryId: string;
  sourceCommitObjectId: string;
  sourceTreeObjectId: string;
  createdAt: string;
  gitVersion: string;
  pathProfile: "utf8-nfc-safe/v1";
  entries: readonly SourceEntryV1[];
  totalFiles: number;
  totalBytes: number;
  manifestSha256: string;
}

type SourceEntryV1 =
  | {
      kind: "file";
      path: string;
      executable: boolean;
      gitBlobObjectId: string;
      contentSha256: string;
      contentLength: number;
    }
  | {
      kind: "symlink";
      path: string;
      target: string;
      gitBlobObjectId: string;
      contentSha256: string;
      contentLength: number;
    };
```

The manifest is sorted by raw UTF-8 path bytes and encoded canonically. The daemon signs no claim; it records SHA-256 digests and its binary/image provenance.

### 6.7 Import channel

No canonical repository directory is mounted into the VM.

The snapshot enters through one of two conforming backend mechanisms:

1. a read-only in-memory virtual mount containing `manifest.pb` and content-addressed blobs; or
2. a bounded host-to-guest control stream handled only by the unprivileged trusted `boundary-agent`.

Both mechanisms expose immutable bytes, not host paths. Writable `RealFSProvider`, virtio-fs bind mounts, 9p host mounts, shared folders, or SSH-based source transfer are prohibited in Release 0.1.

### 6.8 Guest materialization

The unprivileged trusted `boundary-agent`:

1. verifies schema, manifest digest, blob digests, counts, and byte limits;
2. materializes files under an empty `/workspace` using descriptor-relative operations;
3. writes regular files through temporary files and atomic rename;
4. creates constrained symlinks only after lexical target validation;
5. applies mode `0644` or `0755` with a fixed umask;
6. fsyncs files and required directories;
7. creates a synthetic single-commit Git repository using Git plumbing or an equivalent trusted implementation;
8. records the synthetic baseline commit only for guest ergonomics, never for export authority.

The synthetic repository has no remote, no history beyond the baseline, an empty hooks directory, fixed local config, and no filter or credential configuration.

### 6.9 Why no clone

A synthetic tree import provides the developer ergonomics of `git status` and `git diff` while avoiding:

- shared object stores or hardlinks;
- alternates;
- historical secret exposure;
- transport helpers;
- hooks and filters;
- submodule recursion;
- LFS execution;
- remote credentials;
- dependency on sandbox Git metadata for trusted export.

---
