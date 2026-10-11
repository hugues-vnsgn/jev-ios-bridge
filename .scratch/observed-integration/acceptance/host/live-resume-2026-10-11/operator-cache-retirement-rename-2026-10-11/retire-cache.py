#!/usr/bin/env python3
"""UNEXECUTED DRAFT. Exact JetBrains cache retirement, two approved phases.

Requires independent source review and an immutable plan digest per invocation.
No retry/resume mode. A failed delete may have already removed known entries.
"""
import ctypes
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import selectors
import signal
import stat
import subprocess
import sys
import time

SOURCE = '/Users/hugues_mini/Library/Caches/JetBrains'
PARENT = '/Users/hugues_mini/Library/Caches'
HELPER = pathlib.Path(__file__).resolve().parent.parent / 'cache-archive-draft/archive-cache.py'
HELPER_SHA = '1b585f7616e3856749f9d6457bb494f3283f496f174d14f1ecbfc65965635bb3'
RAW_HELPER = HELPER.read_bytes()
if hashlib.sha256(RAW_HELPER).hexdigest() != HELPER_SHA:
    raise RuntimeError('archive helper changed; review required')
# Execute exactly the hashed bytes; do not reread a potentially changed import path.
spec = importlib.util.spec_from_loader('reviewed_archive_helper', loader=None)
a = importlib.util.module_from_spec(spec)
exec(compile(RAW_HELPER, str(HELPER), 'exec'), a.__dict__)
PLAN = {}
LOGFD = None
OPCOUNT = 0


def event(kind, **fields):
    global OPCOUNT
    OPCOUNT += 1
    a.require(OPCOUNT <= PLAN['max_journal_events'], 'journal event bound')
    data = json.dumps({'event': kind, 'monotonic': time.monotonic(), **fields},
                      sort_keys=True, ensure_ascii=True).encode() + b'\n'
    a.write_all(LOGFD, data)
    os.fsync(LOGFD)


def read_json(parent, name, expected_sha, limit, parse=True):
    a.require(re.fullmatch('[0-9a-f]{64}', expected_sha), 'missing evidence SHA')
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        s = os.fstat(fd)
        a.require(stat.S_ISREG(s.st_mode) and s.st_uid == 501 and s.st_size <= limit,
                  'evidence type/owner/size')
        raw = bytearray()
        while True:
            a.tick()
            b = os.read(fd, 1048576)
            if not b:
                break
            raw.extend(b)
            a.require(len(raw) <= limit, 'evidence grew beyond limit')
        a.require(a.facts(os.fstat(fd)) == a.facts(s), 'evidence changed')
        a.require(hashlib.sha256(raw).hexdigest() == expected_sha, 'evidence digest mismatch')
        return json.loads(raw) if parse else bytes(raw)
    finally:
        os.close(fd)


def archive_proof(runfd):
    result = read_json(runfd, 'result.json', PLAN['archive_result_sha256'], PLAN['max_evidence_bytes'])
    before = read_json(runfd, 'source-before.json', PLAN['source_before_sha256'], PLAN['max_evidence_bytes'])
    after = read_json(runfd, 'source-after.json', PLAN['source_after_sha256'], PLAN['max_evidence_bytes'])
    original_plan = read_json(runfd, 'plan.json', PLAN['archive_plan_sha256'], 65536)
    a.require(original_plan['source'] == SOURCE and before == after,
              'wrong source or unmatched archive manifests')
    a.require(result['status'] == 'COPY_VERIFIED_SOURCE_RETAINED'
              and result['archive_sha256'] == PLAN['archive_sha256'], 'archive not accepted')
    a.require(0 < len(before) <= PLAN['max_entries'] and 'JetBrains' in before, 'manifest bound/root')
    for path, item in before.items():
        parts = path.split('/')
        a.require(parts[0] == 'JetBrains' and all(p not in ('', '.', '..') for p in parts)
                  and len(parts) <= PLAN['max_depth'] + 1, 'unsafe manifest path')
        a.require(item['type'] in ('file', 'dir', 'symlink') and item['identity']['uid'] == 501,
                  'unsafe manifest entry')
    fd = os.open('cache.tar.gz', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=runfd)
    try:
        s = os.fstat(fd)
        a.require(stat.S_ISREG(s.st_mode) and s.st_uid == 501 and s.st_size == result['archive_bytes']
                  and s.st_size <= PLAN['max_archive_bytes'], 'archive identity/size')
        h, count = hashlib.sha256(), 0
        while True:
            a.tick()
            b = os.read(fd, 1048576)
            if not b:
                break
            count += len(b)
            a.require(count <= s.st_size, 'archive grew')
            h.update(b)
        a.require(h.hexdigest() == PLAN['archive_sha256'] and a.facts(os.fstat(fd)) == a.facts(s),
                  'archive changed or hash mismatch')
        a.require(a.facts(os.stat('cache.tar.gz', dir_fd=runfd, follow_symlinks=False)) == a.facts(s),
                  'archive path changed')
        return before, fd, a.facts(s)
    except BaseException:
        os.close(fd)
        raise


def no_open_files(path):
    """lsof exit 1 + both streams empty is the sole accepted no-match outcome."""
    argv = ['/usr/sbin/lsof', '-nP', '+D', path]
    p = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, env=a.ENV, start_new_session=True)
    started, output = time.monotonic(), {'stdout': bytearray(), 'stderr': bytearray()}
    sel = selectors.DefaultSelector()
    for side in output:
        sel.register(getattr(p, side), selectors.EVENT_READ, side)
    try:
        while sel.get_map():
            a.tick()
            a.require(time.monotonic() - started < PLAN['command_seconds'], 'activity timeout')
            for key, _ in sel.select(0.2):
                b = os.read(key.fileobj.fileno(), 65536)
                if not b:
                    sel.unregister(key.fileobj)
                    continue
                output[key.data].extend(b)
                a.require(len(output[key.data]) <= PLAN['stderr_bytes'], 'activity output bound')
        p.wait(timeout=max(0.01, min(5, a.DEADLINE-time.monotonic())))
    except BaseException:
        try:
            os.killpg(p.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            p.wait(timeout=2)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid, signal.SIGKILL)
            p.wait()
        raise
    finally:
        sel.close()
        p.stdout.close()
        p.stderr.close()
        event('activity_settled', argv=argv, returncode=p.returncode,
              stdout_hex=output['stdout'].hex(), stderr_hex=output['stderr'].hex(),
              direct_child_waited=p.returncode is not None,
              descendant_settlement='not independently observed')
    a.require(p.returncode == 1 and not output['stdout'] and not output['stderr'],
              'activity check did not return clean no-match')


def activity_evidence(evidence):
    """Pin prior assessment bytes, then collect fresh executable names (never argv)."""
    root = str(pathlib.Path(__file__).resolve().parent.parent)
    path = PLAN['activity_evidence_path']
    a.require(isinstance(path, str) and path.startswith(root + '/')
              and os.path.normpath(path) == path, 'activity evidence outside repository receipt tree')
    fd = a.open_dir(os.path.dirname(path))
    try:
        raw = read_json(fd, os.path.basename(path), PLAN['activity_evidence_sha256'],
                        PLAN['max_evidence_bytes'], parse=False)
    finally:
        os.close(fd)
    a.save(evidence, 'activity-evidence-binding.json', {
        'path': path, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
        'scope': 'Root-approved prior assessment; fresh process and open-file checks follow'})
    ps = a.command(['/bin/ps', '-axo', 'uid=,comm='], output_limit=PLAN['stderr_bytes'])
    # Save the exact executable-name-only output before parsing/refusing it.
    a.save(evidence, 'ps-before.json', {'argv': ['/bin/ps', '-axo', 'uid=,comm='],
                                      'stdout_hex': ps.hex(), 'stdout_sha256': hashlib.sha256(ps).hexdigest()})
    executable_names = {
        'idea', 'idea64', 'intellij', 'intellijidea', 'pycharm', 'pycharm64',
        'webstorm', 'webstorm64', 'phpstorm', 'phpstorm64', 'clion', 'clion64',
        'goland', 'goland64', 'datagrip', 'datagrip64', 'rider', 'rider64',
        'rubymine', 'rubymine64', 'rustrover', 'rustrover64', 'fleet',
        'jetbrains_client', 'jetbrainsclient', 'jetbrains-gateway', 'gateway',
    }
    path_labels = ('jetbrains', 'intellij idea.app', 'intellij idea ce.app', 'pycharm.app',
                   'pycharm ce.app', 'webstorm.app', 'phpstorm.app', 'clion.app',
                   'goland.app', 'datagrip.app', 'rider.app', 'rubymine.app',
                   'rustrover.app', 'fleet.app', 'jetbrains gateway.app')
    count = 0
    for line in ps.decode('utf-8', errors='strict').splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r'\s*([+-]?\d+)\s+(.+?)\s*', line)
        a.require(match is not None, 'unrecognized ps executable-name record')
        uid, executable = int(match.group(1)), match.group(2)
        # Signed UIDs such as -2 are valid macOS process metadata. Check every UID.
        name = os.path.basename(executable).lower()
        a.require(name not in executable_names and not any(label in executable.lower() for label in path_labels),
                  'JetBrains-related executable is active')
        count += 1
    a.require(count > 0, 'empty process inventory')
    event('process_activity_checked', records=count,
          qualification='Known executable-name absence is a point-in-time assessment, not proof against future writers')


def inventory(path, rootfacts):
    a.PLAN['source_identity'] = rootfacts
    actual = a.inventory(path)
    root = os.path.basename(path)
    return {'JetBrains' + key[len(root):]: value for key, value in actual.items()}


def absent(parent, name):
    try:
        os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return
    raise RuntimeError('path must be absent: ' + name)


def rename_phase(parent, before, evidence):
    a.require(a.facts(os.stat('JetBrains', dir_fd=parent, follow_symlinks=False)) == before['JetBrains']['identity'],
              'source root changed')
    no_open_files(SOURCE)
    a.require(inventory(SOURCE, before['JetBrains']['identity']) == before, 'source changed since archive')
    wrapper = PLAN['wrapper_name']
    absent(parent, wrapper)
    event('mkdir_intent', name=wrapper)
    os.mkdir(wrapper, 0o700, dir_fd=parent)
    wrapperfd = os.open(wrapper, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        w = a.facts(os.fstat(wrapperfd))
        a.require(w['uid'] == 501 and w['mode'] == 0o40700 and w['dev'] == before['JetBrains']['identity']['dev'],
                  'unexpected wrapper identity')
        event('mkdir_complete', identity=w)
        absent(wrapperfd, 'source')
        a.require(a.facts(os.stat('JetBrains', dir_fd=parent, follow_symlinks=False)) == before['JetBrains']['identity'],
                  'source changed before rename')
        libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
        fn = libc.renameatx_np
        fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        fn.restype = ctypes.c_int
        event('rename_intent', source=SOURCE, destination=PARENT + '/' + wrapper + '/source')
        # Darwin stdio.h RENAME_EXCL = 0x00000004; never fall back to overwriting rename.
        rc = fn(parent, b'JetBrains', wrapperfd, b'source', 0x00000004)
        if rc != 0:
            errno = ctypes.get_errno()
            raise OSError(errno, os.strerror(errno))
        moved = a.facts(os.stat('source', dir_fd=wrapperfd, follow_symlinks=False))
        expected = dict(before['JetBrains']['identity'])
        expected['ctime_ns'] = moved['ctime_ns']
        a.require(moved == expected, 'unexpected root change during rename')
        event('rename_complete', root_before=before['JetBrains']['identity'], root_after=moved)
        absent(parent, 'JetBrains')
        a.save(evidence, 'result.json', {'status': 'RETIRED_SOURCE_RETAINED', 'source': SOURCE,
               'wrapper_name': wrapper, 'wrapper_identity': a.facts(os.fstat(wrapperfd)),
               'root_before': before['JetBrains']['identity'], 'root_after': moved,
               'archive_sha256': PLAN['archive_sha256'], 'removed_entries': 0})
    finally:
        os.close(wrapperfd)


def delete_phase(parent, before, evidence, archive_run):
    rename_dir = PLAN['rename_evidence_name']
    a.require(re.fullmatch('rename-[a-z0-9-]{1,64}', rename_dir), 'bad rename evidence name')
    rfd = os.open(rename_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=archive_run)
    try:
        rename = read_json(rfd, 'result.json', PLAN['rename_result_sha256'], 65536)
        completion = read_json(rfd, 'completion.json', PLAN['rename_completion_sha256'], PLAN['max_evidence_bytes'])
        a.require(completion['status'] == 'PHASE_COMPLETED' and completion['phase'] == 'rename',
                  'rename phase did not complete')
        absent(rfd, 'failure.json')
    finally:
        os.close(rfd)
    a.require(rename['status'] == 'RETIRED_SOURCE_RETAINED' and rename['source'] == SOURCE
              and rename['wrapper_name'] == PLAN['wrapper_name']
              and rename['archive_sha256'] == PLAN['archive_sha256']
              and rename['root_before'] == before['JetBrains']['identity'], 'rename proof mismatch')
    rebased = json.loads(json.dumps(before))
    rebased['JetBrains']['identity'] = rename['root_after']
    expected_root = dict(before['JetBrains']['identity'])
    expected_root['ctime_ns'] = rename['root_after']['ctime_ns']
    a.require(expected_root == rename['root_after'], 'unapproved root rebind')
    wrapper = PLAN['wrapper_name']
    retired = PARENT + '/' + wrapper + '/source'
    absent(parent, 'JetBrains')
    no_open_files(retired)
    a.require(inventory(retired, rename['root_after']) == rebased, 'retired tree differs from archive')
    absent(parent, 'JetBrains')
    wrapperfd = os.open(wrapper, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    removed = 0
    removed_paths = set()
    children = {}
    hardlink_groups = {}
    for path, item in rebased.items():
        if '/' in path:
            dirname, name = path.rsplit('/', 1)
            children.setdefault(dirname, set()).add(name)
        if item['type'] == 'file':
            hardlink_groups.setdefault((item['identity']['dev'], item['identity']['ino']), []).append(path)

    def remove(parentfd, name, path):
        nonlocal removed
        a.tick()
        absent(parent, 'JetBrains')
        expected = rebased[path]
        s = os.stat(name, dir_fd=parentfd, follow_symlinks=False)
        a.require(a.facts(s) == expected['identity'], 'entry changed before removal')
        if expected['type'] == 'dir':
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parentfd)
            try:
                a.require(a.facts(os.fstat(fd)) == expected['identity'], 'directory open race')
                remaining = set(children.get(path, set()))
                for child in sorted(remaining):
                    a.require(set(os.listdir(fd)) == remaining, 'unknown or missing child')
                    remove(fd, child, path + '/' + child)
                    remaining.remove(child)
                a.require(not os.listdir(fd), 'directory not empty')
                a.require(a.identity(os.fstat(fd)) == a.identity(s)
                          and a.identity(os.stat(name, dir_fd=parentfd, follow_symlinks=False)) == a.identity(s),
                          'directory replaced')
                event('rmdir_intent', path=path, identity=a.facts(os.fstat(fd)))
                os.rmdir(name, dir_fd=parentfd)
                removed += 1
                event('rmdir_complete', path=path)
            finally:
                os.close(fd)
        else:
            held = None
            try:
                if expected['type'] == 'file':
                    held = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parentfd)
                    a.require(a.facts(os.fstat(held)) == expected['identity'], 'file open race')
                else:
                    a.require(os.readlink(name, dir_fd=parentfd) == expected['target'], 'link changed')
                a.require(a.facts(os.stat(name, dir_fd=parentfd, follow_symlinks=False)) == expected['identity'],
                          'leaf changed before unlink')
                event('unlink_intent', path=path, identity=expected['identity'])
                a.require(a.facts(os.stat(name, dir_fd=parentfd, follow_symlinks=False)) == expected['identity'],
                          'leaf changed after journaling intent')
                os.unlink(name, dir_fd=parentfd)
                removed += 1
                removed_paths.add(path)
                if held is not None:
                    changed = a.facts(os.fstat(held))
                    known = dict(expected['identity'])
                    known['nlink'] -= 1
                    known['ctime_ns'] = changed['ctime_ns']
                    a.require(changed == known, 'unexpected inode change after unlink')
                    # Our unlink changes nlink/ctime for other names of this same inode.
                    for otherpath in hardlink_groups[(changed['dev'], changed['ino'])]:
                        if otherpath not in removed_paths:
                            rebased[otherpath]['identity'] = dict(changed)
                    event('known_unlink_inode_update', path=path, identity=changed)
                event('unlink_complete', path=path)
            finally:
                if held is not None:
                    os.close(held)
    try:
        a.require(a.facts(os.fstat(wrapperfd)) == rename['wrapper_identity'], 'wrapper changed')
        a.require(os.listdir(wrapperfd) == ['source'], 'unexpected wrapper contents')
        remove(wrapperfd, 'source', 'JetBrains')
        a.require(not os.listdir(wrapperfd), 'wrapper not empty')
        a.require(a.identity(os.stat(wrapper, dir_fd=parent, follow_symlinks=False)) == a.identity(os.fstat(wrapperfd)),
                  'wrapper replaced')
        event('wrapper_rmdir_intent', name=wrapper)
        os.rmdir(wrapper, dir_fd=parent)
        event('wrapper_rmdir_complete', name=wrapper)
        a.save(evidence, 'result.json', {'status': 'RETIRED_MANIFEST_REMOVED_ARCHIVE_RETAINED',
               'removed_manifest_entries': removed, 'archive_sha256': PLAN['archive_sha256'],
               'new_normal_cache_modified': False, 'capacity_recheck_required': True})
    finally:
        os.close(wrapperfd)


def main():
    global PLAN, LOGFD
    a.require(len(sys.argv) == 3 and re.fullmatch('[0-9a-f]{64}', sys.argv[2]),
              'usage: retire-cache.py APPROVED_PLAN.json APPROVED_PLAN_SHA256')
    fd = os.open(sys.argv[1], os.O_RDONLY | os.O_NOFOLLOW)
    try:
        s = os.fstat(fd)
        a.require(stat.S_ISREG(s.st_mode) and s.st_uid == 501 and s.st_size <= 65536, 'plan type/size')
        raw = os.read(fd, 65537)
        a.require(a.facts(os.fstat(fd)) == a.facts(s) and hashlib.sha256(raw).hexdigest() == sys.argv[2],
                  'plan digest/identity changed')
    finally:
        os.close(fd)
    PLAN = json.loads(raw)
    a.require(PLAN['version'] == 1 and PLAN['source'] == SOURCE and PLAN['mode'] in ('rename', 'delete')
              and PLAN['inactivity_confirmed'] is True and PLAN['writer_stop_contract'], 'unapproved scope')
    a.require(isinstance(PLAN['activity_evidence_path'], str)
              and re.fullmatch('[0-9a-f]{64}', PLAN['activity_evidence_sha256']), 'missing activity evidence binding')
    a.require(re.fullmatch('[a-z0-9-]{1,64}', PLAN['archive_run'])
              and re.fullmatch('[a-z0-9-]{1,64}', PLAN['attempt'])
              and re.fullmatch(r'\.jev-retired-jetbrains-[a-z0-9-]{1,64}', PLAN['wrapper_name']), 'invalid name')
    for key in ('max_depth', 'max_entries', 'max_source_bytes', 'max_archive_bytes', 'max_evidence_bytes',
                'max_journal_events', 'stderr_bytes', 'command_seconds', 'total_seconds'):
        a.require(type(PLAN[key]) is int and PLAN[key] > 0, 'missing finite bound: ' + key)
    a.require(PLAN['max_journal_events'] >= PLAN['max_entries'] * 3 + 20, 'insufficient journal bound')
    a.require(os.getuid() == 501 and os.geteuid() == 501, 'normal owner required')
    os.umask(0o077)
    a.PLAN = dict(PLAN)
    a.DEADLINE = time.monotonic() + PLAN['total_seconds']
    mount = a.destination_gate()
    archive_parent = a.open_dir(a.ARCHIVE)
    archive_run = parent = evidence = archive_fd = None
    try:
        a.require(a.identity(os.fstat(archive_parent)) == a.PINS[a.ARCHIVE], 'archive parent changed')
        archive_run = os.open(PLAN['archive_run'], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=archive_parent)
        a.require(a.facts(os.fstat(archive_run)) == PLAN['archive_run_identity'], 'archive run changed')
        name = PLAN['mode'] + '-' + PLAN['attempt']
        os.mkdir(name, 0o700, dir_fd=archive_run)
        evidence = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=archive_run)
        LOGFD = os.open('operations.jsonl', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=evidence)
        a.save(evidence, 'plan.json', PLAN)
        a.save(evidence, 'mount-before.json', mount)
        before, archive_fd, archive_identity = archive_proof(archive_run)
        activity_evidence(evidence)
        parent = a.open_dir(PARENT)
        a.require(a.identity(os.fstat(parent)) == tuple(PLAN['parent_identity']), 'source parent changed')
        event('phase_started', mode=PLAN['mode'], archive_identity=archive_identity)
        if PLAN['mode'] == 'rename':
            rename_phase(parent, before, evidence)
        else:
            delete_phase(parent, before, evidence, archive_run)
        a.require(a.facts(os.fstat(archive_fd)) == archive_identity, 'archive changed during phase')
        a.save(evidence, 'mount-after.json', a.destination_gate())
        a.save(evidence, 'completion.json', {'status': 'PHASE_COMPLETED', 'commands': a.COMMANDS,
               'archive_retained': True, 'phase': PLAN['mode'], 'journal_events': OPCOUNT})
    except BaseException as error:
        if evidence is not None:
            a.save(evidence, 'failure.json', {'status': 'STOPPED_REVIEW_REQUIRED', 'error': str(error),
                   'partial_effects_possible': True, 'automatic_retry_permitted': False, 'commands': a.COMMANDS})
        raise
    finally:
        for held in (archive_fd, LOGFD, evidence, parent, archive_run, archive_parent):
            if held is not None:
                os.close(held)


if __name__ == '__main__':
    main()
