// summary: Preloaded into each test process by run-package-tests.mjs: when the runner goes away, the test process kills its own process group, so no test outlives the gate.
// read_when:
//   - changing how run-package-tests.mjs contains test processes.
//
// The runner holds the other end of fd 3 (a pipe no test subprocess inherits). If the runner dies
// in any way, even SIGKILL, the pipe closes and this process, the leader of its own group, ends the
// group. The socket is unref'd, so it never keeps a finished test file alive.

import { Socket } from "node:net";

let lifeline;
try {
  lifeline = new Socket({ fd: 3, readable: true, writable: false });
} catch {
  // Not started by the runner: nothing to watch.
}
if (lifeline) {
  const endGroup = () => {
    try {
      process.kill(-process.pid, "SIGKILL");
    } catch {
      process.exit(1);
    }
  };
  lifeline.on("end", endGroup);
  lifeline.on("error", endGroup);
  lifeline.unref();
  lifeline.resume();
}
