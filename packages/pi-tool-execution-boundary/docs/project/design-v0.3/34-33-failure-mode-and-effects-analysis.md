## 33. Failure-mode and effects analysis

| Failure | Detection | Immediate action | Durable classification | Lease future |
|---|---|---|---|---|
| Source changes during snapshot | pre/post identity mismatch | abort before VM | failed pre-effect | none |
| Unsupported Git path/mode | manifest validation | reject | rejected | none |
| Import blob digest mismatch | guest validation | stop VM | failed pre-effect / integrity | destroy |
| QEMU fails before handshake | systemd unit result | stop/cleanup | failed pre-effect | destroy |
| Agent facts mismatch | handshake | stop unit | attestation failed | destroy |
| Attestation canary fails | canary result | reject backend plan | failed pre-effect | destroy |
| SQLite admission commit fails | DB error | do not start call | failed pre-effect | retain ready lease if DB healthy later; otherwise drain |
| Call deadline in queue | daemon monotonic timer | dequeue | cancelled pre-effect | ready |
| Structured read error | agent typed error | return error | failed known, no mutation | ready |
| Structured mutation loses channel after rename | agent/channel loss | stop VM | workspace mutation unknown | quarantine |
| Process exits but daemon remains | cgroup populated | kill cgroup | known failure or success only after empty | ready if empty proven |
| Cgroup never empties | cleanup deadline | stop entire VM | descendants unknown | quarantine |
| Cell OOM | memory.events | kill group | process known/OOM; mutation scan required | ready only if scan and journal succeed |
| QEMU exits during read | systemd event | reconcile | read failed known if no mutation cell | destroy/replace |
| QEMU exits during mutation | systemd event | quarantine | mutation unknown | quarantine |
| Daemon crashes before call accepted | no durable call | client reconnects | not accepted | lease reconciliation |
| Daemon crashes after accepted before start | DB state queued/admitted | no rerun without explicit state path | cancelled/failed pre-effect after recovery | lease stopped in 0.1 |
| Daemon crashes during mutation | recovery sees STARTED | stop unit | mutation unknown | quarantine |
| Client disconnects | socket EOF | grace then dispose | state-dependent | drain |
| Output cap reached | byte counter | discard further output/backpressure | output partial, effect independent | state-dependent |
| Export unsupported inode | trusted scan | abort export | workspace known, export failed | ready/close possible |
| Export fsync fails | I/O error | no success | export failed; mutation still known | retain/quarantine by storage health |
| Terminal SQLite commit fails | DB error | return unknown, stop lease | journal failed | quarantine |
| Host ENOSPC | free-space monitor/I/O error | emergency reserve, stop admission | storage emergency | quarantine/drain |
| Quarantine budget full | admission check | reject new leases | resource denied | existing retained |
| systemd D-Bus unavailable | doctor/runtime error | no new unit | backend unavailable | existing unit handled conservatively |
| PID reused | unit/cgroup/nonce mismatch | never signal numeric PID | recovery blocked | operator/systemd cleanup |
| Remote model selected | Pi model facts | status warning/policy action | not VM failure | operator choice |

---
