---
summary: "Design membrane for filling /autoresearch export charts from matrix campaign artifacts."
read_when:
  - "Changing pi-autoresearch browser dashboard chart behavior for matrix campaigns."
  - "Debugging why /autoresearch export graph is empty while matrix campaign cards are populated."
type: "design-membrane"
---

# Matrix dashboard chart design membrane — 2026-05-14

## Current state and evidence

- `/autoresearch export` is package-owned by `packages/pi-autoresearch` and is read-only.
- The browser dashboard now detects matrix artifacts and switches to `matrix_campaign` mode, making matrix cards/table primary and local runtime fields auxiliary.
- The canvas chart still reads only `closeout.runs` from local `autoresearch.jsonl` receipts.
- In the observed root dashboard, `DASHBOARD_DATA.rows` is `[]` because the current cwd has no local runtime receipt series, while matrix artifacts exist under `.autoresearch/campaigns/**/.autoresearch/matrix-campaign`.
- Existing matrix artifacts contain useful progress data: expected/completed/selected cells, cockpit rows, candidate-result packet inventory, next legal actions, and sometimes closeout metrics such as baseline/final blocker counts.

## Reconstructed objective

Make the dashboard graph truthful and populated for matrix campaigns even when there is no local single-segment runtime receipt series. In matrix mode, the chart should visualize matrix progress from read-only matrix artifacts instead of showing an empty runtime metric graph.

## Owner / authority boundaries

- `pi-autoresearch` may discover local `.autoresearch` artifacts and render read-only dashboard projections.
- `pi-autoresearch` must not become the orchestrator, candidate launcher, matrix reviewer, evidence writer, winner selector, or promotion authority.
- `pi-society-orchestrator` remains owner of above-seam matrix review/cockpit/fan-in artifact production.
- AK/KES/Prompt Vault/ROCS/DSPx retain their respective durable authority and learning/procedure/semantic/evidence boundaries.

## Domain / data / state model

- Runtime mode chart source remains local runtime closeout rows.
- Matrix mode chart source is a normalized dashboard-only series derived from matrix artifacts:
  - Prefer metric trajectory points from matrix closeout metric baseline/final when present.
  - Include candidate-result packet metrics when packet bodies contain full `autoresearch.candidate_result.v1` data.
  - Fall back to cell-completion progress points from plan/cockpit/review artifacts (`0 -> completed/expected`) when metrics are absent.
- Each chart point carries label/status/description fields needed for rendering and tooltips.
- Derived chart points are projections only; they are not evidence, not campaign truth, and not written as a new authority file.

## Trust / security model

- Artifact parsing is local, read-only, and tolerant of partial/stub packets.
- Malformed JSON remains an export visibility blocker; it must not execute code or block unrelated dashboard rendering.
- HTML/script payloads are escaped through existing JSON and HTML escaping paths.
- The chart must explicitly label its source so users do not confuse derived artifact visualization with controller-measured runtime receipts.

## UX / AX / DX contract

- Matrix mode chart heading says `Matrix progress trajectory`, not generic `Metric trajectory`.
- When matrix metric points exist, the chart labels the actual metric and direction.
- When only progress points exist, the chart labels cell completion (`matrix_cells_completed`, higher-is-better).
- When neither matrix nor runtime points exist, the empty-state message explains the missing source rather than silently showing an empty graph.
- Tests should prove matrix artifacts without runtime receipts still produce non-empty chart data and visible chart labels.

## Failure / rollback model

- If matrix chart derivation fails or artifacts are incomplete, dashboard cards/table still render from the existing matrix summary and the chart shows an explanatory empty state.
- Runtime-only dashboards remain unchanged.
- Rollback is bounded to `packages/pi-autoresearch` docs/tests/runtime rendering code; no orchestrator/toolbox dirty files are touched.

## Adversarial test plan

1. Matrix artifacts with no `autoresearch.jsonl` still export non-empty `DASHBOARD_DATA.rows` and `chartMode: "matrix_campaign"`.
2. Matrix closeout metric baseline/final produces a two-point metric trajectory with the closeout metric name/direction.
3. Matrix artifacts with only plan/review progress still produce a cell-completion fallback series.
4. Runtime-only export keeps `chartMode: "runtime_segment"` and the existing runtime chart path.
5. HTML includes read-only/source wording and does not inject unescaped artifact text into executable script context.
