#!/usr/bin/env python3
"""Run ONE real GTK oracle inside the approved private headless helper.

Provisioning and whole-namespace supervision belong to workstation's helper.
A nonzero oracle stays nonzero; known-RED disposition belongs to the caller.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import selectors
import stat
import subprocess
import sys

CASES = (
    "isolated_gtk_empty_visible_preserves_zone_without_keyboard_capture",
    "isolated_gtk_interaction",
    "isolated_gtk_directory_focus_only_preserves_rows_and_scroll",
    "isolated_gtk_stationary_remap_does_not_request_again",
    "isolated_gtk_stationary_backend_loss_remap_does_not_request_again",
    "isolated_gtk_exact_pixel_return_after_two_ticks_requests_again",
    "isolated_gtk_hover_source_revocation_precedes_expiry",
    "isolated_gtk_hover_expiry_releases_keyboard",
    "isolated_gtk_rapid_hidden_reentry_requests_again",
    "isolated_gtk_rapid_hidden_reentry_elsewhere_requests_again",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", required=True, choices=CASES)
    parser.add_argument("--binary", required=True, type=Path)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    if os.environ.get("PI_ACTIVITY_STRIP_ISOLATED_GUI") != "1":
        raise RuntimeError("owned private GUI admission required")
    state_path = Path(os.environ["PI_ACTIVITY_STRIP_GUI_STATE"])
    if not str(state_path.resolve()).startswith("/work/"):
        raise RuntimeError("this entrypoint requires the approved private headless namespace")
    state = json.loads(state_path.read_text())
    socket = os.environ["NIRI_SOCKET"]
    if state.get("outer_socket") is not None or not socket.endswith(f'.{state["pid"]}.sock'):
        raise RuntimeError("not the helper's private compositor")
    if not stat.S_ISSOCK(os.stat(socket).st_mode):
        raise RuntimeError("private compositor socket absent")
    if not args.binary.is_absolute() or not args.binary.is_file() or args.binary.is_symlink():
        raise RuntimeError("exact regular test image required")
    with args.binary.open("rb") as image:
        digest = hashlib.file_digest(image, "sha256").hexdigest()
    if digest != args.sha256:
        raise RuntimeError("test image digest mismatch")
    case = f"app::gui_tests::{args.case}"
    inventory = subprocess.run([str(args.binary), "--list", "--exact", case],
                               check=True, capture_output=True, text=True)
    if f"{case}: test" not in inventory.stdout.splitlines():
        raise RuntimeError("exact test is absent: zero filtered tests are not a pass")
    fixture = Path.cwd() / "native/panel/target/gui-fixture"
    fixture.mkdir(parents=True, exist_ok=True)
    runtime = fixture / "native-runtime"
    runtime.mkdir(mode=0o700)
    env = dict(os.environ)
    env.update({
        "WAYLAND_DISPLAY": str(Path(env["XDG_RUNTIME_DIR"]) / env["WAYLAND_DISPLAY"]),
        "XDG_RUNTIME_DIR": str(runtime),
        "GTK_A11Y": "none", "NO_AT_BRIDGE": "1", "GDK_BACKEND": "wayland",
        "GSK_RENDERER": "cairo",
        "PI_ACTIVITY_STRIP_VIRTUAL_POINTER": str(fixture / "virtual-pointer"),
    })
    for key in ("DISPLAY", "WAYLAND_SOCKET", "XAUTHORITY", "AT_SPI_BUS_ADDRESS",
                "DBUS_STARTER_ADDRESS", "DBUS_STARTER_BUS_TYPE", "SESSION_MANAGER"):
        env.pop(key, None)
    # A short owned /proc alias avoids the Unix socket-address length limit.
    runtime_fd = os.open(runtime, os.O_RDONLY | os.O_DIRECTORY)
    bus_path = f"/proc/{os.getpid()}/fd/{runtime_fd}/bus"
    bus = None
    test_status = 78
    cleanup_ok = True
    try:
        with (fixture / "native-bus.txt").open("w") as bus_log:
            bus = subprocess.Popen(["dbus-daemon", "--session", "--nofork", "--print-address=1",
                                    f"--address=unix:path={bus_path}"], env=env,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=bus_log)
            with selectors.DefaultSelector() as selector:
                selector.register(bus.stdout, selectors.EVENT_READ)
                if not selector.select(10):
                    raise RuntimeError("private bus did not report readiness")
                address = bus.stdout.readline().decode().strip()
            if not address.startswith("unix:") or bus.poll() is not None:
                raise RuntimeError("private bus failed startup")
            env["DBUS_SESSION_BUS_ADDRESS"] = address
            test_status = subprocess.run([str(args.binary), "--exact", case, "--ignored",
                                          "--nocapture", "--test-threads=1"],
                                         env=env, stdin=subprocess.DEVNULL).returncode
            if bus.poll() is not None:
                raise RuntimeError("private bus exited during the oracle")
    finally:
        if bus is not None:
            if bus.poll() is None:
                bus.terminate()
            try:
                bus.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cleanup_ok = False
                bus.kill()
                bus.wait()
            if bus.stdout is not None:
                bus.stdout.close()
        os.close(runtime_fd)
        Path("/work/native-case-result.json").write_text(json.dumps({
            "case": case, "test_sha256": digest, "test_exit_status": test_status,
            "private_bus_clean": cleanup_ok,
            "scope": "controlled native GTK oracle, not production/controller cause telemetry",
        }) + "\n")
    return test_status if cleanup_ok else 78


if __name__ == "__main__":
    sys.exit(main())
