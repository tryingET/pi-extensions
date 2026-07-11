---
summary: "Live dogfood evidence for the guarded standard read/edit snapshot override."
read_when:
  - "Evaluating whether the snapshot protocol can own standard read/edit names locally."
  - "Reviewing failures discovered by live model-driven dogfood."
system4d:
  container: "A bounded implementation and live-runtime evidence note."
  compass: "Promote only behavior that survives real tool selection and mutation."
  engine: "Install -> activate guarded override -> model-driven read/edit -> inspect exact file -> repair -> repeat."
  fog: "Mocked registration can pass while provider serialization or prepareArguments breaks live calls."
---

# Standard read/edit override dogfood — 2026-07-11

## Scope

Package: `packages/pi-snapshot-edit`

Mode:

```bash
PI_SNAPSHOT_EDIT_OVERRIDE=1 pi --no-extensions \
  -e packages/pi-snapshot-edit/extensions/snapshot-edit.ts \
  --tools read,edit -p '<scenario>'
```

The model was allowed only standard `read` and `edit`; namespaced tools, `bash`, and `write` were excluded by instruction and tool allowlist.

## Failure-driven repairs

### Runtime initialization failure

Initial startup activation called action APIs while the extension factory was still loading:

```text
Extension runtime not initialized. Action methods cannot be called during extension loading.
```

Repair: startup override activation moved to `session_start`, where dynamic registration is lawful.

Regression test: `startup override waits for initialized session runtime`.

### False legacy-schema classification

The first live standard edit used the correct new schema:

```json
{
  "path": "duplicate.txt",
  "base": "amber",
  "edits": [
    {
      "op": "replace",
      "startLine": 2,
      "endLine": 2,
      "newText": "selected"
    }
  ]
}
```

`prepareArguments` incorrectly treated any nested `newText` as legacy, even though `newText` exists in both protocols. Three valid retries failed with the retired-schema diagnostic.

Repair: nested legacy detection now requires `oldText`; a regression test passes current-schema arguments through `prepareArguments` before execution.

### Authority review failure

A review found that delegating unsupported reads through a newly constructed `createReadTool(ctx.cwd)` could bypass a remote or sandbox operations adapter.

Repair:

- unsupported standard reads now fail closed;
- override activation requires positively identified built-in `read` and `edit` owners;
- any visible non-built-in owner blocks activation;
- documentation directs the operator to `/reload` to restore the authoritative built-in reader.

Final adversarial review: no blockers; GO for local opt-in dogfood.

## Successful live scenarios

### Duplicate single-line selection

Input:

```text
repeat
repeat
end
```

Requested through standard names only: replace line 2 with `selected`.

Observed result:

```text
repeat
selected
end
```

The model returned fresh revision `apple`. The first identical line remained unchanged.

### Batched insertion and duplicate replacement

Input:

```ts
export function first() {
  return "same";
}

export function second() {
  return "same";
}
```

Requested in one standard edit call:

1. insert `// verified` immediately before the second function;
2. replace only the second duplicate return value.

Observed result:

```ts
export function first() {
  return "same";
}

// verified
export function second() {
  return "selected";
}
```

The model returned fresh revision `apple`. Both operations were interpreted against the original base coordinates.

## Deterministic verification

```text
18 tests passed
Typecheck passed
Biome lint passed
```

Coverage includes:

- namespaced and standard tool registration;
- live-schema preparation;
- legacy resumed-call diagnostics;
- non-built-in owner refusal;
- startup activation timing;
- unsupported image fail-closed behavior;
- duplicate-line targeting;
- stale bytes and replaced inode rejection;
- hard-link commit recheck;
- cancellation before rename;
- BOM/CRLF/mode preservation;
- batch coordinates and overlap rejection;
- jq-only session failure aggregation.

## Decision

The guarded override is verified for local, opt-in text-file dogfood.

It is not promoted to an unconditional default. Host-native standard ownership still belongs in Pi core because an extension cannot preserve arbitrary remote/sandbox operation adapters. The current package is the protocol laboratory and reversible local carrier.
