---
summary: "Why this project matters and what outcomes are rewarded."
read_when:
  - "Prioritizing roadmap work or evaluating tradeoffs."
system4d:
  container: "Motivators and value model for the context inspector package."
  compass: "Favor work that improves operator trust in live session context over ornamental complexity."
  engine: "Operator pain -> package capability -> validation/release discipline -> durable confidence."
  fog: "The main risk is rewarding surface complexity instead of truthful context visibility and host compatibility."
---

# Incentives

Reward changes that improve one or more of these outcomes:

- **Live truthfulness:** the overlay should reflect the active Pi session instead of stale or guessed state.
- **Operator confidence:** `/c` and `/context-report` should make context pressure and composition easier to understand before compacting or debugging.
- **Fast recovery from host drift:** lifecycle/key-hint/runtime compatibility problems should be isolated and fixable inside this package.
- **Low-maintenance ownership:** docs, tests, and validation should make it obvious how to keep the package healthy after Pi runtime changes.
- **Bounded scope:** avoid turning a focused inspection package into a replay system or generic interaction-runtime layer.
