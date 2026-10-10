---
summary: "Native Clipper extraction and read-only workstation Interpreter setup."
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
  upstream model ID or fallback. **Model capability is text+image; current Clipper
  Interpreter sends text strings only. No automatic image/video processing.**
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

Canonical landing is **pending**: the mandated root-wide gate stops because other
packages have no installations in this isolated worktree. The new package's own
gates pass; the root failure is not suppressed and no other package is auto-installed.
Keep this worktree while Pi uses it. Roll back with `pi remove <installed-package-path>`
and `/reload`; native `current` is a separately managed local pointer. Neither
removal nor reload reverses browser changes (none were made).


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
authorized key. This recipe invents no working dummy or blank credentials.
No whole-settings import is offered: the native importer clears all sync storage. Existing providers
and models must be preserved via manual append in the native UI. Browser loopback
permission/CORS/authentication and expected `choices[0].message.content` containing
JSON `prompts_responses` remain explicit browser checks, not claims by this package.
A parent public fixture did verify exact-alias HTTP 200/JSON response compatibility;
OPTIONS returned 501, so this is **not browser-link completion**. Its synthetic
`local` key-field value was accepted only for that probe, not adopted by setup or
asserted to work permanently. [Proof and audit limits](docs/project/native-engine.md#dependency-and-browser-limits).

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
Node preload flags. Node subprocess is not an OS sandbox: install trusted artifacts.

The native template emits `space: input`, `kind: source`, `state: captured`, source
URL and captured timestamp; `Input` is template metadata only, not a write target.
Public result `engine` fields declare the required upstream source and unchanged
lock, with no local patch/repair; file metadata does not attest build provenance.
That official snapshot passed native body/image/schema fixture smokes on Node 22
and 26. Its production closure has one low DOMPurify audit finding; bounded
inspection did not find DOMPurify in this CLI's bundle/external path or runtime
loads. This is not a blanket security certificate. See the native-engine evidence.
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

Development Pi pins/host metadata: **1.1.0**, peers `*` (compatibility declaration,
not proof against all versions). `typebox` is host-provided: peer `*`, exact
`1.3.7` development pin, no runtime dependency copy. The only runtime dependency
is `ipaddr.js@2.2.0`. TypeScript remains `6.0.3`; it does not satisfy the current
root TypeScript 7 floor. The canonical checkout has no release mapping for this
unlanded candidate; the retained installed candidate's root still declares Pi 0.84.4.
Those unchanged parent contracts block full package validation and remain outside
this bounded host-compatibility repair. Root engineering policy owns the lane;
there is no package-local lane override. Package version/release component
is `0.1.0` / `pi-obsidian-clipper`. `.copier-answers.yml` is preserved unchanged;
scaffold-only organisational/prompts placeholders were removed, not made runtime
behavior. The package gate adds package structure checks then delegates the
canonical root package gate. [Test scope and live smoke](docs/project/native-engine.md#observed-native-proof).
