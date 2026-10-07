"""Bounded container/listapps observations; no uninstall, XCTest, AX or input."""
import argparse
import json
from pathlib import Path
import sys

REPOSITORY = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY / 'spikes/native-owner/host'))
from study import Configuration, Dependencies, ProcessTools, _Study, _Refusal, _Expired, RUNNER, FIXTURE, UDID


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence-directory', type=Path, required=True)
    args = parser.parse_args()
    output = args.evidence_directory.resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    config = Configuration(Path('/private/tmp/jev-native-owner-study-wire-fix-build'), output,
                           REPOSITORY / 'spikes/native-owner', admission_seconds=90)
    study = _Study('startup-container-inspection', config,
                   Dependencies(ProcessTools(output / 'process-output')))
    try:
        study.acquire_guard()
        study.initial, state = study.inventory()
        study.save('initial-inventory.json', study.initial)
        if state != 'Shutdown':
            raise _Refusal('PROBE_INITIAL_STATE_UNEXPECTED')
        study.own({'kind':'device', 'deviceId':UDID, 'initialState':state})
        study.booted = True
        study.checked(study.sim('boot', UDID))
        study.checked(study.sim('bootstatus', UDID, '-b'))
        if study.inventory()[1] != 'Booted':
            raise _Refusal('PROBE_DEVICE_NOT_BOOTED')
        before = study.command(study.sim('get_app_container', UDID, RUNNER, 'app'))
        apps = study.command(study.sim('listapps', UDID))
        after = study.command(study.sim('get_app_container', UDID, RUNNER, 'app'))
        fixture = study.command(study.sim('get_app_container', UDID, FIXTURE, 'app'))
        case = json.loads((REPOSITORY / '.scratch/native-owner-recovery/approved-case.json').read_bytes())
        app = Path(case['installedRunnerAppPath'])
        study.save('container-observations.json', {
            'registeredHistoricalPath':str(app), 'pathExists':app.exists(),
            'pathIsSymlink':app.is_symlink(),
            'beforeListing':{'returncode':before[0], 'stdout':before[1], 'stderr':before[2]},
            'listappsReturncode':apps[0],
            'afterListing':{'returncode':after[0], 'stdout':after[1], 'stderr':after[2]},
            'fixtureLookup':{'returncode':fixture[0], 'stdout':fixture[1], 'stderr':fixture[2]},
            'nativeQueries':0, 'inputCalls':0, 'cleanupDispatches':0,
            'meaning':'provider observations only; no absence or native settlement capability'})
        study.restore_pre_native()
        study.resources.clear(); study.ledger()
        result = study.result('completed', 'READONLY_CONTAINER_LOOKUP_INSPECTED')
    except (_Refusal, OSError, ValueError, TypeError, KeyError) as error:
        reason = str(error) if isinstance(error, _Refusal) else 'PROBE_LOCAL_STATE_UNCONFIRMED'
        pending = any(entry['state'] != 'exited' for entry in study.commands)
        if not pending and not isinstance(error, _Expired):
            try:
                study.restore_pre_native()
                study.resources.clear(); study.ledger()
                result = study.result('refused', reason)
            except (_Refusal, OSError):
                result = study.result('retained', 'PROBE_RESTORE_UNCONFIRMED')
        else:
            result = study.result('retained', reason)
    print(json.dumps({'status':result.status, 'reason':result.reason,
                      'requestId':result.request_id, 'evidenceDirectory':result.evidence_directory,
                      'retainedResources':result.retained_resources}, indent=2))
    return {'completed':0, 'refused':2, 'retained':3}[result.status]


if __name__ == '__main__':
    raise SystemExit(main())
