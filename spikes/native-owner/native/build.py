"""Build the owned standalone targets without operating a device; bind inputs/outputs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess

ROOT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sources():
    paths = sorted([*ROOT.glob("*.h"), *ROOT.glob("*.m"), ROOT / "project.yml",
                    *ROOT.parent.joinpath("fixture").glob("*.m")])
    return {str(path.relative_to(ROOT.parent)): sha(path) for path in paths}


def build(derived, receipts):
    if derived.exists() or receipts.exists():
        raise RuntimeError("build and receipt paths must both be fresh")
    receipts.mkdir(parents=True, exist_ok=False)
    before = sources()
    environment = {key: value for key, value in os.environ.items()
                   if key != "TYPESAFE_API_KEY"}
    command = ["xcodebuild", "build-for-testing", "-project", "NativeOwnerStudy.xcodeproj",
               "-scheme", "NativeOwnerStudy", "-destination", "generic/platform=iOS Simulator",
               "-derivedDataPath", str(derived)]
    with (receipts / "project.log").open("w") as log:
        subprocess.run(["xcodegen", "generate", "--spec", "project.yml"],
                       cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT,
                       check=True)
    with (receipts / "build.log").open("w") as log:
        subprocess.run(command, cwd=ROOT, env=environment, stdout=log,
                       stderr=subprocess.STDOUT, check=True)
    if sources() != before:
        raise RuntimeError("source changed during build; binding refused")
    products = derived / "Build/Products/Debug-iphonesimulator"
    runner = products / "NativeOwnerStudy-Runner.app"
    fixture = products / "NativeOwnerFixture.app"
    bundles = {str(path.name): plistlib.loads(path.joinpath("Info.plist").read_bytes())["CFBundleIdentifier"]
               for path in (runner, fixture)}
    if bundles != {"NativeOwnerStudy-Runner.app": "dev.jev.research.native-owner-study.xctrunner",
                   "NativeOwnerFixture.app": "dev.jev.research.native-owner-fixture"}:
        raise RuntimeError("unexpected built bundle identities")
    plans = list(derived.joinpath("Build/Products").glob("*.xctestrun"))
    if len(plans) != 1:
        raise RuntimeError("missing or ambiguous built test plan")
    product_hashes = {str(path.relative_to(products)): sha(path)
                      for app in (runner, fixture) for path in sorted(app.rglob("*")) if path.is_file()}
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True,
                          capture_output=True, check=True).stdout.strip()
    version = subprocess.run(["xcodebuild", "-version"], env=environment, text=True,
                             capture_output=True, check=True).stdout.strip()
    binding = {"sourceCommit": head, "sourceSHA256": before, "xcodeVersion": version,
               "projectSHA256": sha(ROOT / "NativeOwnerStudy.xcodeproj/project.pbxproj"),
               "buildCommand": command, "bundles": bundles,
               "xctestrun": str(plans[0]), "xctestrunSHA256": sha(plans[0]),
               "productSHA256": product_hashes, "deviceExecution": False}
    receipts.joinpath("binding.json").write_text(json.dumps(binding, indent=2) + "\n")
    print(json.dumps({"binding": str(receipts / "binding.json"),
                      "derivedData": str(derived), "xctestrun": str(plans[0])}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--derived-data", type=Path, required=True)
    parser.add_argument("--receipts", type=Path, required=True)
    arguments = parser.parse_args()
    build(arguments.derived_data.resolve(), arguments.receipts.resolve())
