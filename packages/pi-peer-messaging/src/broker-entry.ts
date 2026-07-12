// ---
// summary: starts the peer-messaging broker process and handles operating-system shutdown signals
// read_when:
//   - changing broker process startup, shutdown, or idle-time configuration
// ---
import { PeerMessagingBroker } from "./broker.ts";

const runtimeDir = process.env.PI_PEER_MESSAGING_RUNTIME_DIR;
const idleShutdownMs = Number.parseInt(
  process.env.PI_PEER_MESSAGING_IDLE_SHUTDOWN_MS ?? "5000",
  10,
);

const broker = new PeerMessagingBroker({
  runtimeDir,
  idleShutdownMs: Number.isFinite(idleShutdownMs) ? idleShutdownMs : 5_000,
});

async function shutdown(exitCode: number): Promise<void> {
  try {
    await broker.stop();
  } finally {
    process.exit(exitCode);
  }
}

process.on("SIGTERM", () => {
  void shutdown(0);
});
process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("uncaughtException", (error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  void shutdown(1);
});

await broker.start();
