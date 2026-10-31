---
summary: "Many-of-the-greats adjudication for AK7814 (operator, 2026-10-31, evidence 18338): should the Pi task-session runtime build its dependencies in-house, keep them, trim them or lock them? Corpus: the owned dep-diet, dep-viz and dep-surgeon tools on a read-only copy of the installed closure (134 packages). The host needs 35 packages; 62 load only through providers the host refuses; 2 are feature-gated; 35 are unreachable. The dominant risk is not size but drift: only 4 SDK packages are identity-pinned, the SDK's companions (pi-mcp and pi-codemode in host core) float on ^1.1.0, and 85 third-party packages float, so a reinstall today can mix SDK 1.1.0 with newer companions. Result by class: pin the SDK companions; pin the closure with a two-layer lockfile (third-party and SDK locked, our own tarballs added and verified offline); install only reachable own code and refuse any own package from the registry; drop the orchestrator after a runtime trace; do not replace small third-party code (exact-version pins of upstream bytes are cheap, owned copies are forks). Independent inspection overturned three first-draft verdicts; both versions are kept. Analysis only."
read_when:
  - "Deciding how the Pi task-session runtime acquires, pins or trims its npm dependencies (AK7390 install, task-session-install.mjs)."
  - "Someone proposes replacing a small dependency of the Pi SDK with an owned copy, or reinstalling the runtime from the current installer."
type: adjudication
task_id: 7814
follows: [18338]
method: many-of-the-greats
system4d:
  container: "AK7814 build-vs-depend adjudication for the Pi task-session runtime's npm closure."
  compass: "Pin what drifts, install only reachable own code, and keep small upstream code as pinned upstream bytes rather than owned forks."
  engine: "Many-of-the-greats schools, their confrontation, an independent adversarial inspection, then a verdict per dependency class."
  fog: "Reachability is static, not observed at runtime; newer versions were seen only in the local npm cache."
---

**Analysis only.** No installer, manifest, lockfile, dependency or runtime was changed. Reachability
verdicts are static (code reading and import traces), not observed runtime. Version availability
newer than 1.1.0 was seen in the local npm cache only; the registry was not queried.

# QUESTION

The supported installer builds the Pi task-session runtime with a fresh, unlocked `npm install`. For
each dependency of that runtime, is it worth what it costs (size, supply-chain surface, acquisition,
drift, identity pins), and should it be built in-house from our monorepo, depended on as an upstream
artifact, pinned, trimmed, or replaced by an owned copy?

## Corpus (read-only copy of runtime `86c030bb`, tree hash `f45fa06e…`; reports under `/data/agnt/worktrees/ak7814-dep-analysis-b6ac0fbf/`)

| Fact | Value | Source |
|---|---|---|
| Installed | 134 name@version, 131.6 MiB apparent, 846k JS lines | dep-diet `inventory.json` |
| Groups | 11 `@tryinget` (ours), 8 `@earendil-works` SDK, 115 third-party | dep-diet, dep-viz |
| host-v1 core | 35 packages incl. photon-node (image reads): 8.4 MiB of reached modules, 44.5 MiB installed | dep-diet `layers.json`, inspection |
| Provider-gated | 62 packages, 53.8 MiB installed: Bedrock, Google, Anthropic, openai. The host admits only api `openai-codex-responses` at `chatgpt.com/backend-api` (`model-source.js:14-18`); `codex.js` runs with network model refresh off | dep-diet, re-verified, inspection |
| Feature-gated | 2 packages: quickjs-wasi (codemode worker), jiti (extension loader); photon-node is counted in core. Partition: 35 + 62 + 2 + 35 = 134 | dep-diet, inspection |
| Unreachable | 35 packages: orchestrator subtree, chord + esbuild (11 MiB, native ELF), protobufjs stack, pi-telemetry, type-only packages | dep-diet |
| SDK identity | `assertSdkIdentity` pins 4 packages' bytes (pi-coding-agent, pi-ai, pi-agent-core, pi-tui; `identity.ts:7-80`). The companions pi-mcp, pi-codemode, chord (from pi-coding-agent) and pi-telemetry (from pi-ai) are declared `^1.1.0` and **unpinned**; pi-mcp and pi-codemode load in host core | closure manifests, `task-session-install.mjs:83`, re-verified |
| Companion drift | the local npm cache holds companion versions 1.2.0 (cached 2026-10-13) and 1.4.0 (2026-10-22); the runtime lock is from 2026-10-10. A reinstall today would likely resolve newer companions next to SDK 1.1.0 | inspection (cache only) |
| Third-party pinning | bytes never verified (`identity.ts:37-40` skips `node_modules`; pack-proof records only the 2 own tarballs). 29 dirs are fixed by exact versions in the SDK manifests; **85 float, 10 of them in host core** (balanced-match, graceful-fs, isexe, lru-cache, path-key, retry, shebang-*, signal-exit, which) | dep-surgeon, inspection |
| Committed lock | `packages/pi-little-helpers/package-lock.json` is tracked, matches 145 of 150 runtime entries; the tests use it, the installer ignores it. Drift observed: lru-cache 11.4.0 (lock) vs 11.5.3 (runtime), typebox 1.3.7 vs 1.3.34 | inspection, re-verified tracked |
| Our own code from npm | 9 of 11 `@tryinget` resolved from the public registry, because prepack rewrites `file:` dependencies to exact versions (`pi-interaction/scripts/prepare-publish-manifest.mjs:286-311`). 8 of the 9 ship code byte-identical to monorepo HEAD; pi-autonomous-session-control 0.7.0 vs source 0.8.0 differs in 18 code files (unreachable) | lockfile, inspection |
| Orchestrator | unreachable; its task-session adapter is byte-identical to pi-little-helpers' `producer-adapter.js` (`1adf9ef2…`, re-verified); packed anyway (`task-session-install.mjs:63`); 8 packages, 7.4 MiB | dep-diet, dep-surgeon |
| Build digest | covers only pi-little-helpers `dist/task-session`; an existing `runtime/<digest>` makes the installer discard new staging (`:104-106`), so closure-only changes are silently not deployed (AK7824) | dep-surgeon |
| Vulnerabilities | 0 (offline grype DB 2026-10-15; positive control matched 8); OSV not checked | dep-viz |
| Licences | permissive; 10 `@tryinget` carry a non-SPDX rider (operator's own copyright: scanner noise) | dep-viz |
| Install scripts | esbuild, protobufjs, @google/genai; the installer passes `--ignore-scripts` (`:78`), so they should not have run (inferred, not observed) | dep-viz, dep-surgeon |
| Small reachable third-party | partial-json 292 LOC, cross-spawn 239, get-east-asian-width 172, proper-lockfile 412, chalk 657 …: all imported by the SDK; our own code imports only typebox@1.3.34 (`pi-tool.js:1`) | dep-diet, inspection |
| Removal authority | dep-diet refuses every replacement intent with `runtimeEvidenceAbsent`; dep-surgeon therefore has no valid plan | dep-surgeon |

## Governing texts

- **AK7390 contract:** supported installer; bounded dependency setup; no mandatory-check skips.
- **16844:** no fabricated or borrowed cache; "a fixed npm registry flag alone is not an egress
  boundary"; the installer's fresh unlocked resolution is the concern.
- **dep-diet:** "Evidence, not authority"; unused "only when every channel is silent".
- **pi-extensions:** canonical is live; land only via `scripts/land-canonical.sh`.
- **AK pins:** reinstalling the default host changes `host_sha256` (it embeds the build digest and the
  commit): an AK `task_session` rebinding, i.e. a D151 rotation under AK7710 and freeze 17963. A
  side-by-side install (AK7390) does not touch the default.

## MODE 1 — MANY OF THE GREATS

### School 1: Minimalism (Pike, "a little copying is better than a little dependency"; OpenBSD)
- Core claim: every dependency is code you run and cannot read; copy the little you use, drop the rest.
- Strongest case: 115 third-party packages serve a host that needs 35; partial-json is 292 lines for one `parse`.
- What it sees: count and size are real costs that nobody budgets.

### School 2: Division of labour (Smith; Brooks, "No Silver Bullet": buy, don't build)
- Core claim: specialists maintain shared components better than a consumer can; owning is a permanent tax.
- Strongest case: the SDK and its provider clients are maintained upstream; an owned copy tracks every bump.
- What it sees: the cost of an owned copy is its maintenance, not its first version.

### School 3: Provenance and reproducibility (Thompson, 1984; SLSA; reproducible builds)
- Core claim: what matters is knowing exactly which bytes run and where they came from.
- Strongest case: 4 of 8 SDK packages are pinned; companions in host core float; 85 third-party
  packages float; the committed lock is ignored by the installer and has already drifted.
- What it sees: drift, not size, is the live risk; the next reinstall is a different program.

### School 4: Attack-surface reduction (Saltzer and Schroeder, economy of mechanism; Howard)
- Core claim: what is not needed must not be present.
- Strongest case: 35 packages are unreachable; one ships an 11 MiB native binary and an install script;
  the orchestrator subtree is installed only to provide a file the host already has.
- What it sees: unreachable code still costs acquisition, review and scanning.

### School 5: Upstream first (Linux kernel practice)
- Core claim: fix shared code where it lives; a local patch is a fork you carry forever.
- Strongest case: an `overrides` stub or an owned copy makes the closure differ from what SDK 1.1.0
  declares and must be re-checked at every bump.
- What it sees: the cheapest local fix is often the most expensive one over time.

## MODE 2 — CONFRONTATION

### Clash 1: Minimalism vs division of labour, on the small packages
- Every small reachable package is imported by the SDK, not by our code. An owned copy of partial-json
  is an override that silently replaces whatever pi-ai pins, plus a differential test corpus, for
  0.02 MiB. Division of labour dominates for code replacement. But an **exact-version pin of the same
  upstream bytes** is neither a copy nor a fork; it is cheap and removes drift. Minimalism's instinct
  is right about size and wrong about leverage.

### Clash 2: Minimalism vs provenance, on "fewer dependencies"
- Fewer packages resolved without a lock still drift. A locked closure of 134 packages is safer than
  an unlocked one of 100. Provenance dominates: pin first, trim second.

### Clash 3: Provenance vs upstream first, on the SDK companions
- The companions float because upstream declares `^1.1.0`. Upstream first says leave it; provenance
  says pin it. They do not conflict on means: pinning the published 1.1.0 bytes changes no upstream
  code. Provenance dominates, urgently, because pi-mcp and pi-codemode load in host core.

### Clash 4: Attack surface vs upstream first, on unreachable and provider-gated SDK packages
- Removing them locally needs overrides (a fork) or `--omit=optional` (drops only the esbuild ELF).
  They never load. The cost is acquisition, disk and scanning, not runtime exposure. Irreducible
  locally; the right fix is upstream (optional providers, chord as a dev dependency).

### Clash 5: Attack surface vs provenance, on our own packages
- Building our own packages in-house changes no host bytes (8 of 9 are byte-identical; the build
  digest covers only pi-little-helpers), so provenance gains little there. Not installing unreachable
  own code gains more. Both need enforcement, because npm silently falls back to the registry when a
  local tarball's version does not match. The toolchain refuses removal on static evidence, so a
  runtime trace must confirm first.

## MODE 3 — INTEGRATION OR DECISION

- **Chosen path:** contextual dominance by dependency class.

| Class | Packages | Dominant school | Verdict |
|---|---|---|---|
| SDK, identity-pinned | pi-coding-agent, pi-ai, pi-agent-core, pi-tui | division of labour | **Depend** on the exact published bytes |
| SDK companions | pi-mcp, pi-codemode (host core), chord, pi-telemetry (unreachable) | provenance | **Pin at 1.1.0 now** (lock or exact overrides of the same bytes); consider extending `assertSdkIdentity` to pi-mcp and pi-codemode |
| Third-party closure | 115 | provenance | **Two-layer lock:** lock the third-party and SDK closure (seeded from the committed lock, reconciled with the admitted runtime); then add our own tarballs built at the exact commit, offline, and verify |
| Our own, reachable | pi-little-helpers | provenance | Already packed from source (`:63`) |
| Our own, unreachable | orchestrator chain (8), session-compaction, model-selection, telemetry | attack surface | **Stop installing** after a runtime trace confirms; split pack-proof in step; fail the install if any `@tryinget` lock entry resolves from the registry |
| Provider-gated | 62 | upstream first | **Keep** (never loaded); ask upstream for optional providers when the operator chooses to file |
| Unreachable SDK-brought with native code | chord + esbuild | attack surface, bounded | `--omit=optional` drops the ELF, or accept; upstream fix in parallel |
| Small third-party code | partial-json, cross-spawn, chalk … | division of labour | **Do not replace**; pinning covers the drift risk |
| Our own peer use | typebox@1.3.34 (`pi-tool.js`) | provenance | Pin it; the peer `*` range floats |

- **Answer to the operator's question.** Building ourselves makes sense only for code that is ours,
  and there the win is installing less, not rebuilding: our published packages already match the
  monorepo byte for byte, except one unreachable one. Replacing small third-party code does not pay:
  it is the SDK's, so an owned copy removes nothing and forks the SDK silently. What is worth doing is
  pinning: today the SDK's own companions float in host core, and 85 packages float. Of what the
  dependencies give: 35 do the host's work; 62 give this host nothing but cost acquisition and
  scanning, because they never load; 35 give nothing at all.
- **What remains unresolved:**
  - R1 *Runtime evidence.* A runtime trace of host-v1, view-v1 and bin.js (runtime-trace-insights, then
    `depdiet analyze --runtime-bundle`) gates every removal.
  - R2 *The lock is reproducibility, not trust.* Its sha512 values come from the registry at lock time
    (trust on first use). It needs a private cache filled by one locked, integrity-checked fetch;
    offline enforced by `--offline` plus a network namespace (`unshare -rn`), not a flag alone; and an
    update path, since a frozen lock ages (R3).
  - R3 *Vulnerability currency.* Offline DB 16 days old; OSV not checked.
  - R4 *Publisher identity, toolchain.* Not determinable; `/usr/bin/node` (rolling distro) and the
    per-package `tsc` are unpinned.
  - R5 *Default-host rotation.* Any default-host reinstall changes `host_sha256` (AK7710, freeze 17963).
  - R6 *Upstream asks* (optional providers, chord to dev, exact companion ranges): not filed; GitHub
    needs separate operator authority via softwareco-issue-tracker.

## Inspection (independent adversarial inspector, 2026-10-31)

Read-only; scratch and its own import walker in `inspection/`. It reproduced the 34-package static
core and the provider gating, and overturned three first-draft verdicts (draft 1 kept as
`…many-of-the-greats.draft1.md`, sha256 `6f0e8058…`):

1. **P1, overturned:** "8 SDK packages: depend on the exact published bytes (identity-pinned)". Only 4
   are pinned; pi-mcp and pi-codemode float on `^1.1.0` in host core. The first draft missed drift.
2. **P1, overturned:** "build all 11 own packages in-house". That changes no host bytes, would not
   deploy under the current installer (`:104-106`), and contradicted the next row, which drops 7 of
   them. Corrected to: install only reachable own code; enforce no registry `@tryinget`.
3. **P1, overturned:** "committed integrity lockfile + `npm ci` offline, no fresh resolution". A lock
   that includes our own tarballs changes on every own commit; corrected to two layers. The first
   draft also missed that a committed lock already exists, and drifts.
4. **P2:** "nothing pins the third-party closure" reworded (bytes unverified; 29 fixed, 85 floating);
   partition corrected to 35/62/2/35 with photon-node in core; lock limits named; step 3 (route
   before the installer change) corrected.
5. **P3:** core count 27 not ~26; units (8.4 MiB reached vs 44.5 MiB installed); acquisition cost in
   Clash 4; install scripts "should not have run" is inferred; the provider check is api/baseUrl;
   typebox in `pi-tool.js`; dirty-check scope (`:55`) must widen if more packages are packed;
   `/usr/bin/node` unpinned; the licence rider is noise.

## PRACTICAL CONSEQUENCE

1. **Installer hardening (Pi, one task):** pin the SDK companions at 1.1.0; two-layer lock with a
   private cache and namespace-enforced offline install; fail on any registry-resolved `@tryinget`;
   fix the runtime reuse trap (AK7824); optionally `--omit=optional`. Given/When/Then tests; land via
   `land-canonical.sh`.
2. **Orchestrator and extension-only own packages:** stop installing them after R1's runtime trace;
   split pack-proof in step.
3. **AK7390:** do not run the current installer as-is. Until the hardening lands it resolves unlocked
   and would likely pull newer SDK companions next to SDK 1.1.0, so the diagnostic would be qualified
   on a closure no one has pinned. Run the side-by-side install after step 1.
4. **Accept** the small SDK-internal packages and the provider-gated packages as they are.
