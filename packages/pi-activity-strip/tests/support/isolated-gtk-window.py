"""Private GTK fixture windows, not actual Ghostty/browser/Obsidian applications."""
import sys
import gi

gi.require_version("Gtk", "4.0")
from gi.repository import Gtk, Gio
from pathlib import Path

# Two admitted fixtures may have the same terminal app id, but must be separate owned processes.
app = Gtk.Application(application_id=sys.argv[1], flags=Gio.ApplicationFlags.NON_UNIQUE)

def activate(application):
    window = Gtk.ApplicationWindow(application=application, title=sys.argv[2])
    window.set_default_size(600, 500)
    entry = Gtk.Entry(placeholder_text="AK7114 isolated fixture; no operator data")
    if len(sys.argv) > 3:
        receipt = Path(sys.argv[3])
        receipt.write_text("")
        entry.connect("changed", lambda widget: receipt.write_text(widget.get_text()))
    window.set_child(entry)
    window.present()
    entry.grab_focus()

app.connect("activate", activate)
app.run([])
