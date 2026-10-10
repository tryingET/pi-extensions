---
summary: "Pinned official upstream native Clipper CLI, measured smoke and provenance limits."
read_when:
  - "Provisioning or verifying the external native Clipper artifact."
system4d:
  container: "Owner-installed native process boundary."
  compass: "No substitute scraper or unstable checkout import."
  engine: "Build the immutable upstream source with its unchanged lock and production closure."
  fog: "A passing fixture or file metadata is not arbitrary-site fidelity or source attestation."
---

# Native engine boundary

## Preferred native artifact

Use official `obsidianmd/obsidian-clipper` upstream main snapshot
**`6d56d618b00bd970aa738d6a7a61edee27783e81`**, package version **1.7.1**.
It contains merged PR [#958](https://github.com/obsidianmd/obsidian-clipper/pull/958),
which fixes both Document handoffs reported in
[issue #956](https://github.com/obsidianmd/obsidian-clipper/issues/956).
No local source or lock patches are required for this tested snapshot.

Measured identities from the unchanged upstream snapshot:

| Input/artifact | SHA-256 |
| --- | --- |
| Source archive | `77ec0464a1768eca6448b7295f064847bd1f3bf866100d4448a7273a6f7b8f07` |
| Native package lock | `6aae2253ad079575339138df86f09651153039bbf0f1d4a8d551065b240d450e` |
| Built `dist/cli.cjs` | `afa7c1928101f21d7480850cefdabe70c7254c1435c2dc4a691791f5ee94416f` |

The operator's original checkout was left detached on tag 1.7.1 at older
`c2fbae9645332ecf8d05dcf281483693b5054213`; it was not switched or rewritten.
Historical isolated AK6640 lock and AK6642 handoff repairs proved the causes on
that older snapshot. They are not the preferred deployment input. English tracker
drafts are historical/review-blocked, not new reports to publish against fixed main.

Build command: lock-bound `npm ci --ignore-scripts --no-audit --no-fund`, then native
`npm run build:cli`. A separate production directory retains the original manifest,
unchanged lock, license and compiled CLI, with `npm ci --omit=dev --ignore-scripts`.
Keep the **production `node_modules` closure**, particularly external `linkedom`:
this is not a standalone CLI file. Do not copy only `cli.cjs`.

The root import / `dist/cli.cjs` is executable, not an API library. This artifact
provisions CLI only, **not `dist/api.mjs`** despite the upstream manifest's API export.
API import/DOM compatibility is not claimed. The adapter uses literal Node argv and
never substitutes a separate scraper, executes page JavaScript or builds/downloads
an engine at invocation time.

## Adapter contract

Invocation: `node /absolute/dist/cli.cjs URL --template PRIVATE_FILE --html PRIVATE_FILE`.
Stdout is Markdown. No JSON/setup flag exists. `--html` is always supplied so the
native URL-fetch branch cannot bypass the adapter's controlled public-HTTPS transport.
No `--open`, `--output`, vault or URI option is supplied.

The native template uses schema `0.1.0`, `noteNameFormat`, `path: Input`,
`noteContentFormat: '{{content}}`, properties `space: input`, `kind: source`,
`state: captured`, source URL/captured timestamp, and triggers. Input is capture
metadata, not an automatic write destination. There is no save surface.

After byte/line budgets and control-character sanitation, a bounded delimiter scan
skips optional frontmatter and requires body text containing a Unicode letter,
number or symbol. Metadata-only, whitespace/punctuation-only and unterminated
frontmatter results fail even if the native process exits zero. This is not a
YAML/Markdown parser or completeness proof; it does not reconstruct missing content.
Short articles and image references are not rejected by an arbitrary word threshold.

Private inputs are 0600 in a 0700 directory. The child environment excludes user
configuration/preloads/secrets, but the native process is trusted code, **not an OS
sandbox**. Artifact metadata checks require safe owner/root ancestry; they do not
attest source/build identity. Public `engine` metadata declares the required version,
source base and lock, null local patch and empty repairs, with that limitation.

## Observed native proof

Unchanged lock install/build, real adapter smoke, a substantial article's opening
and closing text, inline non-cover image and JSON-LD schema matching all passed on
**Node 22.23.3 and Node 26.9.0**, using npm 12.0.2. All 273 source files in the
upstream archive stayed byte-identical. Inert caller HTML was used: no browser,
model call or vault save was part of this proof.

Source/artifact evidence currently retained under:
`~/.local/state/pi-quests/tmp/clipper-upstream-6d56d618.7drP2L/REPORT.md` and its
production/provenance files. A runtime install must preserve those measured inputs
or independently rebuild and verify them; a scratch path is not a durable install.

Rerun from this package with a separately provisioned engine:

```bash
PI_OBSIDIAN_CLIPPER_CLI=/absolute/owner-installed/dist/cli.cjs \
  node --import tsx scripts/native-smoke.ts
```

Hermetic tests cover fake subprocess cancellation, bounded argv/environment and
metadata-only rejection. Production-tarball tests cover actual Pi loading and
read-only commands/tools. Neither substitutes for the native fixture above.
Defuddle may intentionally remove an uncaptioned image matching `og:image`;
this adapter preserves native extraction policy rather than promising every image.

## Dependency and browser limits

The current upstream production closure has **one low npm audit finding**:
DOMPurify 3.4.15, GHSA-p98j-92pf-mc4p (IN_PLACE hook detached-subtree DOM XSS).
It is an installed production dependency, but the inspected CLI bundle/external
path and observed runtime loads do not use it. This is a bounded reachability
assessment, not a blanket security certification; no dependency upgrade or
silent `audit fix` was performed. The old patched-tag closure's two high/one
moderate findings must not be presented as the current artifact's audit result.
Adapter runtime and development-host audits remain separate.

A parent public protocol fixture requested exactly `baseline-multimodal` on the
owner-exported endpoint and received HTTP 200 / JSON `prompts_responses.prompt_1:
'OK'` in 1.51s. GET models included the alias. The returned raw upstream model
reflects owner routing, not a different request alias. A nonsecret UI field value
`local` was accepted for that one probe only; endpoint authentication is not
permanently inferred. OPTIONS returned 501, while POST returned
`Access-Control-Allow-Origin: *`. The AK6870 isolated Chromium 153 run (2026-10-10)
covered the following:
an unpacked build of this snapshot, configured additively through the native UI, sent
one extension-origin POST with no preflight. It received HTTP 200 and
`prompts_responses`, and the endpoint was observed keyless. See
[AK6870 qualification](2026-10-10-ak6870-browser-qualification.md). Other
browsers, profiles and later auth changes still need their own check.

Native Custom provider UI requires a nonempty key field; supply its owner-approved
value directly in the browser, never through Pi. Do not import full settings:
that clears browser sync storage. The current Interpreter sends text strings,
although the selected model declares text+image capability. Tools remain honest
about unprobed live/browser state; the default canonical export may need owner
refresh before setup. No model/lane lifecycle or Pi provider registration is owned
by this package.
