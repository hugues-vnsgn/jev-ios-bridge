import datetime, hashlib, json, os, stat
from collections import defaultdict
from pathlib import Path

ROOT = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-legacy-binding')
PRIVATE = ROOT / '.scratch/installed-legacy-volume-runtime/review-correction'
os.umask(0o077)
def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b''): digest.update(data)
    return digest.hexdigest()
def put(name, value):
    path = PRIVATE / name
    with path.open('x') as stream: json.dump(value, stream, indent=2); stream.write('\n')
    path.chmod(0o600)
    return sha(path)
def metadata(path):
    info = path.lstat()
    return {'mode': f'{stat.S_IMODE(info.st_mode):04o}', 'uid': info.st_uid, 'gid': info.st_gid,
            'dev': str(info.st_dev), 'ino': str(info.st_ino), 'size': info.st_size,
            'nlink': info.st_nlink, 'mtimeNs': str(info.st_mtime_ns), 'ctimeNs': str(info.st_ctime_ns)}

excluded = {'evidence-manifest.json': 'This manifest cannot hash itself; bound by evidence-seal.json',
            'evidence-seal.json': 'Final seal cannot hash itself; consumer must rehash its supplied SHA256',
            'evidence-seal-FAIL.json': 'Absent unless sealing fails; no PASS seal on failure'}
try:
    assert not PRIVATE.is_symlink()
    assert not any((PRIVATE / name).exists() for name in excluded)
    verification = json.loads((PRIVATE / 'verification-index.json').read_text())
    context = json.loads((PRIVATE / 'candidate-source.json').read_text())
    assert verification['verdict'].startswith('AUTHOR VALIDATION PASS') and all(c['pass'] for c in verification['checks'])
    assert verification['candidateCommit'] == context['candidateCommit']
    regular, symlinks, directories = {}, {}, {}
    aliases = defaultdict(list)
    for directory, dirs, files in os.walk(PRIVATE, followlinks=False):
        directory = Path(directory)
        key = directory.relative_to(PRIVATE).as_posix()
        directories[key] = metadata(directory)
        assert stat.S_ISDIR(directory.lstat().st_mode)
        for name in list(dirs):
            path = directory / name
            if path.is_symlink():
                symlinks[path.relative_to(PRIVATE).as_posix()] = {'target': os.readlink(path), 'metadata': metadata(path),
                    'policy': 'Recorded only; never followed or chmodded'}
                dirs.remove(name)
        for name in files:
            path = directory / name; key = path.relative_to(PRIVATE).as_posix()
            assert '.env' not in path.relative_to(PRIVATE).parts
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode):
                symlinks[key] = {'target': os.readlink(path), 'metadata': metadata(path),
                                'policy': 'Recorded only; never followed or chmodded'}
            else:
                assert stat.S_ISREG(info.st_mode), 'Unexpected special evidence: ' + key
                regular[key] = {'sha256': sha(path), 'originalMetadata': metadata(path)}
                aliases[(info.st_dev, info.st_ino)].append(key)
    for identity, keys in aliases.items():
        assert all(regular[key]['originalMetadata']['nlink'] == len(keys) for key in keys), \
            'An evidence inode has a link outside the owned private tree: ' + repr(keys)
    # All modes below belong to this new evidence tree. Symlinks stay untouched.
    for key in directories: (PRIVATE if key == '.' else PRIVATE / key).chmod(0o700)
    for key in regular: (PRIVATE / key).chmod(0o600)
    for key, row in regular.items():
        assert sha(PRIVATE / key) == row['sha256']
        info = (PRIVATE / key).lstat(); assert stat.S_IMODE(info.st_mode) == 0o600
        row['sealedMetadata'] = metadata(PRIVATE / key)
    for key in directories:
        assert stat.S_IMODE((PRIVATE if key == '.' else PRIVATE / key).lstat().st_mode) == 0o700
    for key, row in symlinks.items():
        assert (PRIVATE / key).is_symlink() and os.readlink(PRIVATE / key) == row['target']
    context_sha = sha(PRIVATE / 'candidate-source.json')
    manifest = {'capturedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'candidateCommit': context['candidateCommit'],
                'candidateContextSha256': context_sha, 'privateRoot': str(PRIVATE),
                'regularFileCount': len(regular), 'symlinkCount': len(symlinks), 'directoryCount': len(directories),
                'regularFiles': dict(sorted(regular.items())), 'symlinks': dict(sorted(symlinks.items())),
                'originalDirectoryModes': dict(sorted(directories.items())), 'sealedDirectoryMode': '0700',
                'sealedRegularFileMode': '0600', 'exclusions': excluded,
                'operationalCachesAndLocks': 'Included as regular files; no cache/raw/log exclusions',
                'outsideTrees': 'Original author/integration/dependencies/.env are not traversed by this seal',
                'hardlinkGroups': [keys for keys in aliases.values() if len(keys) > 1]}
    manifest_sha = put('evidence-manifest.json', manifest)
    assert {p: sha(ROOT / p) for p in context['source443']} == context['source443']
    assert {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted((ROOT / 'dist').rglob('*'))
            if p.is_file() and not p.is_symlink()} == context['compiled69']
    seal = {'verdict': 'SEALED AUTHOR VALIDATION; independent reviews/installed/startup/native gates pending',
            'candidateCommit': context['candidateCommit'], 'candidateContextSha256': context_sha,
            'manifestSha256': manifest_sha, 'verificationIndexSha256': sha(PRIVATE / 'verification-index.json'),
            'implementationReportSha256': sha(PRIVATE / 'implementation-report.md'),
            'regressionMatrixSha256': sha(PRIVATE / 'correction-regression-matrix.json'),
            'regularFilesInManifest': len(regular), 'regularFilesIncludingManifestAndSeal': len(regular) + 2,
            'symlinks': len(symlinks), 'directories': len(directories),
            'source443StillFrozen': True, 'protected440StillFrozen': True, 'compiled69StillFrozen': True,
            'allRetainedRegularBytesRehashed': True, 'allRetainedSymlinkTargetsRecheckedWithoutFollowing': True,
            'fileMode': '0600', 'directoryMode': '0700', 'selfExclusion': excluded['evidence-seal.json']}
    seal_sha = put('evidence-seal.json', seal)
    print(json.dumps({'candidateCommit': context['candidateCommit'], 'regularFiles': len(regular) + 2,
                      'symlinks': len(symlinks), 'directories': len(directories),
                      'manifestSha256': manifest_sha, 'sealSha256': seal_sha}))
except Exception as error:
    if not (PRIVATE / 'evidence-seal-FAIL.json').exists():
        put('evidence-seal-FAIL.json', {'error': str(error), 'qualification': 'No complete PASS preservation seal'})
    raise
