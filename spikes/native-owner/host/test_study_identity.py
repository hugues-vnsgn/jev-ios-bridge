"""Successor admission through the ordinary study Interface; no device is contacted."""
from dataclasses import replace
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import tempfile
import sys
import unittest
from unittest.mock import patch

from study import Dependencies, run_study
from test_study import Clock, Tools, configuration, bind


class BoundStudies(unittest.TestCase):
    def test_actual_cli_refuses_a_symlinked_binding_or_build_before_any_device_command(self):
        for field in ("binding", "derived"):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as raw:
                root = Path(raw).resolve(); config = configuration(root)
                link = root/"input-link"
                link.symlink_to(config.build_binding if field == "binding" else config.derived_data)
                cli_spec = importlib.util.spec_from_file_location("study_identity_cli",config.source_root/"host/run.py")
                cli = importlib.util.module_from_spec(cli_spec); cli_spec.loader.exec_module(cli)
                clock = Clock(); tools = Tools(clock,config); stdout = io.StringIO()
                with patch.object(cli,"ProcessTools",lambda path:tools), patch.object(sys,"argv",[
                        "run.py","--plan","metadata","--derived-data",str(link if field == "derived" else config.derived_data),
                        "--build-binding",str(link if field == "binding" else config.build_binding),
                        "--evidence-directory",str(config.evidence_directory)]), \
                        patch.dict("os.environ",{"TMPDIR":str(root/"cli-temp")}), redirect_stdout(stdout):
                    code = cli.main()
                result = json.loads(stdout.getvalue())
                self.assertEqual((code,result["status"]),(2,"refused"))
                self.assertEqual(tools.commands,[])

    def test_missing_binding_refuses_before_any_simulator_command(self):
        with tempfile.TemporaryDirectory() as root:
            config = replace(configuration(root), build_binding=None)
            clock = Clock(); tools = Tools(clock, config)
            result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual((result.status, result.reason), ("refused", "BUILD_BINDING_MISSING"))
            self.assertEqual(tools.commands, [])

    def test_metadata_uses_its_bound_profile_and_leaves_old_registration_untouched(self):
        with tempfile.TemporaryDirectory() as root:
            config = configuration(root)
            clock = Clock(); tools = Tools(clock, config)
            legacy = "dev.jev.research.native-owner-study.xctrunner"
            tools.installed.add(legacy)
            result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
            self.assertEqual((result.status, result.reason), ("completed", "METADATA_COMPLETED"))
            self.assertEqual(tools.installed, {legacy})
            self.assertFalse(any(legacy in command for command in tools.commands))
            self.assertIn(["xcrun", "simctl", "uninstall",
                "0E42FDE2-5E09-42D3-9876-9EF0037FCBE7",
                "dev.jev.research.native-owner-20261007-metadata.xctrunner"], tools.commands)

    def test_missing_or_wrong_runtime_identity_never_authorizes_cleanup(self):
        for mode in ("missing", "wrong-fixture"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as root:
                config = configuration(root)
                clock = Clock(); tools = Tools(clock, config)
                def mutate(rows):
                    if mode == "missing":
                        rows.pop(1)
                        for index, row in enumerate(rows): row["sequence"] = index
                    else:
                        rows[1]["details"]["studyIdentity"]["fixture"] = "dev.foreign.fixture"
                    return rows
                tools.mutate = mutate
                result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
                self.assertEqual(result.status, "retained")
                self.assertFalse(any("uninstall" in command for command in tools.commands))
                self.assertTrue((config.evidence_directory / "stop-admission").is_file())

    def test_unbound_nested_fixture_input_refuses_before_any_simulator_command(self):
        for name in ("Dependency.m", "README.md"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as root:
                config = configuration(root)
                nested = config.source_root / "fixture/Nested" / name
                nested.parent.mkdir()
                nested.write_text("unbound nested build input")
                clock = Clock(); tools = Tools(clock, config)
                result = run_study("metadata", config, Dependencies(tools, clock.now, clock.sleep))
                self.assertEqual(result.status,"refused")
                self.assertEqual(tools.commands,[])

    def test_changed_fixture_identity_cannot_receive_a_recreation_write(self):
        with tempfile.TemporaryDirectory() as root:
            config = configuration(root,plan="reference-study")
            clock = Clock(); tools = Tools(clock,config)
            def mutate(rows):
                tools.telemetry["bundleIdentifier"] = "dev.foreign.fixture"
                rows[2]["operation"] = "fixture-recreation"
                rows[2]["details"] = {"request":"recreate"}
                return rows
            tools.mutate = mutate
            result = run_study("reference-study",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual((result.status,result.reason),("retained","FIXTURE_READINESS_UNCONFIRMED"))
            self.assertFalse((config.source_root/"fixture-data/Documents/recreate.request").exists())

    def test_altered_binding_source_product_plan_and_inventories_start_no_device_work(self):
        for mode in ("binding-plan", "binding-identity", "extra-field", "source", "declaration", "template",
                     "generated-project", "extra-generated-file", "product", "extra-product", "missing-product",
                     "test-plan", "source-symlink", "product-directory-symlink", "binding-symlink"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as root:
                config = configuration(root)
                products = config.derived_data / "Build/Products"
                if (mode.startswith("binding-") and mode != "binding-symlink") or mode == "extra-field":
                    receipt = json.loads(config.build_binding.read_text())
                    if mode == "binding-plan": receipt["plan"] = "reference-study"
                    elif mode == "binding-identity": receipt["identity"]["runner"] = "dev.foreign.runner"
                    else: receipt["unsupported"] = True
                    config.build_binding.write_text(json.dumps(receipt))
                elif mode == "source": (config.source_root/"native/Study.m").write_text("// changed source")
                elif mode == "declaration": (config.source_root/"study-identities.json").write_text("{}")
                elif mode == "template": (config.source_root/"native/StudyInfo.plist").write_bytes(b"changed template")
                elif mode == "generated-project": (config.source_root/"native/NativeOwnerStudy.xcodeproj/project.pbxproj").write_text("changed project")
                elif mode == "extra-generated-file": (config.source_root/"native/NativeOwnerStudy.xcodeproj/extra.txt").write_text("extra")
                elif mode == "product": (products/"Debug-iphonesimulator/NativeOwnerFixture.app/executable").write_bytes(b"changed product")
                elif mode == "extra-product": (products/"extra-product").write_bytes(b"extra product")
                elif mode == "missing-product": (products/"Debug-iphonesimulator/NativeOwnerFixture.app/executable").unlink()
                elif mode == "test-plan": (products/"NativeOwnerStudy.xctestrun").write_bytes(b"changed plan")
                else:
                    if mode == "source-symlink": path = config.source_root/"native/Study.m"
                    elif mode == "product-directory-symlink": path = products/"Debug-iphonesimulator/NativeOwnerFixture.app"
                    else: path = config.build_binding
                    target = path.with_name(path.name+".original")
                    path.rename(target); path.symlink_to(target)
                clock = Clock(); tools = Tools(clock,config)
                result = run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual(result.status,"refused")
                self.assertEqual(tools.commands,[])
                self.assertFalse((config.lease_root/("0E42FDE2-5E09-42D3-9876-9EF0037FCBE7.lock")).exists())

    def test_cross_plan_build_cannot_admit_the_other_study(self):
        for build_plan, requested in (("metadata","reference-study"),("reference-study","metadata")):
            with self.subTest(build_plan=build_plan), tempfile.TemporaryDirectory() as root:
                config = configuration(root,plan=build_plan)
                clock = Clock(); tools = Tools(clock,config)
                result = run_study(requested,config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual((result.status,result.reason),("refused","BUILD_BINDING_IDENTITY_MISMATCH"))
                self.assertEqual(tools.commands,[])

    def test_bound_extra_startup_dependency_still_refuses_before_device_work(self):
        with tempfile.TemporaryDirectory() as root:
            config = configuration(root)
            path = config.derived_data/"Build/Products/NativeOwnerStudy.xctestrun"
            plan = plistlib.loads(path.read_bytes())
            plan["NativeOwnerStudy"]["DependentProductPaths"].append("/private/tmp/Foreign.app")
            path.write_bytes(plistlib.dumps(plan))
            bind(config)
            clock = Clock(); tools = Tools(clock,config)
            result = run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual((result.status,result.reason),("refused","TEST_PLAN_DEPENDENCIES_INVALID"))
            self.assertEqual(tools.commands,[])

    def test_runtime_identity_duplicate_or_late_retains_without_recreation(self):
        for mode in ("duplicate", "late", "activation-wrong-fixture"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as root:
                config = configuration(root,plan="reference-study")
                clock = Clock(); tools = Tools(clock,config)
                def mutate(rows):
                    if mode == "duplicate": rows.insert(2,dict(rows[1]))
                    elif mode == "late": rows[1],rows[2] = rows[2],rows[1]
                    else:
                        rows[2]["operation"] = "fixture-recreation"
                        rows[2]["details"] = {"setup":"activate","bundleId":"dev.foreign.fixture"}
                    for index,row in enumerate(rows): row["sequence"] = index; row["elapsedMs"] = index
                    return rows
                tools.mutate = mutate
                result = run_study("reference-study",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual(result.status,"retained")
                self.assertFalse((config.source_root/"fixture-data/Documents/recreate.request").exists())
                self.assertFalse(any("uninstall" in command for command in tools.commands))

    def test_wrong_initial_fixture_identity_prevents_native_work(self):
        with tempfile.TemporaryDirectory() as root:
            config = configuration(root,plan="reference-study")
            clock = Clock(); tools = Tools(clock,config)
            tools.telemetry["bundleIdentifier"] = "dev.jev.research.native-owner-20261007-metadata-fixture"
            result = run_study("reference-study",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual((result.status,result.reason),("retained","FIXTURE_READINESS_UNCONFIRMED"))
            self.assertFalse(any(command[0] == "xcodebuild" for command in tools.commands))

    def test_a_positive_selected_profile_lookup_stops_without_another_identity_attempt(self):
        for plan, runner in (("metadata","dev.jev.research.native-owner-20261007-metadata.xctrunner"),
                             ("reference-study","dev.jev.research.native-owner-20261007-reference.xctrunner")):
            with self.subTest(plan=plan), tempfile.TemporaryDirectory() as root:
                config = configuration(root,plan=plan)
                clock = Clock(); tools = Tools(clock,config); tools.installed.add(runner)
                result = run_study(plan,config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual((result.status,result.reason),("refused","APP_ABSENCE_UNCONFIRMED"))
                self.assertEqual(tools.installed,{runner})
                self.assertFalse(any("install" in command or "uninstall" in command or command[0] == "xcodebuild"
                                     for command in tools.commands))


if __name__ == "__main__": unittest.main()
