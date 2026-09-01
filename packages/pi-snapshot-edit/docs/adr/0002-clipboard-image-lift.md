---
summary: "Lift host clipboard image placeholders into user-message ImageContent without snapshotting bytes."
read_when:
  - "Changing clipboard image lift, standard read replacement, or paste-path attachment."
  - "Considering image support inside snapshot_read."
system4d:
  container: "pi-extensions carrier that restores harnessed-LLM vision while snapshot-edit owns text mutation."
  compass: "Operator-pasted pixels must reach a vision-capable model as image content, not as a UTF-8 snapshot."
  engine: "Host paste writes a tmpdir path -> input transform sniffs and attaches ImageContent -> snapshot read stays text-only."
  fog: "A clipboard path in the editor looks like an attachment; replacing read looks like an edit upgrade."
---

# ADR 0002: Clipboard image lift as input-transform carrier

- Status: accepted
- Date: 2026-09-01
- Relates to: ADR 0001, [harnessed LLM vision RFC](../../../docs/project/2026-09-01-harnessed-llm-vision-authority-rfc.md)

## Context

Host interactive paste writes `TMPDIR/pi-clipboard-<uuid>.<ext>` and inserts that path as editor text. Builtin `read` is the interactive vision bridge: it sniffs still images and returns `ImageContent`. ADR 0001 default replacement makes standard `read` text-only and fail-closed on binary, so pasted screenshots never reach the model.

Pi-mono paste/submit attachment is the durable host target. This package must not wait on contrib to restore vision for operators who already run the default override.

## Decision

1. Protocol B `read` / `snapshot_read` remain UTF-8 snapshot tools. Image bytes never enter `SnapshotStore` and never receive `revision:` aliases. The existing fail-closed image test stays.
2. This package registers an `input` transform that lifts only host clipboard placeholders:
   - absolute paths whose basename matches `pi-clipboard-<uuid>.{png,jpg,jpeg,webp,gif}`
   - `realpath` contained in `os.tmpdir()`
   - sniffable still images (PNG/JPEG/WebP/GIF; animated PNG rejected)
   - size-capped regular files
3. Successful lifts attach `{ type: "image", mimeType, data }` and replace the path token with `<file name="...">` so the model does not try to snapshot-read the PNG.
4. Failed lifts leave the path in text. They do not OCR, invent mime types, or follow symlinks out of tmpdir.
5. `PI_SNAPSHOT_EDIT_IMAGE_LIFT=0|false|off|no` disables the carrier. Namespaced-only `PI_SNAPSHOT_EDIT_OVERRIDE` does not disable it: one-turn attachment remains useful when host `read` still works.
6. This is a pi-extensions carrier, not a pi-mono paste change. Host first-class `session.prompt(text, { images })` remains the upstream target.

## Consequences

### Positive

- Default snapshot-edit replacement becomes lawful for pasted screenshots without cloning host `read`.
- Vision is one-turn and does not depend on the model guessing that a path is an image.
- Snapshot mutation stays text-only.

### Negative

- Drag/drop and hand-typed `@screenshot.png` outside tmpdir are not lifted.
- The carrier uses local `realpath`/`readFile`, same local-carrier limitation as snapshot-edit text reads.
- Duplicate lift is possible if another extension already attached the same image; the path rewrite reduces the leftover `read` call.

## Rejected

- Teaching snapshot `read` to return image blocks (wrong owner; mixes snapshot revisions with binary).
- Lifting arbitrary `.png` substrings in prose.
- Changing contrib/pi-mono in this wave.
