"""Throwaway harness for ticket 05. Drives one emulator through mobilecli 1.0.14 and adb.

Environment: source env.sh first (private adb server on 5099, sandboxed mobilecli).
Set SERIAL and AVD in the environment (for example emulator-5560 / jev-actions-api31).
"""
import json
import os
import subprocess
import sys
import time

ADB = os.path.expanduser("~/Library/Android/sdk/platform-tools/adb")
MCLI = "/tmp/jev-mcli-05/node_modules/@mobilenext/mobilecli-darwin-arm64/mobilecli-darwin-arm64"
SERIAL = os.environ["SERIAL"]
AVD = os.environ["AVD"]
assert os.environ.get("ANDROID_ADB_SERVER_PORT") == "5099", "source env.sh first"


def guard():
    out = subprocess.run([ADB, "-P", "5099", "devices"], capture_output=True, text=True).stdout
    for line in out.splitlines()[1:]:
        serial = line.split("\t")[0].strip()
        if serial and not serial.startswith("emulator-"):
            sys.exit(f"STOP: non-emulator device {serial} on port 5099")


def mcli(*args, check=True):
    guard()
    t0 = time.time()
    p = subprocess.run([MCLI, "--insecure-storage", *args], capture_output=True, text=True)
    dt = time.time() - t0
    if check and p.returncode != 0:
        raise RuntimeError(f"mobilecli {args} failed: {p.stdout} {p.stderr}")
    return p, dt


def adb(*args, check=True):
    t0 = time.time()
    p = subprocess.run([ADB, "-P", "5099", "-s", SERIAL, *args], capture_output=True, text=True)
    dt = time.time() - t0
    if check and p.returncode != 0:
        raise RuntimeError(f"adb {args} failed: {p.stdout} {p.stderr}")
    return p, dt


def dump():
    """Raw dump as a list of flat nodes (dicts), plus the time it took."""
    p, dt = mcli("dump", "ui", "--device", AVD, "--format", "raw")
    raw = json.loads(p.stdout)["data"]["rawData"]
    if raw.lstrip().startswith("<?xml"):
        raise RuntimeError("uiautomator fallback")
    tree = json.loads(raw)["hierarchy"]
    flat = []

    def walk(n, sysui):
        sysui = sysui or n.get("resource-id", "").startswith("com.android.systemui:")
        n["_sysui"] = sysui
        flat.append(n)
        for c in n.get("children") or []:
            walk(c, sysui)

    for h in tree:
        walk(h, False)
    return flat, dt


def find(nodes, rid=None, desc=None, text=None):
    for n in nodes:
        if rid and n.get("resource-id") == rid:
            return n
        if desc and n.get("content-desc") == desc:
            return n
        if text and n.get("text") == text:
            return n
    return None


def centre(n):
    r = n["rect"]
    return r["x"] + r["width"] // 2, r["y"] + r["height"] // 2


def text_under(n):
    """Text of the node, or of its first text descendant (Compose puts Text in a child)."""
    if n.get("text"):
        return n["text"]
    for c in n.get("children") or []:
        t = text_under(c)
        if t:
            return t
    return ""


def tap(n):
    x, y = centre(n)
    return mcli("io", "tap", f"{x},{y}", "--device", AVD)[1]


def signature(nodes):
    """What a capture 'looks like' for the settle rule: class, ids, texts, rects, states; status bar excluded."""
    keys = ("class", "text", "hint", "content-desc", "resource-id", "checked", "enabled", "selected", "focused", "rect")
    return json.dumps([[n.get(k) for k in keys] for n in nodes
                       if n.get("visible", True) and not n.get("_sysui")], sort_keys=True)


if __name__ == "__main__":
    nodes, dt = dump()
    print(f"{len(nodes)} nodes in {dt:.2f}s")
