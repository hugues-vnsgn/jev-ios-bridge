#!/usr/bin/env python3
"""Run one authorized Root host gate and retain exact command/source provenance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['check', 'affected', 'proof'])
parser.add_argument('runtime', choices=['26', '24'])
parser.add_argument('--evidence', required=True)
parser.add_argument('--label', required=True)
args = parser.parse_args()
root = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
node = Path('/opt/homebrew/Cellar/node/26.8.1/bin/node') if args.runtime == '26' else Path('/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node')
os.umask(0o077)
evidence = Path(args.evidence).resolve()
evidence.mkdir(parents=True, exist_ok=True, mode=0o700)
assert not (evidence / (args.label + '.json')).exists(), 'Use a fresh label; preserve previous gate records'
env = dict(os.environ)
for key in ['TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS']:
    env.pop(key, None)
env['PATH'] = str(node.parent) + ':' + env.get('PATH', '')
env['HOST_EVIDENCE_DIR'] = str(evidence / (args.label + '-fault-traces'))
version = subprocess.check_output([str(node), '--version'], env=env, text=True).strip()
assert version == ('v26.8.1' if args.runtime == '26' else 'v24.0.0')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
tracked = subprocess.check_output(['git', 'ls-files', 'src', 'tests', 'docs', 'skills', 'scripts', '.github', 'package.json', 'package-lock.json', 'README.md', 'AGENTS.md', 'GLOSSARY.md', 'tsconfig.json', 'tsconfig.build.json'], cwd=root, text=True).splitlines()
def source_hashes():
    return {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in tracked if (root / p).is_file()}
before = source_hashes()
if args.mode == 'check':
    command = ['npm', 'run', 'check']
elif args.mode == 'affected':
    command = [str(node), '--import', 'tsx', '--test', 'tests/docs.test.ts', 'tests/observed-docs.test.ts', 'tests/observed-packaging.test.ts']
else:
    command = [str(node), 'tests/fixtures/observed-packaging/proof.mjs']
    env['JEV_PACKAGING_EVIDENCE_DIR'] = str(evidence / (args.label + '-installed'))
log = evidence / (args.label + '.log')
start = time.time()
with log.open('wb') as output:
    child = subprocess.Popen(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, umask=0o022)
    code = child.wait()
after = source_hashes()
raw = log.read_bytes()
counts = {}
for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
    matches = re.findall(r'(?m)^(?:# |ℹ )' + key + r' (\d+)\s*$', raw.decode('utf-8', errors='replace'))
    if matches:
        counts[key] = int(matches[-1])
record = {'owner': 'Root', 'scope': 'physical integrated host gate; whole H rows not inferred', 'mode': args.mode, 'label': args.label, 'commit': commit, 'cwd': str(root), 'command': command, 'node': version, 'nodeExecutable': str(node), 'evidenceParentUmask': '0077', 'childUmask': '0022', 'removedEnvironmentNames': ['TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS'], 'exit': code, 'durationSeconds': round(time.time() - start, 3), 'counts': counts, 'rawLog': str(log), 'rawSha256': hashlib.sha256(raw).hexdigest(), 'sourceBefore': before, 'sourceAfter': after, 'sourceUnchanged': before == after}
(evidence / (args.label + '.json')).write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({k: record[k] for k in ['mode', 'label', 'commit', 'node', 'exit', 'durationSeconds', 'counts', 'sourceUnchanged']}), flush=True)
assert before == after, 'Gate source drift: inspect before/after audit'
raise SystemExit(code)
