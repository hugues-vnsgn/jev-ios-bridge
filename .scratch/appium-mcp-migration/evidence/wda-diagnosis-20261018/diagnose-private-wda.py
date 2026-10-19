import fcntl
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

root = Path('.scratch/appium-mcp-migration').resolve()
audit = Path('.audit/phase1-finish-20261018').resolve()
prep = json.loads((root / 'evidence/phase1-freeze-20261018.json').read_text())
ios = prep['ios']
assert ios['udid'] == '15013501-2535-42EB-A67F-45B015DF18F4'
assert Path(ios['set']) == root / 'runtime/devices/simulators'
base = ['xcrun', 'simctl', '--set', ios['set']]
env = {k: os.environ[k] for k in ['PATH', 'HOME', 'USER'] if k in os.environ}
record = {'kind': 'bounded-preinstalled-wda-diagnosis', 'device': ios['udid'], 'set': ios['set'], 'commands': [], 'portSamples': []}
lock = (root / 'runtime/devices/phase1-ios.lock').open('r+')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
def save():
    (audit / '1D-wda-diagnosis.json').write_text(json.dumps(record, indent=2) + '\n')
def run(args, timeout=30, extra=None):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env={**env, **(extra or {})})
    record['commands'].append({'argv': args, 'environmentOverrides': extra or {}, 'exitCode': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr})
    save()
    return p
try:
    listing = run(base + ['list', 'devices', '-j'])
    assert listing.returncode == 0
    selected = [d for ds in json.loads(listing.stdout)['devices'].values() for d in ds if d['udid'] == ios['udid']]
    assert len(selected) == 1 and selected[0]['name'] == ios['name']
    if selected[0]['state'] == 'Shutdown':
        assert run(base + ['boot', ios['udid']]).returncode == 0
    assert run(base + ['bootstatus', ios['udid'], '-b'], 180).returncode == 0
    container = run(base + ['get_app_container', ios['udid'], 'com.facebook.WebDriverAgentRunner.xctrunner', 'app'])
    assert container.returncode == 0
    assert container.stdout.strip().startswith(ios['set'] + '/' + ios['udid'] + '/data/')
    started = time.monotonic()
    launch = run(['node', str(audit / 'launch-private-wda.mjs')], 30)
    assert launch.returncode == 0
    for step in range(13):
        sample = {'elapsedSeconds': round(time.monotonic() - started, 2)}
        try:
            with urllib.request.urlopen('http://127.0.0.1:18100/status', timeout=1) as response:
                sample.update(httpStatus=response.status, body=response.read(32768).decode())
        except Exception as error:
            sample['error'] = str(error)
        record['portSamples'].append(sample)
        log = run(base + ['spawn', ios['udid'], 'log', 'show', '--last', '3m', '--style', 'compact', '--predicate', 'process == "WebDriverAgentRunner-Runner"'], 30)
        (audit / '1D-wda-runner.log').write_text(log.stdout + log.stderr)
        save()
        print(json.dumps({'sample': sample, 'runnerLogBytes': len(log.stdout)}), flush=True)
        if sample.get('httpStatus') == 200 or any(v in log.stdout for v in ['Failed to background test runner', 'Library not loaded', 'Symbol not found', 'Failed to load test bundle', 'not supported']):
            break
        if step < 12:
            time.sleep(10)
finally:
    run(base + ['terminate', ios['udid'], 'com.facebook.WebDriverAgentRunner.xctrunner'])
    stopped = run(base + ['shutdown', ios['udid']], 60)
    record['privateSimulatorShutdown'] = stopped.returncode == 0
    save()
    lock.close()
