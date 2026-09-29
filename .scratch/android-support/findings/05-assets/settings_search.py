"""Settings search field (a classic EditText in another app): typing exactness and clearing."""
import sys, time
from probe import *
from text_tests import io_text, keys, clear_ctrl_a, out

api = sys.argv[1]
adb("shell", "am", "force-stop", "com.google.android.settings.intelligence")
adb("shell", "am", "start", "-W", "-a", "com.android.settings.action.SETTINGS_SEARCH")
time.sleep(2)
nodes, _ = dump()
field = next((n for n in nodes if n["class"].endswith("EditText")), None)
out(test="settings-search", api=api, field_id=field and field.get("resource-id"), hint=field and field.get("hint"), focused=field and field.get("focused"))
if field and not field.get("focused"):
    tap(field); time.sleep(0.5)
for s in ('Wi-Fi & 50% "off"', "a\"b'c$d&e;f|g\\h%i j "):
    clear_ctrl_a(); time.sleep(0.2)
    io_text(s); time.sleep(0.5)
    nodes, _ = dump()
    f = next(n for n in nodes if n["class"].endswith("EditText"))
    out(test="settings-search", api=api, sent=s, got=f.get("text"), ok=f.get("text") == s)
for name, fn in (("ctrl+a; backspace", clear_ctrl_a),
                 ("end + 30 backspace", lambda: keys("end", *["backspace"] * 30))):
    io_text("display"); time.sleep(0.3)
    fn(); time.sleep(0.3)
    nodes, _ = dump()
    f = next(n for n in nodes if n["class"].endswith("EditText"))
    out(test="settings-search-clear", api=api, method=name, text=f.get("text"), hint=f.get("hint"), cleared=f.get("text") == "")
adb("shell", "am", "force-stop", "com.google.android.settings.intelligence")
