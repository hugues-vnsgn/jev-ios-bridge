"""Audit and preserve the closed integrated gates without copying dependency trees."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import zipfile

os.umask(0o077)
vault = Path(__file__).resolve().parent
root = vault.parents[2]
parent = root / '.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
destination = parent / 'root-tracked-final-gates'
assert not destination.exists()
candidate_path = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-tracked-binding/.scratch/installed-tracked-packaging-maxsockets1/candidate-source.json')
candidate = json.loads(candidate_path.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def regular_files(path):
    result = []
    links = []
    for directory, directories, files in os.walk(path, followlinks=False):
        for name in list(directories):
            p = Path(directory) / name
            if p.is_symlink():
                directories.remove(name)
                links.append({'path': str(p.relative_to(path)), 'target': os.readlink(p)})
        for name in files:
            p = Path(directory) / name
            if p.is_symlink():
                links.append({'path': str(p.relative_to(path)), 'target': os.readlink(p)})
            else:
                assert p.is_file(), p
                result.append(p)
    return sorted(result), sorted(links, key=lambda x: x['path'])

source = {p: sha(root / p) for p in candidate['source443']}
exceptions = ['tests/fixtures/observed-cli-server.ts', 'tests/observed-cli.test.ts', 'tests/observed-service.test.ts']
assert sorted(p for p in source if source[p] != candidate['source443'][p]) == exceptions
protected = {p: h for p, h in candidate['protected439'].items() if p not in exceptions}
assert len(protected) == 436 and all(source[p] == h for p, h in protected.items())
compiled = candidate['compiled69']
assert len(compiled) == 69 and all(sha(root / p) == h for p, h in compiled.items())
host_path = root / '.scratch/observed-integration/acceptance/host/accepted-host-freeze.json'
host = json.loads(host_path.read_text())['files']
assert len(host) == 15 and all(sha(root / p) == h for p, h in host.items())
product_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
assert product_commit == '48d4b95e319a2c1b24480be6f008f208acf4327c'
selection = []
gate_results = {}
distribution = {}
for runtime in ['26', '24']:
    label = 'tracked-root-final-node' + runtime + '-check'
    result = json.loads((vault / (label + '.json')).read_text())
    assert result['exit'] == 0 and result['sourceUnchanged']
    assert result['sourceBefore'] == source == result['sourceAfter']
    assert result['counts'] == {'tests': 2258, 'pass': 2258, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
    assert sha(vault / (label + '.log')) == result['rawSha256']
    gate_results[label] = {k: result[k] for k in ['node', 'exit', 'durationSeconds', 'counts', 'rawSha256', 'sourceUnchanged']}
    label = 'tracked-root-final-node' + runtime + '-proof'
    result = json.loads((vault / (label + '.json')).read_text())
    assert result['exit'] == 0 and result['sourceUnchanged']
    assert result['sourceBefore'] == source == result['sourceAfter']
    assert sha(vault / (label + '.log')) == result['rawSha256']
    proof = vault / (label + '-installed')
    summary = json.loads((proof / 'summary.json').read_text())
    assert summary['status'] == 'PASS' and summary['commandCount'] == 37
    assert summary['skips'] == 0 and summary['forbiddenEffects'] == 0
    commands = [json.loads(line) for line in (proof / 'commands.jsonl').read_text().splitlines()]
    assert len(commands) == 37 and all(item['signal'] is None for item in commands)
    assert [item['id'] for item in commands] == [str(i).zfill(3) for i in range(1, 38)]
    for item in commands:
        assert Path(item['stdout']).parent == proof and Path(item['stderr']).parent == proof
    for name in ['npm-forbidden.jsonl', 'plugin-forbidden.jsonl']:
        assert (proof / name).read_bytes() == b''
    payloads = [proof / 'build-source', proof / 'clean/node_modules/jev-ios-bridge',
                proof / 'build-source/build/plugin/jev-ios-bridge', proof / 'plugin']
    for payload in payloads:
        assert all(sha(payload / p) == h for p, h in compiled.items())
    archives = {}
    tarball = Path(summary['tarball']['path'])
    assert sha(tarball) == summary['tarball']['sha256']
    with tarfile.open(tarball) as archive:
        for p, h in compiled.items():
            member = archive.getmember('package/' + p)
            assert member.isfile()
            assert hashlib.sha256(archive.extractfile(member).read()).hexdigest() == h
    archives['npm'] = summary['tarball']
    plugin_zip = Path(summary['pluginZip']['path'])
    assert sha(plugin_zip) == summary['pluginZip']['sha256']
    with zipfile.ZipFile(plugin_zip) as archive:
        for p, h in compiled.items():
            names = [name for name in archive.namelist() if name == p or name.endswith('/' + p)]
            assert len(names) == 1, (p, names)
            assert hashlib.sha256(archive.read(names[0])).hexdigest() == h
    archives['plugin'] = summary['pluginZip']
    # Snapshot/package metadata, guides and skill content must match this checkout.
    snapshot_files, _ = regular_files(proof / 'build-source')
    snapshot_count = 0
    for p in snapshot_files:
        relative = p.relative_to(proof / 'build-source')
        if relative.parts[0] in ['build', 'dist', 'node_modules']:
            continue
        assert sha(p) == sha(root / relative), str(relative)
        snapshot_count += 1
    all_files, links = regular_files(proof)
    distribution[runtime] = {'summary': summary, 'commands': [{'id': x['id'], 'exit': x['exit'], 'signal': x['signal']} for x in commands],
        'compiledFilesPerPayload': 69, 'payloadCount': 4, 'archivesVerified': archives,
        'snapshotFilesMatched': snapshot_count,
        'files': {str(p.relative_to(proof)): {'sha256': sha(p), 'bytes': p.stat().st_size} for p in all_files},
        'linksRecordedNotFollowed': links}
    selection.extend(p for p in proof.iterdir() if p.is_file() and not p.is_symlink())
    for p in snapshot_files:
        relative = p.relative_to(proof / 'build-source')
        if relative.parts[0] not in ['build', 'node_modules']:
            selection.append(p)
    selection.append(plugin_zip)
    selection.extend(p for p in (proof / 'registry-cache/_logs').glob('*') if p.is_file() and not p.is_symlink())
    startup_label = 'tracked-root-final-node' + runtime + '-startup'
    startup = root / '.scratch/observed-run-vault/root-isolated-probes' / startup_label
    startup_result = json.loads((startup / 'result.json').read_text())
    assert startup_result['exit'] == 0 and startup_result['signal'] is None
    assert not startup_result['timedOut'] and startup_result['sourceUnchanged']
    assert startup_result['receivedSignal'] is None and startup_result['executionErrorType'] is None and startup_result['cleanupErrors'] == []
    for name in ['stdout', 'stderr']:
        assert sha(startup / name) == startup_result[name + 'Sha256']
    startup_summary = json.loads((startup / 'execution/summary.json').read_text())
    assert startup_summary['status'] == 'PASS'
    assert startup_summary['cliCommands'] == 2 and startup_summary['mcpCalls'] == 3
    assert startup_summary['sdkDriverChildEffects'] == 0 and startup_summary['productionAccountRootOperations'] == 0
    distribution[runtime]['startup'] = {'result': startup_result, 'summary': startup_summary}
    startup_files, startup_links = regular_files(startup)
    assert startup_links == []
    selection.extend(startup_files)

# Preserve both first full checks, the original failure, focused diagnostics, and final gates.
selection.extend(p for p in vault.iterdir() if p.is_file() and not p.is_symlink())
fault_links = {}
for folder in vault.glob('*-fault-traces'):
    files, links = regular_files(folder)
    selection.extend(files)
    fault_links[folder.name] = links
original_files, original_links = regular_files(vault / 'fixture-repair-originals')
assert original_links == []
selection.extend(original_files)
copied = {}
destination.mkdir(mode=0o700)
for p in sorted(set(selection)):
    assert p.is_file() and not p.is_symlink()
    relative = p.relative_to(root / '.scratch/observed-run-vault')
    target = destination / 'preserved' / relative
    target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    shutil.copyfile(p, target)
    os.chmod(target, 0o600)
    assert sha(target) == sha(p)
    copied[str(relative)] = {'sha256': sha(target), 'bytes': target.stat().st_size}
audit = {'status': 'PASS_WITH_NPM_MAXSOCKETS_1', 'productCommit': product_commit,
    'candidateCommit': candidate['candidateCommit'], 'candidateContextSha256': sha(candidate_path),
    'source443': source, 'candidateFilesMatched': 440, 'declaredFixtureExceptions': exceptions,
    'protectedFilesPreserved': 436, 'compiled69': compiled, 'originalHostFiles15': host,
    'fullChecks': gate_results, 'distribution': distribution,
    'copied': copied, 'faultLinksRecordedNotFollowed': fault_links,
    'scope': 'Fresh integrated full defaults/typecheck/build, clean npm/plugin and guarded startup. All proof files hashed; selected logs/snapshot/archive/fault evidence copied. Dependency trees and registry cache content remain private in the vault. Earlier failures remain preserved without a complete cause claim. Native compatibility, migration, app builds and L01-L05 DEFERRED/UNVERIFIED; full original ticket12 acceptance incomplete.'}
(destination / 'root-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
print(json.dumps({'status': audit['status'], 'productCommit': product_commit,
    'copiedFiles': len(copied), 'copiedBytes': sum(x['bytes'] for x in copied.values()),
    'manifestFiles': {k: len(v['files']) for k, v in distribution.items()},
    'rootAuditSha256': sha(destination / 'root-audit.json')}))
