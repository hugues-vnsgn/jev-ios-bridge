"""Build one declared study profile without operating a device; bind all bytes."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
import binding


def build(plan, derived, receipts):
    derived, receipts = binding.regular_path(derived), binding.regular_path(receipts)
    if derived.exists() or receipts.exists():
        raise RuntimeError("build and receipt paths must both be fresh")
    identity = binding.profile(ROOT.parent, plan)
    before = binding.source_inventory(ROOT.parent)
    receipts.mkdir(parents=True, mode=0o700, exist_ok=False)
    environment = {key:os.environ[key] for key in
                   ("PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "DEVELOPER_DIR", "TOOLCHAINS")
                   if key in os.environ}
    project_command = ["xcodegen", "generate", "--spec", "project.yml"]
    command = binding.build_command(derived, plan, identity)
    with (receipts / "project.log").open("w") as log:
        subprocess.run(project_command, cwd=ROOT, env=environment, stdout=log,
                       stderr=subprocess.STDOUT, check=True)
    project = ROOT / "NativeOwnerStudy.xcodeproj"
    generated = binding.file_inventory(project)
    if not generated:
        raise RuntimeError("generated project is missing")
    with (receipts / "build.log").open("w") as log:
        subprocess.run(command, cwd=ROOT, env=environment, stdout=log,
                       stderr=subprocess.STDOUT, check=True)
    if binding.source_inventory(ROOT.parent) != before or binding.file_inventory(project) != generated:
        raise RuntimeError("source or generated project changed during build; binding refused")
    products = derived / "Build/Products"
    runner = products / "Debug-iphonesimulator/NativeOwnerStudy-Runner.app"
    fixture = products / "Debug-iphonesimulator/NativeOwnerFixture.app"
    plugin = runner / "PlugIns/NativeOwnerStudy.xctest"
    infos = {name:plistlib.loads(binding.regular_path(path/"Info.plist").read_bytes())
             for name,path in ((runner.name,runner),(fixture.name,fixture),(plugin.name,plugin))}
    bundles = {name:info.get("CFBundleIdentifier") for name,info in infos.items()}
    if bundles != {runner.name:identity["runner"], fixture.name:identity["fixture"], plugin.name:identity["plugin"]}:
        raise RuntimeError("unexpected built bundle identities")
    expected_info = {"JevNativeOwnerPlan":plan, "JevNativeOwnerPluginBundleIdentifier":identity["plugin"],
                     "JevNativeOwnerRunnerBundleIdentifier":identity["runner"],
                     "JevNativeOwnerFixtureBundleIdentifier":identity["fixture"]}
    if any(infos[plugin.name].get(key) != value for key,value in expected_info.items()):
        raise RuntimeError("missing or incompatible built plugin profile")
    plans = list(products.glob("*.xctestrun"))
    if len(plans) != 1:
        raise RuntimeError("missing or ambiguous built test plan")
    test_plan = binding.regular_path(plans[0])
    hashes = binding.file_inventory(products, exclude=(test_plan,))
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, env=environment, text=True,
                          capture_output=True, check=True).stdout.strip()
    version = subprocess.run(["xcodebuild", "-version"], env=environment, text=True,
                             capture_output=True, check=True).stdout.strip()
    receipt = {"schema":"jev.native-owner-build/1", "plan":plan, "identity":identity,
               "sourceRoot":str(ROOT.parent), "derivedData":str(derived),
               "sourceCommit":head, "sourceSHA256":before, "xcodeVersion":version,
               "projectCommand":project_command, "generatedProjectSHA256":generated,
               "buildCommand":command, "buildSettings":binding.settings(plan,identity), "bundles":bundles,
               "xctestrun":str(test_plan), "xctestrunSHA256":binding.sha(test_plan),
               "productSHA256":hashes, "deviceExecution":False}
    receipts.joinpath("binding.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"binding":str(receipts/"binding.json"), "plan":plan,
                      "derivedData":str(derived), "xctestrun":str(test_plan)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", choices=("metadata", "reference-study"), required=True)
    parser.add_argument("--derived-data", type=Path, required=True)
    parser.add_argument("--receipts", type=Path, required=True)
    arguments = parser.parse_args()
    build(arguments.plan, arguments.derived_data.resolve(), arguments.receipts.resolve())
