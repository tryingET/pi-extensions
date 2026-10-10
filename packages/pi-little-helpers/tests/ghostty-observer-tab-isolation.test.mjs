import assert from "node:assert/strict";
import test from "node:test";
import { observerIsolationRefusal } from "./ghostty-observer-tab-harness.mjs";

function fixture() {
  const root = "/owned/isolated";
  const env = {
    PI_ASC_OBSERVER_LIVE_ISOLATED: "1",
    PI_ASC_OBSERVER_LIVE_NESTED_STATE: `${root}/state.json`,
    NIRI_SOCKET: "/nested/socket",
    WAYLAND_DISPLAY: "wayland-isolated",
    XDG_RUNTIME_DIR: "/run/user/1000",
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/private/bus",
  };
  const contents = new Map([
    [`${root}/state.json`, JSON.stringify({ pid: 123, outer_socket: "/operator/socket" })],
    ["/proc/123/cmdline", `niri\0-c\0${root}/config.kdl\0`],
    [`${root}/nested.env`, "NIRI_SOCKET=/nested/socket\nWAYLAND_DISPLAY=wayland-isolated\n"],
    [
      "/proc/net/unix",
      "Num RefCount Protocol Flags Type St Inode Path\n0: 2 0 10000 0001 01 901 /nested/socket\n1: 2 0 10000 0001 01 902 /run/user/1000/wayland-isolated\n",
    ],
  ]);
  return {
    env,
    contents,
    list: () => ["3", "4"],
    readLink: (path) =>
      path.endsWith("/exe")
        ? "/usr/bin/niri"
        : path.endsWith("/3")
          ? "socket:[901]"
          : "socket:[902]",
    read: (path) => {
      assert.ok(contents.has(path));
      return contents.get(path);
    },
    getBusId: (address) =>
      address === env.DBUS_SESSION_BUS_ADDRESS ? "a".repeat(32) : "b".repeat(32),
  };
}

test("observer trial accepts a live recorded nested compositor and distinct private bus", () => {
  assert.equal(observerIsolationRefusal(fixture()), undefined);
});
for (const problem of [
  "no-opt-in",
  "no-state",
  "oversized-state",
  "wrong-process",
  "wrong-executable",
  "foreign-sockets",
  "operator-display",
  "wrong-wayland",
  "bus-alias",
  "unreadable-bus",
  "inspection-error",
]) {
  test(`observer trial refuses ${problem} before any dispatch`, () => {
    const f = fixture();
    if (problem === "no-opt-in") delete f.env.PI_ASC_OBSERVER_LIVE_ISOLATED;
    if (problem === "no-state") delete f.env.PI_ASC_OBSERVER_LIVE_NESTED_STATE;
    if (problem === "oversized-state")
      f.contents.set(f.env.PI_ASC_OBSERVER_LIVE_NESTED_STATE, "x".repeat(4097));
    if (problem === "wrong-process")
      f.contents.set("/proc/123/cmdline", "niri\0-c\0/other/config.kdl\0");
    if (problem === "operator-display") f.env.NIRI_SOCKET = "/operator/socket";
    if (problem === "wrong-executable") f.readLink = () => "/usr/bin/unrelated-process";
    if (problem === "foreign-sockets")
      f.readLink = (path) => (path.endsWith("/exe") ? "/usr/bin/niri" : "socket:[999]");
    if (problem === "wrong-wayland") f.env.WAYLAND_DISPLAY = "wayland-operator";
    if (problem === "bus-alias") f.getBusId = () => "a".repeat(32);
    if (problem === "unreadable-bus") f.getBusId = () => undefined;
    if (problem === "inspection-error")
      f.read = () => {
        throw new Error("unreadable");
      };
    assert.equal(typeof observerIsolationRefusal(f), "string");
  });
}
