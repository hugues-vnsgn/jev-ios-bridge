"""Builder CLI against external command doubles, without a device destination."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class Builder(unittest.TestCase):
    def setup_build(self, root, fault=None, require_user=False):
        source = root / "source"
        actual = Path(__file__).resolve().parent.parent
        shutil.copytree(actual, source, ignore=shutil.ignore_patterns("__pycache__", "*.xcodeproj"))
        commands = root / "commands"; commands.mkdir()
        script = '''#!EXECUTABLE
import json, os, pathlib, plistlib, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
if name == "xcodegen" and REQUIRE_USER and not os.environ.get("USER"):
    raise SystemExit("XcodeGen requires the current username")
if REQUIRE_USER and any(key in os.environ for key in ("TYPESAFE_API_KEY","JEV_NATIVE_OWNER_PLUGIN_BUNDLE_ID")):
    raise SystemExit("Builder inherited an unsupported variable")
with open(TRACE_PATH,"a") as log: log.write(json.dumps([name,*args])+"\\n")
if name == "git": print("a"*40)
elif name == "xcodegen":
    project=pathlib.Path("NativeOwnerStudy.xcodeproj"); project.mkdir()
    (project/"project.pbxproj").write_text("generated project")
elif args == ["-version"]: print("Xcode synthetic\\nBuild version synthetic")
else:
    settings=dict(arg.split("=",1) for arg in args if arg.startswith("JEV_"))
    products=pathlib.Path(args[args.index("-derivedDataPath")+1])/"Build/Products"
    plugin_id=settings.get("JEV_NATIVE_OWNER_PLUGIN_BUNDLE_ID","legacy.plugin")
    fixture_id=settings.get("JEV_NATIVE_OWNER_FIXTURE_BUNDLE_ID","legacy.fixture")
    runner_id=settings.get("JEV_NATIVE_OWNER_RUNNER_BUNDLE_ID","legacy.runner")
    identities={"NativeOwnerStudy-Runner.app":runner_id,"NativeOwnerFixture.app":fixture_id,
      "NativeOwnerStudy-Runner.app/PlugIns/NativeOwnerStudy.xctest":plugin_id}
    for product,bundle in identities.items():
        app=products/"Debug-iphonesimulator"/product; app.mkdir(parents=True,exist_ok=True)
        info={"CFBundleIdentifier":bundle}
        if product.endswith(".xctest"):
            info.update({"JevNativeOwnerPlan":settings.get("JEV_NATIVE_OWNER_PLAN"),
              "JevNativeOwnerPluginBundleIdentifier":plugin_id,"JevNativeOwnerRunnerBundleIdentifier":runner_id,
              "JevNativeOwnerFixtureBundleIdentifier":fixture_id})
        if FAULT == "runner-id" and product == "NativeOwnerStudy-Runner.app": info["CFBundleIdentifier"]="dev.foreign.app"
        if FAULT == "plugin-profile" and product.endswith(".xctest"): info["JevNativeOwnerFixtureBundleIdentifier"]="dev.foreign.fixture"
        (app/"Info.plist").write_bytes(plistlib.dumps(info)); (app/"executable").write_bytes(b"bound product")
    (products/"NativeOwnerStudy.xctestrun").write_bytes(plistlib.dumps({"NativeOwnerStudy":{
      "BlueprintName":"NativeOwnerStudy","TestHostBundleIdentifier":runner_id}}))
    if FAULT == "source-change": pathlib.Path("ObservationStudy.m").write_text("changed during build")
'''.replace("EXECUTABLE", sys.executable).replace("TRACE_PATH",repr(str(root/"commands.jsonl"))).replace("FAULT",repr(fault)).replace("REQUIRE_USER",repr(require_user))
        for name in ("xcodegen", "xcodebuild", "git"):
            path = commands / name; path.write_text(script); path.chmod(0o700)
        return source, {"PATH":str(commands)+":/usr/bin:/bin", "HOME":str(root),
                        "USER":"native-study-test-user", "LOGNAME":"native-study-test-user",
                        "COMMAND_TRACE":str(root/"commands.jsonl")}

    def test_reference_cli_build_records_actual_identities_and_every_product(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve(); source, env = self.setup_build(root)
            command = [sys.executable, str(source/"native/build.py"), "--plan", "reference-study",
                       "--derived-data", str(root/"derived"), "--receipts", str(root/"receipts")]
            result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)
            binding=json.loads((root/"receipts/binding.json").read_text())
            self.assertEqual(binding["identity"], {
                "plugin":"dev.jev.research.native-owner-20261007-reference",
                "runner":"dev.jev.research.native-owner-20261007-reference.xctrunner",
                "fixture":"dev.jev.research.native-owner-20261007-reference-fixture"})
            self.assertIn("native/build.py", binding["sourceSHA256"])
            self.assertIn("study-identities.json", binding["sourceSHA256"])
            self.assertIn("Debug-iphonesimulator/NativeOwnerFixture.app/executable",binding["productSHA256"])
            self.assertIs(binding["deviceExecution"],False)
            self.assertFalse(any("simctl" in row or "test-without-building" in row
                                 for row in (root/"commands.jsonl").read_text().splitlines()))

    def test_actual_bundle_profile_mismatch_or_source_change_publishes_no_binding(self):
        for fault in ("runner-id", "plugin-profile", "source-change"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as raw:
                root = Path(raw).resolve(); source,env = self.setup_build(root,fault)
                result = subprocess.run([sys.executable,str(source/"native/build.py"),"--plan","metadata",
                    "--derived-data",str(root/"derived"),"--receipts",str(root/"receipts")],
                    env=env,capture_output=True,text=True,timeout=10)
                self.assertNotEqual(result.returncode,0)
                self.assertFalse((root/"receipts/binding.json").exists())

    def test_required_current_username_reaches_xcodegen_without_open_environment_inheritance(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw).resolve(); source,env = self.setup_build(root,require_user=True)
            env.update({"TYPESAFE_API_KEY":"synthetic-only-canary",
                        "JEV_NATIVE_OWNER_PLUGIN_BUNDLE_ID":"dev.foreign.plugin"})
            result = subprocess.run([sys.executable,str(source/"native/build.py"),"--plan","metadata",
                "--derived-data",str(root/"derived"),"--receipts",str(root/"receipts")],
                env=env,capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertTrue((root/"receipts/binding.json").is_file())


if __name__ == "__main__": unittest.main()
