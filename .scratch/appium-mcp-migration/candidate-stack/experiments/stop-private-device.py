"""Bounded shutdown/verification for the two fixed, privately created devices."""
import json
import importlib.util
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
spec = importlib.util.spec_from_file_location("stop_group", Path(__file__).with_name("stop-group.py"))
group_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(group_module)
processes = group_module.processes

preparation_path, platform, mode = sys.argv[1:]
preparation = json.loads(Path(preparation_path).read_text())
assert platform in ["ios", "android"] and mode in ["stop", "verify"]
assert preparation["ios"]["udid"] == "15013501-2535-42EB-A67F-45B015DF18F4", "Refuse foreign device"
assert preparation["android"]["name"] == "jev_appium_phase1_20261018", "Refuse foreign AVD"
assert preparation["android"]["serial"] == "emulator-5570", "Refuse foreign serial"
root = Path(preparation_path).resolve().parent.parent
assert Path(preparation["ios"]["set"]).resolve() == root / "runtime/devices/simulators", "Refuse foreign simulator set"
deadline = time.monotonic() + 90
receipt = {"version": 1, "kind": "private-device-shutdown", "platform": platform,
           "commands": [], "deviceOffline": False, "ownedPortsClosed": False, "leaseReleased": False}

def run(args, timeout=15):
    remaining = deadline - time.monotonic()
    assert remaining > 0, "Native stop deadline exceeded"
    result = subprocess.run(args, capture_output=True, text=True, timeout=min(timeout, remaining))
    record = {"args": args, "exitCode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    receipt["commands"].append(record)
    return record

def ios_state():
    result = run(["xcrun", "simctl", "--set", preparation["ios"]["set"], "list", "devices", "-j"])
    assert result["exitCode"] == 0
    devices = json.loads(result["stdout"])["devices"]
    owned = [item for entries in devices.values() for item in entries if item["udid"] == preparation["ios"]["udid"]]
    assert len(owned) == 1 and owned[0]["name"] == preparation["ios"]["name"]
    return owned[0]["state"]

def emulator_rows():
    pattern = r"-avd\s+" + re.escape(preparation["android"]["name"]) + r"(?:\s|$)"
    rows = [row for row in processes() if re.search(pattern, row["command"]) and not row["state"].startswith("Z")]
    for row in rows:
        row["incarnation"] = group_module.process_incarnation(row["pid"])
    return rows

if platform == "ios":
    receipt["device"] = preparation["ios"]["udid"]
    if mode == "stop" and ios_state() != "Shutdown":
        result = run(["xcrun", "simctl", "--set", preparation["ios"]["set"], "shutdown", receipt["device"]], 40)
        assert result["exitCode"] == 0
    ports = [18100, 18101]
else:
    receipt["device"] = preparation["android"]["name"]
    serial = preparation["android"]["serial"]
    listing = run(["adb", "devices"]); assert listing["exitCode"] == 0
    already_offline = not any(line.split() and line.split()[0] == serial for line in listing["stdout"].splitlines()) and not emulator_rows()
    receipt["alreadyOffline"] = already_offline
    if mode == "stop" and not already_offline:
        name = run(["adb", "-s", serial, "emu", "avd", "name"])
        assert name["exitCode"] == 0 and name["stdout"].splitlines()[0] == receipt["device"]
        receipt["emulatorBefore"] = emulator_rows()
        assert len(receipt["emulatorBefore"]) == 1, "Emulator process identity unverified"
        for package in ["io.appium.uiautomator2.server", "io.appium.uiautomator2.server.test", "io.appium.settings"]:
            installed = run(["adb", "-s", serial, "shell", "pm", "path", package]); assert installed["exitCode"] in [0, 1] and not installed["stderr"].strip()
            if not installed["stdout"].strip():
                continue
            result = run(["adb", "-s", serial, "shell", "am", "force-stop", package]); assert result["exitCode"] == 0
            result = run(["adb", "-s", serial, "shell", "pm", "disable-user", "--user", "0", package])
            assert result["exitCode"] == 0 and "disabled-user" in result["stdout"]
        forwards = run(["adb", "forward", "--list"]); assert forwards["exitCode"] == 0
        for local, remote in [("tcp:18200", "tcp:6790"), ("tcp:18201", "tcp:7810")]:
            matches = [line.split() for line in forwards["stdout"].splitlines() if len(line.split()) == 3 and line.split()[1] == local]
            assert all(row == [serial, local, remote] for row in matches), "Foreign forward; refuse removal"
            if matches:
                result = run(["adb", "-s", serial, "forward", "--remove", local]); assert result["exitCode"] == 0
        name = run(["adb", "-s", serial, "emu", "avd", "name"])
        assert name["exitCode"] == 0 and name["stdout"].splitlines()[0] == receipt["device"]
        current = emulator_rows()
        assert len(current) == 1 and current[0]["incarnation"] and all(current[0][key] == receipt["emulatorBefore"][0][key] for key in ["pid", "incarnation"]), "Emulator incarnation changed"
        result = run(["adb", "-s", serial, "emu", "kill"]); assert result["exitCode"] == 0
    ports = [18200, 18201, 5570, 5571]

def observe():
    if platform == "ios":
        state = ios_state()
        offline = state == "Shutdown"
        native = [row for row in processes() if preparation["ios"]["udid"] in row["command"] and not row["state"].startswith("Z")]
        offline = offline and not native
    else:
        result = run(["adb", "devices"]); assert result["exitCode"] == 0
        offline = not any(line.split() and line.split()[0] == serial for line in result["stdout"].splitlines())
        native = emulator_rows()
        state = "absent" if not native else "running"
        offline = offline and not native
    closed = []
    for port in ports:
        with socket.socket() as sock:
            sock.settimeout(0.5)
            closed.append(sock.connect_ex(("127.0.0.1", port)) != 0)
    return {"state": state, "deviceOffline": offline, "ownedPortsClosed": all(closed)}

receipt["observations"] = []
first = observe()
while mode == "stop" and not (first["deviceOffline"] and first["ownedPortsClosed"]):
    assert time.monotonic() < deadline, "Native stop deadline exceeded"
    time.sleep(0.25)
    first = observe()
for attempt in range(6):
    observation = first if attempt == 0 else observe()
    observation["elapsedSample"] = attempt
    receipt["observations"].append(observation)
    assert observation["deviceOffline"] and observation["ownedPortsClosed"], "Owned device or automation endpoint still active"
    if attempt < 5:
        time.sleep(1)
receipt["deviceOffline"] = True
receipt["ownedPortsClosed"] = True
print(json.dumps(receipt))
