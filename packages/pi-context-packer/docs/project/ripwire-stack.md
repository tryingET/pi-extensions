---
summary: "Implementation and verification boundaries for the ripwire-only context-provider stack."
system4d:
  container: "Read-only context-provider integration."
  compass: "Bounded useful context without source mutation."
  engine: "Implement -> verify exact artifact -> review."
  fog: "A passing local check does not establish production adoption."
read_when:
  - "Reviewing or independently dogfooding a ripwire stack increment."
---

# Ripwire-only stack

The stack starts at PR #200. No merge, release publication, or operator installation is authorized by this document.

## RW-02: complete output budget

`context_pack` fits all model-visible text, including fences, headings, provenance and omissions.
Selected-content metrics remain separate from final-output metrics in `details.outputBudget`.
The byte limit is exact. Without a host-supplied `countTokens` function the token accounting uses
an explicitly estimated two UTF-8 bytes per token, not a claim of exact tokenizer compliance.
Known remaining host capacity and the reasoning reserve constrain the selected budget. Missing
host headroom is disclosed as unknown. A ceiling too small for a refusal produces empty error
content and a structured host-side reason. An invalid tokenizer fails closed.

Calibration scaffolding is no longer in normal model-visible text. The exported renderer accepts
`{ diagnostics: true }` for an explicitly requested, still-budgeted diagnostic rendering. Redacted
calibration templates remain available in host-side details and the programmatic packet API.

Run `npm run dogfood:gate -- --gate RW-02 --candidate-sha <HEAD> --output-dir <EXTERNAL_DIR>`
from an exact clean checkout. The command creates an isolated packed-artifact scenario plus a
fresh Pi registered-tool smoke. Missing prerequisites are BLOCKED, not passing skips.

Use one detached worktree and isolated Pi roots per candidate. Evidence identifies the exact
commit and package digest. Implementer re-execution is not independent external review.
