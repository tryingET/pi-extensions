# v0.3 MUST/SHOULD closure

All panel MUST and SHOULD deltas are integrated into the normative specification.

| Priority | Delta | Closure |
|---|---|---|
| MUST | Policy/compiler IR chain | §§1, 5, 17, 19; semantic IR and policy schema companions |
| MUST | Closed operation IR | §11 and Protocol draft; caller cannot choose effect/durability |
| MUST | D0/D1/D2 durability | §§2, 14–15, 22; D2 disabled in Release 0.1 |
| MUST | Split guest TCB | §10; minimal `boundary-init`, unprivileged `boundary-agent` |
| MUST | Daemon self-confinement | §§5, 16, 19; systemd plus Landlock where supported |
| MUST | Boot/TCB binding | §§8–9, 19–20; HMAC transcript and immutable generation |
| MUST | Verified root + workspace disk | §§7–8 |
| MUST | Backend bake-off | §19 and `BACKEND_BAKEOFF_PLAN.md` |
| MUST | PSI/inference admission | §§16, 22 |
| MUST | Immutable upgrade generations | §§8–9, 16, 20 |
| MUST | SBOM/provenance/digests | §8 and release gate |
| MUST | Expanded model checking | §§26–28 and formal companion |
| SHOULD | SourceArtifactIR | Defined but disabled; §17.5/§29.1 |
| SHOULD | DataExposureIR | §18; unknown locality remains unknown |
| SHOULD | Human/JSON operator UX | §23 |
| SHOULD | SQLite effective readback | §15.2 and QA requirements |

COULD items remain deferred: separate scanner VM and clean never-used VM prewarming. Neither appears as a hidden Release 0.1 option.
