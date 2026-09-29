"""Ticket 05: tap by coordinates vs by mobilecli ref, and swipes within an element's bounds."""
import json
import re
import sys
import time

from probe import AVD, adb, dump, find, mcli, tap, text_under, centre

PKG = "dev.jevbridge.actionsprobe"


def out(**kw):
    print(json.dumps(kw), flush=True)


def restart():
    adb("shell", "am", "force-stop", PKG)
    adb("shell", "am", "start", "-W", "-n", f"{PKG}/.MainActivity")
    time.sleep(1.0)


def json_dump():
    """mobilecli's default JSON dump, the one that carries @eN refs."""
    p, dt = mcli("dump", "ui", "--device", AVD)
    return json.loads(p.stdout)["data"]["elements"], dt


def flat(elements):
    for e in elements:
        yield e
        yield from flat(e.get("children") or [])


def ref_of(elements, ident):
    for e in flat(elements):
        if e.get("identifier") == ident:
            return e["ref"]


def nav(screen):
    nodes, _ = dump()
    tap(find(nodes, rid=f"nav.{screen}"))
    time.sleep(0.8)


def taps(api):
    restart()
    nav("anim")
    nodes, _ = dump()
    target = find(nodes, rid="anim.count.go")
    x, y = centre(target)
    for i in range(5):
        _, dt = mcli("io", "tap", f"{x},{y}", "--device", AVD)
        out(test="tap-speed", api=api, how="io tap x,y", secs=round(dt, 3))
    els, dtj = json_dump()
    _, dtr = dump()
    out(test="dump-speed", api=api, json_secs=round(dtj, 3), raw_secs=round(dtr, 3))
    ref = ref_of(els, "anim.count.go")
    for i in range(5):
        _, dt = mcli("io", "tap", ref, "--device", AVD)
        out(test="tap-speed", api=api, how="io tap @ref", ref=ref, secs=round(dt, 3))

    # Staleness: take refs and coordinates, then change the screen, then tap with the old ones.
    restart()
    nav("anim")
    time.sleep(1.8)
    els, _ = json_dump()
    ref = ref_of(els, "anim.count.go")
    nodes, _ = dump()
    old_xy = centre(find(nodes, rid="anim.count.go"))
    tap(find(nodes, rid="anim.toggle"))  # the panel slides in above "Count" and pushes it down
    time.sleep(1.5)
    els2, _ = json_dump()
    now_at_ref = [e for e in flat(els2) if e.get("ref") == ref]
    out(test="stale-ref", api=api, ref=ref, was="anim.count.go",
        now=(now_at_ref[0].get("identifier") or now_at_ref[0].get("label") or now_at_ref[0].get("text")) if now_at_ref else None)
    mcli("io", "tap", ref, "--device", AVD)
    time.sleep(2.0)
    nodes, _ = dump()
    out(test="stale-ref-tap", api=api, count_after=text_under(find(nodes, rid="anim.count")),
        panel_present=find(nodes, rid="anim.panel") is not None)
    new_xy = centre(find(nodes, rid="anim.count.go"))
    out(test="stale-coords", api=api, old_xy=old_xy, new_xy=new_xy)


def scroll_state(nodes):
    s = text_under(find(nodes, rid="scroll.state"))
    return dict((k, int(v)) for k, v in re.findall(r"(\w+\.\w+)=(\d+)", s))


def swipe_within(n, direction, frac=0.8, duration=None):
    """Swipe inside n's rect along its centre line, from (1-frac)/2+frac to (1-frac)/2 of the span."""
    r = n["rect"]
    x0, y0, w, h = r["x"], r["y"], r["width"], r["height"]
    cx, cy = x0 + w // 2, y0 + h // 2
    lo, hi = (1 - frac) / 2, (1 + frac) / 2
    pts = {
        "up": (cx, int(y0 + h * hi), cx, int(y0 + h * lo)),
        "down": (cx, int(y0 + h * lo), cx, int(y0 + h * hi)),
        "left": (int(x0 + w * hi), cy, int(x0 + w * lo), cy),
        "right": (int(x0 + w * lo), cy, int(x0 + w * hi), cy),
    }[direction]
    args = ["io", "swipe", ",".join(map(str, pts)), "--device", AVD]
    if duration:
        args += ["--duration", str(duration)]
    _, dt = mcli(*args)
    return dt, pts


def swipes(api):
    restart()
    nav("lists")
    plan = [
        ("list.lazy", ["up", "up", "down", "left"]),
        ("list.row", ["left", "left", "right", "up"]),
        ("list.column", ["up", "down", "left"]),
    ]
    for duration in (None, 300):
        restart()
        nav("lists")
        for rid, dirs in plan:
            for d in dirs:
                nodes, _ = dump()
                before = scroll_state(nodes)
                n = find(nodes, rid=rid)
                dt, pts = swipe_within(n, d, duration=duration)
                nodes, dtd = dump()
                right_after = scroll_state(nodes)
                time.sleep(1.5)
                nodes, _ = dump()
                later = scroll_state(nodes)
                out(test="swipe", api=api, element=rid, direction=d, duration_ms=duration or 1000, swipe_secs=round(dt, 3),
                    before=before, right_after=right_after, after_1_5s=later, dump_secs=round(dtd, 3))


if __name__ == "__main__":
    api = sys.argv[1]
    for part in sys.argv[2:]:
        {"taps": lambda: taps(api), "swipes": lambda: swipes(api)}[part]()
