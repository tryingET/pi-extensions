// ---
// summary: "owns long-TMPDIR socket fixtures through a bounded parent-process directory descriptor"
// read_when:
//   - "adding Unix-socket tests or fixing setup/teardown under governed scratch roots"
// ---

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ActivityStripBroker } from "../../src/broker/server.mjs";

/** Real files stay under the caller's managed TMPDIR; only the Unix address is shortened.
 * The explicit parent PID makes the alias usable from child processes without inheriting the FD.
 * Keep the descriptor open until all owned brokers/clients have stopped.
 * @param {import("node:test").TestContext} t
 * @param {{prefix?: string; tmpdir?: string}} [options] */
export function createSocketFixture(t, { prefix = "activity-socket-", tmpdir = os.tmpdir() } = {}) {
  const root = fs.mkdtempSync(path.join(tmpdir, prefix));
  let fd;
  try {
    fs.chmodSync(root, 0o700);
    fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  const socketDir = `/proc/${process.pid}/fd/${fd}`;
  const socketPath = `${socketDir}/broker.sock`;
  // One address admits one broker for the fixture's lifetime. A second start could
  // unlink the first listener's address before bind, so reserve before construction.
  let admitted = false;
  let broker;
  let brokerStopped = false;
  let starting;
  let closing;
  let closingRequested = false;
  let closed = false;
  const cleanup = () => {
    if (closing) return closing;
    if (closed) return Promise.resolve();
    closingRequested = true;
    closing = (async () => {
      // Wait for the raw start operation, not startBroker's rollback wrapper.
      // Otherwise cleanup can either race a later bind or deadlock with rollback.
      await starting?.catch(() => {});
      if (broker && !brokerStopped) {
        await broker.stop();
        // Never repeat endpoint operations once the directory FD may be reused,
        // even when subsequent descriptor/storage cleanup fails and is retried.
        brokerStopped = true;
      }
      // A rejected stop leaves custody intact and permits a later cleanup retry.
      if (fd !== undefined) {
        // Linux releases a valid descriptor even when close reports an error.
        // Never retry that numeric handle: it may already belong to another fixture.
        const closingFd = fd;
        fd = undefined;
        fs.closeSync(closingFd);
      }
      fs.rmSync(root, { recursive: true, force: true });
      closed = true;
    })().finally(() => {
      closing = undefined;
    });
    return closing;
  };
  // Register before any await/start: rejection after listen must not leak an open server.
  t.after(cleanup);
  return {
    root,
    socketDir,
    socketPath,
    cleanup,
    /** @param {import("../../src/common/contracts.ts").ActivityStripBrokerOptions} [options] */
    async startBroker(options = {}) {
      if (closingRequested) throw new Error("Socket fixture is closing or already closed.");
      if (admitted) throw new Error("Socket fixture already admitted a broker.");
      admitted = true;
      try {
        broker = new ActivityStripBroker({ ...options, socketDir, socketPath });
        starting = broker.start();
        await starting;
        return broker;
      } catch (error) {
        try {
          await cleanup();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Socket fixture startup and cleanup failed.",
            { cause: error },
          );
        }
        throw error;
      }
    },
  };
}
