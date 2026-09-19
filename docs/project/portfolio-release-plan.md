---
summary: "Operator contract for propagation-complete candidates and immutable dependency-ordered portfolio release waves."
read_when:
  - "Reviewing a release PR, sequencing package publication, or recovering a partial release wave."
---

# Portfolio release plan and wave

## The control-plane constraint

Every package release belongs to one immutable, propagation-complete wave. Release Please creates one combined candidate using its `node-workspace` plugin; it does not create independent component PRs. The plugin follows only managed local dependency edges (`dependencies`, `devDependencies`, `optionalDependencies`, and `peerDependencies`) and does not use `updateAllPackages`, so unrelated packages are not bumped.

This constraint preserves independent component versions and changelogs while making a dependency-bearing candidate satisfiable: a changed dependency causes each transitive managed consumer to receive an intentional version advance in the same candidate. Release Please deliberately does not rewrite protocol ranges such as `file:`. The authoritative artifact builder therefore replaces managed runtime `file:` ranges with the dependency's exact wave version only in the transient `npm pack` input, restores the tagged manifest even on failure, and rejects any retained tarball that is not registry-resolvable. Local development links remain unchanged.

## Read-only planning

`node ./scripts/release-components.mjs plan` is the read-only authority for dependency discovery, propagation closure, and candidate readiness:

```sh
node ./scripts/release-components.mjs plan --base <git-ref> --json
node ./scripts/release-components.mjs plan --changed <component> --json
node ./scripts/release-components.mjs plan --all --json
```

Add `--registry` for read-only npm classification and `--require-ready` when blockers must fail. Release PR CI uses both; ordinary PRs validate the graph and tests but are not blocked for unchanged versions.

A selected component is blocked if its intended version is not ahead of the base Release Please manifest. Registry checks also reject an existing version, unavailable state, or unexpected owner. Root control-plane paths remain evidence only and never manufacture package releases.

## Immutable wave

After the combined candidate merges and Release Please creates all component releases, `scripts/release-wave.mjs` compares the exact base and source commits, reconstructs all advanced components, computes propagation closure, and requires `paths_released` to equal that closure. It emits `pi.portfolio-release-wave.v1`, binding:

- exact base and source commits;
- changed and propagation-required components;
- exact package paths, npm names, versions, and tags;
- dependency-first `releaseOrder`;
- a canonical plan digest;
- a wave identity digest over the complete payload.

Missing, extra, stale, reordered, or modified content fails verification. The wave is retained as a workflow artifact and copied into every component's durable release-evidence archive.

## Effect boundary and recovery

`publish.yml` has no GitHub Release event trigger. Publication is possible only by externally approved `workflow_dispatch` with the complete wave and matching identity. The release workflow consumes `releaseOrder`, dispatches one component at a time, and waits for success before dispatching its consumer. A component workflow also requires every wave tag to exist, every earlier wave component to have a successful same-wave exact-artifact run, and every transitive managed dependency (including dependencies outside the wave) to exist at its exact intended npm version before any package effect.

A failed component leaves already published npm versions immutable. Re-run that component with the same wave and a new unique dispatch identity; exact-artifact inspection makes an exact existing version a verified no-op and rejects mismatched bytes. A consumer additionally requires a successful same-wave publish run for every predecessor, not merely an npm version with the expected name. Continue later components only after the failed predecessor succeeds. Never generate a replacement wave merely to hide a partial wave.

The scripts do not grant approval to merge, push, tag, create a GitHub Release, publish to npm, configure OIDC, or change repository settings. Those remain repository-admin/release-operator effects.

### Little-helpers source-test prerequisites (AK5817)

Before the little-helpers package gate, the workflow runs `npm ci` in the tagged
`packages/pi-peer-messaging` directory. The self-evolution fixture imports this
sibling's source directly and starts a real broker. That broker launches its own
package-local `node_modules/tsx/dist/cli.mjs`; the optional npm peer installed under
little-helpers is a different copy and cannot supply that path. The generic
`file:` dependency installer does not traverse this versioned peer relationship.

Run 35454662918 failed the real-runtime assertion (`ownedRuntimes.length`, expected
1, observed 0) before publication. A fresh checkout with the verbatim workflow
install recipe reproduced it; installing only the sibling's locked dependencies
restored all nine self-evolution tests without changing source or assertions.
The prerequisite is helpers-only and precedes the existing tagged-source drift
check. Real runtime ownership, disconnect and broker-shutdown checks stay intact.
It repairs the current workflow's preparation for frozen tags; it does not alter
the tag, bypass the package gate, or authorize a publication retry.

After merge, an explicitly approved retry must retain the original tag and wave
identity. Publish dependents only after the helpers predecessor succeeds. This
source-test setup does not certify dependency completeness of an installed npm
peer-messaging artifact; that is a separate package release-contract concern.

### Post-publish npm visibility (AK5770)

Both tarball paths converge on one `Wait for exact npm publication` step, using
`release-tooling/scripts/release-npm-state.mjs wait` from the current main tooling
checkout, not frozen tag scripts. It succeeds immediately on `exact`, fails on
`mismatch` without retrying, and retries only `absent`. Authentication, transport,
invalid JSON and other inspection errors fail immediately rather than becoming
absence. It never republishes. Successful exact/no-op runs still reach durable
evidence retention; a failed wait still blocks consumers and evidence retention.

The wait starts with an immediate query and has a **600000 ms (10 minute)** monotonic
budget including npm requests and sleeps. Delays grow **10 → 20 → 30 seconds**, then
stay capped at 30 seconds; each sleep and npm process timeout is clipped to the
remaining budget. A timed-out npm process is killed, and a result arriving at or
after the deadline is not accepted. Deadline errors identify the package/version,
last observed state and attempt count. Progress goes to stderr; successful stdout
is the existing `pi.npm-publication-state.v1` exact classification. `inspect` and
its `--require` / env-file contract remain unchanged. CLI timing overrides
`--deadline-ms`, `--initial-delay-ms`, and `--max-delay-ms` accept positive integer
milliseconds (initial delay must not exceed the cap).

**Why this budget:** the 2026-09-19 wave `41a7d378` had seven npm publish successes
followed by six absent checks. The former shell loop actually slept five times,
not six: final negative log observations occurred about 52 seconds after npm's
publish acknowledgment. npm also explicitly warned that processing may take a few
minutes. Later same-wave recovery runs observed identical bytes without publishing:

| Failed run | Publish → final absent (s) | Recovery run | Publish → recovery exact (s) |
| --- | ---: | --- | ---: |
| 35431016650 | 51.950 | 35431244764 | 301.099 |
| 35432181446 | 52.231 | 35432418900 | 244.084 |
| 35432554494 | 51.707 | 35432685051 | 201.022 |
| 35432817309 | 52.229 | 35432960223 | 184.335 |
| 35433039342 | 52.377 | 35433292417 | 308.713 |
| 35433464421 | 52.288 | 35433576821 | 130.417 |
| 35433643968 | 51.970 | 35433751173 | 139.642 |

Source: `gh run view <run> --repo tryingET/pi-extensions --log` (2026-09-19).
Use the real publish `+ package@version` line, not the earlier dry-run line.
Negative observations are lower-bound proxies; recovery observations are coarse
upper bounds, **not first-visibility measurements**. The brief's claimed 8–69 s
post-job appearance was not established by these logs. Ten minutes exceeds every
sampled recovery bound with margin and remains well within the 60-minute job
limit; the 30-second cap limits registry traffic while retaining useful feedback.
This is a provisional operational budget, not a measured percentile or a guarantee.
The next true release-wave propagation case remains the live efficacy check.

## Wave admission

Human admit is one review of the combined release-please PR, not N `npm-publish` environment approvals. Keep the environment **name** `npm-publish` for npm OIDC Trusted Publishing. Empty **Required reviewers** on that environment so sequential `publish.yml` jobs do not each wait. Exact GitHub fields: `docs/project/2026-09-03-npm-publish-wave-admit.md`.
