"""Private GTK fixture windows, not actual Ghostty/browser/Obsidian applications."""
import sys
import gi

gi.require_version("Gtk", "4.0")
from gi.repository import Gtk

app = Gtk.Application(application_id=sys.argv[1])

def activate(application):
    window = Gtk.ApplicationWindow(application=application, title=sys.argv[2])
    window.set_default_size(600, 500)
    window.set_child(Gtk.Entry(placeholder_text="AK7114 isolated fixture; no operator data"))
    window.present()

app.connect("activate", activate)
app.run([])
