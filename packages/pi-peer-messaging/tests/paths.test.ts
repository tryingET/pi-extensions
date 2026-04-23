import assert from "node:assert/strict";
import test from "node:test";
import {
  getDefaultPeerMessagingRuntimeDir,
  resolvePeerMessagingPaths,
  sanitizePipeSegment,
} from "../src/paths.ts";
import { createRuntimeFallbackAddressLabel, resolvePeerAddressLabel } from "../src/presence.ts";

test("resolvePeerMessagingPaths uses broker.sock under the runtime directory on non-Windows platforms", () => {
  const paths = resolvePeerMessagingPaths({
    runtimeDir: "/tmp/pi-peer-messaging-test",
    platform: "linux",
  });

  assert.equal(paths.runtimeDir, "/tmp/pi-peer-messaging-test");
  assert.equal(paths.socketPath, "/tmp/pi-peer-messaging-test/broker.sock");
  assert.equal(paths.pidPath, "/tmp/pi-peer-messaging-test/broker.pid");
  assert.equal(paths.spawnLockPath, "/tmp/pi-peer-messaging-test/broker.spawn.lock");
});

test("resolvePeerMessagingPaths uses a named pipe on Windows", () => {
  const paths = resolvePeerMessagingPaths({
    runtimeDir: "C:/Users/example/.pi/agent/peer messaging",
    platform: "win32",
  });

  assert.match(paths.socketPath, /^\\\\\.\\pipe\\pi-peer-messaging-/);
  assert.equal(
    sanitizePipeSegment("C:/Users/example/.pi/agent/peer messaging"),
    "c-users-example-pi-agent-peer-messaging",
  );
});

test("getDefaultPeerMessagingRuntimeDir stays under the pi agent home", () => {
  assert.equal(
    getDefaultPeerMessagingRuntimeDir("/home/example"),
    "/home/example/.pi/agent/peer-messaging",
  );
});

test("unnamed sessions get a runtime-only fallback address label", () => {
  assert.equal(
    createRuntimeFallbackAddressLabel("session-1234567890abcdef"),
    "peer-session-12345678",
  );
  assert.equal(
    resolvePeerAddressLabel("session-1234567890abcdef", undefined),
    "peer-session-12345678",
  );
  assert.equal(resolvePeerAddressLabel("session-1234567890abcdef", "worker"), "worker");
});
