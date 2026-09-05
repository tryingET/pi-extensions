---
summary: "Exact-revision design review and finding dispositions for visible task-session packets 84/85 under AK task 5434; not an RFC outcome or runtime acceptance."
read_when:
  - "Checking design-stage review, unresolved decision inputs or the next lawful launch-contract transition."
type: "review_memo"
task_id: 5434
status: "design_review_pass_with_decision_input_blockers"
---

# Visible task-session launch — design review

## Scope and authority

This review inventory supports [discovery](2026-09-05-visible-task-session-discovery.md) / [design](2026-09-05-visible-task-session-design.md), registered as AK packets **84 / 85**. Task **5434** owns design-only work. No architecture decision has been opened for this concern; no `ready_for_adr`, implementation approval or activation is asserted.

Independent reviewer: `session-01a072c3-c49a-701d-9b25-1b5fd81693d6`, peer run `scoutpeer-mtop7ifi-8185bdcc`. Original communication ID: `4fc6cbfa-9e91-453b-9b9d-42b845d0dc6b`. Communication transports review observations, not owner authority. The initial ASC dispatch failed before bootstrap with `extension_bootstrap_missing`, `confirmed_no_effects`; no retry of that failed dispatch was made. A standard visible read-only reviewer supplied the assessment instead. This reviewer is not a canary of the proposed launch feature.

## Exact candidate revisions

| Candidate | Discovery SHA-256 | Design SHA-256 |
|---|---|---|
| Initial independent review | `e22c2e4e555141d3b8f7cb53a07531053a3938df21091df5076a80fbab0376cd` | `79aef87972e4117e56f6c82ed9f9beea5edd56b8e50a3a1a1eb146f570c9af9b` |
| Revised, structurally checked | `57e5dafe9b008425662dc6ef77eddefa1229b9ee47fda8f076507cbbae699125` | `82029ff772f54386c915d84d5691ac59baa4f28338f56f2bd0f2327ea6a79baa` |

The review file is not hashed inside either candidate; this avoids a circular candidate/review identity. The first candidate's source hashes remain historical review anchors; its exact finding text is summarized below with concrete counterexamples. Changes require fresh source-hash comparison, not silently reusing a previous verdict.

## First independent verdict

- Structural trace: **pass at document-row level**. Needs/capabilities connect to R1–R8, architecture, BDD and separate verification/validation.
- Semantic adequacy: **targeted revision required**, not an unqualified design exit.
- Evidence sufficiency: enough for a reviewable design with explicit uncertainties; not runtime or owner acceptance.
- RFC-ready for executable tasks: **no**. Implementation-ready: **no**.

## Finding inventory and dispositions

All four material findings came from the initial exact-hash review. Parent dispositions below were independently confirmed at the revised-candidate design-contract stage; they do not prove code behavior.

| ID / severity | Counterexample and violated claim | Revised disposition / dependent claims |
|---|---|---|
| VTS-SC-01 / high | CLI and Pi tool use different profile/state roots or race a check-then-create, admitting the same task twice. Per-request lock cannot enforce task-level exclusion. | Design now requires one stable owner-configured host namespace, independent of profiles/harnesses/package versions/caller overrides; canonical task/workspace key lock linearizes recheck and durable reservation before spawn. Namespace is operational exclusion, not permission. B7/V5 now include independent-process/profile/alias and check-create race cases. R5 affected. |
| VTS-SC-02 / high | Old generation A worker survives lost response; new generation B passes same-generation exclusion after lease rollover and overlaps A. | Unresolved exclusion spans generations until owner-proved quiescence/fencing or explicit bounded safe overlap. Lease age/reassignment/window disappearance does not release it. B8/V5 include delayed A after B attempts admission. R4/R5 affected; G1 still requires an actual owner contract. |
| VTS-SC-03 / medium | Absent/filtered skill and missing CLI cannot explain their own absence to a cold-context second harness. | Named independent harness/installer intended-versus-loaded capability preflight and explicit adoption contract. If all discovery carriers are absent, claim only capability unknown. B10/V1 require cold-context negative cases without expected-command hints. R1/R7 affected; no fallback shell recipe. |
| VTS-SC-04 / medium | Sequencing required ADR closure before resolving G1/G2, although they block RFC/ADR readiness. | Separate pre-decision bounded analysis and exact decision authorization from post-ADR implementation/rollout. G1/G2 resolution no longer depends on accepted ADR. Lifecycle ordering affected. |
| VTS-P-01 / structural | Initial reference checker resolved repo-relative inline paths from the document directory and treated the proposed skill file as already existing. | Converted source references to resolvable links and put proposed file layout in a labelled fenced block. Added bounded source-seam discovery. Revised candidate passes 22-reference check. No semantic-runtime claim follows. |

G1 remains an explicit decision-input blocker: exact claimant/delegation identity and a deterministic pre-model, pre-prompt child hook are not established. The revised ordering rejects an LLM bootstrap prompt followed by a queued task prompt. Startup-extension effect bounds, denied-transfer proof and owner acceptance remain required.

G2 remains explicit: source inspection found `launchPiQuestSession` depends on a small Pi API seam while `launchDetachedGhosttyWindow` uses Node APIs; neither proves an exported CLI artifact. Package export/import and observer compatibility evidence must precede final RFC allocation. G3 migration remains lane-owner work; no live capability claim or cross-repo edit is made here.

## Observed verification

### Independent revised-candidate verdict

The same independent reviewer re-read the complete revised discovery/design and this inventory, rehashed the source candidates, and confirmed **VTS-SC-01 through VTS-SC-04 addressed at design-contract stage** with no new material design-stage finding. Structural trace: pass. Semantic design-stage adequacy **with explicit blockers**: pass. Evidence: sufficient for the bounded documentary/design handoff only. Executable-task RFC-ready, implementation-ready and ready-for-ADR: **no**; G1/G2 remain unresolved and G3 gates migration. The review response corrected an initial duplicated-fragment transcription of the discovery hash; the corrected exact hash matches the independently checked revised candidate recorded above.

The reviewer independently corroborated the source seams and manifest limits. Parent docs/ref/AK checks remain attributed parent evidence, not independently rerun checks. This closes the four review findings as design dispositions, not owner acceptance of a runtime contract.

2026-09-05, parent session `session-01a0728e-b862-7544-a5bd-f198b710f81d`:

| Check | Observed result / limit |
|---|---|
| Canonical `docs-ref-check.mjs` against two revised source docs | **pass**, 22 references, no issues; untracked target allowance explicit because these are newly authored docs, not claimed committed artifacts |
| Canonical `docs-list.mjs --from-prompt <exact two-file allowlist> --strict` | **pass**, two docs; temporary allowlist uses the owner's supported backtick-path syntax |
| `git diff --check` and explicit trailing-whitespace check on new docs | **pass**; diff alone cannot validate untracked content |
| `ak packet check --repo . -F json` via approved gate | **pass**, four packets, 37 links, one relation at check time |
| `ak direction check --repo . --machine` via approved gate | **pass**, 23 nodes and existing task/decision links; no repointing |
| Repo-wide docs strict | **not clean**: unrelated `2026-08-24-pi-0.84.x-adoption-rfc.md` has missing frontmatter/read_when; not edited under this task |
| Repo review-lineage inventory | **fail**: pre-existing missing GDC lineage packet and four historical review-set source files; no decision-closure claim permitted from this projection |
| Proposed feature runtime, package install, live task launch, discovery A/B or owner task transfer | **not executed**; design-stage evidence only |

Additional inspected source hashes: sidequestLaunch.ts `42ddd7abd8dbcee9598c7abacfb87a62eea91b5c68861438226797e0e0de24a3`; sidequestDetachedWindow.ts `a2cda460058d730af898d01028669206a960b94570f841778e997306303ef00d`. No package source was changed by this task.

## Next lawful action

The independent exact-hash check is complete. Preserve packet85 as draft/decision-required while G1/G2 remain missing, record task/packet evidence, and route the exact decision authorization rather than continuing unrelated SF7/IW8/task4165 or treating this document as an applied transition. Any subsequent RFC review must use the existing AK decision/passport/convergence contract; this design review is not a substitute.
