"""More clear methods, 10 runs each on the Compose field, plus typing into the uppercasing field."""
import sys, time
from text_tests import *

api = sys.argv[1]; N = int(sys.argv[2])
methods = {
    "mcli keys end + 20x backspace (one call)": lambda: keys("end", *["backspace"] * 20),
    "mcli keys ctrl+a; sleep 0.2; keys backspace": lambda: (keys("ctrl+a"), time.sleep(0.2), keys("backspace")),
    "mcli keys ctrl+a; keys backspace": clear_ctrl_a,
    "adb keyevent MOVE_END + 20 DEL": lambda: adb("shell", "input", "keyevent", "KEYCODE_MOVE_END", *["KEYCODE_DEL"] * 20),
}
restart()
for name, fn in methods.items():
    ok = 0; t = 0; fails = []
    for i in range(N):
        setup_old(rid="field.plain")
        time.sleep(0.3)
        t0 = time.time(); fn(); t += time.time() - t0
        v = node_text(rid="field.plain")["text"]
        ok += v == ""
        if v: fails.append(v)
    out(test="replace-repeat2", api=api, target="field.plain", method=name, runs=N, cleared=ok, mean_secs=round(t / N, 3), fails=fails)
for path in ("io text", "adb input text", "clipboard+ctrl+v"):
    res = []
    for i in range(3):
        focus(rid="field.upper"); keys("end", *["backspace"] * 20); time.sleep(0.3)
        s = "abc Def"
        if path == "io text": io_text(s)
        elif path == "adb input text": adb_text(s)
        else: mcli("io", "clipboard", "set", "--device", AVD, "--", s); keys("ctrl+v")
        time.sleep(0.5)
        res.append(echo("upper"))
    out(test="upper-field", api=api, path=path, sent="abc Def", echoes=res)
