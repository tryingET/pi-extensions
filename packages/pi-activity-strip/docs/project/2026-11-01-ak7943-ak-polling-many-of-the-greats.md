---
summary: "Many-of-the-greats adjudication for AK7943: how often the always-on activity strip may read AK, whose every call holds one workstation-wide exclusive lock. Decision: contextual dominance; claims stay at 15 s (live custody), the deferral list refreshes every 5 minutes (it changes on human-decision timescales), cutting the strip's lock duty from about 29% to about 8%. A change signal or a projected read from AK stays unresolved."
read_when:
  - "Changing AK_TASK_REFRESH_MS, AK_DEFERRED_REFRESH_MS or what the strip reads from AK."
  - "Wondering why deferred badges can lag a deferral by up to five minutes."
type: adjudication
---

# QUESTION

The native strip host (one per workstation) refreshes AK every 15 s with two reads:
`ak task list --status claimed --format json --all --verbose` (0.8 to 1.3 s inside the binary,
30 KB) and `ak task deferred --format json --all` (3.28 s inside the binary under the lock, 714 KB,
327 deferrals; gate trace, 2026-11-01). The AK runtime gate serializes every read and write on the
workstation behind one exclusive `flock` with a 30 s admission timeout, so the strip holds that
lock about 29% of the time, and every other agent's AK call queues behind it (`bin/it write
--apply` makes about N + 20 sequential calls). From the deferral list the strip uses only
`{id, title, repo}` of active deferrals: to keep a deferred task off the live-claim chips and to show
at most two deferred badges per card. How often may an always-on, read-only status surface read a
shared store behind an exclusive lock?

# MODE 1 — MANY OF THE GREATS

### School 1: Visibility of system status (Norman, Nielsen)
- Core claim: the strip exists to show the present. A display that lags reality teaches the
  operator to distrust it, and a distrusted status surface is worse than none.
- Premises: humans act on what they see; a stale chip is a false statement.
- Strongest case: the 15 s cadence was chosen for live claims and orphaned custody, both of which
  change while the operator watches.
- What it sees: freshness is the product, not a cost.

### School 2: Stewardship of a shared server (Kleinrock, Little; Dean's tail at scale)
- Core claim: a serialized resource is a single-server queue; every background reader inflates the
  wait of every foreground caller, and the inflation grows as 1/(1 - utilization).
- Premises: the lock admits one caller at a time; foreground work (writes, applies, agent turns)
  matters more than a passive ribbon.
- Strongest case: at 29% utilization from one passive client, a 1 s call already waits about
  0.2 s on average, and under bursts the tail reaches the 30 s admission timeout (observed
  2026-11-01: callers refused with exit 75).
- What it sees: the cost is paid by others, invisibly, so it must be budgeted explicitly.

### School 3: Push, not poll (Hewitt; event-driven design)
- Core claim: polling is a confession that the owner offers no change signal. The right design is
  a notification or a cheap version stamp; cost should scale with changes, not with time.
- Premises: deferrals change a few times a day; reading 714 KB every 15 s to learn that nothing
  changed is pure waste.
- Strongest case: with a watermark the strip could poll every 15 s for almost nothing and stay
  perfectly fresh.
- What it sees: the long-run fix lives in AK, not in the strip.

### School 4: Read only what you render (Parnas; need-to-know interfaces)
- Core claim: a consumer should receive the projection it uses. Full records with long reasons,
  for three fields of at most two badges per card, couple the strip to AK's whole record shape.
- Premises: payload size drives both lock time and parse time.
- What it sees: even a slower cadence keeps paying for 700 KB the strip throws away.

# MODE 2 — CONFRONTATION

### Clash 1: Visibility vs stewardship
- Fundamental contradiction: one school prices staleness, the other prices lock time.
- Resolution: they disagree only if all data share one clock. They do not. Claims change on session
  timescales (minutes) and are 23% of the lock time; deferrals change on human-decision timescales
  (hours, review dates) and are 77% of it. Visibility dominates for claims; stewardship dominates
  for deferrals.

### Clash 2: Push vs poll
- Fundamental contradiction: School 3 rejects the premise of a cadence at all.
- What it explains better: every polling interval is arbitrary.
- What it cannot do here: AK offers no change signal and no version stamp; inventing one is AK's
  decision (AK7946 asks the related read-lock question; AK7944 the per-call cost).
- Residual tension: irreducible inside this package; it stays open as an owner request.

### Clash 3: Read only what you render vs the available CLI
- `ak task deferred` offers `--repo` but no projection; one call per card repo would multiply the
  per-process open cost (about 1 s each), so a narrower read is slower, not faster. The projection
  is AK's to offer.

# MODE 3 — INTEGRATION OR DECISION
- Chosen path: Contextual dominance.
- Result: claims refresh every 15 s, unchanged. The deferral list refreshes at most every
  5 minutes; between refreshes the last successfully parsed list is reused. A failed or malformed
  deferral read still fails closed and is retried on the next tick, never papered over.
- Why: it keeps every live-custody fact at its current freshness and moves the dominant cost to the
  timescale on which it changes: lock duty falls from about (3.3 + 1.0) / 15 = 29% to about
  1.0 / 15 + 3.3 / 300 = 8%.
- What remains unresolved: a change signal or a projected deferral read from AK (Schools 3 and 4).
  Until then a newly deferred claimed task can show as active, and a new deferral badge can be
  missing, for up to 5 minutes.

# PRACTICAL CONSEQUENCE
- `AK_DEFERRED_REFRESH_MS = 300_000` beside `AK_TASK_REFRESH_MS = 15_000`; the status report says how
  old the deferral list is.
- Tests: the deferral read happens once per window while claims refresh every tick; a failed
  deferral read clears chips and is retried at once; a claim failure still fails closed with a fresh
  deferral list cached.
- Measure before and after with the same gate trace once the operator restarts the strip host.
- Ask AK's owner for a change signal or a projected read in AK7946's decision.
