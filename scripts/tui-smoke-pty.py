#!/usr/bin/env python3
"""Minimal pty driver for tui-smoke.sh when tmux is unavailable.
Runs `pi` in a 120x40 pty, captures startup, types /changelog + Enter,
captures the result, then quits. Prints delimited captures to stdout."""
import fcntl, os, pty, select, struct, sys, termios, time

repo = sys.argv[1]
timeout = float(sys.argv[2]) if len(sys.argv) > 2 else 90
pid, fd = pty.fork()
if pid == 0:
    os.chdir(repo)
    os.environ["TERM"] = "xterm-256color"
    os.execvp("pi", ["pi"])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))

def drain(seconds):
    chunks = []
    t0 = time.time()
    while time.time() - t0 < seconds:
        r, _, _ = select.select([fd], [], [], 0.5)
        if r:
            try:
                d = os.read(fd, 65536)
            except OSError:
                break
            if not d:
                break
            chunks.append(d)
    return b"".join(chunks)

deadline = time.time() + timeout
startup = drain(15)
print("---STARTUP---")
sys.stdout.write(startup.decode("utf8", "replace"))
if time.time() > deadline:
    os.kill(pid, 9); sys.exit(1)
for ch in "/changelog":
    os.write(fd, ch.encode())
    time.sleep(0.3)
time.sleep(2)
drain(1)
os.write(fd, b"\r")
time.sleep(8)
cmdout = drain(4)
print("\n---CMDOUT---")
sys.stdout.write(cmdout.decode("utf8", "replace"))

# Session-lifecycle regression phase: /reload must not kill pi (stale-ctx
# widget crash class — see docs/project/2026-08-14-tui-smoke-harness.md).
for ch in "/reload":
    os.write(fd, ch.encode())
    time.sleep(0.3)
time.sleep(2)
drain(1)
os.write(fd, b"\r")
reloadout = drain(10)
print("\n---RELOAD---")
sys.stdout.write(reloadout.decode("utf8", "replace"))
for ch in "/changelog":
    os.write(fd, ch.encode())
    time.sleep(0.3)
time.sleep(2)
drain(1)
os.write(fd, b"\r")
postout = drain(8)
print("\n---POSTRELOAD---")
sys.stdout.write(postout.decode("utf8", "replace"))
os.write(fd, b"/quit\r")
drain(3)
try:
    os.kill(pid, 9)
except ProcessLookupError:
    pass
