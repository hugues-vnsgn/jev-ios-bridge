"""Caller regressions for device exclusion; no simulator is contacted."""
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from study import Dependencies, UDID, RUNNER, run_study
from test_study import Clock, Tools, configuration
import reconcile
from test_reconcile import CaseFixture, Tools as RecoveryTools, Child as RecoveryChild


def isolated_configuration(root):
    # This duck-typed configuration also exercises the pre-guard implementation.
    config = configuration(root)
    return SimpleNamespace(**{**vars(config), "lease_root":Path(root) / "leases"})


def lease_path(config):
    return config.lease_root / (UDID + ".lock")


class DeviceOwnership(unittest.TestCase):
    def test_existing_claim_refuses_before_any_device_tool(self):
        with tempfile.TemporaryDirectory() as root:
            config = isolated_configuration(root)
            path = lease_path(config)
            path.parent.mkdir()
            foreign = b'{"pid":null,"token":"another-owner"}\n'
            path.write_bytes(foreign)
            clock = Clock(); tools = Tools(clock, config)
            result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual((result.status, result.reason), ("refused", "DEVICE_GUARD_BUSY"))
            self.assertEqual(tools.commands, [])
            self.assertEqual(path.read_bytes(), foreign)

    def test_metadata_holds_guard_through_restoration_then_releases(self):
        with tempfile.TemporaryDirectory() as root:
            config = isolated_configuration(root)
            clock = Clock()
            class CheckedTools(Tools):
                def start(inner, argv, env, cwd):
                    record = json.loads(lease_path(config).read_bytes())
                    self.assertIsNone(record["pid"])
                    self.assertEqual(record["hostPID"], os.getpid())
                    self.assertEqual(record["deviceId"], UDID)
                    return super().start(argv, env, cwd)
            tools = CheckedTools(clock, config)
            result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual(result.reason, "METADATA_COMPLETED")
            self.assertEqual(tools.state, "Shutdown")
            self.assertFalse(lease_path(config).exists())

    def test_reference_retains_guard_and_blocks_a_later_study(self):
        with tempfile.TemporaryDirectory() as root:
            config = isolated_configuration(root)
            clock = Clock(); tools = Tools(clock, config)
            result = run_study("reference-study", config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual(result.reason, "NATIVE_SETTLEMENT_UNCONFIRMED")
            retained = lease_path(config).read_bytes()
            other = SimpleNamespace(**{**vars(config), "evidence_directory":Path(root) / "later"})
            later_tools = Tools(clock, other)
            later = run_study("metadata", other, Dependencies(later_tools, clock.now, clock.sleep))
            self.assertEqual(later.reason, "DEVICE_GUARD_BUSY")
            self.assertEqual(later_tools.commands, [])
            self.assertEqual(lease_path(config).read_bytes(), retained)
            self.assertTrue(any(item.get("kind") == "device-guard" for item in result.retained_resources))

    def test_replaced_claim_prevents_uninstall_and_is_never_deleted(self):
        with tempfile.TemporaryDirectory() as root:
            config = isolated_configuration(root)
            clock = Clock(); foreign = b'{"pid":null,"token":"replacement"}\n'
            class ReplacedTools(Tools):
                def start(inner, argv, env, cwd):
                    child = super().start(argv, env, cwd)
                    if argv[:3] == ["xcrun", "simctl", "get_app_container"] and argv[4] == RUNNER and RUNNER in inner.installed:
                        lease_path(config).write_bytes(foreign)
                    return child
            tools = ReplacedTools(clock, config)
            result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual(result.status, "retained")
            self.assertIn(RUNNER, tools.installed)
            self.assertFalse(any("uninstall" in command for command in tools.commands))
            self.assertEqual(lease_path(config).read_bytes(), foreign)

    def test_settled_pre_native_refusal_releases_only_its_claim(self):
        with tempfile.TemporaryDirectory() as root:
            config = isolated_configuration(root)
            clock = Clock(); tools = Tools(clock, config)
            tools.inventory_change = lambda device: {**device, "name":"foreign"}
            result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual((result.status, result.reason), ("refused", "DEVICE_IDENTITY_OR_STATE"))
            self.assertFalse(lease_path(config).exists())

    def test_uncertain_pre_native_restoration_keeps_guard(self):
        with tempfile.TemporaryDirectory() as root:
            config = isolated_configuration(root)
            clock = Clock()
            class ChangedTools(Tools):
                def start(inner, argv, env, cwd):
                    if argv[:3] == ["xcrun", "simctl", "list"] and any("shutdown" in call for call in inner.commands):
                        inner.inventory_change = lambda device: {**device, "state":"Booted"}
                    return super().start(argv, env, cwd)
            tools = ChangedTools(clock, config); tools.absence_code = 1
            result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual((result.status, result.reason), ("retained", "PREPARATION_RESTORE_UNCONFIRMED"))
            self.assertTrue(lease_path(config).is_file())

    def test_recovery_inspection_holds_then_releases_its_guard(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = CaseFixture(root); config = fixture.config(); tools = RecoveryTools(fixture); clock = Clock()
            before = {str(path.relative_to(fixture.original)):path.read_bytes() for path in fixture.original.rglob("*") if path.is_file()}
            tools.before = lambda argv: self.assertTrue(lease_path(config).is_file())
            with patch.object(reconcile, "_case_data", return_value=(fixture.case, fixture.archive)):
                result = reconcile.reconcile_metadata(fixture.original, config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual(result.reason, "METADATA_RECONCILIATION_READY")
            self.assertFalse(lease_path(config).exists())
            self.assertTrue(tools.installed)
            self.assertEqual(before, {str(path.relative_to(fixture.original)):path.read_bytes() for path in fixture.original.rglob("*") if path.is_file()})

    def test_recovery_busy_claim_refuses_before_any_device_tool(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = CaseFixture(root); config = fixture.config(); tools = RecoveryTools(fixture); clock = Clock()
            path = lease_path(config); path.parent.mkdir(); foreign = b'{"pid":null,"token":"another"}'
            path.write_bytes(foreign)
            with patch.object(reconcile, "_case_data", return_value=(fixture.case, fixture.archive)):
                result = reconcile.reconcile_metadata(fixture.original, config, Dependencies(tools, clock.now, clock.sleep), True)
            self.assertEqual((result.status, result.reason), ("refused", "DEVICE_GUARD_BUSY"))
            self.assertEqual(tools.commands, [])
            self.assertEqual(path.read_bytes(), foreign)

    def test_recovery_apply_holds_guard_through_shutdown_and_releases_on_success(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = CaseFixture(root); config = fixture.config(); tools = RecoveryTools(fixture); clock = Clock()
            tools.before = lambda argv: self.assertTrue(lease_path(config).is_file())
            with patch.object(reconcile, "_case_data", return_value=(fixture.case, fixture.archive)):
                result = reconcile.reconcile_metadata(fixture.original, config, Dependencies(tools, clock.now, clock.sleep), True)
            self.assertEqual(result.reason, "METADATA_RESOURCES_RECONCILED")
            self.assertEqual(tools.state, "Shutdown")
            self.assertFalse(lease_path(config).exists())

    def test_uncertain_recovery_apply_keeps_device_guard_and_one_use_claim(self):
        with tempfile.TemporaryDirectory() as root:
            fixture = CaseFixture(root); config = fixture.config(); tools = RecoveryTools(fixture); clock = Clock()
            tools.overrides[("xcrun", "simctl", "uninstall", UDID, RUNNER)] = lambda: RecoveryChild(1)
            with patch.object(reconcile, "_case_data", return_value=(fixture.case, fixture.archive)):
                result = reconcile.reconcile_metadata(fixture.original, config, Dependencies(tools, clock.now, clock.sleep), True)
            self.assertEqual(result.status, "retained")
            self.assertTrue(lease_path(config).is_file())
            self.assertTrue(any(item.get("kind") == "device-guard" for item in result.retained_resources))
            claim = fixture.original.parent / ("." + fixture.original.name + ".metadata-reconciliation-claim.json")
            self.assertEqual(json.loads(claim.read_bytes())["state"], "retained")

    def test_unsettled_inspection_keeps_guard(self):
        class Pending(RecoveryChild):
            def poll(self): return None
            def has_live_owned_group(self): return True
        with tempfile.TemporaryDirectory() as root:
            fixture = CaseFixture(root); config = fixture.config(seconds=.05); tools = RecoveryTools(fixture); clock = Clock()
            tools.overrides[("/bin/ps", "-p", "13915", "-o", "pid=", "-o", "comm=")] = Pending
            with patch.object(reconcile, "_case_data", return_value=(fixture.case, fixture.archive)):
                result = reconcile.reconcile_metadata(fixture.original, config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual((result.status, result.reason), ("retained", "ADMISSION_EXPIRED"))
            self.assertTrue(lease_path(config).is_file())


if __name__ == "__main__":
    unittest.main()
