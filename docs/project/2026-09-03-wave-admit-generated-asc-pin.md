---
summary: "Stateless execution brief: wave-level npm-publish admission and generate the governed ASC pin from the lock."
read_when:
  - "Executing the follow-up to the 2026-09-02/03 publication-gap close (#5175)."
  - "A fresh session is told to do the wave-admit / generated-ASC-pin task."
---

# Wave admit + generated ASC pin

## Do not confuse with #5178

**#5178 is done.** It hardened *Pi host contract* drift coverage (`0.84.3` pins). Do not reopen it.

This brief is AK **#5340**. Fresh session: `Do #5340. Read docs/project/2026-09-03-wave-admit-generated-asc-pin.md. Follow the done contract. Validate correctness.`

**#5174** (RP PR-creation permission debt) is paperwork. RP already opened #191–#196. Close #5174 only with evidence of successful PR creation; do not change `default_workflow_permissions` away from `read`.

**#5175** is done (manifest matched npm 32/32 as of orchestrator `0.11.4`). Do not replay historic tag backfills.

## Why this exists

The 5175 close was correct and still felt unautomated because **prove** (per-package quality + exact tarball) was fused with **admit** (human `npm-publish` environment) and the ASC identity was copied in four places (`package.json` selector, lock `resolved`/`integrity`, `GOVERNED_RUNTIME_ASC_REGISTRY_OWNER`, tests). One pin migration became four release PRs.

## Operator vs agent

| Actor | Does |
|---|---|
| Operator | GitHub environment policy for **one admit per wave** (not per package). First-time npm **package name** creation if `npm view @scope/name` is 404. Merge the release-please PR when asked. |
| Agent | Code, tests, docs, generate-from-lock, hermetic publish checks, remove emergency `inputs.tag !=` quality-gate skips once those tags are historical. Never `npm trust` × N when `E409` already exists. |

Agent cannot flip GitHub environment required-reviewers without operator settings. Record the exact clicks/settings as evidence if the operator does them.

## Slices (order)

### A — Generate ASC owner from lock (mechanism)

Single identity: lock entry `node_modules/@tryinget/pi-autonomous-session-control` `{version, resolved, integrity}` plus `package.json` selector.

- `GOVERNED_RUNTIME_ASC_REGISTRY_OWNER` is **generated** or **asserted equal** to that lock + `npm view <name>@<version> dist` in CI (`validate-asc-bridge-lifecycle` and/or a small codegen).
- Tests compare to the lock, not a second hardcoded `0.5.2`.
- A lock bump **is** the pin bump. One `fix:` → one RP → one publish.

### B — Hermetic publish DoD

`npm run check` must pass on `ubuntu-latest` with empty `HOME`. Live-fleet / live-EC tests `t.skip` when fixtures are absent. No `publish.yml` clones of `$HOME/ai-society`. Agent-registry fixture pattern is the template.

### C — Current-only publication

Gap = `.release-please-manifest.json` version vs `npm view name@version`. Do not enqueue historic wave members (`v0.2.1`) after a newer version is on npm. Keep **in-wave** exact predecessor checks; **resume** may treat a later published version of the same name as satisfying a historic predecessor (already in `publish.yml` — do not revert without a better rule).

### D — Wave admit (policy, operator)

Document and, with operator, change GitHub environment `npm-publish` so one review admits a whole `releaseOrder`, or so the `release-please` dispatch is not N human waits. Keep OIDC Trusted Publishing. Do not set repo `default_workflow_permissions` to write.

### E — Remove emergency skips

Delete `inputs.tag != 'pi-agent-registry-v0.3.0'` and `pi-society-orchestrator-v0.11.1` quality-gate exceptions once those tags are not in the live publish path.

## Anti-goals

- Skip quality gates to “fill a hole.”
- 32-package `npm trust` loops (`E409` = already bound).
- Cloning operator skill libraries into Actions.
- Reopening #5178.
- Minting replacement waves to hide a partial wave (`docs/release-recovery.md`).

## Validate correctness (fresh session)

From repo root:

```sh
# 1) manifest vs npm (expect gap 0 for current HEAD manifest, or a listed current-only delta)
python3 - <<'PY'
import json, subprocess, os
m=json.load(open('.release-please-manifest.json'))
gap=[]
for path, ver in sorted(m.items()):
    pj=os.path.join(path,'package.json')
    if not os.path.isfile(pj):
        continue
    name=json.load(open(pj)).get('name','')
    if not str(name).startswith('@tryinget/'):
        continue
    r=subprocess.run(['npm','view',f'{name}@{ver}','version','--loglevel','error'],capture_output=True,text=True)
    if r.returncode!=0 or r.stdout.strip()!=ver:
        gap.append(f'{name}@{ver}')
print('gap', len(gap))
print('\n'.join(gap) or 'ok')
PY

# 2) package gates for touched packages
bash ./scripts/package-quality-gate.sh ci packages/pi-society-orchestrator
# plus any other package this slice edited

# 3) workflow contract tests
node --test ./scripts/release-components.test.mjs ./scripts/release-npm-workflow.test.mjs

# 4) ASC pin: constants/lock/npm dist agree
cd packages/pi-society-orchestrator && node scripts/validate-asc-bridge-lifecycle.mjs
```

Empty-HOME spot check for any package whose tests used to read `~/ai-society`:

```sh
HOME=$(mktemp -d) bash ./scripts/package-quality-gate.sh test packages/<pkg>
```

## Done when

- ASC owner identity has one source (lock) and CI fails if constants/tests disagree.
- Publish quality gate is hermetic for packages this task touches.
- Wave-admit operator path is documented with exact GitHub environment fields; implemented if the operator changed settings.
- Emergency tag skips removed or an evidence note says why a named tag still needs one.
- `ak task close-check` is clean for this task id.
