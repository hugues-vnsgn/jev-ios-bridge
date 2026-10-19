"""Stop only attested automation in the two private devices; leave devices on."""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import socket
import subprocess
import sys
import time

prep_path, platform, snapshot_path = sys.argv[1:]
prep = json.loads(Path(prep_path).read_text())
snapshot = json.loads(Path(snapshot_path).read_text())
root = Path(__file__).resolve().parents[2]
assert platform in ['ios', 'android'] and snapshot['platform'] == platform
assert prep['ios']['udid'] == '15013501-2535-42EB-A67F-45B015DF18F4', 'Refuse foreign device'
assert Path(prep['ios']['set']).resolve() == root / 'runtime/devices/simulators', 'Refuse foreign simulator set'
assert prep['android']['name'] == 'jev_appium_phase1_20261018' and prep['android']['serial'] == 'emulator-5570', 'Refuse foreign emulator'
spec = importlib.util.spec_from_file_location('owned_group', Path(__file__).with_name('stop-group.py'))
group = importlib.util.module_from_spec(spec)
spec.loader.exec_module(group)
receipt = {'version': 1, 'platform': platform, 'commands': [], 'observations': [], 'deviceShutdownIssued': False, 'leaseReleased': False}
def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20, env={**os.environ, 'HOME': pwd.getpwuid(os.getuid()).pw_dir})
    receipt['commands'].append({'args': args, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    return result

def ports_closed(ports):
    samples = []
    for port in ports:
        for family, address in [(socket.AF_INET, '127.0.0.1'), (socket.AF_INET6, '::1')]:
            with socket.socket(family, socket.SOCK_STREAM) as connection:
                connection.settimeout(0.5)
                samples.append({'port': port, 'address': address, 'closed': connection.connect_ex((address, port)) != 0})
    return samples

if platform == 'ios':
    base = ['xcrun', 'simctl', '--set', prep['ios']['set']]
    device = prep['ios']['udid']
    assert snapshot['device']['udid'] == device
    assert all(item['matchesSelected'] for item in snapshot['wda']['files'])
    assert [item['path'] for item in snapshot['wda']['files']] == [item['path'] for item in prep['wda']['files']]
    owned = [item for item in snapshot['services'] if item['automation']]
    assert owned and all(item['incarnation'] for item in owned)
    before = run(base + ['spawn', device, 'launchctl', 'list'])
    assert before.returncode == 0
    current = {int(fields[0]): fields[2] for line in before.stdout.splitlines() if len(fields := line.split(None, 2)) == 3 and fields[0].isdigit()}
    for item in owned:
        now = group.process_incarnation(item['pid'])
        if now == item['incarnation']:
            assert current.get(item['pid']) == item['label'], 'Automation identity changed'
    live = [item for item in owned if group.process_incarnation(item['pid']) == item['incarnation']]
    if live:
        result = run(base + ['terminate', device, 'com.facebook.WebDriverAgentRunner.xctrunner'])
        assert result.returncode == 0
    for attempt in range(8):
        listing = run(base + ['spawn', device, 'launchctl', 'list'])
        assert listing.returncode == 0
        running = [line for line in listing.stdout.splitlines() if 'com.facebook.WebDriverAgentRunner' in line and line.split()[0].isdigit()]
        endpoints = ports_closed([18100, 18101])
        receipt['observations'].append({'sample': attempt, 'automationServices': running, 'ports': endpoints})
        assert not running and all(item['closed'] for item in endpoints), 'AUTOMATION_FENCE_UNPROVEN'
        if attempt < 7: time.sleep(1)
    receipt['deviceRemainsRunning'] = True
else:
    base = ['adb', '-s', prep['android']['serial']]
    name = run(base + ['emu', 'avd', 'name'])
    assert name.returncode == 0 and name.stdout.splitlines()[0] == prep['android']['name']
    packages = ['io.appium.uiautomator2.server', 'io.appium.uiautomator2.server.test', 'io.appium.settings']
    assert {item['package'] for item in snapshot['packages']} == set(packages)
    for package in packages:
        stopped = run(base + ['shell', 'am', 'force-stop', package]); assert stopped.returncode == 0
        disabled = run(base + ['shell', 'pm', 'disable-user', '--user', '0', package])
        assert disabled.returncode == 0 and 'disabled-user' in disabled.stdout
    forwards = run(['adb', 'forward', '--list']); assert forwards.returncode == 0
    for local, remote in [('tcp:18200', 'tcp:6790'), ('tcp:18201', 'tcp:7810')]:
        rows = [line.split() for line in forwards.stdout.splitlines() if len(line.split()) == 3 and line.split()[1] == local]
        assert all(row == [prep['android']['serial'], local, remote] for row in rows), 'Foreign forward refused'
        if rows:
            result = run(base + ['forward', '--remove', local]); assert result.returncode == 0
    for attempt in range(8):
        result = run(base + ['shell', 'ps', '-A', '-o', 'PID,NAME']); assert result.returncode == 0
        remaining = [line for line in result.stdout.splitlines() if len(fields := line.split()) == 2 and any(fields[1] == package or fields[1].startswith(package + ':') for package in packages)]
        endpoints = ports_closed([18200, 18201])
        receipt['observations'].append({'sample': attempt, 'automationProcesses': remaining, 'ports': endpoints})
        assert not remaining and all(item['closed'] for item in endpoints), 'AUTOMATION_FENCE_UNPROVEN'
        if attempt < 7: time.sleep(1)
    input_state = run(base + ['shell', 'dumpsys', 'input']); assert input_state.returncode == 0
    receipt['inputTouchSections'] = [line for line in input_state.stdout.splitlines() if 'TouchStatesByDisplay' in line or 'PointerIds' in line]
    assert any('TouchStatesByDisplay: <no displays touched>' in line for line in receipt['inputTouchSections']), 'INPUT_STATE_UNSETTLED'
    boot = run(base + ['shell', 'getprop', 'sys.boot_completed']); assert boot.returncode == 0 and boot.stdout.strip() == '1'
    receipt['deviceRemainsRunning'] = True
receipt['ownedAutomationInert'] = True
print(json.dumps(receipt))
