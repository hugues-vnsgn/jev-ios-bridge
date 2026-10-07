"""Validate actual native encoder records; supply only the harness framing."""
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path.cwd() / 'spikes/native-owner/host'))
from study import _Stream, _Refusal, PREFIX, CLASS_COMPLETED
results = []
for name in ('ordinary', 'pending'):
    path = Path(sys.argv[1]) / (name + '.jsonl')
    data = path.read_bytes()
    rows = [json.loads(line) for line in data.splitlines()]
    stream = _Stream(rows[0]['requestId'], 'reference-study', lambda row: None)
    for line in data.splitlines():
        stream.feed('stdout', PREFIX + line + b'\n')
    try:
        stream.complete()
    except _Refusal as error:
        assert str(error) == 'CLASS_COMPLETION_MISSING', str(error)
    else:
        raise AssertionError('Encoder-only fixtures must not certify test-class completion')
    # This is a framing test, not evidence of a native process/class exit.
    stream.feed('stdout', CLASS_COMPLETED + b'\n')
    stream.complete()
    counts = rows[-1]['details']['pointCallbacks']
    assert (counts['started'], counts['replyReceived'], counts['pending']) == (
        (2, 2, 0) if name == 'ordinary' else (1, 0, 1))
    results.append({'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(),
                    'records': len(rows), 'summary': counts,
                    'parserAcceptedWithSyntheticHarnessFraming': True,
                    'withoutClassMarker': 'CLASS_COMPLETION_MISSING',
                    'nativeProcessExitOrSettlementProven': False})
print(json.dumps(results, indent=2))
