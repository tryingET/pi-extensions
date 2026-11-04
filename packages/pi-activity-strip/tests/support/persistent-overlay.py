"""Owned competing layer; not a controller/protocol mock. Terminate to release focus."""
import os
import sys
from pathlib import Path
import gi

assert os.environ.get("PI_ACTIVITY_STRIP_ISOLATED_GUI") == "1"
gi.require_version("Gtk", "4.0")
gi.require_version("Gtk4LayerShell", "1.0")
from gi.repository import Gtk, Gio, Gtk4LayerShell as Layer

app = Gtk.Application(application_id="org.ak8273.overlay", flags=Gio.ApplicationFlags.NON_UNIQUE)

def activate(application):
    window = Gtk.ApplicationWindow(application=application)
    Layer.init_for_window(window)
    assert Layer.is_layer_window(window), "overlay must be a real layer surface"
    Layer.set_namespace(window, "ak8273-overlay")
    Layer.set_layer(window, Layer.Layer.OVERLAY)
    Layer.set_keyboard_mode(window, Layer.KeyboardMode.EXCLUSIVE)
    Layer.set_exclusive_zone(window, 0)
    window.set_default_size(400, 120)
    receipt = Path(sys.argv[1])
    receipt.write_text("")
    entry = Gtk.Entry(placeholder_text="Owned AK8273 overlay typing receiver")
    entry.connect("changed", lambda widget: receipt.write_text(widget.get_text()))
    window.set_child(entry)
    window.present()
    entry.grab_focus()

app.connect("activate", activate)
app.run([])
