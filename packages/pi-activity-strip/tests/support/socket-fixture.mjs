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
  const brokers = [];
  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    try {
      for (const broker of brokers.reverse()) await broker.stop();
    } finally {
      fs.closeSync(fd);
      fs.rmSync(root, { recursive: true, force: true });
    }
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
      if (closed) throw new Error("Socket fixture is already closed.");
      const broker = new ActivityStripBroker({ ...options, socketDir, socketPath });
      brokers.push(broker);
      try {
        await broker.start();
        return broker;
      } catch (error) {
        await cleanup();
        throw error;
      }
    },
  };
}
