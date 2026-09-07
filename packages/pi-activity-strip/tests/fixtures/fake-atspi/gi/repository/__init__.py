"""Fake gi.repository exposing an Atspi namespace backed by a JSON tree fixture."""

import json
import os


class _Node:
    def __init__(self, spec):
        self._spec = spec

    def get_role(self):
        return self._spec.get("role", "panel")

    def get_name(self):
        return self._spec.get("name", "")

    def get_process_id(self):
        return self._spec.get("pid", 0)

    def get_child_count(self):
        return len(self._spec.get("children", []))

    def get_child_at_index(self, index):
        return _Node(self._spec["children"][index])


class _Role:
    FRAME = "frame"
    PAGE_TAB = "page tab"


class Atspi:
    Role = _Role

    @staticmethod
    def get_desktop(_index):
        with open(os.environ["FAKE_ATSPI_TREE"], encoding="utf8") as handle:
            return _Node(json.load(handle))
