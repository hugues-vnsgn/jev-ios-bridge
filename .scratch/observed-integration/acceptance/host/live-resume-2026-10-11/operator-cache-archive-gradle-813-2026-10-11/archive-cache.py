#!/usr/bin/env python3
"""Review-only draft. Requires a separately approved plan and its SHA256.
Copies one cache to an archive; contains no deletion or extraction operation.
"""
import datetime
import gzip
import hashlib
import json
import os
import plistlib
import re
import selectors
import signal
import stat
import subprocess
import sys
import tarfile
import time

OWNER_HOME = '/Users/hugues_mini'
BASE = '/Volumes/Sam/jev-ios-bridge-release-2026-10-11'
ARCHIVE = BASE + '/archive'
ALLOW = {OWNER_HOME + '/' + p for p in (
    '.gradle/caches', '.gradle/caches/8.13', '.gradle/caches/9.7.1',
    '.gradle/wrapper/dists', 'Library/Caches/JetBrains',
    'Library/Caches/org.swift.swiftpm', '.npm/_cacache', '.cache/uv',
    '.cache/bazel-repo-contents-cache', '.cache/bazel-repo-cache', '.cache/huggingface')}
# From operator-sam-namespace-preparation-2026-10-11/namespace-result.json.
PINS = {
    '/Volumes/Sam': (16777242, 2, 0, 0, 0o40775),
    BASE: (16777242, 79926, 501, 20, 0o40700),
    ARCHIVE: (16777242, 79929, 501, 20, 0o40700),
}
VOLUME_UUID = '48570675-F94C-3532-89D3-B005FDCF8334'
DISK_UUID = '9776C4A9-99F0-4B06-A2A9-E097A2709E25'
ENV = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'HOME': OWNER_HOME,
       'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}
PLAN = {}
DEADLINE = 0
COMMANDS = []


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def tick():
    require(time.monotonic() < DEADLINE, 'total deadline exceeded')


def identity(s):
    return (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode)


def facts(s):
    return {k: getattr(s, 'st_' + k) for k in
            ('dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink', 'mtime_ns', 'ctime_ns')}


def open_dir(path):
    require(path.startswith('/') and '..' not in path.split('/'), 'bad absolute path')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.split('/')[1:]:
            if not part:
                continue
            new = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = new
        return fd
    except BaseException:
        os.close(fd)
        raise


def write_all(fd, data):
    view = memoryview(data)
    while view:
        n = os.write(fd, view)
        require(n > 0, 'short write')
        view = view[n:]


def save(runfd, name, data):
    raw = json.dumps(data, sort_keys=True, ensure_ascii=True, indent=2).encode() + b'\n'
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=runfd)
    try:
        write_all(fd, raw)
        os.fsync(fd)
    finally:
        os.close(fd)


def command(argv, output_fd=None, output_limit=1048576):
    """Drain both pipes under bounds, kill on failure, always wait for direct child."""
    tick()
    started = time.monotonic()
    p = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, env=ENV, shell=False, start_new_session=True)
    rec = {'argv': argv, 'pid': p.pid, 'stdout_bytes': 0, 'stderr_bytes': 0}
    COMMANDS.append(rec)
    out, err = bytearray(), bytearray()
    digest = hashlib.sha256()
    sel = selectors.DefaultSelector()
    sel.register(p.stdout, selectors.EVENT_READ, 'stdout')
    sel.register(p.stderr, selectors.EVENT_READ, 'stderr')
    try:
        while sel.get_map():
            tick()
            require(time.monotonic() - started < PLAN['command_seconds'], 'command timeout')
            for key, _ in sel.select(0.2):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    sel.unregister(key.fileobj)
                    continue
                side = key.data
                rec[side + '_bytes'] += len(chunk)
                require(rec[side + '_bytes'] <= (output_limit if side == 'stdout' else PLAN['stderr_bytes']),
                        side + ' limit exceeded')
                if side == 'stdout':
                    digest.update(chunk)
                    if output_fd is None:
                        out.extend(chunk)
                    else:
                        write_all(output_fd, chunk)
                else:
                    err.extend(chunk)
        rec['exit_code'] = p.wait(timeout=max(0.01, min(5, DEADLINE-time.monotonic())))
    except BaseException:
        rec['terminated'] = True
        try:
            os.killpg(p.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            p.wait(timeout=2)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid, signal.SIGKILL)
            p.wait()
        rec['exit_code'] = p.returncode
        raise
    finally:
        sel.close()
        p.stdout.close()
        p.stderr.close()
        rec['settled_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        rec['elapsed_seconds'] = time.monotonic() - started
        rec['stdout_sha256'] = digest.hexdigest()
        rec['stderr_hex'] = err.hex()
        rec['direct_child_waited'] = p.returncode is not None
        rec['descendant_settlement'] = 'not independently observed'
    require(rec['exit_code'] == 0 and not err, 'command failed or produced diagnostics')
    return bytes(out)


def destination_gate():
    for path, expected in PINS.items():
        fd = open_dir(path)
        try:
            require(identity(os.fstat(fd)) == expected, 'destination identity changed: ' + path)
        finally:
            os.close(fd)
    raw = command(['/usr/sbin/diskutil', 'info', '-plist', '/Volumes/Sam'])
    v = plistlib.loads(raw)
    require(v.get('VolumeUUID') == VOLUME_UUID and v.get('DiskUUID') == DISK_UUID
            and v.get('MountPoint') == '/Volumes/Sam' and v.get('FilesystemType') == 'hfs'
            and v.get('GlobalPermissionsEnabled') is True and v.get('Writable') is True,
            'Sam mount proof failed')
    return {'plist_hex': raw.hex(), 'volume_uuid': VOLUME_UUID}


def inventory(source):
    result, total = {}, 0
    root = open_dir(source)
    rootstat = os.fstat(root)
    require(facts(rootstat) == PLAN['source_identity'], 'source root no longer matches plan')
    device = rootstat.st_dev

    def walk(parent, name, rel, depth):
        nonlocal total
        tick()
        require(depth <= PLAN['max_depth'] and len(result) < PLAN['max_entries'], 'inventory bound')
        s = os.stat(name, dir_fd=parent, follow_symlinks=False)
        require(s.st_uid == 501 and s.st_dev == device, 'unexpected owner or mount crossing')
        require(not s.st_mode & (stat.S_ISUID | stat.S_ISGID), 'privileged mode')
        item = {'identity': facts(s)}
        if stat.S_ISDIR(s.st_mode):
            item['type'] = 'dir'
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            try:
                require(facts(os.fstat(fd)) == facts(s), 'directory open race')
                names = sorted(os.listdir(fd))
                result[rel] = item
                for child in names:
                    walk(fd, child, rel + '/' + child, depth + 1)
                require(names == sorted(os.listdir(fd)) and facts(os.fstat(fd)) == facts(s),
                        'directory changed during inventory')
            finally:
                os.close(fd)
        elif stat.S_ISREG(s.st_mode):
            total += s.st_size
            require(total <= PLAN['max_source_bytes'], 'source byte bound')
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
            h, size = hashlib.sha256(), 0
            try:
                require(facts(os.fstat(fd)) == facts(s), 'file open race')
                while True:
                    tick()
                    chunk = os.read(fd, 1048576)
                    if not chunk:
                        break
                    size += len(chunk)
                    require(size <= s.st_size, 'file grew')
                    h.update(chunk)
                require(size == s.st_size and facts(os.fstat(fd)) == facts(s), 'file changed')
            finally:
                os.close(fd)
            item.update(type='file', sha256=h.hexdigest(), size=size)
            result[rel] = item
        elif stat.S_ISLNK(s.st_mode):
            item.update(type='symlink', target=os.readlink(name, dir_fd=parent))
            result[rel] = item
        else:
            raise RuntimeError('special file encountered')
        require(facts(os.stat(name, dir_fd=parent, follow_symlinks=False)) == facts(s), 'path changed')

    parent = open_dir(os.path.dirname(source))
    try:
        walk(parent, os.path.basename(source), os.path.basename(source), 0)
        require(facts(os.fstat(root)) == facts(rootstat), 'held source changed')
    finally:
        os.close(parent)
        os.close(root)
    return result


class BoundedReader:
    def __init__(self, stream):
        self.stream, self.count = stream, 0

    def read(self, n=-1):
        tick()
        require(n >= 0, 'unbounded decompression read')
        b = self.stream.read(min(n, 1048576))
        self.count += len(b)
        require(self.count <= PLAN['max_tar_bytes'], 'expanded tar byte bound')
        return b


def verify_archive(fd, before):
    os.lseek(fd, 0, os.SEEK_SET)
    seen, auxiliaries = set(), []
    with os.fdopen(os.dup(fd), 'rb') as raw, gzip.GzipFile(fileobj=raw) as gz:
        stream = BoundedReader(gz)
        with tarfile.open(fileobj=stream, mode='r|') as archive:
            for member in archive:
                tick()
                name = member.name.rstrip('/')
                require(name and not name.startswith('/') and '..' not in name.split('/'), 'unsafe member name')
                require(name not in seen and len(seen) < PLAN['max_entries'] * 2, 'duplicate/member bound')
                seen.add(name)
                expected = before.get(name)
                if expected is None:
                    parent, leaf = os.path.split(name)
                    original = (parent + '/' if parent else '') + leaf[2:]
                    require(leaf.startswith('._') and original in before and member.isfile(),
                            'unexpected archive member')
                    require(member.size <= PLAN['max_metadata_bytes'], 'metadata member bound')
                    f = archive.extractfile(member)
                    header = f.read(4)
                    require(header == b'\x00\x05\x16\x07', 'invalid AppleDouble auxiliary')
                    while f.read(1048576):
                        tick()
                    auxiliaries.append(name)
                    continue
                require(member.uid == 501, 'archive unexpected owner')
                if member.islnk():
                    target = before.get(member.linkname)
                    require(expected['type'] == 'file' and target is not None and target['type'] == 'file'
                            and member.linkname != name and member.linkname in seen
                            and (target['identity']['dev'], target['identity']['ino']) ==
                            (expected['identity']['dev'], expected['identity']['ino']), 'hardlink mismatch')
                elif expected['type'] == 'dir':
                    require(member.isdir(), 'directory mismatch')
                elif expected['type'] == 'symlink':
                    require(member.issym() and member.linkname == expected['target'], 'symlink mismatch')
                else:
                    require(member.isfile() and member.size == expected['size'], 'file mismatch')
                    f, h, size = archive.extractfile(member), hashlib.sha256(), 0
                    while True:
                        chunk = f.read(1048576)
                        if not chunk:
                            break
                        tick()
                        size += len(chunk)
                        h.update(chunk)
                    require(size == expected['size'] and h.hexdigest() == expected['sha256'], 'content mismatch')
        # Read through gzip trailer to check CRC; trailing tar padding must be zero.
        while True:
            chunk = stream.read(1048576)
            if not chunk:
                break
            require(not any(chunk), 'unexpected trailing archive data')
    require(set(before) == seen - set(auxiliaries), 'archive path set mismatch')
    return {'entries': len(before), 'appledouble_entries': len(auxiliaries),
            'metadata': 'native best effort; ACL/xattr/timestamp fidelity not independently verified'}


def main():
    global PLAN, DEADLINE
    require(len(sys.argv) == 3 and re.fullmatch('[0-9a-f]{64}', sys.argv[2]),
            'usage: archive-cache.py APPROVED_PLAN.json APPROVED_PLAN_SHA256')
    fd = os.open(sys.argv[1], os.O_RDONLY | os.O_NOFOLLOW)
    try:
        initial = os.fstat(fd)
        require(stat.S_ISREG(initial.st_mode) and initial.st_size <= 65536, 'invalid plan')
        raw = os.read(fd, 65537)
        require(facts(os.fstat(fd)) == facts(initial), 'plan changed')
    finally:
        os.close(fd)
    require(hashlib.sha256(raw).hexdigest() == sys.argv[2], 'unapproved plan bytes')
    PLAN = json.loads(raw)
    require(PLAN['version'] == 1 and PLAN['source'] in ALLOW and PLAN['inactivity_confirmed'] is True
            and PLAN['writer_stop_contract'] and PLAN['activity_evidence_sha256']
            and re.fullmatch('[a-z0-9-]{1,64}', PLAN['run_name']), 'unapproved scope')
    for key in ('max_depth', 'max_entries', 'max_source_bytes', 'max_archive_bytes', 'max_tar_bytes',
                'max_metadata_bytes', 'stderr_bytes', 'command_seconds', 'total_seconds', 'min_sam_free_bytes'):
        require(type(PLAN[key]) is int and PLAN[key] > 0, 'missing finite bound: ' + key)
    require(os.getuid() == 501 and os.geteuid() == 501, 'normal owner execution required')
    os.umask(0o077)
    DEADLINE = time.monotonic() + PLAN['total_seconds']
    mount_before = destination_gate()
    archivefd = open_dir(ARCHIVE)
    require(identity(os.fstat(archivefd)) == PINS[ARCHIVE], 'archive parent replaced')
    runfd = None
    try:
        fs = os.fstatvfs(archivefd)
        require(fs.f_bavail * fs.f_frsize >= PLAN['max_archive_bytes'] + PLAN['min_sam_free_bytes'],
                'insufficient Sam capacity')
        os.mkdir(PLAN['run_name'], 0o700, dir_fd=archivefd)
        runfd = os.open(PLAN['run_name'], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=archivefd)
        save(runfd, 'plan.json', PLAN)
        save(runfd, 'mount-before.json', mount_before)
        before = inventory(PLAN['source'])
        save(runfd, 'source-before.json', before)
        output = os.open('cache.tar.gz', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=runfd)
        try:
            command(['/usr/bin/tar', '-czf', '-', '--format', 'pax', '--mac-metadata',
                     '--one-file-system', '-C', os.path.dirname(PLAN['source']),
                     os.path.basename(PLAN['source'])], output, PLAN['max_archive_bytes'])
            os.fsync(output)
            stable = facts(os.fstat(output))
            verified = verify_archive(output, before)
            after = inventory(PLAN['source'])
            save(runfd, 'source-after.json', after)
            require(before == after, 'source changed; archive not accepted')
            os.lseek(output, 0, os.SEEK_SET)
            h = hashlib.sha256()
            while True:
                tick()
                chunk = os.read(output, 1048576)
                if not chunk:
                    break
                h.update(chunk)
            require(facts(os.fstat(output)) == stable, 'archive changed during verification')
            require(facts(os.stat('cache.tar.gz', dir_fd=runfd, follow_symlinks=False)) == stable,
                    'archive path replaced')
            save(runfd, 'mount-after.json', destination_gate())
            save(runfd, 'result.json', {'status': 'COPY_VERIFIED_SOURCE_RETAINED',
                 'archive_sha256': h.hexdigest(), 'archive_bytes': stable['size'],
                 'verification': verified, 'commands': COMMANDS, 'source_deletions': 0,
                 'source_stability': 'endpoint inventories plus separately confirmed inactivity; not atomic snapshot'})
        finally:
            os.close(output)
    except BaseException as error:
        if runfd is not None:
            save(runfd, 'failure.json', {'status': 'STOPPED_SOURCE_RETAINED', 'error': str(error),
                                       'commands': COMMANDS, 'source_deletions': 0})
        raise
    finally:
        if runfd is not None:
            os.close(runfd)
        os.close(archivefd)


if __name__ == '__main__':
    main()
