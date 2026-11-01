#!/usr/bin/env python3
# ---
# summary: "enumerates Ghostty windows and their tab labels through AT-SPI for hidden-tab placement"
# read_when:
#   - "changing how the activity strip discovers tabs hidden behind another Ghostty tab"
# ---
"""Print one JSON document describing every AT-SPI frame of the given process ids.

Usage: ghostty-tab-inventory.py <pid> [<pid> ...]

Output: {"ok": true, "frames": [{"pid": int, "name": str, "tabs": [str, ...]}, ...]}
Failures emit {"ok": false, "stage": fixed_label, "reason": fixed_label}.
Exit 3 only when the AT-SPI Python bindings are unavailable; enumeration failures exit 1.
The script only reads accessibility state; it never activates, selects, or focuses anything.
"""

import json
import sys

MAX_NODES_PER_FRAME = 20000
MAX_DEPTH = 40


def fail(stage, reason, code=1):
    print(json.dumps({"ok": False, "stage": stage, "reason": reason}))
    return code


def main() -> int:
    try:
        import gi

        gi.require_version("Atspi", "2.0")
        from gi.repository import Atspi
    except Exception:  # noqa: BLE001 - any import failure means the capability is absent
        return fail("import", "bindings-unavailable", 3)

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
    stage = "desktop-lookup"
    try:
        desktop = Atspi.get_desktop(0)
        if desktop is None:
            return fail(stage, "desktop-unavailable")
        stage = "desktop-count"
        application_count = desktop.get_child_count()
        for index in range(application_count):
            stage = "desktop-index"
            application = desktop.get_child_at_index(index)
            if application is None:
                continue
            try:
                pid = application.get_process_id()
            except Exception:  # noqa: BLE001
                continue
            if pid not in pids:
                continue
            stage = "application-count"
            window_count = application.get_child_count()
            for window_index in range(window_count):
                stage = "application-index"
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
    except Exception as error:  # noqa: BLE001 - never report a partial top-level inventory
        reason = "access-denied" if isinstance(error, PermissionError) else "enumeration-failed"
        return fail(stage, reason)
    print(json.dumps({"ok": True, "frames": frames}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
