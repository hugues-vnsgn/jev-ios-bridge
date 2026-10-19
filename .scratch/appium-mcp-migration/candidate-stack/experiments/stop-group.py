"""Stop only a group created by owned-launcher.py, with incarnation checks."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import ctypes
import struct
import re

def is_shared_service(command):
    executable = command.split(None, 1)[0].rsplit('/', 1)[-1] if command.strip() else ''
    return executable in ['CoreSimulatorService', 'com.apple.CoreSimulator.CoreSimulatorService'] or (
        executable == 'adb' and re.search(r'\bfork-server\b.*\bserver\b', command) is not None)

def process_command(pid):
    result = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True, timeout=2)
    return result.stdout.strip() if result.returncode == 0 else None

def process_incarnation(pid):
    if sys.platform == "darwin":
        # Xcode's public sys/proc_info.h: PROC_PIDTBSDINFO=3, 136-byte
        # proc_bsdinfo, with start timeval at offset 120. Refuse short reads.
        library = ctypes.CDLL("/usr/lib/libproc.dylib")
        buffer = ctypes.create_string_buffer(136)
        count = library.proc_pidinfo(pid, 3, 0, buffer, 136)
        if count != 136:
            return None
        seconds, micros = struct.unpack_from("=QQ", buffer.raw, 120)
        return f"darwin:{seconds}:{micros}"
    if sys.platform.startswith("linux"):
        try:
            fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
            boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
            return f"linux:{boot}:{fields[19]}"
        except OSError:
            return None
    raise AssertionError("Process incarnation unavailable on this host")

def processes(pgid=None):
    args = ["ps", "-g", str(pgid)] if pgid is not None else ["ps", "-ax"]
    result = subprocess.run(args + ["-o", "pid=,ppid=,pgid=,stat=,lstart=,command="], capture_output=True, text=True, timeout=5)
    if result.returncode == 1 and not result.stdout.strip():
        return []
    result.check_returncode()
    output = result.stdout
    rows = []
    for line in output.splitlines():
        fields = line.split(None, 9)
        if len(fields) == 10:
            rows.append({"pid": int(fields[0]), "ppid": int(fields[1]), "pgid": int(fields[2]),
                         "state": fields[3], "birth": " ".join(fields[4:9]), "command": fields[9]})
    return rows

def stop_group(owner):
    pgid = owner["pgid"]
    assert owner["version"] == 1 and pgid == owner["pid"] and pgid > 1
    assert pgid != os.getpgrp(), "Refuse the controller's group"
    before = [row for row in processes(pgid) if row["pgid"] == pgid]
    for row in before:
        row["incarnation"] = process_incarnation(row["pid"])
    active = [row for row in before if not row["state"].startswith("Z")]
    assert owner.get("incarnation"), "Missing owner incarnation"
    expected = [{"pid": owner["pid"], "incarnation": owner["incarnation"]}] + owner["members"]
    leader = next((row for row in active if row["pid"] == owner["pid"]), None)
    if leader:
        assert leader["incarnation"] == owner["incarnation"] and owner["script"] in leader["command"], "Owner incarnation mismatch"
    receipt = {"groupStopped": False, "owner": owner, "before": before, "signals": []}
    for name, duration in [("SIGTERM", 3), ("SIGKILL", 3)]:
        if not active:
            break
        assert not any(is_shared_service(row['command']) for row in active), 'EXCLUDED_SHARED_SERVICE'
        assert all(any(row['pid'] == identity['pid'] and row['incarnation'] and row['incarnation'] == identity.get('incarnation')
                       for identity in expected) for row in active), 'UNATTESTED_GROUP_MEMBER'
        os.killpg(pgid, getattr(signal, name))
        receipt["signals"].append(name)
        end = time.monotonic() + duration
        while time.monotonic() < end:
            active = [row for row in processes(pgid) if row["pgid"] == pgid and not row["state"].startswith("Z")]
            for row in active:
                row["incarnation"] = process_incarnation(row["pid"])
            if not active:
                break
            time.sleep(0.1)
    receipt["after"] = [row for row in processes(pgid) if row["pgid"] == pgid]
    assert not any(not row["state"].startswith("Z") for row in receipt["after"]), "Owned group still active"
    receipt["groupStopped"] = True
    return receipt

if __name__ == "__main__":
    if sys.argv[1] == "identities":
        print(json.dumps([{"pid": int(pid), "incarnation": process_incarnation(int(pid))} for pid in sys.argv[2:]]))
    else:
        owner_path = Path(sys.argv[1])
        owner = json.loads(owner_path.read_text())
        records = [json.loads(file.read_text()) for file in sorted((owner_path.parent / 'components').glob('*.json'))]
        snapshot = owner_path.parent / 'descendants-before-stop.json'
        if snapshot.exists():
            records += [row for row in json.loads(snapshot.read_text()).get('candidates', []) if row.get('owned')]
        for row in records:
            assert row['ownerPid'] == owner['pid'] and row['ownerIncarnation'] == owner['incarnation'], 'FOREIGN_COMPONENT_RECORD'
        owner['members'] += [{'pid': row['pid'], 'incarnation': row['incarnation']} for row in records]
        print(json.dumps(stop_group(owner)))
