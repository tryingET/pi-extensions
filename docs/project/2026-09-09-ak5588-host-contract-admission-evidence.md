---
summary: "AK5588 scoped development-contract repair: red/green admission, root baseline reconciliation, and bounded real-host proof."
read_when:
  - "Verifying AK5588 changes or preparing their separately authorized preservation and landing."
type: "reference"
---

# AK5588 — development host-contract admission

## Authority and scope

AK5588 is the separate operator-authorized development-contract repair; AK5582
remains completed. AK task scope/contracts/evidence own execution and completion
state. This document records observations, not landing or policy authority.

Execution checkout: `/home/tryinget/ai-society/softwareco/owned/pi-extensions`,
branch `feat/activity-ribbon-agent-tabs`, HEAD
`8a54eab73ea8d8e445e892d00ec9dc15b9e1e1b4`.
No staging, commits, branch switch, push, global Pi install/configuration change,
or controller reload occurred. Source/runtime implementation of the TypeScript
extension is unchanged. Shared-checkout preservation outside this exact task
slice is **not proven** by these tests; no cleanup/restoration was performed to
hide validation effects. Preservation/landing remains maintenance-owner work.

The package was untracked here but its pre-change files matched committed package
`a785b9935764c0ea30337ef63b3d7d6a633a6da7` on local main. Its original lock blob is
`6ba985718e8df882ddde6b397a2993aa01b6a58c`. Thus this was a committed contract
conflict, not merely an untracked-package discovery defect. Root policy stayed
at **0.84.3**; package declarations, development metadata and npm-generated lock
were reconciled from **0.84.4** to that baseline.

AGENTS edit preflight read the specified resource loader and prompt renderer.
Observed source included `AGENTS.override.md` before the usual candidates,
cwd-bound ancestry/shadowing, and `project_instructions` rendering. No applicable
override existed; no ancestor guidance was edited. Package AGENTS/README and the
root gate-order regression file were added to AK scope before their edits.

## Implemented behavior

- Existing checker now offers explicit package scope, JSON reconciliation, immutable
  index admission and complete tracked-package revision checks, without repair effects.
- Index admission reads captured blob identities and policy from the same index;
  root-policy changes expand to the indexed fleet. Unrelated untracked/unstaged
  packages cannot conceal staged drift or contaminate this scoped result.
- Complete removals require zero residual indexed entries; moved destinations,
  including repository root, are checked. Orphaned manifests, selected lock-only
  deletion, unmerged entries and symlink metadata fail closed. Empty fleets do not pass.
- Policy schema/lexical validation is separated from runtime canonical-directory
  validation. Missing unrelated execution directories do not block package admission;
  runtime canary containment and identity checks are retained.
- Package gates check explicit working-tree scope before package work; root staged
  smoke checks index scope; full validation retains an early whole-workspace check.
- Generated `devTestFloor` and existing lock root specifiers must agree with the
  authoritative development baseline. Package development validator/tests load the
  root policy instead of independently choosing a literal installed-host floor.

See [the canary contract](pi-host-compatibility-canary.md) for commands and bounds.
No automatic fleet alignment/promotion framework, template-repository mutation,
peer-range relaxation, or uniform runtime-generation policy was added.

## Observed red → green

| Slice | Red observation | Green observation |
|---|---|---|
| Checker scopes/index/revision | 17 failures in initial 22-test run | 26 focused cases passed after added edge cases |
| Package/root admission wiring | Local gates accepted conflicting pins; staged smoke accepted bad index hidden by good worktree | Admission/gate regressions passed |
| Package baseline | Root-consuming host test: `0.84.4 !== 0.84.3` | 42 package tests passed after lock regeneration/install |
| Reviewer isolation/retirement | 8 failures across 11 new cases | All 11 passed; additional moved-destination red also repaired |
| Root-destination move | 3 failures across 10 retirement cases | All 10 passed, including orphaned root-manifest deletion |
| Full-gate ordering fixtures | Two tests still assumed links/ROCS were the first Node call | Both assert host admission first, then links/ROCS |

Final combined focused command passed **61/61**:

```bash
node --test \
  scripts/pi-host-compatibility-canary/check-dev-pin-drift.test.mjs \
  scripts/pi-host-compatibility-canary/check-dev-pin-drift-scoped.test.mjs \
  scripts/pi-host-compatibility-canary/check-dev-pin-drift-snapshot.test.mjs \
  scripts/pi-host-compatibility-canary/check-dev-pin-drift-retirement.test.mjs \
  scripts/pi-host-compatibility-canary/manifest-definition.test.mjs \
  scripts/package-quality-gate.test.mjs \
  scripts/pi-host-contract-admission.test.mjs \
  scripts/validate-local-package-links.test.mjs
```

Independent reviewer `dispatch-1788930577947` first requested repairs, then
**accepted the scoped repair**, independently passing 31 final snapshot,
retirement and schema/isolation tests. This is not landing approval or a gate waiver.

## Package and actual-host verification

Package operations were limited to the authorized TypeScript package:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run check
```

Final package gate passed structure, budgets, lint, typecheck, **42 tests**,
18-file tarball allowlist and **9 provider-free artifact checks**. No resolved
lock entries were hand-edited. The package gate itself explicitly makes no live
Pi claim; the separate probe below supplies bounded actual-host evidence.

Tester `dispatch-1788931336236` used a fresh process and actual package-local Pi
**0.84.3 AgentSession**, loading only the real TypeScript extension. Registration
and tool execution were not mocked. The provider/model was **simulated**: no real
provider transport or credential availability was tested; zero network attempts.

Nine host-observed start/result pairs passed: list+marker read; typed wrapper 42;
decorator result; rejected `fs.write`; missing code; NUL path; pending-promise
abort; post-abort recovery; and numeric-code coercion (intentional host behavior).
Call IDs/order, stored tool results, idle recovery, no write and unchanged fixture
hashes were asserted. There were 17 simulated-provider calls and zero retries.

Actual loaded identities: coding-agent **0.84.3**, direct pi-ai **0.84.3**,
pi-agent-core **0.84.4**, pi-tui **0.84.4**, core's nested pi-ai **0.84.4**,
TypeScript **6.0.3**, typebox **1.3.7**, Node **26.8.1**. This proves the supplied
0.84.3 host installation, **not an entirely 0.84.3 dependency stack**, Node 22,
real-model transport, global autodiscovery, or controller reload. Runtime risks
and trusted-code/no-sandbox limitations remain unchanged.

## Aggregate gate disposition

- Workspace reconciliation: **pass**, 39 packages, 319 checks, zero offenders.
- Explicit TypeScript-package reconciliation: **pass**.
- Actual index: **skip**, empty index; not staged implementation or fleet proof.
- `git diff --check`: **pass** after removing an introduced trailing blank line.
- Explicit package-doc directory strict metadata check: **pass**. Whole-root docs
  strict metadata scan: **fail**, five pre-existing files lacking frontmatter:
  `docs/npm-publication-recovery.md`, `docs/release-recovery.md`,
  `docs/release-verification.md`, `docs/v1-proof/admission.md`, and
  `docs/project/2026-08-24-pi-0.84.x-adoption-rfc.md`. Their HEAD contents already
  lack it; no unrelated docs were edited. Initial package docs discovery defaulted
  to the monorepo; the explicit absolute package docs directory removed that
  ambiguity. Scratch prompt-allowlist attempts did not resolve references and are
  not claimed as a scoped pass.
- `npm run quality:pre-commit`: exit 0 with no staged packages; therefore not
  evidence that these unstaged changes passed staged package fan-out.
- `PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run quality:pre-push`: **exit 1** twice.
  First run exposed the two in-scope gate-order fixtures, now repaired. Second
  run passed original drift, 14 canary and 20 crash-recovery tests, and revised
  ordering tests; it then stopped at `scripts/root-doc-alignment.test.mjs:132`:
  engineering-review snapshot records 38 packages while live audit reports 39.
  Later aggregate package stages were not reached. No failed gate was waived.

These full-gate runs occurred in the **canonical dirty/shared checkout**, not an
independent disposable clone: they are diagnostic execution, not isolated landing
proof. Explicit environment addition was `PI_EXTENSIONS_TMPDIR` pointing to managed
TMPDIR; no `PI_SKIP_*`, host-candidate, generation-test or file-budget override was
set. On maintenance coordination about shared-checkout full-CI holds, further
broad reruns stopped. The separate owner took the doc-only mismatch as **AK5595**;
this task did not edit `engineering-review-surfaces.md`. The maintenance owner
subsequently reported its doc-only repair and 4/4 focused passes under evidence
8641; this task has not rerun the full gate after that owner change.

Read-only `--revision main` also correctly rejected seven authored offenders in
tree `57df600e25eaf40a073e01dc980395a1005b56b3`: four little-helpers pins and the
TypeScript package's two pins plus development metadata. These main-tree facts
are not fixed by an unstaged workspace pass. Excluded helpers and main landing
remain outside AK5588 authority.

## Evidence locations and remaining boundaries

Managed scratch root during execution:
`/home/tryinget/.local/state/pi-quests/tmp`.

- `ak5588-root-final.log`: 61 focused passes.
- `ak5588-package-red.log`, `ak5588-package-final.log`: baseline red and final package gate.
- `ak5588-admission-red.log`, `ak5588-root-move-red.log`: parent regressions.
- `ak5588-checker-evidence-i3X3Ah/`: initial checker red/green.
- `ak5588-review-repair-EcbFrp/`: isolation/retirement red/green.
- `ak5588-host0843-3xB99d/`: probe commands, summary, events, identities, assertions,
  SHA-256 receipts; initial harness-only mistakes retained, final assertions passed.
- `ak5588-prepush.log`, `ak5588-prepush-2.log`: actual failed aggregate runs.
- `ak5588-{workspace,package,index,main}-report.json`: explicit source/scope reports.

This document preserves bounded findings if scratch expires; scratch is not AK
state. Passing authored checks do not cover undeclared direct lock copies,
prove candidate upgrades, authenticate a uniform transitive runtime, or authorize
activation/publication. Full repository completion remains separate from this
validated, reviewed development-contract repair.
