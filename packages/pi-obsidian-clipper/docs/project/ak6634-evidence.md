---
summary: "Historical October 4 AK6634 adapter/native evidence; use current-status.md for later deployment and qualification."
read_when:
  - "Independently inspecting AK6634 or running parent native smoke."
system4d:
  container: "Scoped implementation report, not AK authority or activation proof."
  compass: "Separate hermetic/artifact checks from live owner behavior."
  engine: "Inspect changed files, rerun package gates, provision pinned native smoke."
  fog: "Native fixture proof and parent protocol observations do not complete browser integration."
---

# AK6634 evidence

> **Historical evidence report.** The October 4 observations below are retained,
> not current browser/host/closure qualification. Start at
> [current status](current-status.md) and read the corresponding current AK receipts.

## Preferred native input at the October 4 checkpoint

The historical repaired-tag sections below retain their original scope; they are
not the current deployment prescription. Official main snapshot
`6d56d618b00bd970aa738d6a7a61edee27783e81` contains the already-merged Document
fix (PR #958 / issue #956) and installs/builds with its **unchanged** lock. The
original clone was already detached on older tag 1.7.1 at c2; it was not switched
by this work. No duplicate upstream report is justified. English `bin/it` drafts
were independently reviewed as stale/revise, not authorized or submitted.

Current-source archive SHA-256:
`77ec0464a1768eca6448b7295f064847bd1f3bf866100d4448a7273a6f7b8f07`;
lock: `6aae2253ad079575339138df86f09651153039bbf0f1d4a8d551065b240d450e`;
CLI: `afa7c1928101f21d7480850cefdabe70c7254c1435c2dc4a691791f5ee94416f`.
All 273 archived source files stayed unchanged. Real adapter/body/image/schema
smokes passed on Node22.23.3 and26.9.0 against the production-only dependency
closure. The parent independently reran the current native body smoke: 114 body
bytes, canonical metadata, `saved:false`.

Current production audit: one low DOMPurify finding GHSA-p98j-92pf-mc4p; installed
but absent from the inspected CLI bundle/external path and observed runtime loads.
This bounded reachability evidence is not a security certificate. Native engine
requirements now name unmodified official main and its lock, null local patch and
no repairs. See [native engine](native-engine.md) for full current proof/limits.

A real static URL capture of the Obsidian Help templates page was rejected for
missing body rather than returned as false success. URL capture does not render
JavaScript; already-rendered caller HTML is a separate explicit input. No private
page content, browser credentials or vault writes were involved.

## Operator-authorized local activation — parent, 2026-10-04

The operator selected local activation and owner provider-export refresh in the
interactive form. Although its final submit timed out, the answered selection was
returned and the tool instructed proceeding with that input. Authorization covered
native CLI install, Pi package install from the isolated worktree and owner export
refresh only; no services/models, browser keys/settings or publication.

Executed:
- Installed hash-checked unchanged-upstream production closure read-only at
  `~/.local/libexec/obsidian-clipper/6d56d618-afa7c192`; `current` points there.
- Default native-path smoke under ambient Node26 passed:114bodybytes, `saved:false`.
- Owner `lane-op.py provider-contract baseline-text --surface canonical --write`
  returned `ok`, export timestamp `2026-10-04T07:38:07Z`; no lifecycle commands.
- `pi install <retained-worktree>/packages/pi-obsidian-clipper` succeeded.
- A fresh globally configured Pi print session ran `/obsidian-clipper setup`:
  fresh exact alias, full chat-completions URL and previewOnly:true.
- A fresh real Pi call, with `--tools toolbox,obsidian_clipper_extract`, activated
  the registered tool through Toolbox and extracted both synthetic fixture
  paragraphs using the installed default native path; `isError:false`,saved:false.
- Live controlled HTTPS extraction from IANA's example-domains help page returned
  995 characters including the real explanatory body and links, with saved:false.

CLI allowlist lesson: `--tools toolbox` alone removes Clipper tool registration
for that invocation; the initial two attempted activation checks correctly failed.
Including both required tools made activation/call succeed. Toolbox baseline keeps
new custom tools latent; no catalog or code-mode ownership changed. Installed
command proof alone was not represented as tool proof.

Pinned final package `npm run check` passed25testbodies and artifact checks.
Root-wide `just loop-impact-wide` was attempted with an explicit new-package/root
release-map reason; it stopped at absent installations of unrelated packages in
the isolated worktree. No blanket gate skip, auto-install of neighboring packages,
commit, canonical landing, push or publication occurred. Live canonical install
health separately reports38existingpackagesconsistent. Keep the worktree while
Pi settings reference it; browser configured-state proof remains open.

Historical child execution follows (its no-install statements apply only then).

Worktree: `/home/tryinget/ai-society/softwareco/owned/.pi-candidates/pi-obsidian-clipper-ak6634`.
Only package `packages/pi-obsidian-clipper/**` and the two authorized root release
JSON files were authored. Installs, npm caches, synthetic homes, tarball fixtures
and logs are package-local (ignored `node_modules/` and `.scratch/`). No commits,
landing, global activation/install, AK, vault, browser, live settings or owner
source mutation. The native checkout was read only at the requested immutable
revision. Ancestor/root/package instructions and adopted engineering/host/toolchain
projections were read before implementation. AGENTS/CLAUDE were not edited.

`.copier-answers.yml` was not edited. Recorded SHA-256:
`d227652ae42a28fafcef5a303ae8c69711783608986915b031bb139d63fc6fe0`.

## Authored/new files

Root:
- `.release-please-config.json`
- `.release-please-manifest.json`

Relative to `packages/pi-obsidian-clipper/`:
- `.gitignore`
- `CHANGELOG.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `extensions/obsidian-clipper.ts`
- `src/contract.ts`
- `src/transport.ts`
- `src/native.ts`
- `scripts/quality-gate.sh`
- `scripts/validate-structure.sh`
- `scripts/validate-structure.mjs`
- `scripts/native-smoke.ts`
- `tests/pi-host-contract.test.mjs`
- `tests/helpers.ts`
- `tests/contract.test.ts`
- `tests/transport.test.ts`
- `tests/native.test.ts`
- `tests/artifact.test.ts`
- `docs/project/foundation.md`
- `docs/project/native-engine.md`
- `docs/project/ak6634-evidence.md`

Removed generated unrelated placeholders: `next_session_prompt.md`,
`docs/engineering.local.md`, `docs/org/operating_model.md`,
`docs/project/{contributing,extension-sop,incentives,resources,trusted-publishing,vision}.md`,
`.pi/prompts/commit.md`, `prompts/{implementation-planning,security-review}.md`,
`policy/{engineering-lane,security-policy}.json`, and `.gitkeep` files under
`docs/adr`, `examples`, `external`, `ontology`, `src`, `tests`.
Root engineering adoption remains canonical; the wrapper explicitly runs truthful
package structure checks before delegating the root package gate. The root gate's
legacy scaffold structure auto-discovery is no longer used, not a substitute for
omitting structure checks.

## Initial execution / observed results (historical)

Pinned toolchain used: **Node 22.23.3 / npm 12.0.2**. Node's pinned binary was
installed only under package `.scratch/toolchain`; the globally active Node 26
was not changed. Package-local `npm install --cache "$PWD/.scratch/npm-cache"`
succeeded and wrote the package lock. Host development pins/metadata are root
policy **Pi 0.84.4**, peers `*`; runtime dependencies are `typebox@1.3.7` and
`ipaddr.js@2.2.0`.

From the package, with that toolchain on PATH and `TMPDIR="$PWD/.scratch"`:

| Command/check | Observed result |
|---|---|
| `npm run check` | Passed: package structure/root release mapping, exact host pin admission, local links, lint, typecheck, all 5 test files, quick packaging. |
| `node --import tsx --test tests/*.test.ts tests/*.test.mjs` / gate-selected files | 23 test bodies passing across 5 files; no skipped bodies. |
| `npm run release:check:quick` | Passed: exact file whitelist, publish dry-run, pack. Registry `npm view` 404 is expected for this unpublished component, not publication proof. |
| Artifact test | Production-only tarball install (host supplied separately, `--legacy-peer-deps`), exact Pi 0.84.4 extension loader, setup tool, and real provider-free print CLI `help/status/setup/invalid` packets passed. |
| Load-only test | Network/process/file-open/timer sentinels enabled before dynamic module import/factory; only two tools and one command registered. No provider registrations or event hooks. |
| `node ../../scripts/file-budget-audit.mjs --root "$PWD" --fail` | Passed against actual package files, including untracked authored files (not just Git's tracked subset). |
| `git diff --check` | Passed for tracked root changes; package lint/budget/structure checks cover the new untracked package. |
| `npm audit --omit=dev --json` | Zero runtime dependency findings. |
| `npm audit --json` | Development closure retains 3 findings: low esbuild, high undici, moderate Pi host effect. Approved host was not upgraded or silently patched; owner follow-up remains. |

Hermetic adversarial proof covers wrong scope/authority/schema, stale/future and
bounded contracts, exact alias/no raw upstream substitution, credential fields,
loopback URL admission, unsafe/missing contract/artifact paths, template/argv/env
isolation, private files, native cancellation/output/error budgets and cleanup,
private/IPv6/mapped/transition IPs, mixed DNS answers, address pinning, each redirect,
HTML response budgets/compression, stalled DNS cancellation, no startup actions,
bounded command errors and absence of save/write flags. Artifact dependency install
uses npm registry/cache; that install check is distinct from the hermetic core
transport/subprocess fixtures.

## Coverage limits / blockers

1. **Real repaired-native fixture smoke now passes**, as recorded below. This is
   not unmodified-c2 proof, source attestation or full extraction-completeness
   proof. Public engine metadata declares required base/patch/lock inputs; file
   metadata never attests them. The external native closure retains 3 reported
   audit findings (2 high, 1 moderate), still under parent exposure assessment.
2. **Canonical declaration observed stale:** `generated_at=2026-09-19T17:43:19Z`.
   Actual read-only `status` reports `stale`; `setup` refuses it and requests owner
   refresh. Nothing was refreshed or repaired. A fresh trusted owner declaration
   is required for the real setup recipe. Synthetic fresh contract setup passed.
3. Parent's bounded public fixture demonstrates native Interpreter response
   shape and exact requested alias, but not configured browser use, current/general
   endpoint authentication, host permission or browser-origin/preflight behavior.
   Tools still report unprobed/unknown state; this child added no probes, POSTs,
   settings import or browser/key reads. Model supports text+image; **current
   Interpreter payload is text-only**.
4. **Save deliberately unsupported.** Atomic no-overwrite/native Obsidian CLI and
   approval behavior could not be verified safely in this scope. No save tool,
   path/confirmation/overwrite implementation or test proxy is presented as done.
5. Root fleet/global activation/real TUI/browser/vault behavior were not checked;
   no neighboring package installs or root gate bypasses were used.

## Parent native smoke invocation

From `packages/pi-obsidian-clipper/`, using the pinned package toolchain:

```bash
PI_OBSIDIAN_CLIPPER_CLI=/absolute/owner-installed/dist/cli.cjs \
  node --import tsx scripts/native-smoke.ts
```

Uses inert caller HTML, public example URL metadata, the actual installed native
CLI, and assertions for extracted fixture content plus canonical capture
frontmatter. No page fetch, model POST or vault write. See
[native engine boundary](native-engine.md) for provenance requirements. Parent must
record its actual smoke outcome independently; the repaired production variant's
actual child-run fixture outcome is recorded below.

## Independent-review fixes

Changed in this follow-up only: `src/transport.ts`, `src/contract.ts`,
`tests/transport.test.ts`, `tests/contract.test.ts`, `README.md`, and this report.
No root release metadata, manifests/locks, owner repos or live settings were changed.

- HTTPS requests now explicitly set `rejectUnauthorized: true`. The regression
  asserts this on both initial/redirect requests under
  `NODE_TLS_REJECT_UNAUTHORIZED=0`, preserving the original hostname, default
  hostname verifier, pinned lookup and abort signal. Transport is mocked; no
  unsafe live TLS request was made.
- Provider preview now has `apiKeyRequired: true`, `previewOnly: true`, and
  `endpointAuthentication: unknown`. The empty key remains an explicitly unusable
  non-secret preview. Instructions state that native Custom provider UI always
  requires a nonempty key field, even for a keyless endpoint; no working dummy or
  blank credentials are invented. Owner verification and operator entry remain
  required, with manual append and no whole-settings import.
- README documents optional read-only
  `python3 scripts/phasee/lane-op.py provider-contract baseline-text --surface canonical`
  **without `--write`**, extracting only `.contract` from its wrapper into a
  private regular file and explicitly selecting the override. This child did not
  execute the exporter or auto-refresh canonical state.
- Parent's captured `.scratch/provider-contract-live.json` wrapper was rejected
  as a direct contract; its unchanged inner contract was validated and read via
  `.scratch/provider-contract-inner-review.json` (0600) and explicit override.
  Observed `generated_at=2026-10-04T06:17:51Z`, freshness `fresh`, exact
  `baseline-multimodal`, preview-only setup, authentication/browser state unknown.
  This does not supersede the canonical-file stale observation or prove health.
- Clock skew documentation and boundary test now accurately state: future
  timestamps up to and including 60 seconds are tolerated; 61 seconds fails.

Rerun using Node **22.23.3** / npm **12.0.2**:
`node --import tsx --test tests/contract.test.ts tests/transport.test.ts` passed
**15/15** focused bodies; `npm run check` passed **24/24** bodies across 5 files,
including production artifact/headless smoke; `npm run release:check:quick` and
`git diff --check` passed. No skipped tests or gate suppression.

At that review, native proof was absent because the parent reported source/lock
inconsistencies. That native-fixture blocker is superseded by the authorized local
repairs and actual production smoke below; this child did not repair owner source.
Browser use remains unverified, and save remains unsupported.

## Repaired native production and content-preservation follow-up

Changed in this follow-up only: `src/native.ts`, `extensions/obsidian-clipper.ts`,
`scripts/native-smoke.ts`, `tests/native.test.ts`, `README.md`,
`docs/project/native-engine.md`, and this report. No manifest/lock/root release
mapping, global install, owner repo, browser, vault, Pi provider/lane or AK changes.

The adapter now checks the sanitized native output's metadata/body boundary.
Exit-zero frontmatter-only, missing/unterminated body and whitespace/punctuation-
only output fail clearly. Fake CLI regression exercises LF/CRLF/BOM, metadata
without closing delimiter, control-only bodies, cleanup on failure, and byte-
preserved genuine opening/closing body content. The canonical template remains
unchanged. This is a bounded delimiter/content-presence guard, not a substitute
YAML parser, extractor or proof that every page element is preserved.

Public engine requirements now explicitly identify:

- source base `c2fbae9645332ecf8d05dcf281483693b5054213`;
- AK6642 Document handoff source/test patch SHA-256
  `6390779f82a0b20b445c0cc027861e4a105a705b3b1599580f5ae63b819a6c82`;
- AK6640 repaired lock SHA-256
  `03ab25e0b761b0f1e7505c2c5f34cff400bced5ed7fe609134607eb793477ed1`.

These are operator-authorized **local uncommitted repairs**, not an assertion that
unmodified c2 works, a new owner commit exists, or an artifact was built from a
read-only pristine checkout. Parent provenance is
`/home/tryinget/.local/state/pi-quests/tmp/ak6642-production-TQQAylsL/provenance.json`.
This child independently SHA-256 matched the supplied source patch, repaired lock
and production CLI file against that provenance. Source/build association and
native suite history remain parent-recorded, not a fresh child build/source audit.

Actual repaired production CLI SHA-256:
`4c6a9b6246bc0bfa7b068c376be7685c027ee609d429ac9dac54589313ca2835`.
Keep its production runtime closure, notably external linkedom, with the CLI.
From the package with Node **22.23.3** / npm **12.0.2**, this child ran:

```bash
PI_OBSIDIAN_CLIPPER_CLI=/home/tryinget/.local/state/pi-quests/tmp/ak6642-production-TQQAylsL/dist/cli.cjs \
  node --import tsx scripts/native-smoke.ts
```

**Observed exit 0**, `nativeFixturePassed: true`, **114 post-frontmatter body
bytes**, both fixture paragraphs, canonical capture properties and `saved: false`.
The smoke independently splits body from metadata and checks body content, rather
than relying only on the adapter guard or a phrase potentially present in metadata.
Logs: `.scratch/native-production-guard-smoke.json` and corresponding `.stderr`.
Caller HTML was supplied; no URL fetch/model POST/vault save was requested.

Parent provenance additionally records actual repaired API/compiled-CLI cases
9 red → 9 green, production `npm ci --omit=dev --ignore-scripts`, default/UTC
native suite 608 pass/1 timezone-golden failure, and 609 pass under
`TZ=America/Los_Angeles`. These suites were not rerun by this child. Defuddle's
intentional removal of an uncaptioned image matching `og:image` is not classified
as a native Document handoff bug. Direct `dist/api.mjs` remains unprovisioned and
unverified in production. External native npm audit reports **3 findings (2 high,
1 moderate)**; parent assessment of bundled versus orphan/unused exposure remains
open. They are not resolved, waived or silently upgraded here; the adapter's own
runtime audit does not cover them.

### Bounded parent Interpreter protocol proof

Read supplied `.scratch/interpreter-live-protocol-report.json` and
`.scratch/interpreter-public-fixture-response.json`; verified response SHA-256
`c2ef07fd572d8afe3d8d494ba7d8f570ef02fb110ab077756ed7e80748af4c45`
and parsed `choices[0].message.content` → `prompts_responses.prompt_1: 'OK'`.
Parent reports exact `baseline-multimodal` request to loopback 1234, HTTP 200 in
1.51s, GET models alias present, and returned raw AEON-7/Qwen3.8 upstream model
from owner routing. That returned name is **not an adapter alias substitution**.
No child model request or new probe was made; a bounded review summary is in
`.scratch/protocol-reviewed-summary.json`, with no inference/context dump.

Synthetic UI key-field value `local` was accepted only for that public fixture.
It is **not** a new setup credential or proof authentication stays disabled.
Native Custom provider UI still needs an operator-supplied nonempty field and
owner-verified authentication. OPTIONS returned **501**, while POST returned
`Access-Control-Allow-Origin: *`; real browser origin, extension host permission,
preflight behavior and actual configured Interpreter use still require checks.
No actual browser state was read; the report's lack of browser proof does not
become a measured configured-state assertion by this extension.

The owner's non-mutating envelope → unchanged inner private contract flow was
validated in the preceding follow-up. Default canonical contract remains stale;
it was not overwritten, auto-refreshed or given fabricated timestamps. A private
export must still satisfy its actual freshness interval. Runtime `status`/`setup`
continue to separate declaration from unprobed availability/auth/browser state.

### Follow-up gate outcomes

Pinned Node **22.23.3** / npm **12.0.2**: focused native guard tests **6/6**,
`npm run check` **25/25** bodies across 5 files (including production adapter
package install/headless smoke), `npm run release:check:quick`, explicit
`file-budget-audit --fail` and `git diff --check` all passed. No skipped test
bodies, source/lock dependency upgrades or suppressed substantive failures.
The native-production fixture command above also passed with the final body guard.
Logs are package-local `.scratch/content-guard-{tests,check,release}.log`.

### Final public contracts

- `/obsidian-clipper status|setup|help`: bounded JSON, read-only, no probes or
  provider registration. Setup requires a fresh trusted contract, exact
  baseline-multimodal, incomplete non-secret Provider/Model preview and additive
  manual UI steps; default Interpreter payload remains text-only.
- `obsidian_clipper_setup({})`: same read-only recipe; no browser storage/key read
  or destructive settings import.
- `obsidian_clipper_extract({url, html?})`: controlled public HTTPS or caller inert
  HTML, external owner-installed current-upstream CLI with private canonical template, bounded/cancellable
  Markdown evidence with required-engine metadata and `saved: false`. Missing
  meaningful post-frontmatter body throws instead of reporting capture success.
- `obsidian_clipper_save`: unsupported/not registered; no native `--open` or
  Obsidian/vault write.
