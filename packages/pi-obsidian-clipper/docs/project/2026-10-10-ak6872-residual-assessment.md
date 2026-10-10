---
summary: "AK6872 residual-security adjudication and authorized final-verification boundary: trusted-engine mitigation, not compromised-engine containment."
task_id: 6872
read_when:
  - "Deciding whether Clipper's remaining security limits are accepted or need a separately authorized containment task."
  - "Reproducing the real foreign-owner admission proof."
---

# AK6872 residual assessment and final-verification boundary

## Authority and disposition

The operator requested Prompt Vault `many-of-the-greats`; discovery/retrieval and
its dispatch check returned `text_ok`. The resulting conversation-only assessment
is made durable here. A subsequent native interview explicitly approved finishing
**exact AK6872 under its existing contract**, feasible test-gap closure, current-tree
gates, coordinated script-only landing and a fresh real native receiver. It also
explicitly authorized terminal AK6872 completion after verification and AK evidence.
Authorization: **AK evidence 15199**. No ordinary push, other-task lifecycle,
workstation mutation or compromised-engine containment was authorized.

Standing decisions retained: SQLite remains enabled with its exception disclosed;
Node below 25 refuses by default, with an explicitly accepted weaker in-process
network-guard opt-in. Completion against this contract does not resolve every risk
below. AK, not this document, supplies current lifecycle and verification receipts.

## Question

Which residuals are trust premises, demonstrated bypasses, missing evidence or
protocol ambiguity? What protection can legitimately be claimed?

## Many of the greats: four competing schools

1. **Least privilege (Saltzer–Schroeder).** Only authority required for extraction
   should be granted. Browser databases and signalling Pi are unnecessary authority.
   An approved native engine can still be compromised by hostile source HTML.
2. **Capability security.** Remove access by construction, rather than enumerate
   forbidden APIs. Raw-handle bypasses defeat a JavaScript deny-list; Unix sockets
   can expose local services even when HTTP calls are denied.
3. **Empirical assurance.** Adversarial and mutation tests falsify claims; passing
   probes are not universal absence proof. Repeated independent reviews found
   escapes despite a green suite.
4. **Operational pragmatism.** Useful trusted-code mitigation can ship with precise,
   receiver-accepted risks. The cost of full isolation is not justified merely by
   calling every documented assumption unfinished work.

## Confrontation

- Trusted-engine mitigation and hostile-engine containment have different premises.
  Provenance identifies code; it does not make vulnerable code safe.
- Owner acceptance authorizes proceeding; it cannot change the SQLite exception or
  transform a deny-list into a containment mechanism.
- More tests strengthen measured claims; they cannot replace an absent authority
  boundary. Each test establishes only what its fixture actually exercises.

## Decision: contextual dominance

The current contract supports **trusted-engine accident mitigation**. If containment
following engine compromise becomes a requirement, capability-based OS isolation
must dominate. It needs its own exact owner-approved scope and receiver contract;
this pass neither implements nor certifies it. Root/system administration remains
trusted even in a stronger isolation design.

| Residual | Classification | Current disposition |
| --- | --- | --- |
| Same-UID changes between admission and spawn or to the adapter | Trust boundary | Explicitly retained; no hostile-same-UID protection claimed |
| SQLite reads/writes/creates outside Node fs grants | Demonstrated exception | Retained by explicit owner choice; not read-only containment |
| Signalling same-user processes | Residual process authority | Retained; no destructive signal probe is needed or authorized |
| Opt-in Node below 25 raw Unix/DNS/pipe paths | Demonstrated guard bypasses | Default refusal retained; opt-in accepts weaker protection |
| In-root hard links to outside content | Path-based trust limitation | Retained; rejecting all multi-link files would be a new admission decision |
| Foreign-owner rejection | Former test-evidence gap | Real subordinate-UID inode proof now executed on Node 22 and 26 |
| Close-delimited graceful EOF | Protocol ambiguity | Real TLS fixture observes prefix acceptance; no article-completeness claim |

No threshold, framing-interruption assertion, native admission rule or accepted
SQLite/Node22 policy was weakened or changed in this final-verification pass.

## Reproducible foreign-owner proof

From the package root:

```bash
node --import tsx scripts/native-owner-proof.ts
```

Prerequisites: Linux, an ordinary non-root operator, working unprivileged user
namespaces, `unshare`/`newuidmap`/`newgidmap`, and subordinate UID/GID mappings.
The script fails if prerequisites are missing; it is **host qualification**, not a
portable/skippable CI test. No installation, sudo or live configuration change occurs.

The fresh private fixture is admitted, then the same dependency inode is chowned
inside a user namespace to a subordinate host UID. Actual `admitNative` rejects it
with the specific foreign-owner error. Restoring ownership admits it again; inode,
mode, size and restored content hash are preserved. Only ownership changes. The
fixture is removed, no native subprocess starts, and no network target is contacted.
Observed on this host: uid 1000 -> 100000 -> 1000, on Node 22.23.3 and 26.9.0.

## Peer coordination and evidence limits

- AK6871 peer confirmed its source/dependency qualification is separate; the native
  decisions were not changed by that task. Its proof is not OS isolation proof.
- AK6898 is done; its peer confirmed no remaining claim/landing reservation and no
  authored Clipper runtime, manifest, lock, native or workstation change.
- The prior workstation peer cited AK5341 / Decision150 O4-W / commit `f33a0b6` /
  evidence 8237–8238 as synthetic Bubblewrap/cgroup substrate, explicitly not a
  hostile-same-UID boundary. **Those references are peer-attributed, not independently
  inspected in this package pass**, and do not qualify this engine for containment.
- The original controller acknowledged this owner boundary; no new containment task
  was requested or authorized. No exhaustive discovery claim is made.

Historical implementation/receiver evidence: **14646, 14668, 14671**. Fresh final
proofs must be read from `ak evidence task 6872`; earlier green receipts are not a
claim that later trees are verified.
