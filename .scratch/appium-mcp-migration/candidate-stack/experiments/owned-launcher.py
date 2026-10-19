"""Create an isolated process group and persist its identity before exec."""
import json
import os
from pathlib import Path
import subprocess
import sys
import importlib.util
import uuid
import base64

spec = importlib.util.spec_from_file_location("owned_group", Path(__file__).with_name("stop-group.py"))
group = importlib.util.module_from_spec(spec)
spec.loader.exec_module(group)

os.umask(0o077)
record_path = Path(sys.argv[1]).resolve()
os.setsid()
birth = " ".join(subprocess.check_output(["ps", "-p", str(os.getpid()), "-o", "lstart="], text=True).split())
record = {"version": 1, "pid": os.getpid(), "pgid": os.getpgrp(), "sid": os.getsid(0), "birth": birth,
          "incarnation": group.process_incarnation(os.getpid()),
          "executable": str(Path(sys.argv[2]).resolve()), "script": str(Path(sys.argv[3]).resolve()), "members": []}
record["runMarker"] = uuid.uuid4().hex
record["launchChain"] = [{"pid": record["pid"], "incarnation": record["incarnation"]}]
os.environ["JEV_PHASE1_RUN_MARKER"] = record["runMarker"]
os.environ["JEV_PHASE1_ANCESTRY"] = base64.urlsafe_b64encode(json.dumps(record["launchChain"], separators=(",", ":")).encode()).decode()
assert record["pid"] == record["pgid"]
assert record["incarnation"]
with record_path.open("x") as file:
    json.dump(record, file)
    file.flush()
    os.fsync(file.fileno())
directory = os.open(record_path.parent, os.O_RDONLY)
try:
    os.fsync(directory)
finally:
    os.close(directory)
os.environ["JEV_STOP_GROUP_RECORD"] = str(record_path)
os.execv(sys.argv[2], sys.argv[2:])
