"""One owned no-input study. Completion here never certifies native settlement."""
from dataclasses import asdict, dataclass
from pathlib import Path
import hashlib
import json
import math
import os
import plistlib
import subprocess
import tempfile
import time
import uuid

UDID = "0E42FDE2-5E09-42D3-9876-9EF0037FCBE7"
NAME = "jev-ios-bridge"
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-4"
RUNNER = "dev.jev.research.native-owner-study.xctrunner"
FIXTURE = "dev.jev.research.native-owner-fixture"
PLUGIN = "dev.jev.research.native-owner-study"
PREFIX = b"JEV_NATIVE_OWNER_V1 "
CLASS_COMPLETED = b"JEV_NATIVE_OWNER_CLASS_COMPLETED"
ABSENT = ("An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=2):\n"
          "The operation couldn’t be completed. No such file or directory\n"
          "No such file or directory\n")
MAX_JSON = 1024 * 1024
MAX_LOG = 8 * 1024 * 1024
MAX_STRING = 1024

@dataclass(frozen=True)
class Configuration:
    derived_data: Path
    evidence_directory: Path
    source_root: Path
    admission_seconds: float = 90.0
    device_id: str = UDID

@dataclass(frozen=True)
class Dependencies:
    tools: object
    now: object = time.monotonic
    sleep: object = time.sleep

@dataclass(frozen=True)
class StudyResult:
    status: str
    reason: str
    request_id: str | None = None
    evidence_directory: str | None = None
    records: tuple = ()
    retained_resources: tuple = ()


class _Refusal(Exception):
    pass


class _Expired(_Refusal):
    pass


class _Child:
    """File-backed output survives a frontend exit without signalling the child."""
    def __init__(self, process, files, capture_paths):
        self.process = process
        self.pid = process.pid
        self.files = files
        self.capture_paths = capture_paths
        self.offsets = {"stdout":0,"stderr":0}
        self.closed = False

    def poll(self):
        return self.process.poll()

    def has_live_owned_group(self):
        # Signal zero inspects only the fresh group established at spawn.
        # Permission/inspection uncertainty is not proof of termination.
        try:
            os.killpg(self.pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True

    @property
    def streams_closed(self):
        if self.closed:
            return True
        drained = all(os.fstat(handle.fileno()).st_size == self.offsets[name]
                      for name,handle in self.files.items())
        if drained and self.poll() is not None and not self.has_live_owned_group():
            for handle in self.files.values():
                handle.close()
            self.closed = True
        return self.closed

    def read_available(self):
        if self.closed:
            return []
        chunks = []
        for name, handle in self.files.items():
            data = os.pread(handle.fileno(), 65536, self.offsets[name])
            if data:
                self.offsets[name] += len(data)
                chunks.append((name, data))
        return chunks


class ProcessTools:
    """Real tool Adapter. Commands never run through a shell or inherit secrets."""
    def __init__(self, output_directory=None):
        # Retain Popen ownership after a timeout; no context manager kills/waits.
        self.children = []
        self.output_directory = output_directory

    def start(self, argv, env, cwd):
        files, paths = {}, {}
        if self.output_directory:
            self.output_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        for name in ("stdout","stderr"):
            if self.output_directory:
                path = self.output_directory/f"{len(self.children)+1:03d}-{name}.log"
                descriptor = os.open(path, os.O_RDWR|os.O_CREAT|os.O_EXCL, 0o600)
                files[name] = os.fdopen(descriptor,"w+b")
                paths[name] = str(path)
            else:
                files[name] = tempfile.TemporaryFile("w+b")
        try:
            process = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                       stdout=files["stdout"], stderr=files["stderr"],
                                       close_fds=True, start_new_session=True)
        except Exception:
            for handle in files.values(): handle.close()
            raise
        child = _Child(process, files, paths)
        self.children.append(child)
        return child


def _json_equal(left, right):
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    return left == right


def _validate(value, schema):
    """The frozen schema's keywords, interpreted without an installed package."""
    keywords = {"$schema", "title", "$comment", "type", "const", "enum", "minimum",
                "minLength", "maxLength", "required", "properties", "additionalProperties", "allOf"}
    if set(schema) - keywords:
        raise _Refusal("PROTOCOL_SCHEMA_UNSUPPORTED")
    if "const" in schema and not _json_equal(value, schema["const"]):
        raise _Refusal("RECORD_SCHEMA")
    if "enum" in schema and not any(_json_equal(value, item) for item in schema["enum"]):
        raise _Refusal("RECORD_SCHEMA")
    kind = schema.get("type")
    types = {"object": lambda: type(value) is dict,
             "string": lambda: type(value) is str,
             "integer": lambda: type(value) is int,
             "number": lambda: type(value) in (int, float) and math.isfinite(value),
             "boolean": lambda: type(value) is bool}
    if kind and (kind not in types or not types[kind]()):
        raise _Refusal("RECORD_SCHEMA")
    if "minimum" in schema and value < schema["minimum"]:
        raise _Refusal("RECORD_SCHEMA")
    if "minLength" in schema and len(value) < schema["minLength"]:
        raise _Refusal("RECORD_SCHEMA")
    if "maxLength" in schema and len(value) > schema["maxLength"]:
        raise _Refusal("RECORD_SCHEMA")
    if "required" in schema and not set(schema["required"]).issubset(value):
        raise _Refusal("RECORD_SCHEMA")
    properties = schema.get("properties", {})
    if schema.get("additionalProperties") is False and set(value) - set(properties):
        raise _Refusal("RECORD_SCHEMA")
    for name, definition in properties.items():
        if name in value:
            _validate(value[name], definition)
    for part in schema.get("allOf", []):
        if "if" in part:
            try:
                _validate(value, part["if"])
            except _Refusal:
                continue
            _validate(value, part["then"])
        else:
            _validate(value, part)


def _bounded_strings(value, depth=0):
    if depth > 64:
        raise _Refusal("RECORD_DEPTH_LIMIT")
    if isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_STRING:
            raise _Refusal("RECORD_STRING_LIMIT")
    elif isinstance(value, dict):
        for key, item in value.items():
            _bounded_strings(key, depth + 1)
            _bounded_strings(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            _bounded_strings(item, depth + 1)


def _decode(data):
    def invalid_constant(_):
        raise ValueError("nonfinite JSON")
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result
    try:
        return json.loads(data, parse_constant=invalid_constant,
                          object_pairs_hook=unique_keys)
    except (ValueError, UnicodeError, RecursionError):
        raise _Refusal("MALFORMED_JSON") from None


class _Stream:
    def __init__(self, request, plan, on_record):
        self.schema = json.loads((Path(__file__).parent.parent / "protocol.schema.json").read_text())
        self.request, self.plan, self.on_record = request, plan, on_record
        self.buffers = {"stdout": b"", "stderr": b""}
        self.records = []
        self.json_bytes = 0
        self.class_markers = 0
        self.finished = False
        self.parent_edges = 0

    def feed(self, name, chunk):
        self.buffers[name] += chunk
        while b"\n" in self.buffers[name]:
            line, self.buffers[name] = self.buffers[name].split(b"\n", 1)
            self.line(line.rstrip(b"\r"))
        if len(self.buffers[name]) > MAX_JSON + len(PREFIX):
            raise _Refusal("RECORD_STREAM_LIMIT")

    def line(self, line):
        if line == CLASS_COMPLETED:
            if not self.finished:
                raise _Refusal("CLASS_COMPLETION_ORDER")
            self.class_markers += 1
            if self.class_markers > 1:
                raise _Refusal("DUPLICATE_CLASS_COMPLETION")
            return
        if PREFIX not in line:
            if CLASS_COMPLETED in line:
                raise _Refusal("MALFORMED_CLASS_COMPLETION")
            return
        if not line.startswith(PREFIX):
            raise _Refusal("MALFORMED_RECORD_MARKER")
        data = line[len(PREFIX):]
        self.json_bytes += len(data) + 1
        if self.json_bytes > MAX_JSON:
            raise _Refusal("RECORD_STREAM_LIMIT")
        record = _decode(data)
        _validate(record, self.schema)
        _bounded_strings(record)
        if record["requestId"] != self.request or record["sequence"] != len(self.records):
            raise _Refusal("RECORD_SEQUENCE_OR_REQUEST")
        if self.finished or (record["kind"] == "started") != (not self.records):
            raise _Refusal("RECORD_ORDER")
        if self.records and record["elapsedMs"] < self.records[-1]["elapsedMs"]:
            raise _Refusal("RECORD_TIME_REVERSED")
        if self.plan == "metadata" and record["operation"] != "metadata":
            raise _Refusal("METADATA_ADMITTED_QUERY")
        details = record["details"]
        if record["kind"] in ("started", "finished"):
            if details["plan"] != self.plan:
                raise _Refusal("RECORD_PLAN")
            if self.records and details["runnerPID"] != self.records[0]["details"]["runnerPID"]:
                raise _Refusal("RUNNER_PID_CHANGED")
        for name in ("ancestryComplete", "lifetimeScopeEstablished", "associationIndependenceEstablished"):
            if name in details and details[name] is not False:
                raise _Refusal("CONTRADICTORY_COVERAGE")
        if "nativeSettlement" in details and details["nativeSettlement"] != "unconfirmed":
            raise _Refusal("CONTRADICTORY_SETTLEMENT")
        if "coverage" in details:
            expected = {"originalAncestry":"unestablished", "referenceLifetime":"unestablished",
                        "independentAssociations":"unestablished"}
            if details["coverage"] != expected:
                raise _Refusal("CONTRADICTORY_COVERAGE")
        if record["operation"] == "parent" and record["outcome"] == "observed":
            self.parent_edges += 1
            if self.parent_edges > 32:
                raise _Refusal("PARENT_EDGE_LIMIT")
        self.finished = record["kind"] == "finished"
        self.records.append(record)
        self.on_record(record)

    def complete(self):
        if any(self.buffers.values()) or not self.finished:
            raise _Refusal("INCOMPLETE_RECORD_STREAM")
        if self.class_markers != 1:
            raise _Refusal("CLASS_COMPLETION_MISSING")


class _Study:
    def __init__(self, plan, configuration, dependencies):
        self.plan, self.config, self.dep = plan, configuration, dependencies
        self.request = str(uuid.uuid4())
        self.output = configuration.evidence_directory.resolve()
        self.stop_file = self.output / "stop-admission"
        self.deadline = dependencies.now() + configuration.admission_seconds
        self.commands = []
        self.resources = []
        self.records = []
        self.booted = False
        self.native_started = False
        self.app_owned = False
        self.fixture_documents = None
        self.fixture_pid = None
        self.recreation_written = False
        self.record_refusal = None
        self.initial = None
        self.env = {key: os.environ[key] for key in
                    ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DEVELOPER_DIR", "TOOLCHAINS")
                    if key in os.environ}

    def save(self, name, value):
        target = self.output / name
        temporary = target.with_suffix(target.suffix + ".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w") as handle:
            json.dump(value, handle, indent=2, allow_nan=False)
            handle.write("\n")
        temporary.replace(target)

    def ledger(self):
        self.save("ownership.json", {"requestId":self.request, "plan":self.plan,
                  "deviceId":UDID, "commands":self.commands, "resources":self.resources,
                  "nativeSettlement":"unconfirmed"})

    def admit(self):
        if self.record_refusal is not None:
            raise _Refusal(self.record_refusal)
        self.observe_deadline()

    def observe_deadline(self):
        if self.dep.now() >= self.deadline:
            self.stop_file.touch(mode=0o600, exist_ok=True)
            raise _Expired("ADMISSION_EXPIRED")

    def command(self, argv, stream=None):
        self.admit()
        entry = {"index":len(self.commands)+1, "argv":argv, "state":"spawn-pending"}
        self.commands.append(entry)
        self.ledger()  # Ownership is durable before the Adapter may start anything.
        try:
            child = self.dep.tools.start(argv, self.env, str(self.config.source_root))
        except Exception:
            # A failing Adapter may have spawned before throwing. Never infer absence.
            entry["state"] = "spawn-unconfirmed"
            self.ledger()
            raise _Refusal("PROCESS_SPAWN_UNCONFIRMED") from None
        entry.update(pid=child.pid, ownedProcessGroup=child.pid, state="running")
        if type(child.pid) is not int or child.pid <= 1:
            entry["state"] = "pid-unconfirmed"
            self.ledger()
            raise _Refusal("PROCESS_PID_UNCONFIRMED")
        if hasattr(child,"capture_paths"):
            entry["captureFiles"] = child.capture_paths
        self.ledger()
        captured = {"stdout":bytearray(), "stderr":bytearray()}
        count = 0
        observation = {"outcome":"pending", "reason":"PROCESS_RUNNING",
                       "ownedGroupAbsent":None, "streamsClosed":None}
        entry["processObservation"] = observation
        process_failure = None

        def capture(name, chunk):
            nonlocal count
            if name not in captured or not isinstance(chunk, bytes):
                raise _Refusal("PROCESS_ADAPTER_INVALID")
            count += len(chunk)
            if count > MAX_LOG:
                raise _Refusal("PROCESS_OUTPUT_LIMIT")
            captured[name].extend(chunk)
            if stream and self.record_refusal is None:
                try:
                    stream.feed(name, chunk)
                except (_Refusal, OSError, ValueError, TypeError, KeyError) as error:
                    self.record_refusal = str(error) if isinstance(error, _Refusal) else "LOCAL_STATE_UNCONFIRMED"
                    entry["streamRefusal"] = self.record_refusal
                    self.stop_file.touch(mode=0o600, exist_ok=True)
                    self.ledger()

        try:
            while True:
                self.observe_deadline()
                for name, chunk in child.read_available():
                    capture(name, chunk)
                self.observe_deadline()
                code = child.poll()
                if code is not None and type(code) is not int:
                    raise _Refusal("PROCESS_ADAPTER_INVALID")
                if code is not None and "parentReturncode" not in entry:
                    entry.update(parentReturncode=code, state="parent-exited-owned-work-pending")
                    self.ledger()
                live_group = child.has_live_owned_group()
                if type(live_group) is not bool:
                    raise _Refusal("PROCESS_ADAPTER_INVALID")
                observation["ownedGroupAbsent"] = not live_group
                if code is not None and observation["ownedGroupAbsent"]:
                    closed_streams = child.streams_closed
                    if type(closed_streams) is not bool:
                        raise _Refusal("PROCESS_ADAPTER_INVALID")
                    observation["streamsClosed"] = closed_streams
                if code is not None and observation["ownedGroupAbsent"] and observation["streamsClosed"]:
                    # Drain once more after exit; children with inherited pipes cannot
                    # turn their parent's exit into native settlement.
                    for name, chunk in child.read_available():
                        capture(name, chunk)
                    entry.update(state="exited", returncode=code)
                    observation.update(outcome="completed", reason="PROCESS_COMPLETED")
                    self.ledger()
                    break
                observation["reason"] = "PROCESS_RUNNING" if code is None else "OWNED_PROCESS_WORK_PENDING"
                self.ledger()
                self.observe_deadline()
                self.dep.sleep(min(0.01, max(0, self.deadline-self.dep.now())))
        except Exception as error:
            if not isinstance(error, _Refusal):
                reason = "LOCAL_STATE_UNCONFIRMED" if isinstance(error, (OSError, ValueError, TypeError, KeyError)) else "PROCESS_ADAPTER_UNCONFIRMED"
                error = _Refusal(reason)
            entry["state"] = "retained"
            observation.update(outcome="pending", reason=str(error))
            process_failure = error
        receipt = dict(entry)
        try:
            stdout, stderr = (captured[name].decode("utf-8", errors="strict")
                              for name in ("stdout", "stderr"))
            receipt.update(stdout=stdout, stderr=stderr)
        except UnicodeError:
            entry["outputEncoding"] = "unconfirmed"
            if process_failure is None:
                process_failure = _Refusal("PROCESS_OUTPUT_ENCODING")
                entry["state"] = "retained"
                observation.update(outcome="pending", reason=str(process_failure))
            receipt.update(entry)
        self.ledger()
        self.save(f"command-{entry['index']:03d}.json", receipt)
        if self.record_refusal is not None:
            raise _Refusal(self.record_refusal)
        if process_failure is not None:
            raise process_failure
        self.admit()
        return code, stdout, stderr

    def checked(self, argv):
        result = self.command(argv)
        if result[0] != 0:
            raise _Refusal("TOOL_FAILED")
        return result[1]

    def sim(self, *args):
        return ["xcrun", "simctl", *args]

    def inventory(self):
        value = _decode(self.checked(self.sim("list", "devices", "--json")))
        if type(value) is not dict or type(value.get("devices")) is not dict:
            raise _Refusal("INVENTORY_INVALID")
        matches = []
        for runtime, devices in value["devices"].items():
            if type(devices) is not list:
                raise _Refusal("INVENTORY_INVALID")
            for device in devices:
                if type(device) is not dict:
                    raise _Refusal("INVENTORY_INVALID")
                if device.get("udid") == UDID:
                    matches.append((runtime, device))
        if len(matches) != 1:
            raise _Refusal("DEVICE_AMBIGUOUS")
        runtime, device = matches[0]
        if (runtime != RUNTIME or device.get("name") != NAME or
                device.get("isAvailable") is not True or
                device.get("state") not in ("Booted", "Shutdown")):
            raise _Refusal("DEVICE_IDENTITY_OR_STATE")
        return value, device["state"]

    def absence(self, bundle):
        code, stdout, stderr = self.command(self.sim("get_app_container", UDID, bundle, "app"))
        if (code, stdout, stderr) != (2, "", ABSENT):
            raise _Refusal("APP_ABSENCE_UNCONFIRMED")

    def hash_file(self, path):
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            while chunk := handle.read(65536):
                self.admit()
                digest.update(chunk)
        return digest.hexdigest()

    def artifacts(self):
        products = self.config.derived_data.resolve()/"Build/Products"
        plans = list(products.glob("*.xctestrun"))
        if len(plans) != 1 or plans[0].is_symlink():
            raise _Refusal("BUILD_ARTIFACTS_AMBIGUOUS")
        self.test_plan = plans[0]
        self.apps = {}
        manifest = []
        for product, bundle in (("NativeOwnerStudy-Runner.app", RUNNER), ("NativeOwnerFixture.app", FIXTURE)):
            app = products/"Debug-iphonesimulator"/product
            if not app.is_dir() or app.is_symlink():
                raise _Refusal("BUILD_ARTIFACTS_MISSING")
            try:
                info = plistlib.loads((app/"Info.plist").read_bytes())
            except (ValueError, plistlib.InvalidFileException):
                raise _Refusal("BUILD_PLIST_INVALID") from None
            if info.get("CFBundleIdentifier") != bundle:
                raise _Refusal("BUILD_BUNDLE_MISMATCH")
            self.apps[bundle] = app
            for file in sorted(app.rglob("*")):
                if file.is_symlink():
                    raise _Refusal("BUILD_SYMLINK_UNCONFIRMED")
                if file.is_file():
                    manifest.append({"path":str(file), "sha256":self.hash_file(file)})
        self.plugin = self.apps[RUNNER]/"PlugIns/NativeOwnerStudy.xctest"
        if not self.plugin.is_dir() or self.plugin.is_symlink():
            raise _Refusal("BUILD_PLUGIN_MISSING")
        plugin_info = plistlib.loads((self.plugin/"Info.plist").read_bytes())
        if type(plugin_info) is not dict or plugin_info.get("CFBundleIdentifier") != PLUGIN:
            raise _Refusal("BUILD_PLUGIN_BUNDLE_MISMATCH")
        source_files = []
        for directory in ("native", "fixture"):
            source_files.extend(file for file in (self.config.source_root/directory).rglob("*")
                                if file.is_file() and file.suffix in (".m", ".h", ".swift", ".yml"))
        if (not any(file.parent == self.config.source_root/"native" and file.suffix == ".m" for file in source_files) or
            not any(file.parent == self.config.source_root/"fixture" and file.suffix in (".m", ".swift") for file in source_files) or
            not (self.config.source_root/"native/project.yml").is_file()):
            raise _Refusal("BUILD_SOURCE_MISSING")
        for file in sorted(source_files):
            if file.is_symlink():
                raise _Refusal("BUILD_SOURCE_SYMLINK")
            manifest.append({"path":str(file.resolve()), "sha256":self.hash_file(file)})
        manifest.append({"path":str(self.test_plan), "sha256":self.hash_file(self.test_plan)})
        protocol = Path(__file__).parent.parent/"protocol.schema.json"
        manifest.append({"path":str(protocol.resolve()), "sha256":self.hash_file(protocol)})
        self.save("build-manifest.json", manifest)
        self.read_plan()  # All startup ownership guards precede simulator setup.

    def product_path(self, value):
        if type(value) is not str or not value or "\n" in value:
            raise _Refusal("TEST_PLAN_PRODUCT_INVALID")
        value = value.replace("__TESTROOT__", str(self.test_plan.parent))
        value = value.replace("__TESTHOST__", str(self.apps[RUNNER]))
        if not Path(value).is_absolute():
            raise _Refusal("TEST_PLAN_PRODUCT_INVALID")
        return Path(value).resolve()

    def read_plan(self):
        try:
            value = plistlib.loads(self.test_plan.read_bytes())
        except (ValueError, plistlib.InvalidFileException):
            raise _Refusal("TEST_PLAN_INVALID") from None
        if type(value) is not dict:
            raise _Refusal("TEST_PLAN_INVALID")
        if "TestConfigurations" in value:
            if set(value)-{"TestConfigurations","__xctestrun_metadata__"}:
                raise _Refusal("TEST_PLAN_EXTRA_TARGET")
            configurations=value["TestConfigurations"]
            if type(configurations) is not list or len(configurations)!=1 or type(configurations[0]) is not dict:
                raise _Refusal("TEST_PLAN_TARGET_AMBIGUOUS")
            configuration=configurations[0]
            if set(configuration)-{"Name","ID","IsEnabled","TestTargets"}:
                raise _Refusal("TEST_PLAN_CONFIGURATION_UNSUPPORTED")
            if "IsEnabled" in configuration and configuration["IsEnabled"] is not True:
                raise _Refusal("TEST_PLAN_CONFIGURATION_DISABLED")
            targets=configuration.get("TestTargets")
            if type(targets) is not list or len(targets)!=1:
                raise _Refusal("TEST_PLAN_TARGET_AMBIGUOUS")
            target=targets[0]
        else:
            if set(value)-{"NativeOwnerStudy","__xctestrun_metadata__"}:
                raise _Refusal("TEST_PLAN_EXTRA_TARGET")
            target=value.get("NativeOwnerStudy")
        if type(target) is not dict or target.get("BlueprintName")!="NativeOwnerStudy":
            raise _Refusal("TEST_PLAN_TARGET_AMBIGUOUS")
        # This is the inspected standalone build format, not a general xctestrun
        # runner. Unknown startup fields cannot inherit this study's provenance.
        fields={"BlueprintName","BlueprintProviderName","BlueprintProviderRelativePath",
            "BundleIdentifiersForCrashReportEmphasis","CommandLineArguments",
            "DefaultTestExecutionTimeAllowance","DependentProductPaths","DiagnosticCollectionPolicy",
            "EnvironmentVariables","IsMemoryTaggingAddressSanitizerEnabled","IsUITestBundle",
            "IsXCTRunnerHostedTestBundle","PreferredScreenCaptureFormat","ProcessNamesForCrashReportCollection",
            "ProductModuleName","RunOrder","SystemAttachmentLifetime","TestBundlePath","TestBundleIdentifier",
            "TestHostBundleIdentifier","TestHostPath","TestLanguage","TestRegion","TestTimeoutsEnabled",
            "TestingEnvironmentVariables","ToolchainsSettingValue","UITargetAppCommandLineArguments",
            "UITargetAppEnvironmentVariables","UITargetAppPerformanceAntipatternCheckerEnabled",
            "UseUITargetAppProvidedByTests","UserAttachmentLifetime","UITargetAppPath","UITargetAppBundleIdentifier"}
        if set(target)-fields:
            raise _Refusal("TEST_PLAN_FIELDS_UNSUPPORTED")
        if (target.get("TestHostBundleIdentifier")!=RUNNER or
            target.get("IsUITestBundle") is not True or
            target.get("IsXCTRunnerHostedTestBundle") is not True or
            target.get("UseUITargetAppProvidedByTests") is not True or
            target.get("TestBundleIdentifier",PLUGIN)!=PLUGIN):
            raise _Refusal("TEST_PLAN_BUNDLE_MISMATCH")
        runner,plugin,fixture=self.apps[RUNNER].resolve(),self.plugin.resolve(),self.apps[FIXTURE].resolve()
        if self.product_path(target.get("TestHostPath"))!=runner or self.product_path(target.get("TestBundlePath"))!=plugin:
            raise _Refusal("TEST_PLAN_PRODUCT_MISMATCH")
        dependencies=target.get("DependentProductPaths")
        if type(dependencies) is not list:
            raise _Refusal("TEST_PLAN_DEPENDENCIES_INVALID")
        resolved=[self.product_path(path) for path in dependencies]
        if (len(resolved)!=len(set(resolved)) or not {runner,plugin}.issubset(resolved) or
            set(resolved)-{runner,plugin,fixture} or
            (self.plan=="reference-study" and fixture not in resolved)):
            raise _Refusal("TEST_PLAN_DEPENDENCIES_INVALID")
        if "UITargetAppPath" in target and self.product_path(target["UITargetAppPath"])!=fixture:
            raise _Refusal("TEST_PLAN_UI_TARGET_MISMATCH")
        if "UITargetAppBundleIdentifier" in target and target["UITargetAppBundleIdentifier"]!=FIXTURE:
            raise _Refusal("TEST_PLAN_UI_TARGET_MISMATCH")
        for field in ("CommandLineArguments","UITargetAppCommandLineArguments"):
            if target.get(field,[])!=[]:
                raise _Refusal("TEST_PLAN_ARGUMENTS_UNSUPPORTED")
        products=str(self.apps[RUNNER].parent)
        templates={"DYLD_FRAMEWORK_PATH":products+":__PLATFORMS__/iPhoneSimulator.platform/Developer/Library/Frameworks",
            "DYLD_LIBRARY_PATH":products+":__PLATFORMS__/iPhoneSimulator.platform/Developer/usr/lib",
            "XCODE_SCHEME_NAME":"NativeOwnerStudy","__XCODE_BUILT_PRODUCTS_DIR_PATHS":products,
            "__XPC_DYLD_FRAMEWORK_PATH":products,"__XPC_DYLD_LIBRARY_PATH":products}
        for field in ("TestingEnvironmentVariables","UITargetAppEnvironmentVariables"):
            environment=target.get(field,{})
            if type(environment) is not dict:
                raise _Refusal("TEST_PLAN_ENVIRONMENT_INVALID")
            for name,item in environment.items():
                expanded=item.replace("__TESTROOT__",str(self.test_plan.parent)) if type(item) is str else None
                expected=templates.get(name)
                if field=="UITargetAppEnvironmentVariables" and name=="APP_DISTRIBUTOR_ID_OVERRIDE":
                    expected="com.apple.AppStore"
                if name in ("DYLD_FRAMEWORK_PATH","DYLD_LIBRARY_PATH") and expanded==products:
                    continue
                if expected is None or expanded!=expected:
                    raise _Refusal("TEST_PLAN_ENVIRONMENT_UNSUPPORTED")
        if type(target.get("EnvironmentVariables",{})) is not dict:
            raise _Refusal("TEST_PLAN_ENVIRONMENT_INVALID")
        target["TestHostPath"]=str(runner)
        target["TestBundlePath"]=str(plugin)
        target["DependentProductPaths"]=[str(path) for path in resolved
                                         if self.plan!="metadata" or path!=fixture]
        if self.plan=="metadata":
            for field in list(target):
                if field.startswith("UITargetApp"):
                    del target[field]
        elif "UITargetAppPath" in target:
            target["UITargetAppPath"]=str(fixture)
        self.plan_document,self.plan_target=value,target

    def derive_plan(self):
        value,target=self.plan_document,self.plan_target
        self.admit()
        environment = {
            "JEV_NATIVE_OWNER_REQUEST_ID":self.request,
            "JEV_NATIVE_OWNER_PLAN":self.plan,
            "JEV_NATIVE_OWNER_ADMISSION_SECONDS":str(self.deadline-self.dep.now()),
            "JEV_NATIVE_OWNER_STOP_FILE":str(self.stop_file),
        }
        if self.fixture_documents:
            environment["JEV_NATIVE_OWNER_FIXTURE_DOCUMENTS"] = str(self.fixture_documents)
        existing = target.get("EnvironmentVariables", {})
        if type(existing) is not dict:
            raise _Refusal("TEST_PLAN_ENVIRONMENT_INVALID")
        # Native invocation uses only the explicit study environment. Test-plan
        # runtime/library settings were checked separately against the build.
        target["EnvironmentVariables"] = environment
        def rewrite(item):
            if isinstance(item, str):
                return item.replace("__TESTROOT__", str(self.test_plan.parent)).replace("__TESTHOST__",str(self.apps[RUNNER]))
            if isinstance(item, dict):
                return {key:rewrite(child) for key,child in item.items()}
            if isinstance(item, list):
                return [rewrite(child) for child in item]
            return item
        target_path = self.output/"owned.xctestrun"
        with target_path.open("xb") as handle:
            os.chmod(target_path, 0o600)
            plistlib.dump(rewrite(value), handle)
        self.save("derived-plan.json", {"path":str(target_path),
                  "sha256":self.hash_file(target_path), "environment":environment})
        return target_path

    def own(self, resource):
        self.resources.append(resource)
        self.ledger()

    def fixture_ready(self):
        self.own({"kind":"fixture", "bundleId":FIXTURE, "state":"installation-pending"})
        self.app_owned = True
        self.checked(self.sim("install", UDID, str(self.apps[FIXTURE])))
        self.checked(self.sim("get_app_container", UDID, FIXTURE, "app"))
        container_text = self.checked(self.sim("get_app_container", UDID, FIXTURE, "data")).strip()
        container = Path(container_text)
        if not container.is_absolute() or "\n" in container_text or not container.is_dir() or container.is_symlink():
            raise _Refusal("FIXTURE_CONTAINER_UNCONFIRMED")
        self.fixture_container = container.resolve()
        self.fixture_documents = self.fixture_container/"Documents"
        text = self.checked(self.sim("launch", UDID, FIXTURE))
        prefix = FIXTURE + ": "
        if not text.startswith(prefix) or not text[len(prefix):].strip().isdigit():
            raise _Refusal("FIXTURE_LAUNCH_UNCONFIRMED")
        self.fixture_pid = int(text[len(prefix):].strip())
        if self.fixture_pid <= 1:
            raise _Refusal("FIXTURE_PID_INVALID")
        self.resources[-1].update(state="launched", pid=self.fixture_pid, dataContainer=str(self.fixture_container))
        self.ledger()
        while True:
            self.admit()
            if self.fixture_documents.is_symlink():
                raise _Refusal("FIXTURE_DOCUMENTS_UNCONFIRMED")
            path = self.fixture_documents/"result.txt"
            if path.exists():
                if path.is_symlink() or path.stat().st_size > MAX_STRING:
                    raise _Refusal("FIXTURE_TELEMETRY_INVALID")
                telemetry = _decode(path.read_bytes())
                if (type(telemetry) is not dict or set(telemetry) != {"pid", "generation", "ordinary"} or
                    any(type(value) is not int for value in telemetry.values()) or
                    telemetry != {"pid":self.fixture_pid, "generation":0, "ordinary":0}):
                    raise _Refusal("FIXTURE_READINESS_UNCONFIRMED")
                self.save("fixture-ready.json", telemetry)
                break
            self.dep.sleep(min(0.01, max(0, self.deadline-self.dep.now())))

    def on_record(self, record):
        self.admit()
        self.records.append(record)
        self.save("observations.json", self.records)
        if record["kind"] == "started":
            self.own({"kind":"runner", "bundleId":RUNNER, "pid":record["details"]["runnerPID"],
                      "state":"native-started"})
        if (record["operation"] == "fixture-recreation" and record["kind"] == "observation" and
                record["outcome"] == "observed" and record["details"].get("request") == "recreate"):
            if self.plan != "reference-study" or self.recreation_written:
                raise _Refusal("FIXTURE_RECREATION_DUPLICATE")
            self.admit()
            # Reconfirm this exact owned fixture's container before its only write.
            path = self.checked(self.sim("get_app_container", UDID, FIXTURE, "data")).strip()
            if Path(path).resolve() != self.fixture_container or self.fixture_documents.is_symlink():
                raise _Refusal("FIXTURE_CONTAINER_CHANGED")
            self.admit()
            with (self.fixture_documents/"recreate.request").open("xb") as handle:
                handle.write(b"owned no-input recreation\n")
            self.recreation_written = True
            self.save("recreation-write.json", {"requestId":self.request, "fixturePID":self.fixture_pid,
                      "generationBefore":0, "writeCount":1, "inputCalls":0})

    def restore_pre_native(self):
        if self.booted and not self.app_owned and not self.native_started:
            self.checked(self.sim("shutdown", UDID))
            self.booted = False
            self.resources.clear()
            self.ledger()

    def execute(self):
        self.artifacts()
        self.initial, state = self.inventory()
        self.save("initial-inventory.json", self.initial)
        self.own({"kind":"device", "deviceId":UDID, "initialState":state})
        if state == "Shutdown":
            self.booted = True  # Register possible setup mutation before issuance.
            self.checked(self.sim("boot", UDID))
            self.checked(self.sim("bootstatus", UDID, "-b"))
        if self.inventory()[1] != "Booted":
            raise _Refusal("DEVICE_NOT_BOOTED")
        self.absence(RUNNER)
        self.absence(FIXTURE)
        if self.plan == "reference-study":
            self.fixture_ready()
        derived = self.derive_plan()
        method = "testMetadataOnly" if self.plan == "metadata" else "testReferenceStudy"
        stream = _Stream(self.request, self.plan, self.on_record)
        self.own({"kind":"runner-installation", "bundleId":RUNNER, "state":"testing-pending"})
        self.app_owned = True
        self.native_started = True  # Publication/launch may race failure or deadline.
        code, _, _ = self.command(["xcodebuild", "test-without-building", "-xctestrun", str(derived),
                  "-destination", "id="+UDID, "-parallel-testing-enabled", "NO",
                  "-maximum-concurrent-test-simulator-destinations", "1",
                  "-only-testing:NativeOwnerStudy/NativeOwnerStudy/"+method,
                  "-resultBundlePath", str(self.output/"result.xcresult")], stream)
        stream.complete()
        if code != 0:
            raise _Refusal("TEST_FAILED")
        details = stream.records[-1]["details"]
        if self.plan == "reference-study":
            return self.result("retained", "NATIVE_SETTLEMENT_UNCONFIRMED")
        if (stream.records[-1]["outcome"] != "observed" or details["appElementQueries"] != 0 or
            details["localMethodsReturned"] is not True or details["localReferencesReleased"] is not True):
            raise _Refusal("METADATA_COMPLETION_UNCONFIRMED")
        runner_pid = details["runnerPID"]
        code, stdout, stderr = self.command(["/bin/ps", "-p", str(runner_pid), "-o", "pid=", "-o", "comm="])
        if (code, stdout, stderr) != (1, "", ""):
            raise _Refusal("RUNNER_EXIT_UNCONFIRMED")
        self.save("runner-exit.json", {"pid":runner_pid, "positiveAbsence":True,
                  "meaning":"process absence, never an accessibility fence"})
        self.checked(self.sim("get_app_container", UDID, RUNNER, "app"))
        self.checked(self.sim("uninstall", UDID, RUNNER))
        self.absence(RUNNER)
        if self.booted:
            self.checked(self.sim("shutdown", UDID))
            self.booted = False
        final, _ = self.inventory()
        self.save("final-inventory.json", final)
        def states(inventory):
            return {device["udid"]:device["state"] for devices in inventory["devices"].values() for device in devices}
        if states(self.initial) != states(final):
            raise _Refusal("DEVICE_STATES_CHANGED")
        self.resources.clear()
        self.ledger()
        return self.result("completed", "METADATA_COMPLETED")

    def result(self, status, reason):
        if status == "retained":
            self.stop_file.touch(mode=0o600, exist_ok=True)
        retained = tuple(self.resources) + tuple(entry for entry in self.commands if entry["state"] != "exited")
        result = StudyResult(status, reason, self.request, str(self.output), tuple(self.records),
                             retained if status == "retained" else ())
        self.save("result.json", asdict(result))
        return result

def run_study(plan, configuration, dependencies):
    if configuration.device_id != UDID:
        return StudyResult("refused", "DEVICE_NOT_OWNED")
    if plan not in ("metadata", "reference-study"):
        return StudyResult("refused", "PLAN_UNSUPPORTED")
    seconds = configuration.admission_seconds
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds <= 0 or seconds > 300:
        return StudyResult("refused", "ADMISSION_ALLOWANCE_INVALID")
    if configuration.evidence_directory.exists():
        return StudyResult("refused", "EVIDENCE_NOT_FRESH")
    try:
        configuration.evidence_directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    except OSError:
        return StudyResult("refused", "EVIDENCE_CREATE_FAILED")
    study = _Study(plan, configuration, dependencies)
    try:
        return study.execute()
    except (_Refusal, OSError, ValueError, TypeError, KeyError) as error:
        reason = study.record_refusal or (str(error) if isinstance(error, _Refusal) else "LOCAL_STATE_UNCONFIRMED")
        pending = any(entry["state"] != "exited" for entry in study.commands)
        if not pending and not study.app_owned and not isinstance(error, _Expired):
            try:
                study.restore_pre_native()
            except (_Refusal, OSError):
                return study.result("retained", "PREPARATION_RESTORE_UNCONFIRMED")
            study.resources.clear()
            study.ledger()
            return study.result("refused", reason)
        return study.result("retained", reason)
