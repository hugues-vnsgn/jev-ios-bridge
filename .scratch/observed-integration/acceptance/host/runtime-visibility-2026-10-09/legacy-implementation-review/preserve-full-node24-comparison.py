"""Preserve closed diagnostic evidence; no test or native process execution."""
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat

os.umask(0o077)
root = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
author = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
review = Path(__file__).resolve().parent
source = author / '.scratch/installed-legacy-volume-runtime/diagnostics/full-suite-node24'
destination = review.parent / 'legacy-candidate-evidence/diagnostics/full-suite-node24'
expected_seal = '16760bbcbd1d4df7fea62c3a15d705ff0d0aace7ddda72675878a0a0d388248e'
checks = []

def check(name, passed):
    checks.append({'name': name, 'pass': bool(passed)})
    assert passed, name

def digest(data):
    return hashlib.sha256(data).hexdigest()

def regular_read(path):
    for ancestor in [*reversed(path.parents), path]:
        info = ancestor.lstat()
        assert not stat.S_ISLNK(info.st_mode), str(ancestor)
        if ancestor != path:
            assert stat.S_ISDIR(info.st_mode), str(ancestor)
    before = path.lstat()
    assert stat.S_ISREG(before.st_mode), str(path)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        data = stream.read()
        final = os.fstat(stream.fileno())
    after = path.lstat()
    fields = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_size, s.st_nlink, s.st_mtime_ns, s.st_ctime_ns)
    assert fields(before) == fields(opened) == fields(final) == fields(after), str(path)
    return data

def safe_relative(name):
    p = PurePosixPath(name)
    assert name and not p.is_absolute() and '..' not in p.parts and str(p) == name, name
    return name

def create(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        assert path.is_relative_to(destination), str(path)
        assert regular_read(path) == data, str(path)
    else:
        with path.open('xb') as stream:
            stream.write(data)
    assert stat.S_IMODE(path.lstat().st_mode) == 0o600

seal_bytes = regular_read(source / 'evidence-manifest.json')
check('exact author whole-tree seal', digest(seal_bytes) == expected_seal)
seal = json.loads(seal_bytes)
check('12482 regular files and ten recorded links', len(seal['files']) == 12482 and len(seal['symlinksRecordedNotFollowed']) == 10)
check('only manifest self excluded', seal['otherExclusions'] == [])
check('Root destination fresh or qualified validated copy resume', not destination.exists() or (review / 'root-full-comparison-preservation-qualification.json').is_file())
found_regular, found_links = set(), {}
for directory, dirs, names in os.walk(source, followlinks=False):
    directory = Path(directory)
    assert stat.S_IMODE(directory.lstat().st_mode) == 0o700, str(directory)
    for name in list(dirs) + names:
        path = directory / name
        relative = str(path.relative_to(source))
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode):
            found_links[relative] = os.readlink(path)
            if name in dirs:
                dirs.remove(name)
        elif stat.S_ISREG(info.st_mode):
            found_regular.add(relative)
        else:
            assert stat.S_ISDIR(info.st_mode), relative
check('complete nonfollow inventory', found_regular == set(seal['files']) | {'evidence-manifest.json'} and set(found_links) == set(seal['symlinksRecordedNotFollowed']))
for name, target in found_links.items():
    record = seal['symlinksRecordedNotFollowed'][name]
    check('recorded link target ' + name, target == record['target'] and digest(target.encode()) == record['targetTextSha256'] and record['followed'] is False)

copied = []
for name, record in seal['files'].items():
    safe_relative(name)
    path = source / name
    data = regular_read(path)
    assert len(data) == record['bytes'] and digest(data) == record['sha256'], name
    assert stat.S_IMODE(path.lstat().st_mode) == 0o600, name
    target = destination / name
    create(target, data)
    assert digest(regular_read(target)) == record['sha256'], name
    copied.append({'path': str(target.relative_to(root)), 'authorRelativePath': name, 'sha256': record['sha256'], 'bytes': len(data)})
create(destination / 'evidence-manifest.json', seal_bytes)
copied.append({'path': str((destination / 'evidence-manifest.json').relative_to(root)), 'authorRelativePath': 'evidence-manifest.json', 'sha256': expected_seal, 'bytes': len(seal_bytes)})
check('all regular evidence independently rehashed and copied', len(copied) == 12483)

context = json.loads(regular_read(review / 'candidate-cli-context.json'))
baseline = json.loads(regular_read(review / 'baseline-oracle.json'))
result = json.loads(regular_read(destination / 'full-comparison-result.json'))
preflight = json.loads(regular_read(destination / 'preflight.json'))
check('exact fresh Node24', preflight['node24Version'] == result['freshNode24Version'] == 'v24.0.0')
records = {}
last = None
for cohort, count, vectors, cwd in [('baseline', 1999, baseline, root), ('candidate', 2198, context, author)]:
    command_path = destination / cohort / 'command.json'
    command = json.loads(regular_read(command_path))
    stdout = regular_read(destination / cohort / 'stdout.txt')
    stderr = regular_read(destination / cohort / 'stderr.txt')
    proof_path = destination / cohort / 'derived-build-proof.json'
    proof = json.loads(regular_read(proof_path))
    aggregate = result['cohorts'][cohort]
    source_vector = vectors['baselineSource441' if cohort == 'baseline' else 'source443']
    compiled = vectors['baselineCompiled69' if cohort == 'baseline' else 'compiled69']
    check(cohort + ' exact unmodified official argv and cwd', command['argv'] == preflight['exactFullCheckArgv'] == ['/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node', '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js', 'run', 'check'] and command['cwd'] == str(cwd))
    check(cohort + ' command/raw/aggregate hashes', digest(regular_read(command_path)) == aggregate['receiptSha256'] and digest(stdout) == command['stdoutSha256'] == aggregate['stdoutSha256'] and digest(stderr) == command['stderrSha256'] == aggregate['stderrSha256'])
    check(cohort + ' actual closed exit and serial order', command['exitCode'] == aggregate['exitCode'] == 0 and command['actualChildCloseUtc'] == aggregate['actualChildCloseUtc'] and (last is None or last <= command['startedAtUtc']))
    last = command['actualChildCloseUtc']
    counts = {}
    raw = stdout.decode()
    for key in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'):
        values = re.findall(r'(?m)^(?:# |ℹ )' + key + r' (\d+)\s*$', raw)
        assert values, key
        counts[key] = int(values[-1])
    check(cohort + ' raw counts and unchanged expectations', counts == {'tests': count, 'pass': count, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0} and all(command['counts'][k] == aggregate['counts'][k] == v for k, v in counts.items()))
    check(cohort + ' before/after exact Source and compiled vectors', command['sourceBefore'] == command['sourceAfter'] == source_vector and command['compiled69Before'] == command['compiled69After'] == compiled)
    check(cohort + ' current Source and compiled correspondence', all(digest(regular_read(cwd / p)) == h for p, h in {**source_vector, **compiled}.items()))
    check(cohort + ' retained scrubbed environment', 'HOST_EVIDENCE_DIR' in command['env'] and all(k not in command['env'] for k in ('TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS')))
    check(cohort + ' no source/timeout/concurrency repair or author signal', command['noTestFlagsOrTimeoutOrConcurrencyChanges'] and command['noAuthorSignalsOrRetries'])
    check(cohort + ' truthful preserved original false build field', command['defaultBuildReached'] is False and proof['originalReceiptBuildField'] is False)
    lines = raw.splitlines()
    check(cohort + ' actual raw build reached', proof['rawStdoutSha256'] == digest(stdout) and proof['buildReached'] and '\n> rm -rf dist && tsc -p tsconfig.build.json\n' in raw and all(lines[line['line'] - 1] == line['text'] for line in proof['actualRawBuildLines']))
    check(cohort + ' aggregate derived build proof bound', digest(regular_read(proof_path)) == aggregate['buildProofSha256'] and aggregate['buildReachedRawDerived'])
    records[cohort] = {'counts': counts, 'actualExit': 0, 'actualCloseUtc': last, 'receiptSha256': aggregate['receiptSha256'], 'stdoutSha256': digest(stdout), 'stderrSha256': digest(stderr), 'buildReachedRawDerived': True, 'originalReceiptBuildField': False, 'SourceCount': len(source_vector), 'compiledCount': len(compiled)}

check('failed default remains historically retained and cause unresolved', result['originalDefaultFailureRemainsPreserved'] and 'do not establish original causation' in result['causeQualification'] and result['nativeAccountDeviceSDKEnvOperationsByAuthor'] is False)
for name, record in result['priorImmutableEvidence'].items():
    prior_path = author / '.scratch/installed-legacy-volume-runtime' / name
    prior_bytes = regular_read(prior_path)
    prior = json.loads(prior_bytes)
    files = prior['immutableEvidenceFiles'] if 'immutableEvidenceFiles' in prior else prior['files']
    check('prior immutable parent preserved ' + name, digest(prior_bytes) == record['sha256'] and len(files) == record['immutableFilesRehashed'] and all(digest(regular_read(prior_path.parent / p)) == r['sha256'] for p, r in files.items()))
check('author seal still unchanged after copy', digest(regular_read(source / 'evidence-manifest.json')) == expected_seal)
index = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'status': 'PASS closed diagnostic evidence preservation', 'authorSealSha256': expected_seal, 'regularFilesWithSeal': len(copied), 'files': copied, 'symlinksRecordedNotRecreatedOrFollowed': seal['symlinksRecordedNotFollowed'], 'scope': 'Full diagnostic comparison only. Original failed default retained; lower cause unresolved. No native acceptance.'}
index_path = destination.parent / 'full-suite-preservation-index.json'
create(index_path, (json.dumps(index, indent=2) + '\n').encode())
audit = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'status': 'PASS evidence correspondence; fresh Node24 official comparison PASS', 'candidate': context['candidate'], 'records': records, 'checks': checks, 'preservationIndexSha256': digest(regular_read(index_path)), 'scope': index['scope'], 'rootIntegrationSourceUnchanged': True}
audit_path = review / 'root-full-node24-comparison-audit.json'
create(audit_path, (json.dumps(audit, indent=2) + '\n').encode())
print(json.dumps({'status': audit['status'], 'checks': len(checks), 'copiedRegularFiles': len(copied), 'recordedLinks': len(found_links), 'indexSha256': digest(regular_read(index_path)), 'auditSha256': digest(regular_read(audit_path))}))
