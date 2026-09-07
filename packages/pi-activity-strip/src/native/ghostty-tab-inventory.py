#!/usr/bin/env python3
# ---
# summary: "enumerates Ghostty windows and their tab labels through AT-SPI for hidden-tab placement"
# read_when:
#   - "changing how the activity strip discovers tabs hidden behind another Ghostty tab"
# ---
"""Print one JSON document describing every AT-SPI frame of the given process ids.

Usage: ghostty-tab-inventory.py <pid> [<pid> ...]

Output: {"ok": true, "frames": [{"pid": int, "name": str, "tabs": [str, ...]}, ...]}
Exit 3 with {"ok": false, "error": ...} when the AT-SPI Python bindings are unavailable.
The script only reads accessibility state; it never activates, selects, or focuses anything.
"""

import json
import sys

MAX_NODES_PER_FRAME = 20000
MAX_DEPTH = 40


def main() -> int:
    try:
        import gi

        gi.require_version("Atspi", "2.0")
        from gi.repository import Atspi
    except Exception as error:  # noqa: BLE001 - any import failure means the capability is absent
        print(json.dumps({"ok": False, "error": f"AT-SPI bindings unavailable: {error}"}))
        return 3

    pids = {int(argument) for argument in sys.argv[1:] if argument.isdigit()}
    if not pids:
        print(json.dumps({"ok": True, "frames": []}))
        return 0

    def tab_labels(frame):
        labels = []
        stack = [(frame, 0)]
        seen = 0
        while stack and seen < MAX_NODES_PER_FRAME:
            node, depth = stack.pop()
            seen += 1
            try:
                role = node.get_role()
            except Exception:  # noqa: BLE001 - a vanished node is skipped
                continue
            if role == Atspi.Role.PAGE_TAB:
                try:
                    labels.append(node.get_name() or "")
                except Exception:  # noqa: BLE001
                    pass
                continue
            if depth >= MAX_DEPTH:
                continue
            try:
                count = node.get_child_count()
            except Exception:  # noqa: BLE001
                continue
            for index in range(count):
                try:
                    child = node.get_child_at_index(index)
                except Exception:  # noqa: BLE001
                    continue
                if child is not None:
                    stack.append((child, depth + 1))
        return labels

    frames = []
    desktop = Atspi.get_desktop(0)
    for index in range(desktop.get_child_count()):
        application = desktop.get_child_at_index(index)
        if application is None:
            continue
        try:
            pid = application.get_process_id()
        except Exception:  # noqa: BLE001
            continue
        if pid not in pids:
            continue
        for window_index in range(application.get_child_count()):
            frame = application.get_child_at_index(window_index)
            if frame is None:
                continue
            try:
                if frame.get_role() != Atspi.Role.FRAME:
                    continue
                name = frame.get_name() or ""
            except Exception:  # noqa: BLE001
                continue
            frames.append({"pid": pid, "name": name, "tabs": tab_labels(frame)})

    print(json.dumps({"ok": True, "frames": frames}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
