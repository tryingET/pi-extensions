# Release Evidence Tapes — Conventions

Behavior evidence for release PRs in this monorepo: **show, don't tell**.
A reviewer must see what a released extension *does* without pulling the branch.

Chain (one entrypoint):

```
just evidence <pr-number>
  ├─ capture   vhs renders every tapes/<package>/*.tape  → tapes/<package>/out/*.gif
  ├─ publish   gh pr comment <PR> --body-file … --attach …   (gh ≥ 2.99.0, inline refs rewritten)
  └─ record    ak evidence record -c gh-attachment --details '{"url": …}'   (publication is evidence)
```

Enforcement lives in `.github/workflows/release-check.yml`
(`require-release-evidence` job): release-please PRs fail the check until a
comment containing the marker `<!-- release-evidence -->` **with uploaded
attachments** exists. The failure message names the exact command — a fresh
session with zero context self-corrects from the error alone.

## Tape rules

1. **Always declare an explicit `Output out/<name>.gif` as the first line.**
   Without it, `vhs` (v0.11.0 on this workstation) exits `2` and writes nothing.
   This is entry #1 in this file because it was discovered by running, not by
   reading docs.
2. **cwd is the tape's directory.** `vhs` is invoked with
   `tapes/<package>/` as working directory; reference repo paths as
   `../../packages/<package>/…`, `../../scripts/…`.
3. **Deterministic, offline, secret-free.** No network calls, no credentials,
   no random data in tapes — CI and any workstation must render the same story.
4. **Budgets:** target ≤ 15 s and ≤ 2 MB per GIF. Pipe long output through
   `head -N` to keep frame count down.
5. **Behavior over pixels.** Tapes demonstrate interaction/state over time —
   what `git diff` and static screenshots cannot show. Static-render packages
   (e.g. HTML/SVG output) may additionally attach exact-PNG renders; that is a
   per-package option, not the default.
6. **Never `vhs publish`.** Evidence stays inside our chain
   (GitHub attachment URL + AK receipt). No third-party hosting.
7. **Alt text is the review aid:** `![<package> <tape-stem> — what it shows](…)`.
   The body reference keeps its alt text when `--attach` rewrites the path.

## Before/after

`--base <ref>` renders the same tapes from a temporary git worktree at that
ref (created under `$TMPDIR`, never `/tmp`, per workspace scratch policy) and
attaches them as `out/before/<name>.gif` alongside the HEAD renders. Tapes that
do not exist at the base ref are skipped for the before half with a warning —
new tapes have no past behavior to show.

## Adding a tape for a package

```
tapes/<package>/<demo-name>.tape
```

Then verify locally before posting:

```
cd tapes/<package> && vhs <demo-name>.tape   # must produce out/<demo-name>.gif
node scripts/release-evidence.mjs --pr <number> --dry-run    # compose + validate, no posting
```

Comment idempotency: each run posts a new comment; the gate greps for the
marker, so one successful run per release PR is enough. Comment listing in the
gate reads up to 100 comments per PR — if a release PR ever exceeds that,
paginate in the gate, not here.

## CI auto-render

`.github/workflows/release-evidence.yml` renders and attaches automatically:

- **Auto:** on release-please PRs (`release-please--branches--main` head +
  `autorelease: pending` label) on open/sync/reopen/label — the runner installs
  pinned `ttyd 1.7.7` + `vhs v0.11.0`, upgrades `gh` only when the runner image
  still predates 2.99.0, and runs the same script with `--edit-last` so the
  bot maintains **one** evidence comment per PR instead of stacking.
- **Manual:** `workflow_dispatch` with a PR number (any PR, same render path).
- CI posts as the Actions bot; `--edit-last` edits only the caller's own last
  comment, so workstation runs and CI runs keep separate comments.
- CI runs render HEAD only (no `--base` before-half; the release PR changelog
  carries the textual before). AK receipts stay workstation-side — Actions
  has no society DB access; the comment URL is the CI-visible evidence.
- **Attachment upload needs a user token.** `gh --attach` uploads to
  `uploads.github.com/user-attachments` (user-scoped assets); the Actions
  `GITHUB_TOKEN` is an installation token with no user identity and is
  rejected (`unsupported authentication type` — verified on runner
  33598560994). The workflow therefore requires repo secret
  **`EVIDENCE_GH_TOKEN`** (classic PAT with `repo` scope, or fine-grained PAT
  with pull-requests read+write on this repo) and fails fast with setup
  instructions when it is missing.
