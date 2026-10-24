import base64
import importlib.util
import importlib.machinery
import contextlib
import io
import json
import os
from pathlib import Path
import selectors
import runpy
import signal
import subprocess
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch

EXPERIMENTS = Path(__file__).resolve().parents[2] / '.scratch/appium-mcp-migration/candidate-stack/experiments'
spec = importlib.util.spec_from_file_location('owned_group', EXPERIMENTS / 'stop-group.py')
group = importlib.util.module_from_spec(spec)
spec.loader.exec_module(group)
PARENT = '''import json,os,sys,subprocess
if '--platform-child' in sys.argv:
 child=subprocess.Popen(['/bin/sleep','60'],env={})
 print(json.dumps({'escaped':child.pid}),flush=True)
 sys.stdin.readline();child.terminate();child.wait();sys.exit(0)
r,w=os.pipe()
p=os.fork()
if p==0:
 os.close(r);os.setsid()
 if os.fork()!=0:os._exit(0)
 os.write(w,str(os.getpid()).encode());os.close(w)
 null=os.open('/dev/null',os.O_RDWR)
 for fd in (0,1,2):os.dup2(null,fd)
 os.execv(sys.executable,[sys.executable,'-c','import time; time.sleep(60)'])
os.close(w);child=int(os.read(r,64));os.close(r);os.waitpid(p,0)
print(json.dumps({'escaped':child}),flush=True)
sys.stdin.readline()
'''


class DescendantCases(unittest.TestCase):
    def test_bound_private_device_tree_excludes_only_device_internals(self):
        spec = importlib.util.spec_from_file_location('ownership_test', EXPERIMENTS / 'process-ownership.py')
        ownership = importlib.util.module_from_spec(spec);spec.loader.exec_module(ownership)
        udid = '15013501-2535-42EB-A67F-45B015DF18F4'
        device_set = str(EXPERIMENTS.parents[1] / 'runtime/devices/simulators')
        wda = str(EXPERIMENTS.parents[1] / 'runtime/wda-16.14.2/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app')
        profile = {'platform': 'ios', 'caps': {'appium:udid': udid, 'appium:simulatorDevicesSetPath': device_set, 'appium:prebuiltWDAPath': wda}}
        self.profile_path.write_text(json.dumps(profile))
        owner = {'pid': 99999990, 'pgid': 99999990, 'sid': 99999990, 'incarnation': 'owner-start', 'runMarker': 'a' * 32, 'launchChain': [{'pid': 99999990, 'incarnation': 'owner-start'}]}
        self.owner_path.write_text(json.dumps(owner))
        class Loader:
            def create_module(self, spec): return ownership
            def exec_module(self, module): pass
        def snapshot(bound_set=device_set, bound_udid=udid, outside=False, automation=None, exiting=False, absent=False):
            args = {99999901: {'executable': '/usr/libexec/launchd_sim', 'argv': ['launchd_sim', bound_set + '/' + bound_udid + '/launchd_bootstrap.plist']},
                    99999902: {'executable': '/usr/libexec/simulated-service', 'argv': ['simulated-service']},
                    99999903: {'executable': automation or '/usr/libexec/simulated-helper', 'argv': [automation or 'simulated-helper']}}
            lines = [f'99999901 1 99999901 S /usr/libexec/launchd_sim {bound_set}/{bound_udid}/launchd_bootstrap.plist',
                     '99999902 99999901 99999902 S simulated-service', '99999903 99999902 99999903 S simulated-helper']
            if exiting: args.pop(99999903)
            if outside: lines.append('99999904 1 99999904 S outside --device ' + udid)
            def inspect(command, **kwargs):
                if '-p' in command: return subprocess.CompletedProcess(command, 1 if absent else 0, '' if absent else 'S', '')
                return subprocess.CompletedProcess(command, 0, '\n'.join(lines), '')
            output = io.StringIO();code = 0
            with patch.object(ownership, 'process_arguments', side_effect=lambda pid: args.get(pid)), \
                    patch.object(ownership.subprocess, 'run', side_effect=inspect), \
                    patch.object(ownership.group, 'process_incarnation', side_effect=lambda pid: None if exiting and pid == 99999903 else 'start-' + str(pid)), \
                    patch.object(ownership.os, 'getsid', return_value=1), \
                    patch.object(importlib.util, 'spec_from_file_location', return_value=importlib.machinery.ModuleSpec('ownership', Loader())), \
                    patch.object(sys, 'argv', ['verify-native-descendants.py', str(self.root), str(self.owner_path), 'snapshot']), contextlib.redirect_stdout(output):
                try: runpy.run_path(str(EXPERIMENTS / 'verify-native-descendants.py'), run_name='__main__')
                except SystemExit as result: code = result.code
            return code, json.loads(output.getvalue())
        code, result = snapshot()
        self.assertEqual(code, 0, result)
        self.assertEqual([r['pid'] for r in result['candidates'] if r['deviceInternal']], [99999901, 99999902, 99999903])
        self.assertTrue(result['verified']);self.assertFalse(result['quarantined'])
        code, result = snapshot(exiting=True, absent=True)
        self.assertEqual(code, 0, result)
        self.assertFalse(result['candidates'][-1]['active'])
        for changes in [{'bound_udid': 'FOREIGN-UDID'}, {'bound_set': '/foreign/set'}, {'outside': True},
                        {'automation': '/usr/bin/xctest'}, {'automation': '/tmp/WebDriverAgentRunner-Runner'}, {'automation': wda + '/Frameworks/helper'}, {'exiting': True}]:
            with self.subTest(changes=changes):
                code, result = snapshot(**changes)
                self.assertEqual(code, 1, result)
                self.assertFalse(result['verified']);self.assertTrue(result['quarantined'])
                self.assertTrue(result['unverifiedComponents'])

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='jev-descendants-')
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        (self.root / 'components').mkdir(mode=0o700)
        self.profile = {'fakeOnly': True, 'marker': uuid.uuid4().hex}
        self.profile_path = self.root / 'profile.json'
        self.profile_path.write_text(json.dumps(self.profile))
        self.owner_path = self.root / 'owner.json'
        self.env = {'PATH': os.environ['PATH'], 'HOME': str(self.root), 'PYTHONDONTWRITEBYTECODE': '1'}
        self.children = []
        self.escaped = None

    def tearDown(self):
        if self.escaped is not None and group.process_incarnation(self.escaped):
            try: os.kill(self.escaped, signal.SIGTERM)
            except ProcessLookupError: pass
        for child in reversed(self.children):
            if child.poll() is None: child.terminate()
            child.wait(timeout=5)
            for stream in (child.stdin, child.stdout, child.stderr):
                if stream is not None: stream.close()
        self.tmp.cleanup()

    def launch(self, platform=False):
        program = self.root / 'parent.py'
        program.write_text(PARENT)
        child = subprocess.Popen([sys.executable, str(EXPERIMENTS / 'owned-launcher.py'), str(self.owner_path), sys.executable, str(program), *(['--platform-child'] if platform else [])],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=self.env)
        self.children.append(child)
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ)
            self.assertTrue(selector.select(5), 'Owned fork fixture did not become ready')
        line = child.stdout.readline()
        self.assertTrue(line, child.stderr.read() if child.poll() is not None else 'No readiness message')
        self.escaped = json.loads(line)['escaped']
        return child, json.loads(self.owner_path.read_text())

    def inventory(self, mode='snapshot', env=None):
        result = subprocess.run([sys.executable, str(EXPERIMENTS / 'verify-native-descendants.py'), str(self.root), str(self.owner_path), mode],
                                capture_output=True, text=True, env=env or self.env, timeout=25)
        return result.returncode, json.loads(result.stdout)

    def test_escaped_double_fork_is_found_stopped_and_foreign_process_survives(self):
        parent, owner = self.launch()
        foreign = subprocess.Popen(['/bin/sleep', '60'], env=self.env, start_new_session=True)
        self.children.append(foreign)
        code, snapshot = self.inventory()
        self.assertEqual(code, 0, snapshot)
        escaped = next(row for row in snapshot['candidates'] if row['pid'] == self.escaped)
        self.assertTrue(escaped['owned'])
        self.assertEqual(escaped['launchChain'][0], owner['launchChain'][0])
        self.assertNotEqual(escaped['pgid'], owner['pgid'])
        (self.root / 'descendants-before-stop.json').write_text(json.dumps(snapshot))
        parent.stdin.write('exit\n');parent.stdin.flush();parent.wait(timeout=5)
        stopped = subprocess.run([sys.executable, str(EXPERIMENTS / 'stop-native-children.py'), str(self.root), str(self.owner_path), 'stop'],
                                 capture_output=True, text=True, env=self.env, timeout=10)
        self.assertEqual(stopped.returncode, 0, stopped.stderr)
        self.assertTrue(json.loads(stopped.stdout)['recordedChildrenStopped'])
        code, verification = self.inventory('verify')
        self.assertEqual(code, 0, verification)
        self.assertTrue(verification['verified'])
        self.assertIsNone(foreign.poll())
        os.kill(foreign.pid, 0)

    def test_platform_binary_with_recorded_link_is_marker_unreadable_and_quarantined(self):
        parent, owner = self.launch(platform=True)
        code, result = self.inventory()
        self.assertEqual(code, 1)
        self.assertFalse(result['verified'])
        self.assertTrue(result['quarantined'])
        row = next(row for row in result['unverifiedComponents'] if row['pid'] == self.escaped)
        self.assertEqual(row['markerState'], 'unreadable')
        self.assertEqual(row['reason'], 'MARKER_UNREADABLE')
        self.assertFalse(row['owned'])
        self.assertEqual(row['pgid'], owner['pgid'])
        self.assertIsNotNone(group.process_incarnation(self.escaped))

    def test_completed_scan_can_verify_positive_absence_after_native_fence(self):
        parent, owner = self.launch(platform=True)
        code, snapshot = self.inventory()
        self.assertEqual(code, 1)
        self.assertTrue(snapshot['inspectionComplete'])
        (self.root / 'descendants-before-stop.json').write_text(json.dumps(snapshot))
        self.assertEqual(self.inventory('verify')[0], 1, 'Live unreadable component stays quarantined')
        parent.stdin.write('fence\n');parent.stdin.flush();parent.wait(timeout=5)
        code, verification = self.inventory('verify')
        self.assertEqual(code, 0, verification)
        self.assertTrue(verification['verified'])
        self.assertTrue(verification['priorCandidatesAbsent'])

    def test_group_signals_refuse_shared_or_unattested_members(self):
        owner = {'version': 1, 'pid': 99999991, 'pgid': 99999991,
                 'incarnation': 'owner-start', 'script': 'owned-server',
                 'members': [{'pid': 99999992, 'incarnation': 'peer-start'}]}
        leader = {'pid': owner['pid'], 'pgid': owner['pgid'], 'state': 'S', 'command': 'node owned-server'}
        for command, members in [('/sdk/adb fork-server server', owner['members']),
                                 ('/Library/CoreSimulatorService', owner['members']),
                                 ('node unrecorded-helper', [])]:
            with self.subTest(command=command), patch.object(group, 'processes', return_value=[leader, {'pid': 99999992, 'pgid': owner['pgid'], 'state': 'S', 'command': command}]), \
                    patch.object(group, 'process_incarnation', side_effect=lambda pid: 'owner-start' if pid == owner['pid'] else 'peer-start'), \
                    patch.object(group.os, 'killpg') as signal_group:
                with self.assertRaisesRegex(AssertionError, 'EXCLUDED_SHARED_SERVICE|UNATTESTED_GROUP_MEMBER'):
                    group.stop_group({**owner, 'members': members})
                signal_group.assert_not_called()

    def test_recorded_shared_service_is_not_individually_signalled(self):
        child = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(60)'])
        self.children.append(child)
        owner = {'pid': 99999991, 'incarnation': 'owner-start'}
        self.owner_path.write_text(json.dumps(owner))
        record = {'pid': child.pid, 'incarnation': group.process_incarnation(child.pid),
                  'ownerPid': owner['pid'], 'ownerIncarnation': owner['incarnation']}
        (self.root / 'components/shared.json').write_text(json.dumps(record))
        fake_bin = self.root / 'bin';fake_bin.mkdir()
        ps = fake_bin / 'ps'
        ps.write_text('#!/bin/sh\nprintf "%s\\n" "/sdk/adb fork-server server"\n');ps.chmod(0o700)
        result = subprocess.run([sys.executable, str(EXPERIMENTS / 'stop-native-children.py'), str(self.root), str(self.owner_path), 'stop'],
                                capture_output=True, text=True, env={**self.env, 'PATH': str(fake_bin) + os.pathsep + self.env['PATH']}, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads(result.stdout)
        self.assertTrue(receipt['components'][0]['excludedSharedService'])
        self.assertEqual(receipt['components'][0]['signals'], [])
        self.assertIsNone(child.poll())

    def test_original_reproducer_without_launch_attestation_is_not_verified(self):
        parent, owner = self.launch()
        del owner['runMarker'];del owner['launchChain']
        self.owner_path.write_text(json.dumps(owner))
        code, snapshot = self.inventory()
        self.assertEqual(code, 1)
        self.assertFalse(snapshot['verified'])
        self.assertTrue(snapshot['quarantined'])
        self.assertIn('MISSING_LAUNCH_ATTESTATION', snapshot['reason'])
        self.assertIsNotNone(group.process_incarnation(self.escaped))

    def test_unverifiable_leftover_is_quarantined_and_not_signalled(self):
        parent, owner = self.launch()
        fake_bin = self.root / 'bin';fake_bin.mkdir()
        row = '99999999 1 99999999 S sleep JEV_PHASE1_RUN_MARKER=' + owner['runMarker'] + ' JEV_PHASE1_ANCESTRY=' + base64.urlsafe_b64encode(json.dumps(owner['launchChain']).encode()).decode()
        ps = fake_bin / 'ps';ps.write_text('#!' + sys.executable + '\nprint(' + repr(row) + ')\n');ps.chmod(0o700)
        code, result = self.inventory(env={**self.env, 'PATH': str(fake_bin) + os.pathsep + self.env['PATH']})
        self.assertEqual(code, 1)
        self.assertFalse(result['verified'])
        self.assertTrue(result['quarantined'])
        self.assertEqual(result['unverifiedComponents'][0]['pid'], 99999999)
        self.assertEqual(result['unverifiedComponents'][0]['reason'], 'UNVERIFIABLE_OWNERSHIP')
        self.assertIsNone(parent.poll())

    def test_inspection_timeout_retains_quarantine(self):
        parent, owner = self.launch()
        fake_bin = self.root / 'bin';fake_bin.mkdir()
        ps = fake_bin / 'ps';ps.write_text('#!/bin/sh\nexec /bin/sleep 5\n');ps.chmod(0o700)
        self.profile['inspectionTimeoutSeconds'] = 0.05
        self.profile_path.write_text(json.dumps(self.profile))
        code, result = self.inventory(env={**self.env, 'PATH': str(fake_bin) + os.pathsep + self.env['PATH']})
        self.assertEqual(code, 1)
        self.assertFalse(result['verified'])
        self.assertTrue(result['quarantined'])
        self.assertEqual(result['reason'], 'HOST_INVENTORY_DEADLINE_EXCEEDED')
        self.assertIsNone(parent.poll())
        (self.root / 'descendants-before-stop.json').write_text(json.dumps(result))
        code, verification = self.inventory('verify')
        self.assertEqual(code, 1)
        self.assertIn('PRE_STOP_INVENTORY_UNVERIFIED', verification['reason'])


if __name__ == '__main__':
    os.umask(0o077)
    unittest.main()
