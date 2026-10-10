#!/usr/bin/env python3
"""Execute a fixed Root gate with an explicitly recorded minimal environment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['check', 'proof', 'startup'])
parser.add_argument('runtime', choices=['26', '24'])
parser.add_argument('--label', required=True)
parser.add_argument('--installed-proof')
args = parser.parse_args()
assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', args.label)
os.umask(0o077)
directory = Path(__file__).resolve().parent
root = directory.parents[2]
env = {
    'HOME': '/Users/hugues_mini',
    'LANG': 'C', 'LC_ALL': 'C',
    'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    'NPM_CONFIG_USERCONFIG': str(directory / 'user.npmrc'),
    'NPM_CONFIG_GLOBALCONFIG': str(directory / 'global.npmrc'),
    'NPM_CONFIG_CACHE': str(directory / (args.label + '-outer-cache')),
    'npm_config_maxsockets': '1',
}
for name in ['user.npmrc', 'global.npmrc']:
    assert (directory / name).read_bytes() == b''
assert not Path(env['NPM_CONFIG_CACHE']).exists()
if args.mode == 'startup':
    assert args.installed_proof
    runner = root / '.scratch/observed-run-vault/root-isolated-probe-runner.py'
    expected = '42dedbf1e6936f6942794b88f1af2bffedd9ca95de3f67f46a8c80458beb8ab1'
    command = [sys.executable, str(runner), 'startup', args.runtime,
               '--label', args.label, '--installed-proof', args.installed_proof]
else:
    runner = root / '.scratch/observed-run-vault/root-gate-runner.py'
    expected = '1a64e2143b07c99532456bc215090ee0dfbf631624670d8b0b013be0c7727efc'
    command = [sys.executable, str(runner), args.mode, args.runtime,
               '--evidence', str(directory), '--label', args.label]
assert hashlib.sha256(runner.read_bytes()).hexdigest() == expected
record = {'scope': 'Integrated host/package validation; native/live deferred',
          'command': command, 'environment': env,
          'runnerSha256': expected,
          'configuration': 'Blank user/global npm config; npm maxsockets=1; no inherited credentials/loaders/proxies'}
with (directory / (args.label + '-environment.json')).open('x') as output:
    output.write(json.dumps(record, indent=2) + '\n')
os.chdir(root)
os.execve(sys.executable, command, env)
