---
summary: "KES learning candidate for Autoresearch learning: candidate-kes-learning-handoff-proof"
read_when:
  - "Reviewing a package-owned learning candidate before promotion."
kes_contract_version: 1
kes_kind: "learning_candidate"
kes_package: "pi-society-orchestrator"
system4d:
  container: "Package-local KES learning candidate."
  compass: "Bound promotion from raw capture into a durable candidate without inventing a second authority surface."
  engine: "Tie the claim to raw evidence -> state reusable heuristics -> capture follow-up and anti-patterns."
  fog: "The main risk is promoting pattern language without attributable package-local evidence."
---

# 2026-05-13 — KES Learning Candidate: Autoresearch learning: candidate-kes-learning-handoff-proof

## Status
- State: candidate-only
- Candidate kind: learning

## Source
- Package: pi-society-orchestrator
- Source diary: `diary/2026-05-13--validation-consume-autoresearch-learning-packet-aut--2.md`
- Source kind: manual
- Session: pi-autoresearch-candidate-kes-dogfood
- Objective: Owner-routed KES adapter proof for pi-autoresearch learning packets.

## Claim
# Autoresearch learning: candidate-kes-learning-handoff-proof

## Summary
- campaign: candidate-kes-learning-handoff-proof
- metric: candidate_acceptance_blockers (blockers, lower is better)
- runs: 2 total / 2 successful
- baseline: 1blockers
- best: 0blockers
- empirical decision: threshold_satisfied
- recommended action: verify or finalize the candidate through explicit review/evidence promotion

## Timing interpretation
(n/a)

## What was learned
- Current empirical meaning: threshold_satisfied.
- This packet is learning material, not canonical AK evidence or ontology truth.

## Candidate bindings
- candidate 1
  - candidate source: manual
  - candidate worktree: /tmp/pi-autoresearch-candidate-kes-yX4915
  - candidate branch: candidate/kes-learning-handoff
  - candidate base ref: 5bdc41bc46db7a673ad6aca7573babb072a533ca
  - candidate diff summary: diff --git a/metric.txt b/metric.txt
index d00491f..573541a 100644
--- a/metric.txt
+++ b/metric.txt
@@ -1 +1 @@
-1
+0
  - candidate files changed: metric.txt

## Receipt references
- receipt log: /tmp/pi-autoresearch-candidate-kes-yX4915/autoresearch.jsonl

## Evidence
- Consumed packet kind autoresearch.learning.v1 with adapter contract version 1.
- Campaign: candidate-kes-learning-handoff-proof.
- Empirical decision: threshold_satisfied.
- Promotion ready: true.
- Source packet sha256 (raw_file): 600d7dba5b2a5ae56195d8cbd6ced27eb07098a5fd8d2f04c5b5babd1dcdc79a.
- Source receipt sha256: 0c212bb59ce0af3aa96973fe061d19c1fb594e160721f0a91fbec65e4ddb7460 (2067 bytes, 3 lines).
- Source receipt tail preview: {"type":"config","version":1,"name":"candidate-kes-learning-handoff-proof","metricName":"candidate_acceptance_blockers","metricUnit":"blockers","direction":"lower","metricThreshold":0,"createdAt":1778683249444,"benchmarkCommand":"node benchmark.mjs","checksCommand":"node check.mjs"}
- Source receipt tail preview: {"type":"run","version":1,"status":"baseline","empiricalDecisionClass":"baseline","metric":1,"metrics":{"candidate_acceptance_blockers":1},"description":"Baseline before candidate changes; unresolved blocker remains.","timestamp":1778683249499,"iteration":1,"confidence":null,"durationSeconds":0.024,"exitCode":0,"timedOut":false,"benchmarkCommand":"node benchmark.mjs","checksCommand":"node check.mjs","checksPassed":true,"checksDurationSeconds":0.027}
- Source receipt tail preview: {"type":"run","version":1,"status":"candidate","experiment":{"hypothesisId":"candidate-kes-learning-handoff-001","hypothesis":"Changing the fixture blocker count from 1 to 0 should satisfy the explicit zero-blocker threshold.","interventionSummary":"metric.txt changed from 1 to 0 in an isolated temporary candidate branch.","expectedPrimaryEffect":"candidate_acceptance_blockers reaches 0 and satisfies the threshold.","targetFiles":["metric.txt"],"risk":"Synthetic fixture proves candidate closeout…[truncated]
- Source evidence warning: closeout receiptPath is under a temp directory and may disappear before review: /tmp/pi-autoresearch-candidate-kes-yX4915/autoresearch.jsonl

## Reusable Heuristics
- Keep autoresearch learning persistence outside pi-autoresearch; use owner-routed KES/notes surfaces for durable learning candidates.

## Anti-patterns to Avoid
- Do not turn autoresearch local packets into canonical learning authority by writing them directly from the experiment runtime.

## Follow-up
- verify or finalize the candidate through explicit review/evidence promotion
- Resolve or explicitly accept source-evidence warning before broader promotion: closeout receiptPath is under a temp directory and may disappear before review: /tmp/pi-autoresearch-candidate-kes-yX4915/autoresearch.jsonl

## Metadata
```json
{
  "kes_contract_version": 1,
  "package": "pi-society-orchestrator",
  "source": {
    "kind": "manual",
    "packageName": "pi-society-orchestrator",
    "sessionId": "pi-autoresearch-candidate-kes-dogfood",
    "objective": "Owner-routed KES adapter proof for pi-autoresearch learning packets."
  },
  "sourceDiary": "diary/2026-05-13--validation-consume-autoresearch-learning-packet-aut--2.md",
  "metadata": {
    "adapter_kind": "autoresearch.learning_kes_adapter.v1",
    "packet_kind": "autoresearch.learning.v1",
    "campaign": "candidate-kes-learning-handoff-proof",
    "suggested_path": "docs/learnings/candidate-kes-learning-handoff-proof-autoresearch-learning.md",
    "empirical_decision_class": "threshold_satisfied",
    "promotion_ready": true,
    "receipt_path": "/tmp/pi-autoresearch-candidate-kes-yX4915/autoresearch.jsonl",
    "source_evidence_warnings": [
      "closeout receiptPath is under a temp directory and may disappear before review: /tmp/pi-autoresearch-candidate-kes-yX4915/autoresearch.jsonl"
    ],
    "source_evidence_snapshot": {
      "packetSha256": "600d7dba5b2a5ae56195d8cbd6ced27eb07098a5fd8d2f04c5b5babd1dcdc79a",
      "packetHashKind": "raw_file",
      "packetPath": "/tmp/pi-autoresearch-candidate-kes-yX4915/.autoresearch/learning-candidate-kes-2026-05-13T14-40-49-422Z.json",
      "receiptPath": "/tmp/pi-autoresearch-candidate-kes-yX4915/autoresearch.jsonl",
      "receiptExists": true,
      "receiptSha256": "0c212bb59ce0af3aa96973fe061d19c1fb594e160721f0a91fbec65e4ddb7460",
      "receiptBytes": 2067,
      "receiptLineCount": 3,
      "receiptTailPreview": [
        "{\"type\":\"config\",\"version\":1,\"name\":\"candidate-kes-learning-handoff-proof\",\"metricName\":\"candidate_acceptance_blockers\",\"metricUnit\":\"blockers\",\"direction\":\"lower\",\"metricThreshold\":0,\"createdAt\":1778683249444,\"benchmarkCommand\":\"node benchmark.mjs\",\"checksCommand\":\"node check.mjs\"}",
        "{\"type\":\"run\",\"version\":1,\"status\":\"baseline\",\"empiricalDecisionClass\":\"baseline\",\"metric\":1,\"metrics\":{\"candidate_acceptance_blockers\":1},\"description\":\"Baseline before candidate changes; unresolved blocker remains.\",\"timestamp\":1778683249499,\"iteration\":1,\"confidence\":null,\"durationSeconds\":0.024,\"exitCode\":0,\"timedOut\":false,\"benchmarkCommand\":\"node benchmark.mjs\",\"checksCommand\":\"node check.mjs\",\"checksPassed\":true,\"checksDurationSeconds\":0.027}",
        "{\"type\":\"run\",\"version\":1,\"status\":\"candidate\",\"experiment\":{\"hypothesisId\":\"candidate-kes-learning-handoff-001\",\"hypothesis\":\"Changing the fixture blocker count from 1 to 0 should satisfy the explicit zero-blocker threshold.\",\"interventionSummary\":\"metric.txt changed from 1 to 0 in an isolated temporary candidate branch.\",\"expectedPrimaryEffect\":\"candidate_acceptance_blockers reaches 0 and satisfies the threshold.\",\"targetFiles\":[\"metric.txt\"],\"risk\":\"Synthetic fixture proves candidate closeout…[truncated]"
      ],
      "warnings": [
        "closeout receiptPath is under a temp directory and may disappear before review: /tmp/pi-autoresearch-candidate-kes-yX4915/autoresearch.jsonl"
      ]
    }
  }
}
```
