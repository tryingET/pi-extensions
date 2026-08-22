## 27. Formal state model v0.3

The companion TLA+ model includes:

- two or more clients and changing client epochs;
- one or more call identities;
- D0 and D1 durability classes;
- volatile versus durable admission;
- one workspace mutation token;
- workspace generation and unknown/quarantine state;
- output-credit accounting;
- global resource reservations;
- TCB generations and draining upgrades;
- cancellation versus terminal ownership;
- descendant cleanup before success;
- duplicate-call non-execution.

Required invariants include:

```text
D1 execution implies durable admission
D0 execution never mutates or advances generation
caller cannot choose effect/durability
at most one D1 mutator owns the workspace
success implies terminal state appropriate to durability class
D1 success implies durable terminal and empty descendants
unknown D1 mutation implies quarantined lease
output in flight never exceeds granted credits
reserved resources never exceed global budget
running lease uses exactly one eligible TCB generation
same call identity executes at most once for D1
stale client epoch cannot start a new effect
```

The model is not proof of kernel or hypervisor containment. It is a controller-state specification that implementation state transitions and fault-injection tests must refine.

TLC model checking is mandatory release evidence. If TLC cannot be executed in a development environment, that environment may edit the model but cannot declare the formal gate passed.
