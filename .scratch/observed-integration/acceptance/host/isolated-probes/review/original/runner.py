#!/usr/bin/env python3
"""Bounded host-only diagnostic/startup execution with contemporaneous provenance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['tarball', 'startup'])
parser.add_argument('runtime', choices=['26', '24'])
parser.add_argument('--label', required=True)
parser.add_argument('--installed-proof')
args = parser.parse_args()
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
with (directory / 'stdout').open('wb') as stdout, (directory / 'stderr').open('wb') as stderr:
    child = subprocess.Popen(command, cwd=cwd, env=env, stdout=stdout, stderr=stderr, umask=0o022, start_new_session=True)
    try:
        code = child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(child.pid, signal.SIGKILL)
        code = child.wait()
after = hashes()
receipt.update(exit=code if code >= 0 else None, signal=-code if code < 0 else None, timedOut=timed_out, durationSeconds=round(time.monotonic() - start, 3), sourceAfter=after, sourceUnchanged=before == after, stdoutSha256=digest(directory / 'stdout'), stderrSha256=digest(directory / 'stderr'), artifacts=[{'path': str(p.relative_to(directory)), 'sha256': digest(p), 'bytes': p.stat().st_size} for p in sorted(directory.glob('*.tgz'))])
(directory / 'result.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: receipt[k] for k in ['label', 'mode', 'node', 'exit', 'signal', 'timedOut', 'durationSeconds', 'sourceUnchanged']}), flush=True)
assert before == after, 'Source drift during isolated probe'
raise SystemExit(code if code >= 0 else 1)
