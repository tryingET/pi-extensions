// ---
// summary: shared helpers for peer-messaging runtime tests: private brokers, peers that are always disconnected, and polling waits
// read_when:
//   - writing runtime tests that start brokers or peers
// ---
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createPeerMessagingRuntime,
  type ManagedPeerMessagingRuntime,
  type PeerMessage,
} from "../index.ts";
import { resolvePeerMessagingPaths } from "../src/paths.ts";

export async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error("Timed out waiting for predicate.");
}

export async function waitForBrokerShutdown(runtimeDir: string): Promise<void> {
  const paths = resolvePeerMessagingPaths({ runtimeDir });
  await waitFor(() => !fs.existsSync(paths.pidPath), 3_000);
}

export function createMessage(
  text: string,
  options: { id?: string; replyTo?: string } = {},
): PeerMessage {
  return {
    id: options.id ?? randomUUID(),
    timestamp: Date.now(),
    replyTo: options.replyTo,
    content: {
      text,
    },
  };
}

export async function disconnectAll(runtimes: ManagedPeerMessagingRuntime[]): Promise<void> {
  for (const runtime of runtimes.reverse()) {
    try {
      await runtime.disconnect();
    } catch {
      // Best-effort cleanup for tests.
    }
  }
}

// Creates named peers on a private broker and always disconnects them, even when an assertion fails,
// so a failure reports instead of hanging on open sockets.
export async function withPeers<T>(
  names: string[],
  fn: (peer: (name: string) => ManagedPeerMessagingRuntime) => Promise<T>,
): Promise<T> {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
  const peers: ManagedPeerMessagingRuntime[] = [];
  try {
    for (const name of names) {
      peers.push(
        await createPeerMessagingRuntime({
          name,
          cwd: `/repo/${name}`,
          model: "openai/gpt-4.1",
          runtimeDir,
          idleShutdownMs: 250,
        }),
      );
    }
    return await fn((name) => {
      const found = peers[names.indexOf(name)];
      assert.ok(found, `no peer named ${name}`);
      return found;
    });
  } finally {
    await disconnectAll([...peers]);
    await waitForBrokerShutdown(runtimeDir).catch(() => {});
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Asserts that `check` holds on every poll across `ms`: a fixed sleep could pass before the broker acts.
export async function holdsThroughout(check: () => Promise<boolean>, message: string, ms = 600) {
  const deadline = Date.now() + ms;
  do {
    assert.ok(await check(), message);
    await delay(50);
  } while (Date.now() < deadline);
}
