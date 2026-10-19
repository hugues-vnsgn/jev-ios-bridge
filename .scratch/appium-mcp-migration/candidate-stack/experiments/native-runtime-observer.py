"""Read-only component/artifact observations in the fixed private device context."""
import hashlib
import importlib.util
import json
import os
import pwd
from pathlib import Path
import subprocess
import sys

prep_path, platform = sys.argv[1:]
prep = json.loads(Path(prep_path).read_text())
root = Path(__file__).resolve().parents[2]
assert platform in ['ios', 'android']
assert prep['ios']['udid'] == '15013501-2535-42EB-A67F-45B015DF18F4', 'Refuse foreign device'
assert Path(prep['ios']['set']).resolve() == root / 'runtime/devices/simulators', 'Refuse foreign simulator set'
assert prep['android']['name'] == 'jev_appium_phase1_20261018' and prep['android']['serial'] == 'emulator-5570', 'Refuse foreign emulator'
spec = importlib.util.spec_from_file_location('owned_group', Path(__file__).with_name('stop-group.py'))
group = importlib.util.module_from_spec(spec)
spec.loader.exec_module(group)
commands = []
def run(args, binary=False):
    result = subprocess.run(args, capture_output=True, timeout=20, env={**os.environ, 'HOME': pwd.getpwuid(os.getuid()).pw_dir})
    commands.append({'args': args, 'exitCode': result.returncode})
    assert result.returncode == 0, 'READONLY_OBSERVATION_UNAVAILABLE'
    return result.stdout if binary else result.stdout.decode('utf-8')
state = {'version': 1, 'platform': platform, 'readOnly': True, 'commands': commands}
if platform == 'ios':
    base = ['xcrun', 'simctl', '--set', prep['ios']['set']]
    device = prep['ios']['udid']
    listing = json.loads(run(base + ['list', 'devices', '-j']))['devices']
    selected = [item for items in listing.values() for item in items if item['udid'] == device]
    assert len(selected) == 1 and selected[0]['state'] == 'Booted'
    state['device'] = selected[0]
    services = []
    for line in run(base + ['spawn', device, 'launchctl', 'list']).splitlines():
        fields = line.split(None, 2)
        if len(fields) == 3 and fields[0].isdigit():
            pid = int(fields[0])
            services.append({'pid': pid, 'label': fields[2], 'incarnation': group.process_incarnation(pid),
                             'automation': 'com.facebook.WebDriverAgentRunner' in fields[2]})
    state['services'] = services
    container = Path(run(base + ['get_app_container', device, 'com.facebook.WebDriverAgentRunner.xctrunner', 'app']).strip())
    assert str(container).startswith(str(Path(prep['ios']['set']) / device / 'data') + '/')
    manifest = prep['wda']
    state['wda'] = {'container': str(container), 'packageVersion': manifest['packageVersion'],
                    'files': [{'path': item['path'], 'sha256': hashlib.sha256((container / item['path']).read_bytes()).hexdigest(),
                               'matchesSelected': hashlib.sha256((container / item['path']).read_bytes()).hexdigest() == item['sha256']} for item in manifest['files']]}
    assert all(item['matchesSelected'] for item in state['wda']['files'])
else:
    serial = prep['android']['serial']
    base = ['adb', '-s', serial]
    assert run(base + ['emu', 'avd', 'name']).splitlines()[0] == prep['android']['name']
    state['device'] = {'avd': prep['android']['name'], 'serial': serial, 'bootId': run(base + ['shell', 'cat', '/proc/sys/kernel/random/boot_id']).strip(),
                       'abi': run(base + ['shell', 'getprop', 'ro.product.cpu.abi']).strip()}
    packages = ['io.appium.uiautomator2.server', 'io.appium.uiautomator2.server.test', 'io.appium.settings']
    rows = []
    for line in run(base + ['shell', 'ps', '-A', '-o', 'PID,NAME']).splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[0].isdigit() and any(fields[1] == package or fields[1].startswith(package + ':') for package in packages):
            pid = int(fields[0]); raw = run(base + ['shell', 'cat', '/proc/' + str(pid) + '/stat'])
            rows.append({'pid': pid, 'name': fields[1], 'startTicks': raw.rsplit(') ', 1)[1].split()[19]})
    state['processes'] = rows
    state['packages'] = []
    for package in packages:
        paths = run(base + ['shell', 'pm', 'path', package]).splitlines()
        assert len(paths) == 1 and paths[0].startswith('package:/data/app/')
        path = paths[0][8:]
        apk = run(base + ['exec-out', 'cat', path], binary=True)
        digest = hashlib.sha256(apk).hexdigest()
        approved = prep['androidAutomationApks']
        matches = [item for item in approved if item['package'] == package and item['sha256'] == digest]
        assert len(matches) == 1, 'INSTALLED_AUTOMATION_ARTIFACT_MISMATCH'
        state['packages'].append({'package': package, 'installedPath': path, 'sha256': digest, 'bytes': len(apk), 'selectedArtifact': matches[0]})
    input_state = run(base + ['shell', 'dumpsys', 'input'])
    state['inputStateSha256'] = hashlib.sha256(input_state.encode()).hexdigest()
    state['inputTouchSections'] = [line for line in input_state.splitlines() if any(word in line for word in ['TouchStates', 'Pointers:', 'downTime', 'PointerIds'])]
print(json.dumps(state))
