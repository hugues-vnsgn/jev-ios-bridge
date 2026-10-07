import gzip
import hashlib
import io
import json
import os
import plistlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import reconcile
from study import ABSENT, Configuration, Dependencies, FIXTURE, NAME, PLUGIN, PREFIX, RUNTIME, RUNNER, UDID


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


class Clock:
    def __init__(self): self.value = 0.0
    def now(self): return self.value
    def sleep(self, seconds): self.value += seconds


class Child:
    pid = 23456
    def __init__(self, code=0, stdout="", stderr=""):
        self.code = code
        self.output = [("stdout", stdout.encode()), ("stderr", stderr.encode())]
    def read_available(self):
        output, self.output = self.output, []
        return output
    def poll(self): return self.code
    def has_live_owned_group(self): return False
    @property
    def streams_closed(self): return not self.output


class CaseFixture:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.original = self.root / "original"
        self.archive = self.root / "archive"
        self.app = self.root / f"Devices/{UDID}/data/Containers/Bundle/Application/377FB024-136D-4407-9929-66C7CA0AF0C4/NativeOwnerStudy-Runner.app"
        self.request = "5f1164bb-f0a4-44c7-b5d9-88c39b3c1a56"
        self.case = {"schema":"jev.native-owner.metadata-reconciliation/1", "requestId":self.request,
            "archive":"archive", "nativeSourceCommit":"223d733a049485dd7a83b937dd0ae9e68135dc07",
            "retainedDirectory":str(self.original), "installedRunnerAppPath":str(self.app),
            "runnerPID":15195, "parentPID":13915, "ownedProcessGroup":13915,
            "initialDeviceState":"Shutdown", "retainedDeviceState":"Booted",
            "exception":"metadata-only-numeric-completion-flags-2026-10-07"}
        self.products = {
            "Info.plist":plistlib.dumps({"CFBundleIdentifier":RUNNER}),
            "NativeOwnerStudy-Runner":b"independent owned runner fixture",
            "PkgInfo":b"APPL????",
            "PlugIns/NativeOwnerStudy.xctest/Info.plist":plistlib.dumps({"CFBundleIdentifier":PLUGIN}),
            "PlugIns/NativeOwnerStudy.xctest/NativeOwnerStudy":b"independent metadata-only plugin fixture"}
        for relative, data in self.products.items():
            path=self.app/relative; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(data)
        self.rows = []
        for sequence, kind, details in [
            (0,"started",{"plan":"metadata","runnerPID":15195}),
            (1,"observation",{"interfaceClass":"SyntheticMetadataClient"}),
            (2,"finished",{"plan":"metadata","runnerPID":15195,"appElementQueries":0,
                "localMethodsReturned":1,"localReferencesReleased":1,"nativeSettlement":"unconfirmed",
                "coverage":{"originalAncestry":"unestablished","referenceLifetime":"unestablished","independentAssociations":"unestablished"}})]:
            self.rows.append({"schema":"jev.native-owner/1","requestId":self.request,"sequence":sequence,
                "kind":kind,"operation":"metadata","outcome":"observed","elapsedMs":sequence,"inputCalls":0,"details":details})
        resources=[{"kind":"device","deviceId":UDID,"initialState":"Shutdown"},
                   {"kind":"runner-installation","bundleId":RUNNER,"state":"testing-pending"},
                   {"kind":"runner","bundleId":RUNNER,"pid":15195,"state":"native-started"}]
        argv = ["xcodebuild","test-without-building","-xctestrun",str(self.original/"owned.xctestrun"),
                "-destination","id="+UDID,"-parallel-testing-enabled","NO",
                "-maximum-concurrent-test-simulator-destinations","1",
                "-only-testing:NativeOwnerStudy/NativeOwnerStudy/testMetadataOnly",
                "-resultBundlePath",str(self.original/"result.xcresult")]
        setup=[["xcrun","simctl","list","devices","--json"], ["xcrun","simctl","boot",UDID],
               ["xcrun","simctl","bootstatus",UDID,"-b"], ["xcrun","simctl","list","devices","--json"],
               ["xcrun","simctl","get_app_container",UDID,RUNNER,"app"],
               ["xcrun","simctl","get_app_container",UDID,FIXTURE,"app"]]
        commands=[]
        for index, arguments in enumerate(setup+[argv],1):
            entry={"index":index,"argv":arguments,"state":"retained" if index==7 else "exited",
                   "pid":13915 if index==7 else 13000+index,"ownedProcessGroup":13915 if index==7 else 13000+index,
                   "captureFiles":{name:str(self.original/f"process-output/{index:03d}-{name}.log") for name in ("stdout","stderr")}}
            if index<7: entry.update(parentReturncode=2 if index in (5,6) else 0,returncode=2 if index in (5,6) else 0)
            commands.append(entry)
            stdout=""; stderr=ABSENT if index in (5,6) else ""
            if index in (1,4): stdout=json.dumps(self.inventory("Shutdown" if index==1 else "Booted"))
            if index==7: stdout=self.native_output()
            for name,data in (("stdout",stdout),("stderr",stderr)):
                path=self.original/f"process-output/{index:03d}-{name}.log"
                path.parent.mkdir(parents=True,exist_ok=True); path.write_text(data)
            if index<7: write_json(self.original/f"command-{index:03d}.json",{**entry,"stdout":stdout,"stderr":stderr})
        write_json(self.original/"ownership.json",{"requestId":self.request,"plan":"metadata","deviceId":UDID,
            "commands":commands,"resources":resources,"nativeSettlement":"unconfirmed"})
        write_json(self.original/"result.json",{"status":"retained","reason":"RECORD_SCHEMA","request_id":self.request,
            "evidence_directory":str(self.original),"records":self.rows[:2],"retained_resources":resources+[commands[-1]]})
        write_json(self.original/"observations.json",self.rows[:2])
        write_json(self.original/"initial-inventory.json",self.inventory("Shutdown"))
        environment={"JEV_NATIVE_OWNER_REQUEST_ID":self.request,"JEV_NATIVE_OWNER_PLAN":"metadata",
                     "JEV_NATIVE_OWNER_ADMISSION_SECONDS":"81.0","JEV_NATIVE_OWNER_STOP_FILE":str(self.original/"stop-admission")}
        plan=plistlib.dumps({"NativeOwnerStudy":{"BlueprintName":"NativeOwnerStudy","EnvironmentVariables":environment}})
        (self.original/"owned.xctestrun").write_bytes(plan)
        write_json(self.original/"derived-plan.json",{"path":str(self.original/"owned.xctestrun"),"sha256":digest(plan),"environment":environment})
        (self.original/"stop-admission").touch()
        self.binding={"sourceCommit":self.case["nativeSourceCommit"],"sourceSHA256":{"native/ObservationStudy.m":digest(b"metadata-only source")},
            "productSHA256":{"NativeOwnerStudy-Runner.app/"+relative:digest(data) for relative,data in self.products.items()},
            "bundles":{"NativeOwnerStudy-Runner.app":RUNNER,"NativeOwnerFixture.app":FIXTURE}}
        write_json(self.original/"build-manifest.json",[{"path":"/owned/"+name,"sha256":value} for name,value in {**self.binding["productSHA256"],**self.binding["sourceSHA256"]}.items()])
        self.seal()
    def inventory(self,state="Booted"):
        return {"devices":{RUNTIME:[{"udid":UDID,"name":NAME,"state":state,"isAvailable":True},
                                     {"udid":"other-device","name":"other","state":"Shutdown","isAvailable":True}]}}
    def native_output(self):
        return "\n".join((PREFIX.decode()+json.dumps(row) for row in self.rows))+"\nJEV_NATIVE_OWNER_CLASS_COMPLETED\n** TEST EXECUTE SUCCEEDED **\n"
    def seal(self):
        for path in self.original.rglob("*"):
            if path.is_file():
                relative=path.relative_to(self.original)
                target=self.archive/"metadata-initial"/relative
                target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(path.read_bytes())
        write_json(self.archive/"native-live-build-binding.json",self.binding)
        files={str(path.relative_to(self.archive)):digest(path.read_bytes()) for path in self.archive.rglob("*") if path.is_file() and path.name!="manifest.json"}
        write_json(self.archive/"manifest.json",{"algorithm":"SHA-256","files":files,"compressedRawSHA256":{}})
        self.case["archiveManifestSHA256"]=digest((self.archive/"manifest.json").read_bytes())
        self.case["buildBindingSHA256"]=digest((self.archive/"native-live-build-binding.json").read_bytes())
    def config(self, name="inspection", seconds=90):
        return Configuration(self.root/"unused-build",self.root/name,self.root,seconds)


class Tools:
    def __init__(self, fixture):
        self.fixture=fixture; self.commands=[]; self.installed=True; self.state="Booted"
        self.overrides={}; self.before=lambda argv:None
    def start(self,argv,env,cwd):
        self.commands.append(argv)
        self.before(argv)
        if tuple(argv) in self.overrides: return self.overrides[tuple(argv)]()
        if argv[0]=="/bin/ps": return Child(1) if "-p" in argv else Child(stdout="1 1 /sbin/launchd\n")
        verb=argv[2]
        if verb=="list": return Child(stdout=json.dumps(self.fixture.inventory(self.state)))
        if verb=="get_app_container":
            if argv[4]==FIXTURE or not self.installed: return Child(2,stderr=ABSENT)
            return Child(stdout=str(self.fixture.app)+"\n")
        if verb=="uninstall": self.installed=False
        elif verb=="shutdown": self.state="Shutdown"
        else: raise AssertionError("Forbidden tool operation: "+repr(argv))
        return Child()


class Reconciliation(unittest.TestCase):
    def run_case(self, fixture, tools=None, apply=False, name="inspection", seconds=90):
        clock=Clock(); tools=tools or Tools(fixture)
        with patch.object(reconcile,"_case_data",return_value=(fixture.case,fixture.archive)):
            result=reconcile.reconcile_metadata(fixture.original,fixture.config(name,seconds),Dependencies(tools,clock.now,clock.sleep),apply)
        return result,tools

    def test_bounded_historical_tool_stdout_is_not_a_protocol_string(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root)
            path=f.original/"command-003.json"; receipt=json.loads(path.read_text())
            receipt["stdout"]="bounded historical boot-status output\n"*100
            write_json(path,receipt)
            (f.original/"process-output/003-stdout.log").write_text(receipt["stdout"])
            f.seal()
            result,tools=self.run_case(f)
            self.assertEqual(result.reason,"METADATA_RECONCILIATION_READY")

    def test_exact_case_inspection_is_ready_without_mutation(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root); clock=Clock(); tools=Tools(f)
            with patch.object(reconcile,"_case_data",return_value=(f.case,f.archive),create=True):
                result=reconcile.reconcile_metadata(f.original,f.config(),Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual((result.status,result.reason),("retained","METADATA_RECONCILIATION_READY"))
            self.assertTrue(tools.installed); self.assertEqual(tools.state,"Booted")
            self.assertFalse(any("uninstall" in argv or "shutdown" in argv for argv in tools.commands))

    def test_apply_removes_only_registered_runner_restores_shutdown_and_preserves_original_bytes(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root)
            before={str(path.relative_to(f.original)):path.read_bytes() for path in f.original.rglob("*") if path.is_file()}
            archive_before={str(path.relative_to(f.archive)):path.read_bytes() for path in f.archive.rglob("*") if path.is_file()}
            tools=Tools(f)
            def check_claim(argv):
                claim=f.original.parent/("."+f.original.name+".metadata-reconciliation-claim.json")
                value=json.loads(claim.read_text())
                self.assertEqual(value["ownerPID"],os.getpid())
                self.assertEqual(value["evidenceDirectory"],str(f.root/"apply"))
                if "uninstall" in argv: self.assertEqual(value["state"],"uninstall-pending")
                if "shutdown" in argv: self.assertEqual(value["state"],"shutdown-pending")
            tools.before=check_claim
            result,tools=self.run_case(f,tools,True,"apply")
            self.assertEqual((result.status,result.reason),("completed","METADATA_RESOURCES_RECONCILED"))
            self.assertEqual([argv for argv in tools.commands if "uninstall" in argv],[["xcrun","simctl","uninstall",UDID,RUNNER]])
            self.assertFalse(tools.installed); self.assertEqual(tools.state,"Shutdown")
            self.assertEqual({str(path.relative_to(f.original)):path.read_bytes() for path in f.original.rglob("*") if path.is_file()},before)
            self.assertEqual({str(path.relative_to(f.archive)):path.read_bytes() for path in f.archive.rglob("*") if path.is_file()},archive_before)
            historical=json.loads((f.root/"apply/historical-case.json").read_text())
            self.assertIsNone(historical["historicalParentReturncode"])
            self.assertFalse(historical["originalStreamValid"])
            self.assertEqual(historical["numericFlags"]["localMethodsReturned"],1)
            self.assertIs(type(historical["numericFlags"]["localMethodsReturned"]),int)
            self.assertEqual(historical["nativeSettlement"],"unconfirmed")
            self.assertEqual(json.loads((f.root/"apply/ownership.json").read_text())["resources"],[])

    def test_apply_is_one_use_even_if_another_installation_appears(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root)
            first,_=self.run_case(f,apply=True,name="first")
            self.assertEqual(first.status,"completed")
            second,tools=self.run_case(f,apply=True,name="second")
            self.assertEqual((second.status,second.reason),("refused","RECONCILIATION_ALREADY_CLAIMED"))
            self.assertEqual(tools.commands,[]); self.assertTrue(tools.installed)

    def test_registered_case_bytes_cannot_be_replaced_with_caller_approval(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root); tools=Tools(f)
            with patch.object(reconcile,"_CASE_SHA256","0"*64):
                result=reconcile.reconcile_metadata(f.original,f.config(),Dependencies(tools))
            self.assertEqual(result.reason,"REGISTERED_CASE_CHANGED"); self.assertEqual(tools.commands,[])

    def test_cli_defaults_to_inspection_and_requires_explicit_apply(self):
        for apply in (False,True):
            with self.subTest(apply=apply),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root); tools=Tools(f); output=io.StringIO()
                argv=["reconcile.py","--retained-directory",str(f.original),"--evidence-directory",str(f.root/"cli")]
                if apply: argv.append("--apply")
                with patch.object(reconcile,"_case_data",return_value=(f.case,f.archive)),patch.object(reconcile,"ProcessTools",return_value=tools),patch.object(sys,"argv",argv),patch("sys.stdout",output):
                    code=reconcile.main()
                result=json.loads(output.getvalue())
                self.assertEqual(result["reason"],"METADATA_RESOURCES_RECONCILED" if apply else "METADATA_RECONCILIATION_READY")
                self.assertEqual(code,0 if apply else 3)
                self.assertEqual(any("uninstall" in command for command in tools.commands),apply)

    def test_full_archive_verifies_compressed_hash_and_decompressed_original_bytes(self):
        for valid in (True,False):
            with self.subTest(valid=valid),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root)
                raw_path=f.archive/"metadata-initial/process-output/003-stdout.log"
                raw=raw_path.read_bytes(); compressed_path=raw_path.with_suffix(".log.gz")
                compressed_path.write_bytes(gzip.compress(raw)); raw_path.unlink()
                manifest=json.loads((f.archive/"manifest.json").read_text())
                relative=str(raw_path.relative_to(f.archive)); compressed=str(compressed_path.relative_to(f.archive))
                del manifest["files"][relative]
                manifest["files"][compressed]=digest(compressed_path.read_bytes())
                manifest["compressedRawSHA256"][compressed]=digest(raw) if valid else "0"*64
                write_json(f.archive/"manifest.json",manifest)
                f.case["archiveManifestSHA256"]=digest((f.archive/"manifest.json").read_bytes())
                result,tools=self.run_case(f)
                if valid: self.assertEqual(result.reason,"METADATA_RECONCILIATION_READY")
                else: self.assertEqual(result.reason,"ARCHIVE_COMPRESSION_CHANGED"); self.assertEqual(tools.commands,[])

    def test_unknown_directory_wrong_device_overlap_and_nonfresh_evidence_refuse_before_tools(self):
        for scenario in ("directory","device","overlap","existing","allowance","apply-type"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root); tools=Tools(f); config=f.config(); retained=f.original; apply=False
                if scenario=="directory": retained=f.root/"foreign"
                if scenario=="device": config=Configuration(config.derived_data,config.evidence_directory,config.source_root,device_id="foreign")
                if scenario=="overlap": config=Configuration(config.derived_data,f.original/"new",config.source_root)
                if scenario=="existing": config.evidence_directory.mkdir()
                if scenario=="allowance": config=Configuration(config.derived_data,config.evidence_directory,config.source_root,0)
                if scenario=="apply-type": apply=1
                with patch.object(reconcile,"_case_data",return_value=(f.case,f.archive)):
                    result=reconcile.reconcile_metadata(retained,config,Dependencies(tools),apply)
                self.assertEqual(result.status,"refused"); self.assertEqual(tools.commands,[])

    def test_changed_archive_original_and_binding_refuse_before_any_tool(self):
        for scenario in ("archive-manifest","archive-file","archive-extra","original","binding","symlink"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root)
                path={"archive-manifest":f.archive/"manifest.json","archive-file":f.archive/"metadata-initial/result.json",
                      "archive-extra":f.archive/"extra","original":f.original/"ownership.json",
                      "binding":f.archive/"native-live-build-binding.json","symlink":f.archive/"metadata-initial/stop-admission"}[scenario]
                if scenario=="symlink": path.unlink(); path.symlink_to(f.original/"stop-admission")
                else: path.write_text("changed bytes")
                result,tools=self.run_case(f,apply=True)
                self.assertNotEqual(result.status,"completed"); self.assertEqual(tools.commands,[])

    def test_reference_foreign_extra_query_or_wrong_wire_defect_cannot_use_exception(self):
        for scenario in ("reference","query","input","false","boolean","float","operation","settlement","coverage","request","resources"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root)
                if scenario=="reference":
                    path=f.original/"ownership.json"; value=json.loads(path.read_text()); value["plan"]="reference-study"; write_json(path,value)
                elif scenario=="resources":
                    path=f.original/"ownership.json"; value=json.loads(path.read_text()); value["resources"].append({"kind":"foreign"}); write_json(path,value)
                else:
                    if scenario=="query": f.rows[-1]["details"]["appElementQueries"]=1
                    if scenario=="input": f.rows[-1]["inputCalls"]=1
                    if scenario=="false": f.rows[-1]["details"]["localMethodsReturned"]=0
                    if scenario=="boolean": f.rows[-1]["details"]["localMethodsReturned"]=True
                    if scenario=="float": f.rows[-1]["details"]["localMethodsReturned"]=1.0
                    if scenario=="operation": f.rows[-1]["operation"]="point"
                    if scenario=="settlement": f.rows[-1]["details"]["nativeSettlement"]="settled"
                    if scenario=="coverage": f.rows[-1]["details"]["coverage"]["referenceLifetime"]="established"
                    if scenario=="request": f.rows[-1]["requestId"]="foreign-request"
                    (f.original/"process-output/007-stdout.log").write_text(f.native_output())
                f.seal()
                result,tools=self.run_case(f,apply=True)
                self.assertNotEqual(result.status,"completed"); self.assertEqual(tools.commands,[])

    def test_missing_or_wrong_class_and_success_order_refuse_before_any_tool(self):
        for scenario in ("missing-class","duplicate-class","class-before-finish","missing-success","success-before-class","truncated","extra-record"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root); text=f.native_output()
                if scenario=="missing-class": text=text.replace("JEV_NATIVE_OWNER_CLASS_COMPLETED\n","")
                if scenario=="duplicate-class": text=text.replace("JEV_NATIVE_OWNER_CLASS_COMPLETED\n","JEV_NATIVE_OWNER_CLASS_COMPLETED\n"*2)
                if scenario=="class-before-finish": text="JEV_NATIVE_OWNER_CLASS_COMPLETED\n"+text.replace("JEV_NATIVE_OWNER_CLASS_COMPLETED\n","")
                if scenario=="missing-success": text=text.replace("** TEST EXECUTE SUCCEEDED **\n","")
                if scenario=="success-before-class": text="** TEST EXECUTE SUCCEEDED **\n"+text.replace("** TEST EXECUTE SUCCEEDED **\n","")
                if scenario=="truncated": text=text.rstrip("\n")
                if scenario=="extra-record": text+=PREFIX.decode()+json.dumps(f.rows[-1])+"\n"
                (f.original/"process-output/007-stdout.log").write_text(text); f.seal()
                result,tools=self.run_case(f,apply=True)
                self.assertNotEqual(result.status,"completed"); self.assertEqual(tools.commands,[])

    def test_duplicate_json_keys_and_excessive_json_depth_refuse_before_any_tool(self):
        for scenario in ("duplicate","depth"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root)
                if scenario=="duplicate": (f.original/"result.json").write_text('{"status":"retained","status":"retained"}')
                else: (f.original/"result.json").write_text('['*70+'0'+']'*70)
                f.seal(); result,tools=self.run_case(f,apply=True)
                self.assertNotEqual(result.status,"completed"); self.assertEqual(tools.commands,[])

    def test_pid_group_and_any_current_runner_presence_or_inspection_error_retains(self):
        for scenario in ("parent","runner-pid","group","runner-instance","ps-error","ps-malformed","ps-stderr","ps-empty","ps-reused","full-scan-reused-pid"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root); tools=Tools(f)
                query=["/bin/ps","-axo","pid=,pgid=,comm="]
                reply=Child(stdout="1 1 /sbin/launchd\n")
                if scenario in ("parent","runner-pid","ps-reused"):
                    pid=13915 if scenario in ("parent","ps-reused") else 15195
                    query=["/bin/ps","-p",str(pid),"-o","pid=","-o","comm="]
                    reply=Child(0,stdout=f"{pid} /bin/harmless-reused-process\n")
                if scenario=="group": reply=Child(stdout="22222 13915 /bin/harmless-descendant\n")
                if scenario=="full-scan-reused-pid": reply=Child(stdout="13915 22222 /bin/harmless-reused-process\n")
                if scenario=="runner-instance": reply=Child(stdout="22222 22222 /foreign/NativeOwnerStudy-Runner.app/NativeOwnerStudy-Runner\n")
                if scenario=="ps-error": reply=Child(1,stderr="inspection failed")
                if scenario=="ps-malformed": reply=Child(stdout="ambiguous process information\n")
                if scenario=="ps-stderr": reply=Child(stdout="1 1 /sbin/launchd\n",stderr="warning")
                if scenario=="ps-empty": reply=Child()
                code=reply.code; stdout=reply.output[0][1].decode(); stderr=reply.output[1][1].decode()
                tools.overrides[tuple(query)]=lambda code=code,stdout=stdout,stderr=stderr:Child(code,stdout,stderr)
                result,tools=self.run_case(f,tools,True)
                self.assertEqual(result.status,"retained")
                self.assertFalse(any("uninstall" in argv or "shutdown" in argv for argv in tools.commands))

    def test_wrong_device_state_fixture_presence_and_noncanonical_absence_refuse_cleanup(self):
        for scenario in ("shutdown","foreign-name","fixture-present","fixture-error"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root); tools=Tools(f)
                if scenario=="shutdown": tools.state="Shutdown"
                if scenario=="foreign-name":
                    value=f.inventory(); value["devices"][RUNTIME][0]["name"]="foreign"
                    tools.overrides[("xcrun","simctl","list","devices","--json")]=lambda:Child(stdout=json.dumps(value))
                if scenario.startswith("fixture"):
                    tools.overrides[("xcrun","simctl","get_app_container",UDID,FIXTURE,"app")]=lambda:Child(0,stdout="/foreign\n") if scenario=="fixture-present" else Child(2,stderr="No such file or directory")
                result,tools=self.run_case(f,tools,True)
                self.assertEqual(result.status,"retained")
                self.assertFalse(any("uninstall" in argv or "shutdown" in argv for argv in tools.commands))

    def test_changed_path_installed_bytes_bundle_symlink_or_extra_file_retains(self):
        for scenario in ("path","hash","bundle","plugin","extra","symlink","ancestor-symlink"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root); tools=Tools(f)
                if scenario=="path": tools.overrides[("xcrun","simctl","get_app_container",UDID,RUNNER,"app")]=lambda:Child(stdout=str(f.app.parent/"Foreign.app")+"\n")
                if scenario=="hash": (f.app/"NativeOwnerStudy-Runner").write_bytes(b"changed")
                if scenario in ("bundle","plugin"):
                    relative="Info.plist" if scenario=="bundle" else "PlugIns/NativeOwnerStudy.xctest/Info.plist"
                    (f.app/relative).write_bytes(plistlib.dumps({"CFBundleIdentifier":"foreign"}))
                    f.binding["productSHA256"]["NativeOwnerStudy-Runner.app/"+relative]=digest((f.app/relative).read_bytes())
                    entries=json.loads((f.original/"build-manifest.json").read_text())
                    for entry in entries:
                        if entry["path"].endswith("/NativeOwnerStudy-Runner.app/"+relative): entry["sha256"]=f.binding["productSHA256"]["NativeOwnerStudy-Runner.app/"+relative]
                    write_json(f.original/"build-manifest.json",entries); f.seal()
                if scenario=="extra": (f.app/"extra").write_text("unbound")
                if scenario=="symlink":
                    target=f.app/"PkgInfo"; target.unlink(); target.symlink_to(f.app/"NativeOwnerStudy-Runner")
                if scenario=="ancestor-symlink":
                    displaced=f.app.with_name("Displaced.app"); f.app.rename(displaced); f.app.symlink_to(displaced,target_is_directory=True)
                result,tools=self.run_case(f,tools,True)
                self.assertEqual(result.status,"retained")
                self.assertFalse(any("uninstall" in argv or "shutdown" in argv for argv in tools.commands))

    def test_liveness_and_every_hash_are_rechecked_immediately_before_uninstall(self):
        for scenario in ("hash","new-process"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root); tools=Tools(f); scans=0
                def change_during_second_inspection(argv):
                    nonlocal scans
                    if argv==["/bin/ps","-axo","pid=,pgid=,comm="]:
                        scans+=1
                        if scans==2:
                            if scenario=="hash": (f.app/"NativeOwnerStudy-Runner").write_bytes(b"changed before uninstall")
                            else: tools.overrides[tuple(argv)]=lambda:Child(stdout="22222 13915 /bin/harmless\n")
                tools.before=change_during_second_inspection
                result,tools=self.run_case(f,tools,True)
                self.assertEqual(result.status,"retained"); self.assertEqual(scans,2)
                self.assertFalse(any("uninstall" in argv for argv in tools.commands))

    def test_changed_claim_owner_cannot_be_overwritten_before_uninstall(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root); tools=Tools(f); scans=0
            def replace_owner(argv):
                nonlocal scans
                if argv==["/bin/ps","-axo","pid=,pgid=,comm="]:
                    scans+=1
                    if scans==2:
                        path=f.original.parent/("."+f.original.name+".metadata-reconciliation-claim.json")
                        value=json.loads(path.read_text()); value["ownerPID"]=os.getpid()+10000; write_json(path,value)
            tools.before=replace_owner
            result,tools=self.run_case(f,tools,True)
            self.assertEqual((result.status,result.reason),("retained","RECONCILIATION_CLAIM_CHANGED"))
            self.assertFalse(any("uninstall" in argv or "shutdown" in argv for argv in tools.commands))

    def test_special_installed_file_and_extra_protocol_markers_on_stderr_are_refused(self):
        for scenario in ("fifo","stderr"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root)
                if scenario=="fifo": os.mkfifo(f.app/"extra-special-file")
                else:
                    (f.original/"process-output/007-stderr.log").write_bytes(PREFIX+json.dumps(f.rows[0]).encode()+b"\n")
                    f.seal()
                result,tools=self.run_case(f,apply=True)
                self.assertEqual(result.status,"retained")
                self.assertFalse(any("uninstall" in argv for argv in tools.commands))

    def test_deadline_after_claim_and_uncertain_uninstall_keep_tombstone_and_never_replay(self):
        for scenario in ("deadline","uninstall-error","spawn-loss","shutdown-error","final-absence"):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory() as root:
                f=CaseFixture(root); tools=Tools(f); clock=Clock()
                if scenario=="deadline": tools.before=lambda argv:setattr(clock,"value",90)
                if scenario=="uninstall-error": tools.overrides[("xcrun","simctl","uninstall",UDID,RUNNER)]=lambda:Child(1,stderr="uncertain uninstall")
                if scenario=="shutdown-error": tools.overrides[("xcrun","simctl","shutdown",UDID)]=lambda:Child(1,stderr="uncertain shutdown")
                if scenario=="spawn-loss":
                    def lose(argv):
                        if "uninstall" in argv: raise RuntimeError("frontend-like Adapter loss after possible dispatch")
                    tools.before=lose
                if scenario=="final-absence":
                    def change_absence(argv):
                        if "uninstall" in argv:
                            tools.overrides[("xcrun","simctl","get_app_container",UDID,RUNNER,"app")]=lambda:Child(2,stderr="noncanonical absence")
                    tools.before=change_absence
                with patch.object(reconcile,"_case_data",return_value=(f.case,f.archive)):
                    result=reconcile.reconcile_metadata(f.original,f.config(),Dependencies(tools,clock.now,clock.sleep),True)
                self.assertEqual(result.status,"retained")
                claim=json.loads((f.original.parent/("."+f.original.name+".metadata-reconciliation-claim.json")).read_text())
                self.assertEqual(claim["state"],"retained")
                second,second_tools=self.run_case(f,apply=True,name="second")
                self.assertEqual(second.reason,"RECONCILIATION_ALREADY_CLAIMED"); self.assertEqual(second_tools.commands,[])
                self.assertLessEqual(sum("uninstall" in argv for argv in tools.commands),1)

    def test_other_device_state_change_is_not_reported_as_completed_restoration(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root); tools=Tools(f)
            def change_foreign_state(argv):
                if "shutdown" in argv:
                    value=f.inventory("Shutdown"); value["devices"][RUNTIME][1]["state"]="Booted"
                    tools.overrides[("xcrun","simctl","list","devices","--json")]=lambda:Child(stdout=json.dumps(value))
            tools.before=change_foreign_state
            result,tools=self.run_case(f,tools,True)
            self.assertEqual((result.status,result.reason),("retained","DEVICE_STATES_CHANGED"))

    def test_partial_cleanup_saves_positive_runner_absence_before_later_fixture_failure(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root); tools=Tools(f)
            def fail_fixture_after_uninstall(argv):
                if "uninstall" in argv:
                    tools.overrides[("xcrun","simctl","get_app_container",UDID,FIXTURE,"app")]=lambda:Child(stdout="/unexpected-fixture\n")
            tools.before=fail_fixture_after_uninstall
            result,tools=self.run_case(f,tools,True)
            self.assertEqual(result.status,"retained")
            runner=next(resource for resource in result.retained_resources if resource.get("bundleId")==RUNNER)
            self.assertEqual(runner["state"],"positive-absence")
            self.assertFalse(any("shutdown" in argv for argv in tools.commands))

    def test_two_real_harmless_processes_compete_for_one_permanent_claim(self):
        with tempfile.TemporaryDirectory() as root:
            f=CaseFixture(root)
            payload=f.root/"case-data.json"; write_json(payload,f.case)
            script='''import json,sys,time
from pathlib import Path
from types import SimpleNamespace
import reconcile
from test_reconcile import Tools,CaseFixture,Clock
from study import Configuration,Dependencies
root=Path(sys.argv[1]); case=json.loads((root/'case-data.json').read_text())
fixture=SimpleNamespace(app=Path(case['installedRunnerAppPath']),inventory=lambda state:CaseFixture.inventory(None,state))
reconcile._case_data=lambda:(case,root/'archive')
clock=Clock(); tools=Tools(fixture)
end=time.monotonic()+5
while not (root/'go').exists() and time.monotonic()<end: time.sleep(.005)
config=Configuration(root/'unused-build',root/sys.argv[2],root)
result=reconcile.reconcile_metadata(root/'original',config,Dependencies(tools,clock.now,clock.sleep),True)
print(json.dumps({'status':result.status,'reason':result.reason,'uninstalls':sum('uninstall' in argv for argv in tools.commands)}))
'''
            children=[subprocess.Popen([sys.executable,"-c",script,str(f.root),name],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,cwd=Path(__file__).parent)
                      for name in ("process-one","process-two")]
            (f.root/"go").touch()
            outputs=[]
            for child in children:
                stdout,stderr=child.communicate(timeout=10)
                self.assertEqual(child.returncode,0,stderr)
                outputs.append(json.loads(stdout))
            self.assertEqual(sorted(item["reason"] for item in outputs),["METADATA_RESOURCES_RECONCILED","RECONCILIATION_ALREADY_CLAIMED"])
            self.assertEqual(sum(item["uninstalls"] for item in outputs),1)


if __name__=="__main__": unittest.main()
