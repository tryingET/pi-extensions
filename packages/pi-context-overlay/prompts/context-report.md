---
description: Generate a text report of current context composition
system4d:
  container: "Prompt template for summarizing current Pi context composition."
  compass: "Make context pressure visible so the operator can decide whether to continue or compact."
  engine: "Estimate -> group -> rank contributors -> recommend next action."
  fog: "Context windows can feel opaque until major contributors are surfaced explicitly."
---
Generate a concise context-window report with:
1) system prompt size estimate
2) AGENTS/CLAUDE context contribution
3) top 10 largest message/tool contributors
4) current risk of overflow and recommendation (/compact or continue)
