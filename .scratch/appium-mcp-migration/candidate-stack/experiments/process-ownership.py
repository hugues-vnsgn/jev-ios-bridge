"""Pinned-stack ownership through inherited launch markers and recorded ancestry."""
import base64
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import struct
import sys

spec = importlib.util.spec_from_file_location('owned_group', Path(__file__).with_name('stop-group.py'))
group = importlib.util.module_from_spec(spec)
spec.loader.exec_module(group)
MARKER = 'JEV_PHASE1_RUN_MARKER'
CHAIN = 'JEV_PHASE1_ANCESTRY'

def process_arguments(pid):
    try:
        if sys.platform == 'darwin':
            library = ctypes.CDLL(None, use_errno=True)
            mib = (ctypes.c_int * 3)(1, 49, pid)
            size = ctypes.c_size_t()
            if library.sysctl(mib, 3, None, ctypes.byref(size), None, 0) != 0 or not 4 < size.value <= 2097152:
                return None
            buffer = ctypes.create_string_buffer(size.value)
            if library.sysctl(mib, 3, buffer, ctypes.byref(size), None, 0) != 0:
                return None
            raw = buffer.raw[:size.value]
            argc = struct.unpack_from('=i', raw)[0]
            if not 0 < argc <= 4096:
                return None
            end = raw.index(b'\0', 4)
            executable = os.fsdecode(raw[4:end])
            offset = end
            while offset < len(raw) and raw[offset] == 0:
                offset += 1
            argv = []
            for _ in range(argc):
                end = raw.index(b'\0', offset)
                argv.append(os.fsdecode(raw[offset:end]));offset = end + 1
            return {'executable': executable, 'argv': argv}
        argv = Path(f'/proc/{pid}/cmdline').read_bytes().rstrip(b'\0').split(b'\0')
        return {'executable': os.readlink(f'/proc/{pid}/exe'), 'argv': [os.fsdecode(arg) for arg in argv]}
    except (OSError, ValueError, struct.error):
        return None


def private_device_root(row, profile):
    if profile.get('platform') != 'ios' or profile.get('fakeOnly') or row['ppid'] != 1 or 'launchd_sim' not in row['command']:
        return None
    caps = profile['caps']
    udid = caps['appium:udid']
    device_set = str(Path(caps['appium:simulatorDevicesSetPath']).resolve())
    assert udid == '15013501-2535-42EB-A67F-45B015DF18F4', 'FOREIGN_DEVICE'
    assert Path(device_set) == Path(__file__).resolve().parents[2] / 'runtime/devices/simulators', 'FOREIGN_DEVICE_SET'
    before = group.process_incarnation(row['pid'])
    info = process_arguments(row['pid'])
    if not before or not info or Path(info['executable']).name != 'launchd_sim':
        return None
    device_path = device_set + '/' + udid
    bound = any(arg == device_path or arg.startswith(device_path + '/') for arg in info['argv']) or (
        device_set in info['argv'] and udid in info['argv'])
    if not bound or group.process_incarnation(row['pid']) != before:
        return None
    return {'pid': row['pid'], 'incarnation': before, 'set': device_set, 'udid': udid, **info}


def encode_chain(chain):
    return base64.urlsafe_b64encode(json.dumps(chain, separators=(',', ':')).encode()).decode()


def scan(root, owner, profile):
    marker = owner.get('runMarker')
    assert isinstance(marker, str) and re.fullmatch('[0-9a-f]{32}', marker), 'MISSING_LAUNCH_ATTESTATION'
    ancestor = {'pid': owner['pid'], 'incarnation': owner['incarnation']}
    assert owner.get('launchChain') == [ancestor], 'MISSING_LAUNCH_ANCESTRY'
    timeout = profile.get('inspectionTimeoutSeconds', 10) if profile.get('fakeOnly') else 10
    assert 0 < timeout <= 20
    ps_args = ['ps', '-Eww', '-axo'] if sys.platform == 'darwin' else ['ps', 'axeww', '-o']
    result = subprocess.run(ps_args + ['pid=,ppid=,pgid=,stat=,command='],
                            capture_output=True, text=True, timeout=timeout)
    assert result.returncode == 0 and result.stdout.strip(), 'HOST_INVENTORY_FAILED'
    if profile.get('fakeOnly'):
        markers = [profile['marker']]
    else:
        caps = profile['caps']
        if profile['platform'] == 'ios':
            assert caps['appium:udid'] == '15013501-2535-42EB-A67F-45B015DF18F4', 'FOREIGN_DEVICE'
            markers = [caps['appium:udid'], caps['appium:simulatorDevicesSetPath'], '18100', '18101']
        else:
            assert caps['appium:udid'] == 'emulator-5570', 'FOREIGN_DEVICE'
            markers = ['emulator-5570', '18200', '18201']
    records = [owner]
    for file in sorted((root / 'components').glob('*.json')):
        record = json.loads(file.read_text())
        assert record['ownerPid'] == owner['pid'] and record['ownerIncarnation'] == owner['incarnation'], 'FOREIGN_COMPONENT_RECORD'
        records.append(record)
    recorded = {record['pid']: record['incarnation'] for record in records}
    pgids = {record['pgid'] for record in records}
    sids = {record['sid'] for record in records if record.get('sid', 0) > 1}
    raw_rows = []
    for line in result.stdout.splitlines():
        parts = line.strip().split(None, 4)
        assert len(parts) == 5, 'HOST_INVENTORY_TRUNCATED'
        pid, ppid, pgid, state, command = parts
        tagged = re.search(r'(?:^| )' + MARKER + '=' + re.escape(marker) + r'(?: |$)', command) is not None
        matched = any(re.search(r'(?<![\w-])' + re.escape(value) + r'(?![\w-])', command, re.IGNORECASE) for value in markers)
        try:
            sid = os.getsid(int(pid))
        except (ProcessLookupError, PermissionError):
            sid = None
        readable = tagged or re.search(r'(?:^| )(?:PATH|HOME|USER|SHELL|TMPDIR|' + MARKER + r')=', command) is not None
        raw_rows.append({'pid': int(pid), 'ppid': int(ppid), 'pgid': int(pgid), 'sid': sid,
                         'state': state, 'command': command, 'tagged': tagged, 'matched': matched,
                         'markerState': 'present' if tagged else 'absent' if readable else 'unreadable'})
    linked = set(recorded)
    while True:
        additions = {row['pid'] for row in raw_rows if row['ppid'] in linked}
        if additions <= linked:
            break
        linked |= additions
    device_tree = {}
    if profile.get('platform') == 'ios' and not profile.get('fakeOnly'):
        for row in raw_rows:
            device_root = private_device_root(row, profile)
            if device_root:
                device_tree[row['pid']] = device_root
        assert len(device_tree) <= 1, 'AMBIGUOUS_PRIVATE_DEVICE_ROOT'
        while True:
            additions = {row['pid']: device_tree[row['ppid']] for row in raw_rows if row['ppid'] in device_tree and row['pid'] not in device_tree}
            if not additions:
                break
            device_tree.update(additions)
    rows = []
    for row in raw_rows:
        pid, ppid, pgid, sid, state, command, tagged = (row[key] for key in ['pid', 'ppid', 'pgid', 'sid', 'state', 'command', 'tagged'])
        related = pid in linked or pgid in pgids or sid in sids
        if pid == os.getpid() or not (tagged or row['matched'] or related or pid in device_tree):
            continue
        chain = None
        value = re.search(r'(?:^| )' + CHAIN + r'=([^ ]+)', command)
        if value:
            try:
                chain = json.loads(base64.urlsafe_b64decode(value[1]))
            except (ValueError, TypeError):
                pass
        identity = group.process_incarnation(int(pid))
        owned = tagged and isinstance(chain, list) and bool(chain) and chain[0] == ancestor and bool(identity)
        shared = group.is_shared_service(command)
        device_root = device_tree.get(pid)
        info = process_arguments(pid) if device_root else None
        executable = info['executable'] if info else None
        wda_bundle = profile.get('caps', {}).get('appium:prebuiltWDAPath', '')
        automation = bool(executable and ('xctest' in Path(executable).name.lower() or 'WebDriverAgentRunner' in Path(executable).name or
                         (wda_bundle and (executable == wda_bundle or executable.startswith(wda_bundle + '/') or Path(wda_bundle).name in Path(executable).parts))))
        device_internal = bool(device_root and identity and executable and not automation)
        active = not state.startswith('Z')
        if device_root and active and (identity is None or executable is None):
            check = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], capture_output=True, text=True, timeout=2)
            if (check.returncode == 1 and not check.stdout.strip()) or (check.returncode == 0 and check.stdout.strip().startswith('Z')):
                active = False
        rows.append({'pid': int(pid), 'ppid': int(ppid), 'pgid': int(pgid), 'state': state,
                     'sid': sid, 'markerState': row['markerState'], 'incarnation': identity, 'active': active, 'runMarker': marker if tagged else None,
                     'launchChain': chain, 'owned': owned and not shared and not device_internal, 'excludedSharedService': shared,
                     'deviceInternal': device_internal, 'deviceRootPid': device_root['pid'] if device_root else None,
                     'deviceRootIncarnation': device_root['incarnation'] if device_root else None,
                     'automationFenceRequired': bool(device_root and automation),
                     'ownerPid': owner['pid'], 'ownerIncarnation': owner['incarnation'],
                     'reason': None if owned or device_internal else 'MARKER_UNREADABLE' if row['markerState'] == 'unreadable' else 'UNVERIFIABLE_OWNERSHIP'})
    return rows


if __name__ == '__main__':
    assert sys.argv[1] == 'device-root'
    profile = json.loads(Path(sys.argv[2]).read_text())
    listing = subprocess.run(['ps', '-ww', '-axo', 'pid=,ppid=,command='], capture_output=True, text=True, timeout=10)
    listing.check_returncode()
    roots = []
    for line in listing.stdout.splitlines():
        pid, ppid, command = line.strip().split(None, 2)
        found = private_device_root({'pid': int(pid), 'ppid': int(ppid), 'command': command}, profile)
        if found:
            roots.append(found)
    assert len(roots) == 1, 'PRIVATE_DEVICE_ROOT_UNVERIFIED'
    print(json.dumps(roots[0]))
