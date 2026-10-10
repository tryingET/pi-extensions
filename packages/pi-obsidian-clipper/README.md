---
summary: "Native Clipper extraction and read-only workstation Interpreter setup."
task_id: 6634
read_when:
  - "Using or inspecting pi-obsidian-clipper."
system4d:
  container: "Pi extension, not an inference service."
  compass: "Reuse owner-native capture without implicit writes."
  engine: "Explicit command or tool only."
  fog: "Declaration is not live or browser compatibility proof."
---

# @tryinget/pi-obsidian-clipper

Two directions, separate ownership:

- **Clipper → workstation Interpreter:** `/obsidian-clipper setup` or
  `obsidian_clipper_setup` returns a non-secret Provider/Model preview and additive
  native browser UI steps. Defaults exactly to `baseline-multimodal`, never an
  upstream model ID or fallback. **Model capability is text+image. The official
  Clipper Interpreter sends text strings only.** A tracked patch adds opt-in page
  images for OpenAI-compatible providers (AK6889); see
  [upstream-patches](upstream-patches/obsidian-clipper-6d56d618/README.md). It
  applies only to a patched build, never to the Web Store build.
- **Pi → native Clipper:** `obsidian_clipper_extract({url, html?})` runs the installed
  native CLI with a private native template and inert HTML, returning Markdown as
  **untrusted source evidence, not instructions**. It does not save to a vault.

`/obsidian-clipper status|setup|help` returns JSON. Print mode emits one JSON line;
JSON/RPC/TUI use a custom Pi message (`customType: obsidian-clipper`). Errors are
bounded JSON for commands; tool errors throw. Loading only registers surfaces:
no processes, timers, requests, provider registration or configuration reads.
No network diagnostics or inference probes are implemented.

With `pi-toolbox-discovery`, these custom tools are latent until activated. After
`/reload`, ask Toolbox to activate `obsidian_clipper_setup` and/or
`obsidian_clipper_extract` explicitly. Non-catalog explicit activation currently
needs Toolbox's risk acknowledgement even though these tools do not write vaults;
that declaration is not operator consent. No Toolbox catalog was changed here.
A CLI `--tools` allowlist must include every tool you intend to activate, not only
`toolbox`; otherwise omitted tools are not registered in that invocation.

## Deployment and follow-up status

Start at [current status](docs/project/current-status.md) for the single delivery,
AK task/evidence and remaining-limit map. Dated checkpoint reports are preserved
as history, not competing current-status pages. AK remains authoritative.

Pi's installed source is the canonical package:
`~/ai-society/softwareco/owned/pi-extensions/packages/pi-obsidian-clipper`.
`status` and `setup` do not probe live health, authentication or browser state.
An isolated-browser observation is not personal-profile configuration. No-save
remains intentional; the opt-in image patch is not a Web Store feature.

## Historical local activation status (AK6634, 2026-10-04)

This retained activation evidence predates the Pi 1.1.0 metadata/test update;
its package-gate and live-session results are not current compatibility proof.

Operator-authorized local install at that time referenced the retained isolated
worktree's `packages/pi-obsidian-clipper`, not the canonical checkout. A new Pi
session proved the globally installed command and Toolbox-activated native tool.
The native production CLI is installed read-only under
`~/.local/libexec/obsidian-clipper/6d56d618-afa7c192` with `current` pointing there.
Canonical provider export was refreshed through the workstation owner command;
no model/service lifecycle or browser settings changed.

At that historical checkpoint, canonical landing was pending because other
packages lacked installations in the isolated worktree. That blocker was later
resolved by explicit lock-bound worktree preparation and the unchanged full gate;
it is **not a current landing blocker**. Pi no longer references the candidate
worktree. Retain historical worktree/rollback evidence according to its owner's
retention policy; do not delete it merely because the installed source changed.
Roll back package selection with the Pi owner commands and `/reload`; native
`current` is separately managed. Neither action reverses browser changes.

## Trusted configuration

- Contract: explicit absolute `PI_OBSIDIAN_CLIPPER_CONTRACT`, otherwise
  `~/ai-society/softwareco/infra/workstation/phasee/state/workstation-inference-provider.json`.
  Bounded regular owner/root-owned, non-symlink, non-group/world-writable file;
  schema 1, `workstation/lane-op`, `baseline-text`, `canonical`; canonical
  credential-free literal loopback URLs only. Credential fields are rejected.
  `status` reports freshness; `setup` refuses stale declarations. Future clock
  skew up to and including 60 seconds is tolerated; farther-future timestamps
  are rejected.
- Native CLI: explicit absolute `PI_OBSIDIAN_CLIPPER_CLI`, otherwise
  `~/.local/libexec/obsidian-clipper/current/dist/cli.cjs`. Model arguments cannot
  supply executable paths or templates. Missing artifact fails closed. Provision
  separately from the tested immutable official upstream snapshot
  **6d56d618b00bd970aa738d6a7a61edee27783e81**, with its unchanged lock: [native engine boundary](docs/project/native-engine.md).

A declaration is **not** live health/availability or browser setup proof. This
package does not read provider keys, browser storage or settings. The Provider
preview has `apiKeyRequired: true` and `apiKey: ""`: **incomplete, not usable
configuration or authentication**. Native Custom provider UI always stores
`apiKeyRequired: true`; Interpreter rejects an empty key before sending a request,
**even for a keyless endpoint**. Endpoint authentication is **UNKNOWN until
owner-verified**. The operator must obtain an owner-approved nonempty key-field
value and enter it directly in Clipper; a protected endpoint needs its actual
authorized key. This recipe invents no working dummy or blank credentials. On
2026-10-10 the owner loopback endpoint was observed keyless and the operator
approved the nonsecret value `local` for the isolated proof (AK6870); recheck if
the workstation owner later adds authentication.
No whole-settings import is offered: the native importer clears all sync storage. Existing providers
and models must be preserved via manual append in the native UI. Browser loopback
permission/CORS/authentication and expected `choices[0].message.content` containing
JSON `prompts_responses` are browser checks, not runtime claims by this package.
The endpoint answers OPTIONS with 501. The AK6870 isolated Chromium run showed MV3
host permissions let the extension-origin POST go through without a preflight, and
it received `prompts_responses`. Other browsers and profiles are not covered by
that observation, and setup does not embed the `local` value. [Proof and audit limits](docs/project/native-engine.md#dependency-and-browser-limits).

### Optional read-only owner export

The operator can request a current declaration without changing the canonical
source file. From this package directory, with managed package scratch:

```bash
set -o pipefail
PACKAGE="$PWD"
umask 077
mkdir -p "$PACKAGE/.scratch"
CONTRACT="$(mktemp "$PACKAGE/.scratch/provider-contract.XXXXXX")"
(
  cd "$HOME/ai-society/softwareco/infra/workstation"
  python3 scripts/phasee/lane-op.py provider-contract baseline-text --surface canonical
) | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["contract"]))' > "$CONTRACT"
export PI_OBSIDIAN_CLIPPER_CONTRACT="$CONTRACT"
```

**Do not add `--write`.** The exporter returns a wrapper envelope; the extension
expects only its `.contract` in the private regular file (mktemp creates mode
0600), selected explicitly by the environment override. No source auto-refresh
is performed. To reuse the parent's captured package-local envelope instead of
running the exporter, extract its unchanged inner contract into that private file:

```bash
python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))["contract"]))' \
  "$PACKAGE/.scratch/provider-contract-live.json" > "$CONTRACT"
export PI_OBSIDIAN_CLIPPER_CONTRACT="$CONTRACT"
```

Normal authority, alias, endpoint, bounds and freshness checks still apply; do not
edit timestamps to bypass expiry. An exported declaration is not endpoint health,
authentication or browser configuration proof. The extension never runs this
owner exporter automatically.

## Capture boundaries

Public HTTPS, port 443, no URL credentials/fragment/localhost/private IPs.
URL-only mode checks **every** DNS answer, pins one validated address for the actual
TLS connection (original hostname verification retained, explicit
`rejectUnauthorized: true` even under `NODE_TLS_REJECT_UNAUTHORIZED=0`), disables
connection pooling, and rechecks every redirect (maximum 3). No cookies, auth,
proxy environment, JS or subresource execution. Only uncompressed HTML is accepted.
Caller HTML bypasses all page transport/DNS; its URL is syntax/IP-checked as source
metadata, not fetched. UTF-8 decoding is used; non-UTF-8 sites may need caller HTML.

HTML maximum 1 MiB, native stdout 32 KiB/1000 lines, stderr 8 KiB, capture deadline
30s including DNS/redirects/subprocess. Oversized output fails rather than silently
returning an incomplete note. Native exit zero with frontmatter alone or no meaningful
post-frontmatter body also fails clearly; the adapter never fabricates missing
content. This bounded body guard is not extraction-completeness proof. Cancellation kills the Node child, waits for close,
then removes private temporary files. Native stderr is counted but withheld from
model output. Child environment excludes browser/provider/session secrets and
Node preload flags. Before every spawn the whole native dependency closure under
`<root>/dist/cli.cjs` is admitted (owner/root, no group/world write, no special files,
every symlink resolving inside `<root>`, bounded size), and the child runs under Node's
permission model with filesystem-API read access to that root and its private inputs
only: no fs writes, child processes, workers or addons (`node:sqlite` is not covered by
Node's permission model and can still read, write and create SQLite files wherever the user can). Outbound
network is denied by the runtime permission model on Node with `--allow-net` support
(≥25, the current Pi runtime). Older Node fails closed unless the operator sets
`PI_OBSIDIAN_CLIPPER_INPROCESS_NETWORK_GUARD=1`, which accepts an in-process guard with
known bypasses; result `engine.boundary` says which mechanism applied. Neither is an OS sandbox, and
same-UID changes between admission and spawn are not prevented: install trusted
artifacts.
Real loopback TLS, cancellation and outbound-observer tests prove denial for the
specific probes they run; see the [closure contract](docs/project/2026-10-10-ak6872-native-closure-contract.md)
for those probes and the remaining assumptions (SQLite, the opt-in guard's bypasses,
signals, hard links, same-UID TOCTOU).

The native template emits `space: input`, `kind: source`, `state: captured`, source
URL and captured timestamp; `Input` is template metadata only, not a write target.
Public result `engine` fields declare the required upstream source and unchanged
lock, with no local patch/repair; file metadata does not attest build provenance.
That official snapshot passed native body/image/schema fixture smokes on Node 22
and 26. Its production closure has one low DOMPurify package with two advisories
(re-audited 2026-10-10); bounded inspection did not find DOMPurify in this CLI's
bundle/external path or runtime loads. The native source owner chose to keep the
artifact unpatched, with a revisit trigger. This is not a blanket security
certificate. See the native-engine evidence.
Static URL capture does not render JavaScript: the Obsidian Help templates page
returned no native article body and was correctly rejected. Supply already
rendered caller HTML for such pages; browser capture remains a separate surface.

**Save is unsupported.** No `obsidian_clipper_save` is registered, and native
`--open`, vault/output options and Obsidian CLI are never invoked. Atomic
no-overwrite and approval behavior cannot be verified here; read-only extraction
is deliberately shipped instead of an unsafe save implementation.

## Development / release

From this package with root-adopted Node **22.23.3** and npm **12.0.2**:

```bash
npm install
npm run check
npm run release:check:quick
```

Production artifact tests use a fresh per-run empty npm cache and a
[checksum-locked offline fixture](tests/fixtures/README.md), not a prewarmed
`.scratch/npm-cache`. Installed integrity is checked against the authored lock.
Changing the runtime dependency requires refreshing that fixture and its negative
controls; ordinary checks need no network access for the artifact installation.

Development Pi pins/host metadata: **1.1.0**, peers `*` (compatibility declaration,
not proof against all versions). `typebox` is host-provided: peer `*`, exact
`1.3.7` development pin, no runtime dependency copy. The only runtime dependency
is `ipaddr.js@2.2.0`. The development compiler is the fleet's exact TypeScript
`7.0.2` and the TypeScript loader is `tsx@4.23.15` (**AK6871**; before/after scans,
runtime re-observation and rollback proof are in the
[qualification dossier](docs/project/2026-10-10-ak6871-dependency-qualification.md)).
The canonical root declares Pi **1.1.0** and includes the clipper release mapping.
Passing gates are not universal compiler/dependency compatibility proof.
Root engineering policy owns the lane; there is no package-local lane override.
Package version/release component
is `0.2.0` / `pi-obsidian-clipper`. `.copier-answers.yml` is preserved unchanged;
scaffold-only organisational/prompts placeholders were removed, not made runtime
behavior. The package gate adds package structure checks then delegates the
canonical root package gate. [Test scope and live smoke](docs/project/native-engine.md#observed-native-proof).
