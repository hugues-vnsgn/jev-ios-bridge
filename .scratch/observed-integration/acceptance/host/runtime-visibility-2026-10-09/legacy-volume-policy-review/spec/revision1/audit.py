"""Read retained repository evidence; write only this private review directory."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess

os.umask(0o077)
OUT = Path(__file__).resolve().parent
REPO = OUT.parents[7]
P = REPO / '.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
Q = P / 'operator-repaired-compatibility'
checks = []
inputs = {}

def digest(b):
    return hashlib.sha256(b).hexdigest()

def read(path):
    path = path.resolve()
    if not path.is_relative_to(REPO) or '.env' in path.parts:
        raise RuntimeError('Input outside authorized repository')
    b = path.read_bytes()
    inputs[str(path.relative_to(REPO))] = {'bytes': len(b), 'sha256': digest(b)}
    return b

def data(path):
    return json.loads(read(path))

def check(name, ok):
    checks.append({'name': name, 'pass': bool(ok)})

def save(name, obj):
    path = OUT / name
    path.write_text(json.dumps(obj, indent=2) + '\n')
    path.chmod(0o600)

proposal_rel = str((P / 'legacy-volume-policy-proposal.md').relative_to(REPO))
proposal = read(P / 'legacy-volume-policy-proposal.md')
base = 'e971d3312b595a5d841b1d70288302c40f7a5b70'
candidate = '91084c0c065373a978c8437f8f8362c4f5e4dbc9'
product = '3edf247ab44d3332bc4bab5f3a43104536d84ce9'
check('proposal exact frozen SHA', digest(proposal) == '94ab01cb03679e8f92008a874e90cddaaa970e509799bb3c380fbe060f6a028a')
check('proposal equals exact commit blob', proposal == subprocess.check_output(['git', 'show', candidate + ':' + proposal_rel], cwd=REPO))
check('approved Cryptex v3 exact hash', digest(read(P / 'cryptex-policy-proposal.md')) == 'e8cbff80f2a1610a6e0b4ec1b372086e490f0bc8a8030d6ecf2e5c7105859d13')
owner = data(P / 'owner-cryptex-trust-decision.json')
check('owner approves exact v3; Applications persists', owner['proposalSha256'] == 'e8cbff80f2a1610a6e0b4ec1b372086e490f0bc8a8030d6ecf2e5c7105859d13' and owner['separateApplicationsAuthorizationPersists'] is True)
source_rel = 'src/observed/allocation-config.ts'
check('current Source equals product commit', read(REPO / source_rel) == subprocess.check_output(['git', 'show', product + ':' + source_rel], cwd=REPO))

for rel in ['AGENTS.md', '.scratch/v1-release/map.md', 'docs/agents/issue-tracker.md', 'docs/agents/domain.md', 'GLOSSARY.md', '.scratch/observed-integration/evidence/allocation-contract.md', '.scratch/observed-integration/implementation-plan.md', '.scratch/observed-integration/issues/05-allocation-contract.md', '.scratch/observed-action-rollout/issues/07-allocation-orchestration.md', '.scratch/observed-action-rollout/issues/12-independent-review.md', '.scratch/observed-action-rollout/spec.md', '.scratch/observed-action-rollout/installed-cryptex-repair.md', 'tests/observed-allocation-config.test.ts', 'tests/observed-cryptex-runtime.test.ts', 'src/observed/installed-plist.ts', 'tests/installed-plist.test.ts']:
    read(REPO / rel)

root = data(P / 'root-repaired-compatibility-audit.json')
check('Root audit retained 2169 successful checks', len(root['checks']) == 2169 and all(c['pass'] is True for c in root['checks']))
for name, entry in root['files'].items():
    b = read(Q / name)
    check('Root receipt binding ' + name, len(b) == entry['bytes'] and digest(b) == entry['sha256'])
artifacts = data(Q / 'artifact-hashes.json')
for entry in artifacts['files']:
    b = read(Q / entry['path'])
    check('operator artifact ' + entry['path'], len(b) == entry['bytes'] and digest(b) == entry['sha256'])

captures = [data(Q / n) for n in ['source-hashes-before.json', 'source-hashes-after.json', 'completion-preservation.json']]
for group, count in [('source441', 441), ('compiled69', 69), ('originalHost15', 15), ('priorEvidence', 121)]:
    lists = [c['groups'][group]['files'] for c in captures]
    check(group + ' before/after/completion counts and matches', all(c['groups'][group]['count'] == count and c['groups'][group]['allMatch'] is True and len(c['groups'][group]['files']) == count for c in captures))
    expected = [{e['path']: e['expectedSha256'] for e in rows} for rows in lists]
    check(group + ' all three hash maps identical', expected[0] == expected[1] == expected[2])
    for entry in lists[0]:
        b = read(REPO / entry['path'])
        check(group + ' current bound path ' + entry['path'], len(b) == entry['bytes'] and digest(b) == entry['expectedSha256'])

result = data(Q / 'result.json')
fs = data(Q / 'filesystem-trace.json')
children = data(Q / 'child-receipts.json')
proc = data(Q / 'caller-process-trace.json')
metadata = data(Q / 'metadata-input-hashes.json')
summary = data(Q / 'summary.json')
command = data(Q / 'command.json')
context = data(Q / 'context.json')
cause = data(Q / 'first-confirmed-refusal.json')
check('one actual lookup/no guard mismatch/refusal', result['lookupCalls'] == 1 and result['guardFailures'] == [] and result['exactResult']['status'] == 'HOST_PREREQUISITE_MISSING' and result['exitCode'] == 3)
check('actual Source/fullHEAD binding', context['sourceProduct'] == product and context['fullIntegratedHead'] == base)
check('raw stdout/result same exact bytes', read(Q / 'stdout.txt') == read(Q / 'result.json'))
check('raw result filesystem/caller traces exact', result['fsTrace'] == fs and result['processTrace'] == proc)
check('no diskutil or Cryptex operation', all(c['kind'] == 'plutil' and c['argv'][0] == '/usr/bin/plutil' for c in children) and not any('/private/var/run/com.apple.security.cryptexd' in str(e.get('path', '')) for e in fs))
check('8197 filesystem / 134 caller / 402 input records', len(fs) == 8197 and len(children) == len(proc) == 134 and len(metadata) == 402)
check('summary outer actual close exit3', summary['lookupCalls'] == 1 and summary['childCount'] == 134 and summary['diskutilChildren'] == 0 and command['captureComplete'] is True and command['code'] == 3 and any(e['event'] == 'close' and e['code'] == 3 for e in command['events']))
volumes = [e for e in fs if e['method'] == 'readdir' and e['path'] == '/Library/Developer/CoreSimulator/Volumes']
check('actual immediate volume names', len(volumes) == 1 and volumes[0]['entries'] == ['iOS_22G86', 'iOS_23E254a'])
last = fs[-1]
check('first refusal genuine final lstat', last['sequence'] == 9002 and last['path'] == cause['firstConfirmedCause']['path'] and last['identity'] == cause['firstConfirmedCause']['identity'] and last['identity']['uid'] == 0 and last['identity']['gid'] == 80 and last['identity']['permissions'] == '0775' and last['identity']['type'] == 'directory' and last['identity']['isSymbolicLink'] is False)
check('strict predicate rejects genuine group write', last['identity']['mode'] & 0o022 == 0o020)
check('default runtime ENOENT is only failed filesystem event', [e['path'] for e in fs if e.get('ok') is False] == ['/Library/Developer/CoreSimulator/Profiles/Runtimes'])

expected_env = {'HOME': '/Users/hugues_mini', 'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'LANG': 'C', 'LC_ALL': 'C', 'DEVELOPER_DIR': '/Applications/Xcode.app/Contents/Developer'}
for i, (child, original, caller) in enumerate(zip(children, result['children'], proc)):
    check('child %03d actual close/fixed command/environment' % i, child['exitCode'] == 0 and child['signal'] is None and child['killCalls'] == [] and child['captureComplete'] is True and child['spawnOptions'] == {'shell': False, 'env': expected_env, 'stdio': ['ignore', 'pipe', 'pipe']} and child['argv'][1:6] == ['-convert', 'json', '-o', '-', '--'] and any(e['event'] == 'close' and e['code'] == 0 and e['signal'] is None for e in child['events']))
    check('child %03d caller exact result/options' % i, caller['argv'] == child['argv'] and caller['sharedSignal'] is True and caller['shell'] is False and caller['timeoutMs'] == 10000 and caller['maxOutputBytes'] == child['outputCap'] and caller['result']['exitCode'] == 0)
    for channel in ['stdout', 'stderr']:
        b = read(Q / child['rawFiles'][channel])
        check('child %03d %s raw original/retained/result/caller bytes' % (i, channel), b == base64.b64decode(original[channel + 'RetainedBase64']) and b == caller['result'][channel].encode() and len(b) == child[channel + 'OriginalBytes'] and digest(b) == child[channel + 'OriginalSha256'] == child['rawFiles'][channel + 'RetainedSha256'])
    expected_cap = 131072 if child['argv'][-1] == '/Applications/Xcode.app/Contents/Info.plist' else 65536
    check('child %03d unchanged exact Xcode cap' % i, child['outputCap'] == expected_cap and child['stdoutOriginalBytes'] + child['stderrOriginalBytes'] <= expected_cap)

for i, (record, original) in enumerate(zip(metadata, result['metadataInputs'])):
    b = read(Q / record['rawFile'])
    check('metadata %03d retained exact complete input' % i, b == base64.b64decode(original['retainedBytesBase64']) and len(b) == record['capturedBytes'] == record['totalReturnedBytes'] <= 65536 and digest(b) == record['retainedSha256'] == record['originalReturnedByteSha256'] and record['completeRead'] is True and record['captureComplete'] is True and all(r['requestedBytes'] <= 65536 for r in record['reads']))

xcode = json.loads(read(Q / children[0]['rawFiles']['stdout']))
check('fresh exact Xcode output receipt', children[0]['stdoutOriginalBytes'] == 77555 and children[0]['stdoutOriginalSha256'] == '3b78d94ef7ee6f9ab11db94a9b3aa2513c77668ff00fa3227a7a12186ac32d33' and xcode['CFBundleShortVersionString'] == '27.0')
check('new legacy mount proof remains absent', summary['diskutilChildren'] == 0 and cause['notReached']['mountProofQueries'] is True and cause['notReached']['runtimeCompatibilityFields'] is True)

audit = {'scope': 'Independent retained evidence audit; no test or native command run', 'base': base, 'proposalCommit': candidate, 'product': product, 'proposalSha256': digest(proposal), 'checks': checks, 'counts': {'checks': len(checks), 'pass': sum(c['pass'] for c in checks), 'fail': sum(not c['pass'] for c in checks), 'operatorArtifacts': len(artifacts['files']), 'retainedChildren': len(children), 'metadataReads': len(metadata), 'source': 441, 'compiled': 69, 'originalHost': 15, 'priorEvidence': 121}, 'qualifications': ['The 1999 default/installed proof claims are prior frozen acceptance, not new implementation checks.', 'Fresh repaired lookup Xcode JSON is complete raw 77555B; older phase5 retained JSON remains sanitized/reformatted, not a reconstruction.', 'Observed names and 0775 Profiles identity do not establish a legacy read-only mount.', 'Full namespace enumeration stability is a proposal completeness finding, not a claimed current Source implementation regression.']}
save('evidence-audit.json', audit)
save('inputs-manifest.json', {'scope': 'Exact repository inputs read and hash-bound by audit.py', 'files': inputs})
(OUT / 'proposal-frozen.md').write_bytes(proposal)
(OUT / 'proposal-frozen.md').chmod(0o600)
diff = subprocess.check_output(['git', 'diff', base + '...' + candidate, '--', proposal_rel], cwd=REPO)
(OUT / 'proposal.diff').write_bytes(diff)
(OUT / 'proposal.diff').chmod(0o600)
print(json.dumps(audit['counts']))
if any(not c['pass'] for c in checks):
    print(json.dumps([c for c in checks if not c['pass']]))
    raise SystemExit(1)
