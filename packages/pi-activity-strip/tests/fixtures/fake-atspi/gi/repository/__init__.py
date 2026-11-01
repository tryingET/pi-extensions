"""Fake gi.repository exposing an Atspi namespace backed by a JSON tree fixture."""

import json
import os

PRIVATE_SENTINEL = "PRIVATE_ATSPI_SENTINEL/path/title/env"
if os.environ.get("FAKE_ATSPI_IMPORT_FAILURE") == "1":
    raise ImportError(PRIVATE_SENTINEL)


class _Node:
    def __init__(self, spec):
        self._spec = spec

    def _fault(self, operation):
        fault = self._spec.get("faults", {}).get(operation)
        if fault == "denied":
            raise PermissionError(PRIVATE_SENTINEL)
        if fault:
            raise RuntimeError(PRIVATE_SENTINEL)

    def get_role(self):
        self._fault("role")
        return self._spec.get("role", "panel")

    def get_name(self):
        self._fault("name")
        return self._spec.get("name", "")

    def get_process_id(self):
        self._fault("pid")
        return self._spec.get("pid", 0)

    def get_child_count(self):
        self._fault("count")
        return len(self._spec.get("children", []))

    def get_child_at_index(self, index):
        self._fault(f"index:{index}")
        child = self._spec["children"][index]
        return _Node(child) if child is not None else None


class _Role:
    FRAME = "frame"
    PAGE_TAB = "page tab"


class Atspi:
    Role = _Role

    @staticmethod
    def get_desktop(_index):
        with open(os.environ["FAKE_ATSPI_TREE"], encoding="utf8") as handle:
            tree = json.load(handle)
        if tree.get("desktop") == "raise":
            raise RuntimeError(PRIVATE_SENTINEL)
        if tree.get("desktop") == "none":
            return None
        return _Node(tree)
