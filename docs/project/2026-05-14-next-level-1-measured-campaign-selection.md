---
summary: "Selection packet for the next real non-meta level-1 measured campaign adoption wave after decision #42."
read_when:
  - "You need the selected next campaign after level-1 campaign substrate graduation."
  - "You are about to claim the next SF5/IW3 execution task."
  - "You are deciding whether toolbox rollback or root release-control work should be the next measured campaign."
type: "selection-packet"
system4d:
  container: "Repo-scoped selection packet for SF5/IW3 measured campaign adoption."
  compass: "Pick a real owner wave that uses the campaign substrate without reopening proof-era dogfood or authorizing level-2 automation."
  engine: "Review active direction and pending tasks -> compare candidates -> select next level-1 wave -> seed bounded AK task."
  fog:
    risks:
      - "Selecting a deferred task whose trigger has not fired."
      - "Treating campaign machinery itself as the implementation target again."
      - "Picking a wave too broad to measure with a clear blocker metric."
---

# Next level-1 measured campaign selection

## Context

Decision `#42` accepted level-1 campaign automation graduation:

```text
Default-use measured campaign substrate: yes.
Checkpointed command-packet automation: yes.
Hidden execution / promotion automation: no.
```

Active direction is `SF5/IW3`: adopt the measured campaign substrate for real implementation waves and normalize playbooks/automation gates.

## Selection criteria

The next wave should:

1. be real product/root work, not another proof of the campaign machinery;
2. have multiple plausible hypotheses or candidate lanes;
3. have a blocker metric with target `0`;
4. fit level-1 rules: plan/checkpoint/review only, explicit execution and owner mutation;
5. align with existing repo direction;
6. avoid claiming work whose AK deferral trigger has not fired.

## Candidates considered

| Candidate | Fit | Decision |
|---|---|---|
| Root compatibility/release control-plane campaign | Strong. Aligns with next root direction `SG2`; has real owner value; can measure release/canary drift and package-seam truth without requiring level-2 automation. | **Select** |
| Toolbox lazy bundle rollback contract (`task:2184`) | Important, but actively deferred until host unregister/sandbox API or owner-bundle side-effect-free contract is approved. Current dirty toolbox files may be related, but the deferral trigger is not clearly satisfied by decision `#42`. | Do not select now. |
| More autoresearch/orchestrator proof polish | Easy but low leverage; risks repeating proof-era work. | Reject. |
| Arbitrary package feature wave | Could work later, but less aligned with active root next direction than release/control-plane truth. | Defer. |

## Selected campaign

**Run a level-1 measured campaign for root compatibility/release control-plane truth.**

Working title:

```text
Root compatibility/release control-plane measured campaign
```

Campaign objective:

```text
Make root release, compatibility, and package-seam validation posture truthful enough that package changes can be evaluated without stale canaries, release-component drift, or root/package ownership confusion.
```

Primary campaign-control metric:

```text
root_release_control_plane_blockers  (lower is better, target 0)
```

Example blocker classes:

- release component map drift;
- package manifest / release metadata mismatch;
- package quality-gate coverage gap;
- Pi host compatibility canary gap;
- docs/playbook mismatch after decision #42;
- root/package owner-boundary ambiguity.

## Initial matrix sketch

| Cell | Scenario | Hypothesis family | Candidate posture |
|---|---|---|---|
| `cell-01-01` | Release component truth | A small deterministic release-component audit/check can expose stale package seams better than relying on manual manifest review. | Candidate lanes may compare doc-only guidance vs deterministic script/test improvement. |
| `cell-02-01` | Package quality-gate drift | A root-level gate summary can distinguish package-local failures from root control-plane failures and reduce operator confusion. | Candidate lanes may compare summary UX vs stricter test enforcement. |
| `cell-03-01` | Pi host compatibility canary coverage | Compatibility canaries should cover campaign substrate entrypoints without turning package-local runtime artifacts into release authority. | Candidate lanes may compare canary expansion vs documentation/selection guidance. |

## Level-1 boundaries

Authorized for the selected wave:

- plan matrix/candidate waves;
- launch visible candidate lanes only when explicitly approved;
- measure through `pi-autoresearch` receipts and candidate-result packets;
- fan in with orchestrator review;
- record AK evidence only after owner review.

Not authorized:

- hidden peer launch;
- hidden benchmark/export/review;
- direct release publication;
- package source mutation outside the task scope;
- automatic AK/KES/Oracle/Prompt Vault/ROCS writes;
- promotion, merge, or worktree cleanup automation.

## Seeded task

Seed the selected wave as the next active `IW3` execution task:

```text
Run root compatibility/release control-plane level-1 measured campaign
```

The task should start by writing or materializing a campaign plan under `.autoresearch/campaigns/root-compatibility-release-control-plane/`, then use level-1 measured campaign flow before any source mutation is accepted.
