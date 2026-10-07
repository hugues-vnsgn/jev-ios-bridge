"""Regression of the actual diagnostic caller's restoration failure chain."""
from dataclasses import replace
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout

REPOSITORY = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY/'spikes/native-owner/host'))
from study import _Study, UDID
from test_study import Clock, Tools

spec = importlib.util.spec_from_file_location('startup_container_probe', Path(__file__).with_name('observe.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class Restoration(unittest.TestCase):
    def test_failure_after_shutdown_preserves_resources_and_guard(self):
        for failure in ('state', 'identity'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as raw:
                root = Path(raw).resolve(); output = root/'evidence'
                case = root/'.scratch/native-owner-recovery/approved-case.json'
                case.parent.mkdir(parents=True)
                case.write_text(json.dumps({'installedRunnerAppPath':str(root/'missing.app')}))
                config = SimpleNamespace(evidence_directory=output, source_root=root/'spikes/native-owner')
                class ChangedTools(Tools):
                    def start(inner, argv, env, cwd):
                        if argv[:3] == ['xcrun','simctl','list'] and any('shutdown' in row for row in inner.commands):
                            inner.inventory_change = lambda device: {**device, **({'state':'Booted'} if failure == 'state' else {'name':'foreign'})}
                        return super().start(argv, env, cwd)
                tools = ChangedTools(Clock(),config)
                def isolated_study(plan, configuration, dependencies):
                    return _Study(plan,replace(configuration,lease_root=root/'leases'),dependencies)
                stdout = io.StringIO()
                with patch.object(probe,'REPOSITORY',root), patch.object(probe,'ProcessTools',lambda path:tools), patch.object(probe,'_Study',isolated_study), patch.object(sys,'argv',['observe.py','--evidence-directory',str(output)]), redirect_stdout(stdout):
                    code = probe.main()
                result = json.loads(stdout.getvalue())
                self.assertEqual((code,result['status']), (3,'retained'))
                self.assertTrue((root/'leases'/(UDID+'.lock')).is_file())
                self.assertTrue(any(item.get('kind')=='device' for item in result['retainedResources']))
                self.assertEqual(sum('shutdown' in command for command in tools.commands),1)


if __name__ == '__main__': unittest.main()
