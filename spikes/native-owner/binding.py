"""Closed research profiles and byte inventories shared by builder and host."""
import hashlib
import json
from pathlib import Path
import re


def decode(data):
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise ValueError("duplicate JSON field")
            result[key] = value
        return result
    def invalid(value): raise ValueError("non-finite JSON value")
    return json.loads(data, object_pairs_hook=pairs, parse_constant=invalid)


def regular_path(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path:
        raise ValueError("ambiguous or symlinked path")
    return path


def sha(path):
    path = regular_path(path)
    if not path.is_file():
        raise ValueError("missing or non-regular file")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def profile(root, plan):
    declaration = decode(regular_path(root / "study-identities.json").read_bytes())
    if type(declaration) is not dict or set(declaration) != {"metadata", "reference-study"}:
        raise ValueError("unsupported study declaration")
    for value in declaration.values():
        if type(value) is not dict or set(value) != {"plugin", "runner", "fixture"}:
            raise ValueError("unsupported identity fields")
        if any(type(item) is not str or not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)+", item)
               for item in value.values()) or value["runner"] != value["plugin"] + ".xctrunner":
            raise ValueError("invalid study identity")
    identifiers = [item for value in declaration.values() for item in value.values()]
    if len(set(identifiers)) != 6 or plan not in declaration:
        raise ValueError("ambiguous study identity")
    return declaration[plan]


def settings(plan, identity):
    return {"JEV_NATIVE_OWNER_PLAN": plan,
            "JEV_NATIVE_OWNER_PLUGIN_BUNDLE_ID": identity["plugin"],
            "JEV_NATIVE_OWNER_RUNNER_BUNDLE_ID": identity["runner"],
            "JEV_NATIVE_OWNER_FIXTURE_BUNDLE_ID": identity["fixture"]}


def build_command(derived, plan, identity):
    return ["xcodebuild", "build-for-testing", "-project", "NativeOwnerStudy.xcodeproj",
            "-scheme", "NativeOwnerStudy", "-destination", "generic/platform=iOS Simulator",
            "-derivedDataPath", str(derived),
            *[key + "=" + value for key, value in settings(plan, identity).items()]]


def source_inventory(root, hash_file=sha):
    root = regular_path(root)
    paths = [root / "study-identities.json", root / "binding.py", root / "protocol.schema.json"]
    for directory, suffixes in (("native", {".m", ".h", ".py", ".yml", ".plist"}),
                               ("fixture", {".m", ".swift"}), ("host", {".py"})):
        parent = regular_path(root / directory)
        for path in parent.rglob("*"):
            relative = path.relative_to(parent)
            if any(part == "__pycache__" or part.endswith((".xcodeproj", ".xcworkspace")) for part in relative.parts):
                continue
            regular_path(path)
            if not path.is_dir() and not path.is_file():
                raise ValueError("unsupported source entry")
            if not path.is_file() or path.name in {"README.md", ".gitignore"}:
                continue
            if (directory == "fixture" or path.suffix in suffixes) and not (
                    directory == "host" and path.name.startswith("test_")):
                paths.append(path)
    if not any(p.parent == root / "native" and p.suffix == ".m" for p in paths) or not any(
            p.parent == root / "fixture" and p.suffix in {".m", ".swift"} for p in paths):
        raise ValueError("missing native source")
    return {str(path.relative_to(root)): hash_file(regular_path(path)) for path in sorted(paths)}


def file_inventory(root, hash_file=sha, exclude=()):
    root = regular_path(root)
    if not root.is_dir():
        raise ValueError("missing inventory directory")
    result = {}
    for path in sorted(root.rglob("*")):
        regular_path(path)  # Includes directory symlinks, not only files.
        if path.is_file() and path not in exclude:
            result[str(path.relative_to(root))] = hash_file(path)
        elif not path.is_dir() and not path.is_file():
            raise ValueError("unsupported inventory entry")
    return result
