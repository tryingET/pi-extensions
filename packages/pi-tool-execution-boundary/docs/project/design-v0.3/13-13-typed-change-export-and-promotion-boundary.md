## 13. Typed change export and promotion boundary

### 13.1 No trusted Git dependency

The workload may freely corrupt its private `.git`. Export MUST NOT run trusted Git porcelain or plumbing against sandbox-controlled Git config, refs, index, attributes, hooks, filters, or object storage.

### 13.2 Trusted filesystem scan

Under the exclusive workspace lock, the trusted unprivileged `boundary-agent` walks `/workspace` descriptor-relatively and emits a canonical current manifest.

It MUST reject or specially classify:

- device nodes;
- FIFOs;
- sockets;
- mount points;
- files with multiple hardlinks;
- paths outside the Release 0.1 path profile;
- sparse or excessively large files beyond policy;
- unsupported modes or ownership;
- symlinks that are absolute or escape the workspace lexically.

The scan records regular files, supported symlinks, executable bit, sizes, and SHA-256 digests.

### 13.3 `ChangeSetV1`

```ts
interface ChangeSetV1 {
  schema: "pi-tool-boundary-changes/v1";
  changeSetId: string;              // UUIDv7
  leaseId: string;
  sourceManifestSha256: string;
  sourceCommitObjectId: string;
  workspaceGeneration: string;
  createdAt: string;
  pathProfile: "utf8-nfc-safe/v1";
  entries: readonly ChangeEntryV1[];
  totalContentBytes: number;
  manifestSha256: string;
  dispositionDigest: string;
}

type ChangeEntryV1 =
  | {
      operation: "add" | "replace";
      path: string;
      executable: boolean;
      baseSha256?: string;
      contentSha256: string;
      contentLength: number;
    }
  | {
      operation: "delete";
      path: string;
      baseSha256: string;
    }
  | {
      operation: "symlink";
      path: string;
      baseSha256?: string;
      target: string;
      targetSha256: string;
    };
```

Entries are sorted canonically. File content is streamed as separately framed content-addressed blobs. The host verifies every digest, length, count, path, and source precondition.

### 13.4 Human review rendering

The daemon may render:

- unified text diffs;
- binary summaries;
- mode changes;
- symlink changes;
- file-tree summary;
- risk flags for generated config, executable additions, large files, or dependency manifests.

Rendering MUST escape control characters and MUST NOT execute diff drivers, textconv filters, pagers, terminal hyperlinks, or repository configuration.

### 13.5 Release 0.1 promotion policy

Release 0.1 does not automatically apply the change set to the canonical checkout.

It exports:

- `changeset.pb`;
- content blob directory or packed archive;
- safe human-readable report;
- optional conventional patch for convenience where representable.

Operator review and application happen through an external trusted workflow. Automatic apply is a later release with its own root-safe, crash-recoverable transaction design.

### 13.6 Export durability

Before the daemon returns change-set success:

1. all blobs are written to a daemon-owned staging directory;
2. each blob and manifest digest is verified;
3. files are fsynced;
4. the staging directory is fsynced;
5. the directory is atomically renamed to its final change-set ID;
6. the parent directory is fsynced;
7. SQLite records the final path and digest in the terminal transaction.

---
