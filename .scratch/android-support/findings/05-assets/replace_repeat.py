"""Repeat each clear method N times; read the field right away and again after 1.5 s (late vs lost keys)."""
import json, sys, time
from text_tests import *

api = sys.argv[1]; N = int(sys.argv[2]); only = sys.argv[3:] 
methods = {
    "mcli keys ctrl+a backspace (one call)": lambda: keys("ctrl+a", "backspace"),
    "mcli keys ctrl+a; keys backspace": clear_ctrl_a,
    "adb keyevent MOVE_END + 40 DEL": lambda: adb("shell", "input", "keyevent", "KEYCODE_MOVE_END", *["KEYCODE_DEL"] * 40),
    "adb keyevent MOVE_HOME + 40 FORWARD_DEL": lambda: adb("shell", "input", "keyevent", "KEYCODE_MOVE_HOME", *["KEYCODE_FORWARD_DEL"] * 40),
    "adb keycombination 113 29; keyevent DEL": lambda: (adb("shell", "input", "keycombination", "113", "29"), adb("shell", "input", "keyevent", "KEYCODE_DEL")),
}
restart()
for target in (("rid", "field.plain"), ("desc", "classic.plain")):
    kw = {"rid": target[1]} if target[0] == "rid" else {"desc": target[1]}
    for name, fn in methods.items():
        if only and not any(o in name for o in only): continue
        now_ok = late_ok = 0; err = None
        for i in range(N):
            setup_old(**kw)
            time.sleep(0.3)
            try:
                fn()
            except RuntimeError as e:
                err = str(e)[:120]; break
            a1 = node_text(**kw)["text"]
            time.sleep(1.5)
            a2 = node_text(**kw)["text"]
            now_ok += a1 == ""; late_ok += a2 == ""
        out(test="replace-repeat", api=api, target=target[1], method=name, runs=N, cleared_at_once=now_ok, cleared_after_1_5s=late_ok, error=err)
