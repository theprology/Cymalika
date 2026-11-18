import gi
gi.require_version('Gtk','3.0')
from gi.repository import Gtk
window=Gtk.Window(title='Cipher computer fixture')
box=Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
entry=Gtk.Entry();entry.set_text('before');entry.get_accessible().set_name('Cipher fixture entry')
button=Gtk.Button(label='Apply fixture');label=Gtk.Label(label='not applied')
button.connect('clicked',lambda _:label.set_text('Applied '+entry.get_text()))
for widget in (entry,button,label): box.pack_start(widget,True,True,0)
window.add(box);window.connect('destroy',Gtk.main_quit);window.show_all();Gtk.main()
