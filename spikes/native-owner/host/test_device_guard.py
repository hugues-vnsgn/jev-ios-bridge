"""Exercise the research claim and the real Bridge consumer without a device."""
import json
import os
import stat
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from device_guard import DeviceGuard, DeviceGuardError, default_lease_root


HOST = Path(__file__).resolve().parent
REPOSITORY = HOST.parents[2]
DEVICE = "ABCDEF00-1234-ABCD-0000-000000000123"


def bridge_take(root):
    loader = Path(os.environ.get("JEV_NATIVE_OWNER_TSX_LOADER",
                               REPOSITORY / "node_modules/tsx/dist/loader.mjs"))
    if not loader.is_file():
        raise AssertionError("Install package dependencies or set JEV_NATIVE_OWNER_TSX_LOADER")
    script = """
      const { DeviceLease, DeviceLeaseBusyError, DEFAULT_LEASE_ROOT } = await import(process.env.LEASE_SOURCE);
      const lease = new DeviceLease({root: process.env.GUARD_ROOT});
      try {
        await lease.take(process.env.GUARD_DEVICE);
        console.log(JSON.stringify({busy: false, held: lease.held, defaultRoot: DEFAULT_LEASE_ROOT}));
        await lease.release();
      } catch (error) {
        if (!(error instanceof DeviceLeaseBusyError)) throw error;
        console.log(JSON.stringify({busy: true, held: lease.held, holder: error.holder,
                                   defaultRoot: DEFAULT_LEASE_ROOT}));
      }
    """
    result = subprocess.run(["node", "--import", str(loader), "--input-type=module",
                             "--eval", script], cwd=REPOSITORY, capture_output=True,
                            text=True, check=True, env={"PATH": os.environ["PATH"],
                            "LEASE_SOURCE": (REPOSITORY / "src/device/lease.ts").as_uri(),
                            "GUARD_ROOT": str(root), "GUARD_DEVICE": DEVICE,
                            **{name: os.environ[name] for name in ("TMPDIR", "TMP", "TEMP")
                               if name in os.environ}})
    return json.loads(result.stdout)


class DeviceExclusion(unittest.TestCase):
    def test_guard_is_one_use_and_cannot_release_before_take_or_after_release(self):
        with tempfile.TemporaryDirectory() as directory:
            guard = DeviceGuard(Path(directory) / "leases", DEVICE, "one-use",
                                Path(directory) / "evidence")
            self.assertFalse(guard.created)
            with self.assertRaises(DeviceGuardError) as refused:
                guard.release()
            self.assertEqual(refused.exception.reason, "DEVICE_GUARD_NOT_HELD")
            path = Path(guard.take()["path"])
            before = path.read_bytes()
            with self.assertRaises(DeviceGuardError) as refused:
                guard.take()
            self.assertEqual(refused.exception.reason, "DEVICE_GUARD_ALREADY_ATTEMPTED")
            self.assertEqual(path.read_bytes(), before)
            guard.release()
            with self.assertRaises(DeviceGuardError) as refused:
                guard.check()
            self.assertEqual(refused.exception.reason, "DEVICE_GUARD_NOT_HELD")

    def test_default_namespace_matches_node_with_standard_symlinked_temp_ancestry(self):
        with tempfile.TemporaryDirectory() as directory:
            actual = Path(directory) / "actual-temp"
            actual.mkdir()
            alias = Path(directory) / "temp-alias"
            alias.symlink_to(actual, target_is_directory=True)
            with patch.dict(os.environ, {"TMPDIR": str(alias) + "/"}):
                guard = DeviceGuard(None, DEVICE, "default-root", Path(directory) / "evidence")
                path = Path(guard.take()["path"])
                result = bridge_take(default_lease_root())
                self.assertEqual(result["defaultRoot"], str(alias / "jev-ios-bridge-device-locks"))
                self.assertEqual(path.parent, Path(result["defaultRoot"]))
                self.assertTrue(result["busy"])
                guard.release()

    def test_changed_or_missing_or_symlinked_owned_claim_is_retained(self):
        for change in ("token", "other-field", "missing", "symlink", "hardlink", "mode", "oversize"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                guard = DeviceGuard(Path(directory) / "leases", DEVICE, "owner",
                                    Path(directory) / "evidence")
                path = Path(guard.take()["path"])
                target = Path(directory) / "external"
                if change in ("token", "other-field"):
                    record = json.loads(path.read_bytes())
                    record["token" if change == "token" else "hostPID"] = "changed"
                    path.write_text(json.dumps(record))
                elif change == "missing":
                    path.unlink()
                elif change == "symlink":
                    path.rename(target)
                    path.symlink_to(target)
                elif change == "hardlink":
                    os.link(path, target)
                elif change == "mode":
                    path.chmod(0o644)
                else:
                    path.write_bytes(b"x" * (1024 * 1024))
                before = path.read_bytes() if path.exists() else None
                with self.assertRaises(DeviceGuardError) as refused:
                    guard.check()
                self.assertEqual(refused.exception.reason, "DEVICE_GUARD_UNCERTAIN")
                with self.assertRaises(DeviceGuardError):
                    guard.release()
                self.assertTrue(guard.created)
                self.assertFalse(guard.released)
                if before is not None:
                    self.assertEqual(path.read_bytes(), before)
                else:
                    self.assertFalse(path.exists())

    def test_replaced_or_symlinked_lease_directory_is_not_used(self):
        for replacement in ("directory", "symlink"):
            with self.subTest(replacement=replacement), tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / "leases"
                guard = DeviceGuard(root, DEVICE, "owner", Path(directory) / "evidence")
                path = Path(guard.take()["path"])
                old = root.with_name("old-leases")
                root.rename(old)
                if replacement == "symlink":
                    root.symlink_to(old, target_is_directory=True)
                else:
                    root.mkdir()
                    (root / path.name).write_bytes((old / path.name).read_bytes())
                with self.assertRaises(DeviceGuardError) as refused:
                    guard.release()
                self.assertEqual(refused.exception.reason, "DEVICE_GUARD_UNCERTAIN")
                self.assertTrue((old / path.name).exists())
                self.assertTrue(path.exists())

    def test_symlinked_lease_root_is_refused_before_creating_a_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            actual = Path(directory) / "actual"
            actual.mkdir()
            root = Path(directory) / "leases"
            root.symlink_to(actual, target_is_directory=True)
            guard = DeviceGuard(root, DEVICE, "owner", Path(directory) / "evidence")
            with self.assertRaises(DeviceGuardError) as refused:
                guard.take()
            self.assertEqual(refused.exception.reason, "DEVICE_GUARD_UNCERTAIN")
            self.assertFalse(guard.created)
            self.assertEqual(list(actual.iterdir()), [])

    def test_uncertain_partial_write_preserves_created_fact_and_durable_intent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "leases"
            evidence = Path(directory) / "evidence"
            guard = DeviceGuard(root, DEVICE, "partial", evidence)
            path = Path(guard.provenance["path"])
            write = os.write
            def fail_claim_write(descriptor, content):
                if path.exists() and os.fstat(descriptor).st_ino == path.stat().st_ino:
                    write(descriptor, b"{")
                    raise OSError("simulated disk write failure")
                return write(descriptor, content)
            with patch("device_guard.os.write", side_effect=fail_claim_write):
                with self.assertRaises(DeviceGuardError) as refused:
                    guard.take()
            self.assertEqual(refused.exception.reason, "DEVICE_GUARD_UNCERTAIN")
            self.assertTrue(guard.created)
            self.assertFalse(guard.released)
            intent = json.loads((evidence / "device-guard-intent.json").read_bytes())
            self.assertEqual(intent, {"state": "pending", **guard.provenance})
            with self.assertRaises(DeviceGuardError):
                guard.release()
            self.assertEqual(path.read_bytes(), b"{")
            self.assertTrue(bridge_take(root)["busy"])

    def test_unsynced_intent_prevents_claim_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "leases"
            guard = DeviceGuard(root, DEVICE, "failed-intent", Path(directory) / "evidence")
            with patch("device_guard.os.fsync", side_effect=OSError("intent sync failed")):
                with self.assertRaises(DeviceGuardError) as refused:
                    guard.take()
            self.assertEqual(refused.exception.reason, "DEVICE_GUARD_UNCERTAIN")
            self.assertFalse(guard.created)
            self.assertFalse(root.exists())

    def test_unsynced_created_claim_is_kept_with_truthful_ownership(self):
        with tempfile.TemporaryDirectory() as directory:
            guard = DeviceGuard(Path(directory) / "leases", DEVICE, "claim-sync-fails",
                                Path(directory) / "evidence")
            path = Path(guard.provenance["path"])
            sync = os.fsync
            def fail_claim_sync(descriptor):
                if path.exists() and os.fstat(descriptor).st_ino == path.stat().st_ino:
                    raise OSError("claim sync failed")
                sync(descriptor)
            with patch("device_guard.os.fsync", side_effect=fail_claim_sync):
                with self.assertRaises(DeviceGuardError):
                    guard.take()
            self.assertTrue(guard.created)
            self.assertFalse(guard.released)
            with self.assertRaises(DeviceGuardError):
                guard.release()
            self.assertTrue(bridge_take(path.parent)["busy"])

    def test_unlink_failure_keeps_claim_and_latches_uncertainty(self):
        with tempfile.TemporaryDirectory() as directory:
            guard = DeviceGuard(Path(directory) / "leases", DEVICE, "unlink-fails",
                                Path(directory) / "evidence")
            path = Path(guard.take()["path"])
            before = path.read_bytes()
            with patch("device_guard.os.unlink", side_effect=OSError("unlink failed")):
                with self.assertRaises(DeviceGuardError):
                    guard.release()
            with self.assertRaises(DeviceGuardError):
                guard.release()
            self.assertEqual(path.read_bytes(), before)
            self.assertFalse(guard.released)

    def test_competing_frontends_have_one_owner_and_both_exit_naturally(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "leases"
            script = """
import json, sys
from device_guard import DeviceGuard, DeviceGuardError
guard = DeviceGuard(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
print("ready", flush=True)
sys.stdin.readline()
try:
    guard.take()
    print(json.dumps({"created": guard.created, "reason": "owned"}), flush=True)
except DeviceGuardError as error:
    print(json.dumps({"created": guard.created, "reason": error.reason}), flush=True)
"""
            children = [subprocess.Popen([sys.executable, "-c", script, str(root), DEVICE,
                         name, str(Path(directory) / name)], cwd=HOST, stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                         env={"PATH": os.environ["PATH"]}) for name in ("first", "second")]
            for child in children:
                self.assertEqual(child.stdout.readline().strip(), "ready")
            for child in children:
                child.stdin.write("go\n")
                child.stdin.flush()
            results = [json.loads(child.stdout.readline()) for child in children]
            for child in children:
                child.stdin.close()
                self.assertEqual(child.wait(), 0, child.stderr.read())
                child.stdout.close()
                child.stderr.close()
            self.assertEqual(sorted(row["reason"] for row in results), ["DEVICE_GUARD_BUSY", "owned"])
            self.assertEqual(sum(row["created"] for row in results), 1)
            self.assertTrue(bridge_take(root)["busy"])

    def test_existing_dead_or_malformed_or_symlinked_claim_is_never_taken_over(self):
        departed = subprocess.Popen([sys.executable, "-c", "pass"])
        self.assertEqual(departed.wait(), 0)
        for existing in ("dead", "unknown", "malformed", "symlink", "directory"):
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / "leases"
                root.mkdir()
                lease = root / (DEVICE + ".lock")
                target = Path(directory) / "foreign"
                target.write_bytes(b"foreign data")
                if existing == "symlink":
                    lease.symlink_to(target)
                elif existing == "directory":
                    lease.mkdir()
                else:
                    content = (b"not JSON" if existing == "malformed" else
                               json.dumps({"pid": None if existing == "unknown"
                                           else departed.pid, "token": "foreign"}).encode())
                    lease.write_bytes(content)
                before = lease.read_bytes() if existing != "directory" else None
                guard = DeviceGuard(root, DEVICE, "contender", Path(directory) / "evidence")
                with self.assertRaises(DeviceGuardError) as refused:
                    guard.take()
                self.assertEqual(refused.exception.reason, "DEVICE_GUARD_BUSY")
                self.assertFalse(guard.created)
                if before is not None:
                    self.assertEqual(lease.read_bytes(), before)
                self.assertEqual(target.read_bytes(), b"foreign data")

    def test_byte_identical_replacement_cannot_be_released_as_our_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            guard = DeviceGuard(Path(directory) / "leases", DEVICE, "original",
                                Path(directory) / "evidence")
            path = Path(guard.take()["path"])
            before = path.read_bytes()
            replacement = path.with_suffix(".replacement")
            replacement.write_bytes(before)
            replacement.chmod(0o600)
            replacement.replace(path)
            with self.assertRaises(DeviceGuardError) as refused:
                guard.release()
            self.assertEqual(refused.exception.reason, "DEVICE_GUARD_UNCERTAIN")
            self.assertEqual(path.read_bytes(), before)
            self.assertFalse(guard.released)

    def test_matching_settled_owner_can_release_its_private_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "leases"
            guard = DeviceGuard(root, DEVICE.lower(), "ordinary-metadata",
                                Path(directory) / "evidence")
            claim = guard.take()
            path = Path(claim["path"])
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertIsNone(claim["record"]["pid"])
            self.assertEqual(claim["record"]["hostPID"], os.getpid())
            self.assertEqual(claim["record"]["deviceId"], DEVICE)
            self.assertEqual(claim["record"]["runId"], "ordinary-metadata")
            self.assertTrue(guard.created)
            self.assertFalse(guard.released)
            claim["record"]["token"] = "caller-mutated-copy"
            self.assertNotEqual(guard.provenance["record"]["token"], "caller-mutated-copy")
            self.assertEqual(guard.check(), guard.provenance)
            self.assertEqual(guard.release(), guard.provenance)
            self.assertTrue(guard.released)
            self.assertFalse(path.exists())
            self.assertFalse(bridge_take(root)["busy"])

    def test_bridge_keeps_research_claim_after_claiming_host_exits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "leases"
            script = """
import json, sys
from device_guard import DeviceGuard
guard = DeviceGuard(sys.argv[1], sys.argv[2], "departed-host", sys.argv[3])
print(json.dumps(guard.take()))
"""
            claimant = subprocess.run([sys.executable, "-c", script, str(root), DEVICE,
                                       str(Path(directory) / "evidence")], cwd=HOST,
                                      capture_output=True, text=True, check=True,
                                      env={"PATH": os.environ["PATH"]})
            claim = json.loads(claimant.stdout)
            before = Path(claim["path"]).read_bytes()
            result = bridge_take(root)
            self.assertTrue(result["busy"], "Bridge must not reclaim an unknown native owner")
            self.assertFalse(result["held"])
            self.assertEqual(Path(claim["path"]).read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
