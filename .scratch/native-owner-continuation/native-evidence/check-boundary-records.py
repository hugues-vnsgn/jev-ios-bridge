"""Check actual native encoder edge-boundary traces with host stream framing only."""
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path.cwd() / "spikes/native-owner/host"))
from study import _Stream, _Refusal, PREFIX, CLASS_COMPLETED
results = []
for name, reason in (("root32", "native-root-equal"), ("over32", "parent-limit")):
    path = Path(__file__).parent / (name + ".jsonl")
    data = path.read_bytes()
    rows = [json.loads(line) for line in data.splitlines()]
    edges = [r for r in rows if r["operation"] == "parent" and r["details"].get("phase") == "edge"]
    terminals = [r for r in rows if r["operation"] == "parent" and r["details"].get("phase") == "termination"]
    assert len(edges) == 32
    assert [r["details"]["edge"] for r in edges] == list(range(1, 33))
    assert len(terminals) == 1 and terminals[0]["details"]["reason"] == reason
    stream = _Stream(rows[0]["requestId"], "reference-study", lambda row: None)
    for line in data.splitlines():
        stream.feed("stdout", PREFIX + line + b"\n")
    try:
        stream.complete()
    except _Refusal as error:
        assert str(error) == "CLASS_COMPLETION_MISSING", str(error)
    else:
        raise AssertionError("Fixture alone must not certify class completion")
    stream.feed("stdout", CLASS_COMPLETED + b"\n")
    stream.complete()
    results.append({"path": str(path), "sha256": hashlib.sha256(data).hexdigest(),
        "records": len(rows), "edges": len(edges), "termination": reason,
        "parserAcceptedWithSyntheticHarnessFraming": True,
        "withoutClassMarker": "CLASS_COMPLETION_MISSING",
        "nativeProcessExitOrSettlementProven": False})
print(json.dumps(results, indent=2))
