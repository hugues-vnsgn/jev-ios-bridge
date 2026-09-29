"""Ticket 05: replace text, exactness, reformatting and password fields, typing speed.

Needs the probe app (dev.jevbridge.actionsprobe) installed. Prints one JSON line per result.
"""
import json
import time

from probe import AVD, adb, dump, find, mcli, tap, text_under

PKG = "dev.jevbridge.actionsprobe"


def out(**kw):
    print(json.dumps(kw), flush=True)


def restart():
    adb("shell", "am", "force-stop", PKG)
    adb("shell", "am", "start", "-W", "-n", f"{PKG}/.MainActivity")
    time.sleep(1.0)


def node_text(rid=None, desc=None):
    nodes, _ = dump()
    n = find(nodes, rid=rid, desc=desc)
    return None if n is None else {"text": n.get("text"), "hint": n.get("hint")}


def echo(name):
    nodes, _ = dump()
    n = find(nodes, rid=f"echo.{name}")
    return text_under(n) if n else None


def focus(rid=None, desc=None):
    nodes, _ = dump()
    n = find(nodes, rid=rid, desc=desc)
    tap(n)
    time.sleep(0.4)


def io_text(s):
    return mcli("io", "text", "--device", AVD, "--", s)[1]


def keys(*k):
    return mcli("io", "keys", "--device", AVD, *k)[1]


def adb_escape(s):
    """Escape for `adb shell input text`: %s for spaces, then single-quote for the device shell."""
    return "'" + s.replace(" ", "%s").replace("'", "'\\''") + "'"


def adb_text(s):
    return adb("shell", "input", "text", adb_escape(s))[1]


def clear_ctrl_a():
    """Two separate calls: in one call, Compose often gets the backspace before the selection lands."""
    return keys("ctrl+a") + keys("backspace")


SPECIALS = [
    'Wi-Fi & 50% "off"',
    "a\"b'c$d&e;f|g\\h%i j ",
    "`~!@#*()<>?[]{}^=+_,./:",
    "50%s off",
    "  two  spaces",
]


def exactness():
    restart()
    focus(rid="field.plain")
    for s in SPECIALS:
        clear_ctrl_a()
        dt = io_text(s)
        got = echo("plain")
        out(test="exact.mcli", sent=s, echo=got, ok=(got == f"[{s}]"), secs=round(dt, 3))
    for s in SPECIALS:
        clear_ctrl_a()
        try:
            dt = adb_text(s)
            got = echo("plain")
            out(test="exact.adb", sent=s, echo=got, ok=(got == f"[{s}]"), secs=round(dt, 3))
        except RuntimeError as e:
            out(test="exact.adb", sent=s, error=str(e)[:200])


def setup_old(rid=None, desc=None, old="old value 123"):
    focus(rid=rid, desc=desc)
    clear_ctrl_a()
    io_text(old)


def replace_methods(api):
    restart()
    methods = {
        "mcli io keys ctrl+a backspace (one call)": lambda: keys("ctrl+a", "backspace"),
        "mcli io keys ctrl+a, then io keys backspace": clear_ctrl_a,
        "adb MOVE_END + 40x DEL (one call)": lambda: adb("shell", "input", "keyevent", "KEYCODE_MOVE_END", *["KEYCODE_DEL"] * 40)[1],
        "adb MOVE_HOME + 40x FORWARD_DEL": lambda: adb("shell", "input", "keyevent", "KEYCODE_MOVE_HOME", *["KEYCODE_FORWARD_DEL"] * 40)[1],
        "adb keyevent --longpress DEL": lambda: adb("shell", "input", "keyevent", "--longpress", "KEYCODE_DEL")[1],
        "adb keycombination 113 29 + DEL": lambda: (adb("shell", "input", "keycombination", "113", "29", check=False)[1]
                                                  + adb("shell", "input", "keyevent", "KEYCODE_DEL")[1]),
        "adb keyevent CTRL_LEFT A + DEL": lambda: adb("shell", "input", "keyevent", "KEYCODE_CTRL_LEFT", "KEYCODE_A", "KEYCODE_DEL")[1],
    }
    for target in (("rid", "field.plain"), ("desc", "classic.plain")):
        kw = {"rid": target[1]} if target[0] == "rid" else {"desc": target[1]}
        for name, fn in methods.items():
            setup_old(**kw)
            t0 = time.time()
            try:
                fn()
                err = None
            except RuntimeError as e:
                err = str(e)[:160]
            dt = time.time() - t0
            after = node_text(**kw)
            out(test="replace", api=api, target=target[1], method=name, after=after,
                cleared=(after is not None and after["text"] == ""), secs=round(dt, 3), error=err)
        # one-step replace: select all, then paste over the selection
        setup_old(**kw)
        t0 = time.time()
        keys("ctrl+a")
        mcli("io", "clipboard", "set", "--device", AVD, "--", "new text")
        keys("ctrl+v")
        dt = time.time() - t0
        after = node_text(**kw)
        out(test="replace", api=api, target=target[1], method="mcli ctrl+a, clipboard set, ctrl+v", after=after,
            replaced=(after is not None and after["text"] == "new text"), secs=round(dt, 3))
        mcli("io", "clipboard", "set", "--device", AVD, "--", " ")


def special_fields(api):
    restart()
    cases = [
        ("field.password", None, "Secr3t!"),
        (None, "classic.password", "Secr3t!"),
        ("field.phone", None, "5551234567"),
        ("field.phone", None, "555-12a34567890"),
        ("field.upper", None, "abc Def"),
        (None, "classic.plain", "hello"),
    ]
    for rid, desc, s in cases:
        focus(rid=rid, desc=desc)
        clear_ctrl_a()
        io_text(s)
        nodes, _ = dump()
        n = find(nodes, rid=rid, desc=desc)
        e = find(nodes, rid=f"echo.{rid.split('.')[1]}") if rid else None
        out(test="field", api=api, target=rid or desc, sent=s, node_text=n.get("text"), node_hint=n.get("hint"),
            echo=text_under(e) if e else None)
    # empty password field: what does the capture show?
    focus(rid="field.password")
    clear_ctrl_a()
    nodes, _ = dump()
    n = find(nodes, rid="field.password")
    out(test="field", api=api, target="field.password (empty)", node_text=n.get("text"), node_hint=n.get("hint"))


def speed(api):
    restart()
    focus(rid="field.plain")
    s17 = 'Wi-Fi & 50% "off"'
    s100 = ("The quick brown fox jumps over the lazy dog 0123456789 " * 2)[:100]
    for s in (s17, s100):
        for rep in range(3):
            clear_ctrl_a()
            dt = io_text(s)
            ok = echo("plain") == f"[{s}]"
            out(test="speed", api=api, path="mobilecli io text", chars=len(s), secs=round(dt, 3), ok=ok)
        for rep in range(3):
            clear_ctrl_a()
            dt = adb_text(s)
            ok = echo("plain") == f"[{s}]"
            out(test="speed", api=api, path="adb shell input text", chars=len(s), secs=round(dt, 3), ok=ok)
        for rep in range(3):
            clear_ctrl_a()
            t0 = time.time()
            mcli("io", "clipboard", "set", "--device", AVD, "--", s)
            keys("ctrl+v")
            dt = time.time() - t0
            ok = echo("plain") == f"[{s}]"
            out(test="speed", api=api, path="mobilecli io clipboard set + io keys ctrl+v", chars=len(s), secs=round(dt, 3), ok=ok)
    mcli("io", "clipboard", "set", "--device", AVD, "--", " ")
    # the single steps of a replace
    for rep in range(3):
        dt = clear_ctrl_a()
        out(test="speed", api=api, path="clear: io keys ctrl+a, then io keys backspace", secs=round(dt, 3))


if __name__ == "__main__":
    import sys
    api = sys.argv[1]
    for part in sys.argv[2:]:
        {"exact": exactness, "replace": lambda: replace_methods(api), "fields": lambda: special_fields(api),
         "speed": lambda: speed(api)}[part]()
