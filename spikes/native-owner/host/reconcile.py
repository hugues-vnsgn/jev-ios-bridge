"""Case-specific disposal of one retained metadata setup; no settlement claim."""
import argparse
from dataclasses import asdict
import gzip
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import plistlib
import uuid

from study import (Configuration, Dependencies, ProcessTools, StudyResult, _Study,
                   _Refusal, _Stream, _decode, UDID, PREFIX, CLASS_COMPLETED, MAX_JSON, MAX_LOG)
# The one-use exception recognizes only this archived case's original identities.
RUNNER = "dev.jev.research.native-owner-study.xctrunner"
FIXTURE = "dev.jev.research.native-owner-fixture"
PLUGIN = "dev.jev.research.native-owner-study"


_CASE_SHA256 = "50dfe89a32023bb40dad21a2e40c11e4e41f2842bc098c45fcfd1e6e5978418a"
_NATIVE_REVISION = "223d733a049485dd7a83b937dd0ae9e68135dc07"
_RUNNER_FILES = {"Info.plist", "NativeOwnerStudy-Runner", "PkgInfo",
    "PlugIns/NativeOwnerStudy.xctest/Info.plist", "PlugIns/NativeOwnerStudy.xctest/NativeOwnerStudy"}
_CASE_FIELDS = {"schema","requestId","archive","archiveManifestSHA256","buildBindingSHA256",
    "nativeSourceCommit","retainedDirectory","installedRunnerAppPath","runnerPID","parentPID",
    "ownedProcessGroup","initialDeviceState","retainedDeviceState","exception"}


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _safe(path):
    path = Path(path)
    try: resolved=path.resolve()
    except (RuntimeError,OSError): raise _Refusal("EVIDENCE_PATH_UNCONFIRMED") from None
    if not path.is_absolute() or resolved != path:
        raise _Refusal("EVIDENCE_PATH_UNCONFIRMED")
    return path


def _read(path, limit=MAX_JSON):
    path = _safe(path)
    if not path.is_file() or path.stat().st_size > limit:
        raise _Refusal("EVIDENCE_FILE_UNCONFIRMED")
    with path.open("rb") as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise _Refusal("EVIDENCE_FILE_LIMIT")
    return data


def _case_data():
    """Private data Seam; callers cannot supply a case or approval location."""
    repository = Path(__file__).resolve().parents[3]
    data = _read(repository/".scratch/native-owner-recovery/approved-case.json")
    if _sha(data) != _CASE_SHA256:
        raise _Refusal("REGISTERED_CASE_CHANGED")
    case = _decode(data)
    return case, repository/case["archive"]


def _relative(value):
    if type(value) is not str or not value or "\\" in value:
        raise _Refusal("ARCHIVE_PATH_INVALID")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in (".","..") for part in value.split("/")):
        raise _Refusal("ARCHIVE_PATH_INVALID")
    return Path(value)


def _identical(left, right):
    # Python's equality would treat integer 1 and boolean true as equal.
    return json.dumps(left,sort_keys=True) == json.dumps(right,sort_keys=True)


class _Reconciliation:
    def __init__(self, retained, configuration, dependencies):
        self.study = _Study("metadata-reconciliation",configuration,dependencies)
        self.original = retained
        self.case, self.archive = _case_data()
        self.claim_path = None
        self.claim = None
        self.initial_states = None
        self.apply = False

    def result(self, status, reason):
        if not self.apply and all(entry["state"] == "exited" for entry in self.study.commands):
            try:
                self.study.release_guard()
            except (_Refusal, OSError):
                status, reason = "retained", "DEVICE_GUARD_UNCERTAIN"
        return self.study.result(status, reason)

    def read(self, path, limit=MAX_JSON):
        self.study.admit()
        value = _read(path,limit)
        self.study.admit()
        return value

    def json(self, path):
        # Historical tool output is bounded by the receipt/file allowance,
        # rather than the native protocol's 1KiB per-string allowance.
        value = _decode(self.read(path,MAX_LOG))
        pending=[(value,0)]
        while pending:
            item,depth=pending.pop()
            if depth>64: raise _Refusal("EVIDENCE_JSON_DEPTH")
            if type(item) is dict:
                if any(len(key.encode("utf-8"))>1024 for key in item): raise _Refusal("EVIDENCE_JSON_KEY_LIMIT")
                pending.extend((child,depth+1) for child in item.values())
            elif type(item) is list:
                pending.extend((child,depth+1) for child in item)
        return value

    def provenance(self):
        case = self.case
        if (type(case) is not dict or set(case)!=_CASE_FIELDS or
            case["schema"]!="jev.native-owner.metadata-reconciliation/1" or
            case["exception"]!="metadata-only-numeric-completion-flags-2026-10-07" or
            case["nativeSourceCommit"]!=_NATIVE_REVISION or
            case["initialDeviceState"]!="Shutdown" or case["retainedDeviceState"]!="Booted" or
            any(type(case[key]) is not int or case[key]<=1 for key in ("runnerPID","parentPID","ownedProcessGroup")) or
            case["ownedProcessGroup"]!=case["parentPID"] or case["runnerPID"]==case["parentPID"]):
            raise _Refusal("CASE_UNSUPPORTED")
        if str(self.original)!=case["retainedDirectory"]:
            raise _Refusal("CASE_DIRECTORY_MISMATCH")
        _safe(self.original); _safe(self.archive)
        if self.study.output.is_relative_to(self.original) or self.study.output.is_relative_to(self.archive):
            raise _Refusal("RECONCILIATION_EVIDENCE_OVERLAP")
        manifest_data = self.read(self.archive/"manifest.json")
        if _sha(manifest_data)!=case["archiveManifestSHA256"]:
            raise _Refusal("ARCHIVE_MANIFEST_CHANGED")
        manifest = _decode(manifest_data)
        if (type(manifest) is not dict or set(manifest)!={"algorithm","files","compressedRawSHA256"}
            or manifest["algorithm"]!="SHA-256" or type(manifest["files"]) is not dict
            or type(manifest["compressedRawSHA256"]) is not dict):
            raise _Refusal("ARCHIVE_MANIFEST_INVALID")
        actual=set()
        for path in self.archive.rglob("*"):
            _safe(path)
            if path.is_file() and path != self.archive/"manifest.json": actual.add(str(path.relative_to(self.archive)))
            elif not path.is_file() and not path.is_dir(): raise _Refusal("ARCHIVE_FILES_CHANGED")
        if actual!=set(manifest["files"]) or set(manifest["compressedRawSHA256"])-actual:
            raise _Refusal("ARCHIVE_FILES_CHANGED")
        critical=set()
        for relative, expected in manifest["files"].items():
            path=self.archive/_relative(relative)
            data=self.read(path,MAX_LOG)
            if _sha(data)!=expected: raise _Refusal("ARCHIVE_FILE_CHANGED")
            if relative in manifest["compressedRawSHA256"]:
                with gzip.open(path,"rb") as handle: raw=handle.read(MAX_LOG+1)
                if len(raw)>MAX_LOG or _sha(raw)!=manifest["compressedRawSHA256"][relative]:
                    raise _Refusal("ARCHIVE_COMPRESSION_CHANGED")
                data=raw
            if relative.startswith("metadata-initial/"):
                name=relative[len("metadata-initial/"):]
                if relative in manifest["compressedRawSHA256"]:
                    if not name.endswith(".gz"): raise _Refusal("ARCHIVE_COMPRESSION_INVALID")
                    name=name[:-3]
                critical.add(name)
                if self.read(self.original/_relative(name),MAX_LOG)!=data:
                    raise _Refusal("ORIGINAL_RECEIPT_CHANGED")
        required={"result.json","ownership.json","observations.json","build-manifest.json",
                  "initial-inventory.json","derived-plan.json","owned.xctestrun","stop-admission"}
        required.update(f"command-{index:03d}.json" for index in range(1,7))
        required.update(f"process-output/{index:03d}-{name}.log" for index in range(1,8) for name in ("stdout","stderr"))
        if not required.issubset(critical): raise _Refusal("CRITICAL_RECEIPT_MISSING")
        if {path.name for path in self.original.glob("command-*.json")}!={f"command-{index:03d}.json" for index in range(1,7)}:
            raise _Refusal("ORIGINAL_COMMAND_HISTORY_CHANGED")
        binding_data=self.read(self.archive/"native-live-build-binding.json")
        if _sha(binding_data)!=case["buildBindingSHA256"]: raise _Refusal("BUILD_BINDING_CHANGED")
        binding=_decode(binding_data)
        if (binding.get("sourceCommit")!=_NATIVE_REVISION or binding.get("bundles")!={"NativeOwnerStudy-Runner.app":RUNNER,"NativeOwnerFixture.app":FIXTURE}
            or type(binding.get("sourceSHA256")) is not dict or not binding["sourceSHA256"]):
            raise _Refusal("BUILD_BINDING_UNCONFIRMED")
        products=binding.get("productSHA256")
        if type(products) is not dict: raise _Refusal("BUILD_BINDING_UNCONFIRMED")
        prefix="NativeOwnerStudy-Runner.app/"
        self.runner_hashes={name[len(prefix):]:value for name,value in products.items() if name.startswith(prefix)}
        if set(self.runner_hashes)!=_RUNNER_FILES: raise _Refusal("BUILD_RUNNER_SCOPE_CHANGED")
        build_manifest=self.json(self.original/"build-manifest.json")
        if type(build_manifest) is not list: raise _Refusal("BUILD_MANIFEST_INVALID")
        for relative, expected in {**products,**binding["sourceSHA256"]}.items():
            _relative(relative)
            matches=[entry for entry in build_manifest if type(entry) is dict and
                     type(entry.get("path")) is str and entry["path"].endswith("/"+relative) and entry.get("sha256")==expected]
            if len(matches)!=1: raise _Refusal("ORIGINAL_BUILD_BINDING_MISMATCH")
        result=self.json(self.original/"result.json")
        ledger=self.json(self.original/"ownership.json")
        request=case["requestId"]
        if (result.get("status")!="retained" or result.get("reason")!="RECORD_SCHEMA" or
            result.get("request_id")!=request or result.get("evidence_directory")!=str(self.original) or
            ledger.get("requestId")!=request or ledger.get("plan")!="metadata" or ledger.get("deviceId")!=UDID or
            ledger.get("nativeSettlement")!="unconfirmed"):
            raise _Refusal("HISTORICAL_CASE_UNCONFIRMED")
        resources=[{"kind":"device","deviceId":UDID,"initialState":"Shutdown"},
            {"kind":"runner-installation","bundleId":RUNNER,"state":"testing-pending"},
            {"kind":"runner","bundleId":RUNNER,"pid":case["runnerPID"],"state":"native-started"}]
        commands=ledger.get("commands")
        if type(commands) is not list or len(commands)!=7 or not _identical(ledger.get("resources"),resources):
            raise _Refusal("HISTORICAL_OWNERSHIP_UNCONFIRMED")
        expected_setup=[self.study.sim("list","devices","--json"), self.study.sim("boot",UDID),
            self.study.sim("bootstatus",UDID,"-b"), self.study.sim("list","devices","--json"),
            self.study.sim("get_app_container",UDID,RUNNER,"app"),self.study.sim("get_app_container",UDID,FIXTURE,"app")]
        for index, argv in enumerate(expected_setup,1):
            receipt=self.json(self.original/f"command-{index:03d}.json")
            entry=commands[index-1]
            if (entry.get("index")!=index or entry.get("argv")!=argv or entry.get("state")!="exited" or
                not _identical({key:receipt.get(key) for key in entry},entry)):
                raise _Refusal("HISTORICAL_COMMAND_UNCONFIRMED")
        original_command=commands[-1]
        expected_command=["xcodebuild","test-without-building","-xctestrun",str(self.original/"owned.xctestrun"),
            "-destination","id="+UDID,"-parallel-testing-enabled","NO",
            "-maximum-concurrent-test-simulator-destinations","1",
            "-only-testing:NativeOwnerStudy/NativeOwnerStudy/testMetadataOnly","-resultBundlePath",str(self.original/"result.xcresult")]
        if (original_command.get("argv")!=expected_command or original_command.get("index")!=7 or
            original_command.get("pid")!=case["parentPID"] or original_command.get("ownedProcessGroup")!=case["ownedProcessGroup"] or
            original_command.get("state")!="retained" or "returncode" in original_command or "parentReturncode" in original_command or
            not _identical(result.get("retained_resources"),resources+[original_command])):
            raise _Refusal("HISTORICAL_PROCESS_UNCONFIRMED")
        self.historical_records()
        derived=self.json(self.original/"derived-plan.json")
        plan_data=self.read(self.original/"owned.xctestrun")
        environment=derived.get("environment")
        plan=plistlib.loads(plan_data)
        targets=plan.get("TestConfigurations",[{"TestTargets":[plan.get("NativeOwnerStudy")]}])
        if "TestConfigurations" in plan:
            if len(targets)!=1 or len(targets[0].get("TestTargets",[]))!=1: raise _Refusal("HISTORICAL_PLAN_UNCONFIRMED")
            target=targets[0]["TestTargets"][0]
        else: target=plan.get("NativeOwnerStudy")
        if (derived.get("path")!=str(self.original/"owned.xctestrun") or derived.get("sha256")!=_sha(plan_data) or
            type(environment) is not dict or set(environment)!={"JEV_NATIVE_OWNER_REQUEST_ID","JEV_NATIVE_OWNER_PLAN","JEV_NATIVE_OWNER_ADMISSION_SECONDS","JEV_NATIVE_OWNER_STOP_FILE"} or
            environment.get("JEV_NATIVE_OWNER_REQUEST_ID")!=request or environment.get("JEV_NATIVE_OWNER_PLAN")!="metadata" or
            environment.get("JEV_NATIVE_OWNER_STOP_FILE")!=str(self.original/"stop-admission") or
            type(target) is not dict or target.get("EnvironmentVariables")!=environment):
            raise _Refusal("HISTORICAL_PLAN_UNCONFIRMED")
        self.study.save("historical-case.json",{"originalDirectory":str(self.original),"originalRequestId":request,
            "originalStatus":"retained","originalReason":"RECORD_SCHEMA","originalStreamValid":False,
            "historicalParentReturncode":None,"historicalParentReturncodeKnown":False,
            "exception":case["exception"],"numericFlags":{"localMethodsReturned":1,"localReferencesReleased":1},
            "nativeSettlement":"unconfirmed","successTextIsExitCode":False})

    def historical_records(self):
        stderr=self.read(self.original/"process-output/007-stderr.log",MAX_LOG)
        if PREFIX in stderr or CLASS_COMPLETED in stderr:
            raise _Refusal("HISTORICAL_STDERR_PROTOCOL_UNCONFIRMED")
        raw=self.read(self.original/"process-output/007-stdout.log",MAX_LOG)
        if not raw.endswith(b"\n"): raise _Refusal("HISTORICAL_STREAM_INCOMPLETE")
        lines=raw.splitlines()
        stream=_Stream(self.case["requestId"],"metadata",lambda record:None)
        records=[]; class_seen=False; success=0
        for line in lines:
            if PREFIX in line:
                if not line.startswith(PREFIX): raise _Refusal("HISTORICAL_RECORD_MARKER")
                record=_decode(line[len(PREFIX):]); records.append(record)
                diagnostic=_decode(json.dumps(record))
                if record.get("kind")=="finished":
                    details=record.get("details",{})
                    if (any(type(details.get(key)) is not int or details[key]!=1 for key in ("localMethodsReturned","localReferencesReleased")) or
                        type(details.get("appElementQueries")) is not int or details["appElementQueries"]!=0):
                        raise _Refusal("HISTORICAL_WIRE_DEFECT_MISMATCH")
                    diagnostic["details"]["localMethodsReturned"]=True
                    diagnostic["details"]["localReferencesReleased"]=True
                stream.feed("stdout",PREFIX+json.dumps(diagnostic).encode()+b"\n")
            else:
                stream.feed("stdout",line+b"\n")
            if line==CLASS_COMPLETED: class_seen=True
            if b"TEST EXECUTE SUCCEEDED" in line:
                if line!=b"** TEST EXECUTE SUCCEEDED **" or not class_seen:
                    raise _Refusal("HISTORICAL_SUCCESS_ORDER")
                success+=1
        stream.complete()
        if (len(records)!=3 or [record["kind"] for record in records]!=["started","observation","finished"] or
            any(record["outcome"]!="observed" for record in records) or records[0]["details"]["runnerPID"]!=self.case["runnerPID"] or success!=1 or
            not _identical(self.json(self.original/"observations.json"),records[:2]) or
            not _identical(self.json(self.original/"result.json").get("records"),records[:2])):
            raise _Refusal("HISTORICAL_METADATA_UNCONFIRMED")

    def processes_absent(self):
        for key in ("parentPID","runnerPID"):
            if self.study.command(["/bin/ps","-p",str(self.case[key]),"-o","pid=","-o","comm="])!=(1,"",""):
                raise _Refusal("HISTORICAL_PID_PRESENT_OR_UNCONFIRMED")
        code,stdout,stderr=self.study.command(["/bin/ps","-axo","pid=,pgid=,comm="])
        if code!=0 or stderr or not stdout.strip(): raise _Refusal("PROCESS_INSPECTION_UNCONFIRMED")
        seen=set()
        for line in stdout.splitlines():
            parts=line.strip().split(None,2)
            if len(parts)!=3 or not parts[0].isdigit() or not parts[1].isdigit() or int(parts[0])<1 or int(parts[0]) in seen:
                raise _Refusal("PROCESS_INSPECTION_UNCONFIRMED")
            seen.add(int(parts[0]))
            if (int(parts[0]) in (self.case["parentPID"],self.case["runnerPID"]) or
                int(parts[1])==self.case["ownedProcessGroup"] or Path(parts[2]).name=="NativeOwnerStudy-Runner" or "NativeOwnerStudy-Runner.app/" in parts[2]):
                raise _Refusal("OWNED_GROUP_OR_RUNNER_PRESENT")
        self.study.save("fresh-process-absence.json",{"pids":[self.case["parentPID"],self.case["runnerPID"]],
            "ownedProcessGroup":self.case["ownedProcessGroup"],"runnerExecutableAbsent":True,"nativeSettlement":"unconfirmed"})

    def runner(self):
        code,stdout,stderr=self.study.command(self.study.sim("get_app_container",UDID,RUNNER,"app"))
        if code!=0 or stderr or stdout!=self.case["installedRunnerAppPath"]+"\n":
            raise _Refusal("RUNNER_CONTAINER_UNCONFIRMED")
        app=_safe(Path(self.case["installedRunnerAppPath"]))
        if f"/Devices/{UDID}/data/Containers/Bundle/Application/" not in str(app) or app.name!="NativeOwnerStudy-Runner.app" or not app.is_dir():
            raise _Refusal("RUNNER_SCOPE_UNCONFIRMED")
        files=set()
        for path in app.rglob("*"):
            _safe(path)
            if path.is_file(): files.add(str(path.relative_to(app)))
            elif not path.is_dir(): raise _Refusal("RUNNER_FILES_CHANGED")
        if files!=_RUNNER_FILES: raise _Refusal("RUNNER_FILES_CHANGED")
        for relative, expected in self.runner_hashes.items():
            path=app/relative
            if path.stat().st_size>32*MAX_JSON or self.study.hash_file(path)!=expected:
                raise _Refusal("RUNNER_HASH_CHANGED")
        for relative,bundle in (("Info.plist",RUNNER),("PlugIns/NativeOwnerStudy.xctest/Info.plist",PLUGIN)):
            if plistlib.loads(self.read(app/relative)).get("CFBundleIdentifier")!=bundle:
                raise _Refusal("RUNNER_BUNDLE_CHANGED")
        self.study.save("fresh-runner-binding.json",{"path":str(app),"sha256":self.runner_hashes})

    @staticmethod
    def states(inventory):
        result={}
        for devices in inventory["devices"].values():
            for device in devices:
                identity,state=device.get("udid"),device.get("state")
                if type(identity) is not str or identity in result or state not in ("Booted","Shutdown"):
                    raise _Refusal("INVENTORY_STATES_UNCONFIRMED")
                result[identity]=state
        return result

    def gates(self):
        self.provenance()
        inventory,state=self.study.inventory()
        if state!="Booted": raise _Refusal("RETAINED_DEVICE_NOT_BOOTED")
        self.initial_states=self.states(inventory)
        self.study.save("pre-cleanup-inventory.json",inventory)
        self.study.absence(FIXTURE)
        self.processes_absent()
        self.runner()

    def update_claim(self, state):
        # Local tombstone accounting must remain possible after admission ends.
        # This bounded read never extends the deadline or authorizes a tool call.
        if not _identical(_decode(_read(self.claim_path)),self.claim):
            raise _Refusal("RECONCILIATION_CLAIM_CHANGED")
        self.claim["state"]=state
        temporary=self.claim_path.with_name(self.claim_path.name+"."+str(uuid.uuid4())+".tmp")
        with temporary.open("x") as handle:
            os.chmod(temporary,0o600)
            json.dump(self.claim,handle,allow_nan=False); handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        temporary.replace(self.claim_path)
        descriptor=os.open(self.claim_path.parent,os.O_RDONLY)
        try: os.fsync(descriptor)
        finally: os.close(descriptor)

    def claim_once(self):
        self.claim_path=self.original.parent/("."+self.original.name+".metadata-reconciliation-claim.json")
        self.claim={"schema":"jev.native-owner.metadata-reconciliation-claim/1","originalRequestId":self.case["requestId"],
            "requestId":self.study.request,"ownerPID":os.getpid(),"evidenceDirectory":str(self.study.output),
            "originalDirectory":str(self.original),"state":"claimed","nativeSettlement":"unconfirmed"}
        try:
            descriptor=os.open(self.claim_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        except FileExistsError:
            self.claim=None
            raise _Refusal("RECONCILIATION_ALREADY_CLAIMED") from None
        with os.fdopen(descriptor,"w") as handle:
            json.dump(self.claim,handle); handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        self.update_claim("claimed")
        self.study.save("claim.json",self.claim)
        self.study.ledger()

    def execute(self, apply):
        self.apply = apply
        self.provenance()
        self.study.own({"kind":"device","deviceId":UDID,"initialState":"Shutdown","state":"retained-Booted"})
        self.study.own({"kind":"runner-installation","bundleId":RUNNER,"state":"retained-installed"})
        claim_path = self.original.parent/("."+self.original.name+".metadata-reconciliation-claim.json")
        if apply and os.path.lexists(claim_path):
            raise _Refusal("RECONCILIATION_ALREADY_CLAIMED")
        self.study.acquire_guard()
        if apply: self.claim_once()
        self.gates()
        if not apply: return self.result("retained","METADATA_RECONCILIATION_READY")
        # Repeat the complete scope proof, including current process absence and
        # all installed bytes, immediately before the sole uninstall dispatch.
        self.gates()
        self.study.resources[1]["state"]="uninstall-pending"; self.study.ledger()
        self.update_claim("uninstall-pending")
        self.study.checked(self.study.sim("uninstall",UDID,RUNNER))
        self.study.absence(RUNNER)
        self.study.resources[1]["state"]="positive-absence"; self.study.ledger()
        self.study.absence(FIXTURE)
        self.study.resources[0]["state"]="shutdown-pending"; self.study.ledger()
        self.update_claim("shutdown-pending")
        self.study.checked(self.study.sim("shutdown",UDID))
        final,state=self.study.inventory()
        expected={**self.initial_states,UDID:"Shutdown"}
        if state!="Shutdown" or self.states(final)!=expected: raise _Refusal("DEVICE_STATES_CHANGED")
        self.study.save("final-inventory.json",final)
        self.update_claim("completed")
        self.study.save("claim.json",self.claim)
        self.study.resources.clear(); self.study.ledger()
        return self.result("completed","METADATA_RESOURCES_RECONCILED")


def reconcile_metadata(retained_directory, configuration, dependencies, apply=False):
    """Inspect one pinned metadata case; apply explicitly consumes its one-use claim."""
    if configuration.device_id!=UDID: return StudyResult("refused","DEVICE_NOT_OWNED")
    seconds=configuration.admission_seconds
    if type(apply) is not bool or type(seconds) not in (int,float) or not math.isfinite(seconds) or not 0<seconds<=300:
        return StudyResult("refused","RECONCILIATION_CONFIGURATION_INVALID")
    try:
        retained=_safe(Path(retained_directory))
        output=_safe(Path(configuration.evidence_directory))
        case,archive=_case_data()
        if str(retained)!=case["retainedDirectory"]: return StudyResult("refused","CASE_DIRECTORY_MISMATCH")
        if output.is_relative_to(retained) or output.is_relative_to(archive): return StudyResult("refused","RECONCILIATION_EVIDENCE_OVERLAP")
        if output.exists(): return StudyResult("refused","EVIDENCE_NOT_FRESH")
        output.mkdir(mode=0o700,parents=True,exist_ok=False)
        study=_Reconciliation(retained,configuration,dependencies)
    except (_Refusal,OSError,ValueError,TypeError,KeyError) as error:
        return StudyResult("refused",str(error) if isinstance(error,_Refusal) else "RECONCILIATION_LOCAL_STATE_UNCONFIRMED")
    try:
        return study.execute(apply)
    except (_Refusal,OSError,ValueError,TypeError,KeyError,EOFError) as error:
        reason=str(error) if isinstance(error,_Refusal) else "RECONCILIATION_LOCAL_STATE_UNCONFIRMED"
        if study.claim:
            try: study.update_claim("retained")
            except (_Refusal,OSError): pass  # Never overwrite a changed owner or force-reclaim.
        return study.result("refused" if reason in ("RECONCILIATION_ALREADY_CLAIMED","DEVICE_GUARD_BUSY") else "retained",reason)


def main():
    parser=argparse.ArgumentParser(description="Inspect the one registered retained metadata setup; no native settlement claim")
    parser.add_argument("--retained-directory",type=Path,required=True)
    parser.add_argument("--evidence-directory",type=Path,required=True)
    parser.add_argument("--admission-seconds",type=float,default=90)
    parser.add_argument("--apply",action="store_true")
    args=parser.parse_args()
    configuration=Configuration(Path("/private/tmp/jev-native-owner-study-admission-fix-build"),args.evidence_directory.resolve(),
        Path(__file__).resolve().parent.parent,args.admission_seconds)
    result=reconcile_metadata(args.retained_directory.absolute(),configuration,
        Dependencies(ProcessTools(configuration.evidence_directory/"process-output")),args.apply)
    print(json.dumps(asdict(result),indent=2))
    return {"completed":0,"refused":2,"retained":3}[result.status]


if __name__=="__main__": raise SystemExit(main())
