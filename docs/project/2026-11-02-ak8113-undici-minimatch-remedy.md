---
summary: "AK8113: what really runs undici 8.10.2 in Pi, per-advisory verdicts, the proven override for the task-session lock, why an override cannot patch the Pi CLI, and the side-by-side CLI plan."
read_when:
  - "Deciding how to remedy undici or minimatch advisories in Pi or the task-session runtime."
  - "Trusting a scanner result for a bundled Pi CLI."
  - "Moving the Pi SDK or the task-session lock past 1.4.0, when the override must be removed."
type: "evidence_note"
task_id: 8113
system4d:
  container: "Exploitability triage and remedy preparation for undici 8.10.2 and minimatch 10.2.6 in the Pi SDK closure."
  compass: "Prove what the running process executes; a clean scanner over node_modules proves nothing about a bundle."
  engine: "Measure the real load order -> triage per advisory -> prove the override on the executed path -> hand the patch to its custodian."
  fog: "Which undici owns the dispatcher depends on load order, and the CLI runs a copy no scanner sees."
---

# AK8113: undici and minimatch remedy

Status, updated 2026-11-04: the live CLI is still exposed, and **upstream has now fixed it**. Pi 1.5.0 was
published on 2026-11-02 at 11:05Z, after this write-up, and its bundle was verified (see "Upstream 1.5.0"
below). Adopting it supersedes the local rebuild. The task-session override landed with AK7845, done on
2026-11-04. No live CLI change, PATH switch, default host reinstall or filing happened. Authority: operator
rulings 19575, 19601, 19717 and 19763. Evidence: AK task 8113. Artifacts:
`/data/agnt/worktrees/ak8113-790a2a89.artifacts/`.

No reproducer ran, so nothing here confirms or refutes exploitability. Every "no path" below is static
reasoning, not proof. "Offline" below means no TCP or UDP. DNS lookups escaped most of those runs through
the systemd-resolved socket (AK8182); the rows marked DNS-masked close that.

## What actually runs undici

| Surface | `fetch` layer | Transport | npm override reaches it? |
|---|---|---|---|
| Live Pi CLI, `pi` → `dist/bundle/cli.js` | undici 8.10.2 inlined in a bundle chunk | same inlined copy | **No** |
| Installed task-session host, either Node | Node internal: 8.12.2 on 26.13, 6.29.1 on 22.23.4 | npm undici 8.10.2 | Yes |
| Anything using `dist/cli.js` or `dist/main.js` unbundled | npm undici | npm undici | Yes |

- `configureHttpDispatcher()` calls `undici.install()`, which replaces Node's own `fetch`, `WebSocket`
  and `EventSource`. On Node 26.13 that swaps a fixed 8.12.2 for the vulnerable 8.10.2.
- The host never calls `configureHttpDispatcher`. Its send port is the global `fetch`
  (`host-entry.ts:21`), its transport is SSE and redirects are errors (`codex.ts:88,159`), and its URL
  is fixed (`codex.ts:125`).
- Node's `fetch` still dispatches through whichever undici registered the global dispatcher first.
  Loading npm undici registers it, unless something registered first.
- The host path negotiates HTTP/2 on Node 26.13 and HTTP/1.1 on 22.23.4 (measured over TLS). The CLI
  sets `allowH2: false`. The host does not.

**Load order decides the owner.** An ESM `import ... from "node:http"`, or reading `globalThis.Headers`,
makes Node's internal undici register the dispatcher. `require("node:http")` does not. A probe that
imports `node:http` before the SDK therefore measures a different program. Replay the real module order
with the server in another process: `host-order-probe.mjs` and `sse-server.mjs` in the artifacts.

## Verdicts

| Advisory | Severity | Live CLI | Task-session host |
|---|---|---|---|
| GHSA-xjj6-f33q-929c, `fetch` crash on excess codings | High | reachable, unproven | not executed: `fetch` is Node's, a fixed version |
| GHSA-qrxm-fqhp-jwvm, TLS 1.2 renegotiation crash | High | reachable, unproven | reachable, unproven; peer is chatgpt.com only; ends custody |
| GHSA-2m5v-pch6-74hx, dropped `tls` callback | High | no path found | no path found |
| GHSA-4w7w-5xrc-9h26, redirect + cache interceptors | High | no path found | no path found |
| GHSA-9fm3-97px-rjf6, WebSocket PONG buffering | Medium | reachable: `transport` is `auto` | not reached: SSE forced |
| GHSA-4qv8-2p9j-2685, EventSource memory | Medium | no consumer found | no consumer found |
| GHSA-55wc-3pg8-jfw6, decompress interceptor | Medium | no consumer found | no consumer found |
| GHSA-f72v-6w45-q472, SRI token case | Medium | no consumer found | no consumer found |
| GHSA-g3hv-75wg-m249, minimatch globparts | Medium | no path found | no path found |

- **GHSA-xjj6:** `web/fetch/index.js:2264` creates the stream before the limit at `:2283`, which rejects
  without aborting. `withUndiciErrorListener` (`http-dispatcher.js:49`) guards the dispatcher, not that
  stream. The attacker must control a response from a peer Pi fetches. Those are LLM providers, about
  twelve sub-bar usage endpoints, and whatever extensions call.
- **GHSA-qrxm:** the assert is at `client-h1.js:964` and `client-h2.js:590,750`. The peer must speak
  TLS 1.2, renegotiate and present a second CA-trusted certificate, so a passive observer cannot do this.
- **Crash handling:** interactive mode's `uncaughtCrash` restores the terminal, then calls
  `process.exit(1)`. Print and RPC modes have no handler. The process ends either way.
- **Host custody:** `dist/task-session` has no process handler, so an uncaught transport error skips
  the `host-entry.ts` catch that retains custody, and the process dies with its inherited descriptor.
  Static reading, not exercised. Upstream also recorded undici 8 HTTP/2 races crashing the CLI, fixed by
  `allowH2: false` (`CHANGELOG.md:2173`); the host runs H2 without that or `withUndiciErrorListener`.
  Whether the race exists on these versions is unknown. Tracked in AK8149.
- **GHSA-2m5v:** needs a function-valued `tls` option. `http-dispatcher.js:73-84` passes `connect`, and
  `checkServerIdentity` has no hits in the closure outside undici.
- **GHSA-4w7w:** no `interceptors.*` use in `node_modules` outside undici.
- **minimatch:** the vulnerable phases need `optimizationLevel` 2 or higher (`index.js:332-336`). The
  default is 1 and the only callers (`model-resolver.js:233`, `package-manager.js:484-493`) pass none.
  Patterns come from local settings. **No override is proposed for the task-session lock**: 11.x is a major
  and was never tested against SDK 1.4.0. The rebuilt candidate does carry 11.0.3, as upstream's own pin.

The dep-redteam packets in `redteam/` cover the four Highs, as ruled: 2 `reachable_unproven`, 2 left at
`dependency_present_only`. The five Mediums have no reachability evidence recorded there, so all five stay
`dependency_present_only` even though GHSA-9fm3 is reachable on the CLI per the table above. No disclosure is
recommended, and every plan entry has `executionAllowed: false`. `design-xjj6.json` and `design-qrxm.json` are
non-executing local-lab designs. Running either needs separate approval.

## Override for the task-session lock

**Applied by AK7845** at `420f4ed2c`, which is on main; AK7845 completed on 2026-11-04. I confirmed the
override in that commit. The rest of this paragraph is that session's report: the real `update-lock.mjs` changed one lock
entry, a new `assertOverridesCurrent` refuses an override that an exact pin has passed, the README change
list and the `update-lock.mjs` comment are corrected, and the real end-to-end install passed 13/13.

```json
"overrides": { "undici": "8.12.3" }
```

The lock alone is not enough: the SDK exact-pins 8.10.2, so `npm ci` needs the manifest's `overrides`.

When the lock moves to SDK 1.5.0, which pins undici 8.12.3 exactly, the override becomes a no-op. Remove it
then. `assertOverridesCurrent` refuses only an override below an exact pin, so it will not flag the redundant
one.

The ruled version was 8.12.2, and 8.12.3 replaced it after a further ruling. The difference is not a security
change: `client-h2.js` gains a PING liveness probe, and `pool-base.js` keeps async context on queued
requests. It was preferred because the host runs HTTP/2 on Node 26 and it equals pi-mono main's pin. The
tarball's sha512 equals pi-mono's lock entry, a check independent of the registry.

### Proof

| Given | When | Then, as observed |
|---|---|---|
| The AK7845 lock as it stands | Offline grype on the installed tree | RED: 9 matches, undici 8.10.2 plus minimatch |
| The override, regenerated as `update-lock.mjs` does | Diff against `runtime.lock` | 1 of 121 entries changes, for 8.12.2 and 8.12.3 |
| That lock | Install offline under `unshare -rn` | 120 packages, `npm ls` shows `overridden` |
| That install | AK7845's `assertLayerOneLock` and `verifyInstalled` | Both pass |
| That install | Offline grype | GREEN: 1 match, minimatch only |
| Host module order, both Nodes | Real `streamSimple` against a local SSE fixture | 8/8 on 8.12.2, 4/4 on 8.12.3, 1 npm dispatch each |
| Host and CLI paths, TLS 1.3, H2 and H1 servers, one CONNECT tunnel | Real `streamSimple` | 17/17 on 8.10.2 and 8.12.2, 9/9 on 8.12.3 |
| CLI dispatcher path, both Nodes | SSE, gzip SSE, WebSocket with a PING | Identical on 8.10.2 and 8.12.2 |
| Stand-in own tarballs, independent inspector | AK7845's real `installClosure`, offline | Override survives both npm steps; without it, `ENOTCACHED` |

Toolchain: Node 22.23.4, npm 12.0.2. No provider or paid call.

## Why a clean scan proves nothing for the CLI

Run on an override install, where grype reports no undici advisory:

| Entry | undici files loaded | Vulnerable asserts in loaded code |
|---|---|---|
| `dist/bundle/cli.js`, the package `bin` | 0 | **3**, in the bundle chunk |
| `dist/cli.js`, unbundled | 110, version 8.12.2 | 0 |

So the ruling's RED/GREEN by grype cannot judge the CLI. The AK6971 adoption doc warns of the same trap:
"a version/loader-only smoke cannot establish adoption". Judge a CLI candidate by what it loads. "0
asserts" evidences GHSA-qrxm only; the other fixes were checked by reading the 8.10.2 and 8.12.2 source.

## Upstream 1.5.0, published after this write-up

`@earendil-works/pi-coding-agent` 1.5.0 is the npm `latest` tag since 2026-11-02T11:05Z. Release commit
`f9a263655` contains both fix commits, and its changelog lists the undici security update and the glob fix.
Checked offline on 2026-11-04, from the published tarball in the local npm cache, integrity matching its
index entry:

| Check | Result |
|---|---|
| Pins | undici 8.12.3, minimatch 11.0.3; `bin` still `dist/bundle/cli.js` |
| Vulnerable asserts in the bundle chunk | 0 |
| 8.12.3's unique H2 probe string | present |
| External undici imports | none |

This is now the recommended path for the live CLI: adopt 1.5.0 through the AK7963 route. It needs no
catalogue generation and no local qualification of unreleased commits. The blockers under "Before any PATH
switch" below still apply to it, except the reinstall from `install-lock`, which concerns only the local
rebuild. The rebuilt candidate below is superseded and kept only as evidence.

## Live CLI: the rebuilt candidate

The operator chose a local rebuild from `contrib/pi-mono` main (19717). Other routes stay open: the next
upstream release through AK7963 fixes the bundle with upstream's own build, and an unbundled launch with the
override needs a PATH-level change, because ASC's `spawn("pi")` otherwise keeps subagents on the bundle.

| Item | Value |
|---|---|
| Source | `c9f4c7b9f`, 297 commits past release `4a080252f`, reporting version 1.4.0 |
| Install | `/data/agnt/worktrees/ak8113-790a2a89.scratch/pi-consumer` |
| Private clone | `/data/agnt/worktrees/ak8113-pimono-790a2a89`; nothing written to `contrib/pi-mono` |
| Artifact manifest sha256 | `9044e8637cae8a4373448712115a9adb966313e2cc59b7ddba85cc58d53ad283` |
| Bundle tree sha256 | `b8241c0b47568b63b2fbb4d248a980013da303f7bb4596a4d77bf57e7e774ae9` |
| Network | npm registry; one `generate:models` run against the five ruled catalogue hosts, keys scrubbed |

**What is fixed.** The bundle carries undici 8.12.3 and minimatch 11.0.3. Its executed chunk has 0 vulnerable
asserts and holds 8.12.3's unique H2 probe string. The `bin` is unchanged.

**What is not.** Vulnerable undici 8.10.2 stays loaded. 32 fleet packages link their SDK to the 1.1.0 prefix,
and native `.js` such as `TriggerEditor.js:10` imports it at runtime. Measured with the whole fleet through
one real turn and a self-fetch, DNS-masked: the dispatcher is the bundle's `EnvHttpProxyAgent2`, `fetch` and
`WebSocket` are not stock, and stock undici handled 0 dispatches. It is dormant on those paths, not gone.

| Given | When | Then, as observed |
|---|---|---|
| Whole fleet in a read-only sandbox, DNS-masked | Load it | 90 tools, 172 commands, identical on stock 1.1.0, stock 1.4.0 and the candidate |
| A deliberately broken extension | Load it | Exit 1, names the extension, so the smoke can fail |
| Whole fleet | One real turn against a local fixture | Fixture answer, empty stderr, same as stock 1.4.0 |
| Private clone, real UID, DNS not masked | `npm run check`, `test.sh` | Check exit 0. Tests fail only on one OpenRouter test and 6 `packages/env` daemon suites |
| Session written by the candidate | Continue it on stock 1.1.0, independent inspector | Works; session format and migrations unchanged |

### Before any PATH switch

1. Decide the fleet's 1.1.0 links and the task-session SDK pin. Relinking trips that pin, and the 1.4.0
   prefix holds undici 8.10.2 too.
2. Reinstall the candidate from `install-lock`: its third-party tree differs from upstream's in 38 paths,
   though in a fleet run only the bundle and jiti opened from the consumer.
3. Exercise what one turn does not: idle custom turns with an ontology grant (`a447ba11f`, handled by
   AK7963's `68f4ded66`, now on main), `task_session`, MCP, RPC, a real TUI, real keybindings and themes.
4. Operator decides on `pi.dev/api/report-install`, which stock also sends, and the new conditional
   `openrouter.ai` `models/user` call carrying the user's key.
5. Snapshot `settings.json`, `models-store.json` and `mcp-auth.json`, keep 1.1.0 installed, and keep a commit
   receipt: `--version` cannot tell this build from stock 1.4.0.

Rollback residue, from source reading: `lastChangelogVersion` stays 1.4.0, and MCP `auto` sign-ins store
tokens without a client, so 1.1.0 likely needs a new login. The model data is git-ignored and generated live,
so the build is not reproducible from the commit alone. Record the data manifest hash next time.

## Upstream

Main fixed both after 1.4.0, and the 1.5.0 release then met the only ask, so the report is moot. Pi's
`SECURITY.md` says not to open public issues for security reports, so `bin/it write issue` was never the
vehicle. The tracker row is abandoned, and the never-sent draft is kept at
`/data/agnt/worktrees/ak8113-790a2a89.artifacts/upstream-draft/`.

This write-up itself was pushed to GitHub on 2026-11-03 (evidence 20184), a day after the fix was public, so
it disclosed nothing still under embargo. A security write-up in a pushable repo is a publication: judge it as
one before committing.

## Corrections kept on record

- **Overturned:** "the host on Node 26 does not execute npm undici". True only for my probes, which
  imported `node:http` first. The real host order gives npm undici on both Nodes (19664). The `host` rows of
  `codex/matrix.jsonl` on Node 26 are perturbed; `codex/host-clean.jsonl` replaces them.
- **Overturned:** "Pi has no crash handler". The first search missed `prependListener`.
- **Overturned:** "0 external undici" for the candidate. That held only without the fleet (19818).
- **Overturned:** "no network". DNS escaped through the systemd-resolved socket, and the test runs looked up
  OpenRouter outside the once-only generator ruling. TCP and UDP stayed blocked (`ENETUNREACH`). AK8182.
- **Overturned:** `qualify.log`'s `exit=0`. My echo expanded `$(date)` before `$?`. Its seven other failures
  were my harness: UID 0 under `unshare -r`, and a scratch path over the socket length limit.
- **Refused:** forging a model data manifest to avoid the catalogue fetch.
- **Stale in the handoff:** AK7845's custodian. 19581 moved it to `claude-session-fca9119e`.
- **Boundary breach:** one `git fetch --dry-run` in `contrib/pi-mono` reached github.com, outside the
  rulings. It changed nothing and nothing here relies on it.
- **Probe gaps found by inspection:** `pi-ai/compat` loads first in the real host, and my order probe
  omitted it (same result once added). All my fixtures were plaintext (TLS rows added).

## Not proven

- Exploitability of anything, in either direction.
- The renegotiation path, which no fixture exercises, and a real provider response.
- HTTP proxy paths beyond one CONNECT tunnel: no proxy is configured here.
- The 1.1.0 live CLI's behaviour: the proof rows ran 1.4.0. For 1.1.0 the evidence is static.
- The `packages/env` daemon suites: the crates are not cached, and crates.io is outside every ruling.
- Dormancy beyond the measured paths. An extension that builds its own undici client would use 8.10.2.
- Third-party extensions other than `pi-sub-maintained` were not read for `fetch`, `tls` or interceptors.
