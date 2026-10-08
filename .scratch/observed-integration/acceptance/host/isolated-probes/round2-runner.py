#!/usr/bin/env python3
"""Bounded host-only diagnostic/startup execution with contemporaneous provenance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['tarball', 'startup'])
parser.add_argument('runtime', choices=['26', '24'])
parser.add_argument('--label', required=True)
parser.add_argument('--installed-proof')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', args.label):
    parser.error('--label must be one nonempty filename component')
root = Path(__file__).resolve().parents[2]
node = Path('/opt/homebrew/Cellar/node/26.8.1/bin/node') if args.runtime == '26' else Path('/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node')
os.umask(0o077)
directory = root / '.scratch/observed-run-vault/root-isolated-probes' / args.label
directory.mkdir(parents=True, mode=0o700, exist_ok=False)
env = dict(os.environ)
removed = ['TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS']
for key in removed:
    env.pop(key, None)
env['PATH'] = str(node.parent) + ':' + env.get('PATH', '')
version = subprocess.check_output([str(node), '--version'], env=env, text=True).strip()
assert version == ('v26.8.1' if args.runtime == '26' else 'v24.0.0')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
helper = root / '.scratch/observed-integration/acceptance/host/faults/production-startup/review/final/probe.mjs'
guard = root / 'tests/fixtures/observed-packaging/guard.mjs'
tracked = subprocess.check_output(['git', 'ls-files', 'src', 'tests', 'scripts', 'docs/guide', 'skills', 'package.json', 'package-lock.json', 'README.md'], cwd=root, text=True).splitlines()
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def hashes():
    result = {p: digest(root / p) for p in tracked if (root / p).is_file()}
    result[str(helper.relative_to(root))] = digest(helper)
    result[str(Path(__file__).relative_to(root))] = digest(Path(__file__))
    return result
before = hashes()
if args.mode == 'tarball':
    cache = directory / 'registry-cache'
    assert not cache.exists()
    env.update(npm_config_cache=str(cache), npm_config_fetch_retries='0', npm_config_fetch_timeout='45000')
    npm = Path('/opt/homebrew/bin/npm').resolve()
    command = [str(node), str(npm), 'pack', 'mobilebuildmcp@2.7.1', '--ignore-scripts', '--json', '--pack-destination', str(directory), '--cache', str(cache), '--fetch-retries=0', '--fetch-timeout=45000', '--loglevel=silly', '--timing']
    cwd = directory
    timeout = 90
else:
    assert args.installed_proof, 'Startup probe requires a genuine completed installed proof'
    assert digest(helper) == 'bf3b8b89d0ad11b03a30be23f2501b8e40aad8cf293b0ba94ce978f943ba0a4c'
    assert digest(guard) == '000c19430aae956338a406a9b4daceb68e99eb76d70bc3a0340fccf52ae0d2f7'
    proof = Path(args.installed_proof).resolve()
    summary = json.loads((proof / 'summary.json').read_text())
    assert summary['status'] == 'PASS' and summary['node'] == version
    command = [str(node), str(helper), str(proof), str(directory / 'execution')]
    cwd = root
    timeout = 30
receipt = {'owner': 'Root', 'label': args.label, 'mode': args.mode, 'commit': commit, 'node': version, 'command': command, 'cwd': str(cwd), 'evidenceUmask': '0077', 'childUmask': '0022', 'removedEnvironmentNames': removed, 'timeoutSeconds': timeout, 'sourceBefore': before}
(directory / 'launch.json').write_text(json.dumps(receipt, indent=2) + '\n')
start = time.monotonic()
timed_out = False
child = None
code = None
execution_error = None
cleanup_errors = []
received_signal = None
def interrupted(signum, frame):
    global received_signal
    received_signal = signum
    raise InterruptedError('Owned host runner interrupted')
previous_handlers = {number: signal.getsignal(number) for number in [signal.SIGINT, signal.SIGTERM]}
for number in previous_handlers:
    signal.signal(number, interrupted)
try:
    with (directory / 'stdout').open('wb') as stdout, (directory / 'stderr').open('wb') as stderr:
        child = subprocess.Popen(command, cwd=cwd, env=env, stdout=stdout, stderr=stderr, umask=0o022, start_new_session=True)
        code = child.wait(timeout=timeout)
except subprocess.TimeoutExpired:
    timed_out = True
except BaseException as error:
    execution_error = error
finally:
    # Cleanup only this runner's new process group, including on SIGINT/SIGTERM.
    # Ignore repeat interruption while the bounded cleanup and receipt finish.
    for number in previous_handlers:
        signal.signal(number, signal.SIG_IGN)
    try:
        if child is not None and (timed_out or execution_error is not None):
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except OSError as error:
                cleanup_errors.append(type(error).__name__)
            try:
                code = child.wait(timeout=5)
            except BaseException as error:
                cleanup_errors.append(type(error).__name__)
        try:
            after = hashes()
        except BaseException as error:
            after = None
            cleanup_errors.append('SourceAudit:' + type(error).__name__)
        def output_digest(name):
            path = directory / name
            return digest(path) if path.is_file() else None
        receipt.update(exit=code if code is not None and code >= 0 else None,
                       signal=-code if code is not None and code < 0 else None,
                       timedOut=timed_out, receivedSignal=received_signal,
                       executionErrorType=type(execution_error).__name__ if execution_error else None,
                       cleanupErrors=cleanup_errors,
                       durationSeconds=round(time.monotonic() - start, 3),
                       sourceAfter=after, sourceUnchanged=before == after,
                       stdoutSha256=output_digest('stdout'), stderrSha256=output_digest('stderr'),
                       artifacts=[{'path': str(p.relative_to(directory)), 'sha256': digest(p), 'bytes': p.stat().st_size} for p in sorted(directory.glob('*.tgz'))])
        (directory / 'result.json').write_text(json.dumps(receipt, indent=2) + '\n')
    finally:
        for number, handler in previous_handlers.items():
            signal.signal(number, handler)
print(json.dumps({k: receipt[k] for k in ['label', 'mode', 'node', 'exit', 'signal', 'timedOut', 'durationSeconds', 'sourceUnchanged', 'executionErrorType', 'cleanupErrors']}), flush=True)
if received_signal:
    raise SystemExit(128 + received_signal)
if execution_error is not None:
    raise execution_error
if cleanup_errors:
    raise SystemExit(1)
assert before == after, 'Source drift during isolated probe'
raise SystemExit(code if code is not None and code >= 0 else 1)
