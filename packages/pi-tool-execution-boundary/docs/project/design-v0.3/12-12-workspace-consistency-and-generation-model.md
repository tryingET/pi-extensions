## 12. Workspace consistency and generation model

### 12.1 Single writer

Each checkout has exactly one workspace coordinator.

Allowed concurrency:

```text
multiple structured reads: yes
one read-only grep/find plus structured reads: yes
one mutation of any kind: yes
reads during a mutation: no in Release 0.1
second writable lease on same checkout: no
interactive and batch on same checkout: no
```

### 12.2 Workspace generation

The coordinator maintains a monotonic 64-bit unsigned generation stored in SQLite and mirrored in guest-agent memory.

Initial imported state:

```text
generation = 1
```

Known mutation success:

```text
generation := generation + 1
```

Arbitrary process completion increments generation even if the derived manifest appears unchanged.

Unknown mutation outcome marks the generation `unknown-after=<previous>` and quarantines the lease. It does not guess a number and continue.

### 12.3 Locking

- `read`, `ls`, fixed `grep`, and fixed `find` acquire a shared lock.
- `write`, `edit`, `bash`, user shell, import, export, and checkpoint acquire an exclusive lock.
- Lock ownership is journaled for mutating calls.
- Deadlines include queue wait.
- Cancellation while queued removes the waiter without starting an effect.

### 12.4 Stale protection

Mutating structured tools MUST include the generation observed when their arguments were prepared. A mismatch returns a typed stale error and instructs the model to reread.

For compatibility where Pi's built-in schema cannot carry generation visibly, the extension binds the generation internally to the corresponding tool-call preparation/execution context. It MUST not expose a new model-visible argument solely for backend coordination.

### 12.5 Quiesced export

Change export requires:

- exclusive workspace lock;
- no active or queued mutator;
- all call cgroups empty;
- trusted `boundary-agent` healthy;
- current generation known;
- SQLite journal flushed through the last terminal mutation.

---
