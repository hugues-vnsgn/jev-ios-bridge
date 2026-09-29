"""Ticket 05: after an action, how long until captures stop changing? Back-to-back raw dumps for a few seconds.

For each scenario: do the action, then dump as fast as possible for WINDOW seconds, recording the time and a
signature of each capture. Then replay two settle rules on the recorded sequence:
  - "2 equal": stop at the first capture equal to the one before it;
  - "2 equal, 250 ms apart": the same, but only comparing captures at least 250 ms apart.
and report whether the stopping capture equals the final one (a false settle if not).
"""
import hashlib
import json
import sys
import time

from probe import AVD, adb, dump, find, mcli, tap, text_under, signature
from tap_swipe import swipe_within

PROBE = "dev.jevbridge.actionsprobe"
TWIN = "dev.jevbridge.diagnostic"
WINDOW = 3.0


def out(**kw):
    print(json.dumps(kw), flush=True)


def start(pkg, activity=".MainActivity"):
    adb("shell", "am", "force-stop", pkg)
    adb("shell", "am", "start", "-W", "-n", f"{pkg}/{activity}")
    time.sleep(1.5)


def sig(nodes):
    return hashlib.sha1(signature(nodes).encode()).hexdigest()[:8]


def record(action, note_fn=None):
    t0 = time.time()
    action()
    t_act = time.time() - t0
    seq = []
    while time.time() - t0 < WINDOW:
        ts = time.time()
        nodes, dt = dump()
        seq.append({"t": round(ts - t0, 3), "dump": round(dt, 3), "sig": sig(nodes), "note": note_fn(nodes) if note_fn else None})
    return t_act, seq


def rule(seq, min_gap):
    last = None
    for s in seq:
        if last is not None and s["t"] - last["t"] >= min_gap and s["sig"] == last["sig"]:
            return s
        if last is None or s["t"] - last["t"] >= min_gap:
            last = s
    return None


def summarise(name, api, anim, t_act, seq):
    final = seq[-1]["sig"]
    first_final = next(s["t"] for s in seq if all(x["sig"] == final for x in seq[seq.index(s):]))
    changes = sum(1 for a, b in zip(seq, seq[1:]) if a["sig"] != b["sig"])
    r = {}
    for label, gap in (("2 equal", 0.0), ("2 equal 250ms apart", 0.25)):
        s = rule(seq, gap)
        r[label] = None if s is None else {"stopped_at": s["t"], "false_settle": s["sig"] != final}
    out(test="settle", api=api, animations=anim, scenario=name, action_secs=round(t_act, 3), captures=len(seq),
        distinct_changes=changes, stable_from=first_final, rules=r,
        dump_secs_max=max(s["dump"] for s in seq), dump_secs_median=sorted(s["dump"] for s in seq)[len(seq) // 2],
        timeline=[(s["t"], s["sig"], s["note"]) for s in seq][:40])


def scenarios(api, anim):
    # 1. an 800 ms slide-in panel
    start(PROBE)
    nodes, _ = dump()
    tap(find(nodes, rid="nav.anim")); time.sleep(1.5)
    nodes, _ = dump()
    btn = find(nodes, rid="anim.toggle")

    def panel(nodes):
        p = find(nodes, rid="anim.panel")
        return None if p is None else p["rect"]["y"]
    summarise("panel slide-in 800ms", api, anim, *record(lambda: tap(btn), panel))

    # 2. a 1500 ms counter
    nodes, _ = dump()
    go = find(nodes, rid="anim.count.go")
    summarise("counter 0->100 over 1500ms", api, anim,
              *record(lambda: tap(go), lambda n: text_under(find(n, rid="anim.count"))))

    # 3. an infinite spinner: does the dump still return, and how fast?
    nodes, _ = dump()
    spin = find(nodes, rid="anim.spin")
    summarise("infinite spinner shown", api, anim, *record(lambda: tap(spin), lambda n: find(n, rid="anim.spinner") is not None))
    nodes, _ = dump()
    tap(find(nodes, rid="anim.spin"))

    # 4. a fast fling on a lazy list
    nodes, _ = dump()
    tap(find(nodes, rid="nav.lists")); time.sleep(1.5)
    nodes, _ = dump()
    lazy = find(nodes, rid="list.lazy")
    summarise("fling lazy list (300ms swipe)", api, anim,
              *record(lambda: swipe_within(lazy, "up", duration=300), lambda n: text_under(find(n, rid="scroll.state"))))

    # 5. Settings: open a sub-screen (activity transition)
    adb("shell", "am", "force-stop", "com.android.settings")
    adb("shell", "am", "start", "-W", "-a", "android.settings.SETTINGS")
    time.sleep(2.0)
    nodes, _ = dump()
    row = next((r for r in (find(nodes, text=t) for t in ("Network & internet", "Connected devices", "Display")) if r), None)
    if row:
        label = row.get("text")

        def screen(n):
            texts = [x.get("text") for x in n if x.get("text") and not x.get("_sysui")]
            return f"{len(texts)} texts, first: {texts[:2]}"
        summarise(f"Settings: tap '{label}' row", api, anim, *record(lambda: tap(row), screen))
    else:
        out(test="settle", api=api, scenario="Settings", error="no known row on screen")
    adb("shell", "am", "force-stop", "com.android.settings")

    # 6. the twin app: add an item (plain recomposition, no animation)
    start(TWIN)
    nodes, _ = dump()
    apple = find(nodes, rid="choose.apple")
    summarise("twin: tap Add Apple", api, anim, *record(lambda: tap(apple), lambda n: text_under(find(n, rid="selection.summary"))))


if __name__ == "__main__":
    scenarios(sys.argv[1], sys.argv[2])
