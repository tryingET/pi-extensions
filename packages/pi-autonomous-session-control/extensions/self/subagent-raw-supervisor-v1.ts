import { spawn } from "node:child_process";

const START_GATE_TIMEOUT_MS = 30_000;
const START_GATE_MAX_BYTES = 32;

interface SupervisorOptions {
  cwd: string;
  piArgs: string[];
}

function parseArgs(argv: string[]): SupervisorOptions {
  const separator = argv.indexOf("--");
  if (separator < 0) throw new Error("Missing raw-supervisor argument separator.");
  const control = argv.slice(0, separator);
  const piArgs = argv.slice(separator + 1);
  if (control.length !== 2 || control[0] !== "--cwd" || !control[1]) {
    throw new Error("Raw supervisor requires exactly one --cwd value.");
  }
  if (piArgs.length === 0) throw new Error("Raw supervisor requires Pi arguments.");
  return { cwd: control[1], piArgs };
}

async function waitForStartGate(): Promise<void> {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Raw supervisor start gate timed out.")),
      START_GATE_TIMEOUT_MS,
    );
    timeout.unref?.();

    const cleanup = () => {
      clearTimeout(timeout);
      process.stdin.removeAllListeners("data");
      process.stdin.removeAllListeners("end");
      process.stdin.removeAllListeners("error");
    };
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, "utf8") > START_GATE_MAX_BYTES) {
        cleanup();
        reject(new Error("Raw supervisor start gate exceeded its bound."));
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const gate = buffer.slice(0, newline);
      cleanup();
      gate === "start" ? resolve() : reject(new Error("Raw supervisor rejected the start gate."));
    });
    process.stdin.once("end", () => {
      cleanup();
      reject(new Error("Raw supervisor parent closed before the start gate."));
    });
    process.stdin.once("error", (error) => {
      cleanup();
      reject(error);
    });
    process.stdin.resume();
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await waitForStartGate();

  // The supervisor is the live process-group leader. It ignores the graceful group TERM that it
  // initiates, then SIGKILLs the complete group—including itself—after bounded grace. Teardown
  // therefore never relies on a post-reap numeric PGID signal from the helper.
  process.on("SIGTERM", () => undefined);
  let groupShutdownStarted = false;
  const terminateManagedGroup = () => {
    if (groupShutdownStarted) return;
    groupShutdownStarted = true;
    try {
      process.kill(-process.pid, "SIGTERM");
    } catch {
      // The supervisor is still the group leader here; a failed TERM still proceeds to KILL.
    }
    setTimeout(() => {
      try {
        process.kill(-process.pid, "SIGKILL");
      } catch {
        process.exit(1);
      }
    }, 250);
  };

  const rawPi = spawn("pi", options.piArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    cwd: options.cwd,
    detached: false,
  });
  rawPi.stdout?.pipe(process.stdout);
  rawPi.stderr?.pipe(process.stderr);

  process.stdin.once("end", terminateManagedGroup);
  process.stdin.resume();
  if (process.stdin.readableEnded) terminateManagedGroup();

  rawPi.once("error", (error) => {
    process.stderr.write(
      `Error spawning pi inside ASC raw supervisor: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    terminateManagedGroup();
  });
  rawPi.once("close", terminateManagedGroup);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 125;
});
