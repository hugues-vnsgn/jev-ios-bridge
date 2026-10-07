import tempfile
import unittest
import json
import plistlib
import os
import sys
import time
from unittest.mock import patch
from pathlib import Path
from study import Configuration, Dependencies, ProcessTools, run_study, UDID, NAME, RUNTIME, MAX_JSON

RUNNER = "dev.jev.research.native-owner-study.xctrunner"
FIXTURE = "dev.jev.research.native-owner-fixture"
PLUGIN = "dev.jev.research.native-owner-study"
PREFIX = "JEV_NATIVE_OWNER_V1 "

class Clock:
    def __init__(self): self.value = 0.0
    def now(self): return self.value
    def sleep(self, seconds): self.value += seconds

class Child:
    pid = 23456
    def __init__(self, stdout=b"", stderr=b"", code=0):
        self.chunks = [("stdout", stdout), ("stderr", stderr)]
        self.code = code
    def read_available(self):
        result, self.chunks = self.chunks, []
        return result
    def poll(self): return self.code
    def has_live_owned_group(self): return False
    @property
    def streams_closed(self): return not self.chunks

def records(request, plan="metadata"):
    def record(sequence, kind, details):
        return {"schema":"jev.native-owner/1", "requestId":request,
                "sequence":sequence, "kind":kind, "operation":"metadata",
                "outcome":"observed", "elapsedMs":sequence, "inputCalls":0,
                "details":details}
    return [record(0, "started", {"plan":plan, "runnerPID":22222}),
            record(1, "observation", {"getterABIMatches":True}),
            record(2, "finished", {"plan":plan, "runnerPID":22222,
                "appElementQueries":0 if plan == "metadata" else 3,
                "localMethodsReturned":True, "localReferencesReleased":True,
                "nativeSettlement":"unconfirmed", "coverage":{
                    "originalAncestry":"unestablished",
                    "referenceLifetime":"unestablished",
                    "independentAssociations":"unestablished"}})]

class Tools:
    def __init__(self, clock, configuration):
        self.clock, self.configuration = clock, configuration
        self.commands = []
        self.installed = set()
        self.state = "Shutdown"
        self.mutate = lambda records: records
        self.class_markers = 1
        self.ps = Child(code=1)
        self.test_code = 0
        self.inventory_change = lambda device: device
        self.absence_code = 2
        self.telemetry = {"pid":33333,"generation":0,"ordinary":0}
        self.fixture_path_override = None
        self.started_ledgers = []
        self.test_child = None
    def start(self, argv, env, cwd):
        self.commands.append(argv)
        self.started_ledgers.append(json.loads((self.configuration.evidence_directory/"ownership.json").read_text()))
        if argv[0] == "/bin/ps": return self.ps
        if argv[0] == "xcodebuild":
            self.installed.add(RUNNER)
            plan = plistlib.loads(Path(argv[argv.index("-xctestrun")+1]).read_bytes())
            target = (plan["TestConfigurations"][0]["TestTargets"][0]
                      if "TestConfigurations" in plan else plan["NativeOwnerStudy"])
            environment = target["EnvironmentVariables"]
            self.environment = environment
            if self.test_child is not None: return self.test_child
            output = self.mutate(records(environment["JEV_NATIVE_OWNER_REQUEST_ID"],
                                         environment["JEV_NATIVE_OWNER_PLAN"]))
            lines = [PREFIX+json.dumps(row) for row in output]
            lines += ["JEV_NATIVE_OWNER_CLASS_COMPLETED"]*self.class_markers
            return Child(("\n".join(lines)+"\n").encode(), code=self.test_code)
        verb = argv[2]
        if verb == "list":
            device = self.inventory_change({"udid":UDID, "name":NAME,
                      "state":self.state, "isAvailable":True})
            return Child(json.dumps({"devices":{RUNTIME:[device]}}).encode())
        if verb == "boot": self.state = "Booted"
        elif verb == "shutdown": self.state = "Shutdown"
        elif verb == "get_app_container":
            bundle = argv[4]
            if bundle not in self.installed:
                return Child(stderr=("An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=2):\n"
                            "The operation couldn’t be completed. No such file or directory\n"
                            "No such file or directory\n").encode(), code=self.absence_code)
            container = self.configuration.source_root / ("fixture-data" if argv[5] == "data" else "installed-app")
            if argv[5] == "data" and self.fixture_path_override:
                return Child((str(self.fixture_path_override)+"\n").encode())
            container.mkdir(exist_ok=True)
            if argv[5] == "data":
                documents = container / "Documents"
                documents.mkdir(exist_ok=True)
                (documents/"result.txt").write_text(json.dumps(self.telemetry))
            else:
                (container/"Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier":bundle}))
            return Child((str(container)+"\n").encode())
        elif verb == "install": self.installed.add(FIXTURE)
        elif verb == "launch": return Child(f"{FIXTURE}: 33333\n".encode())
        elif verb == "uninstall": self.installed.remove(argv[4])
        return Child()

def configuration(root, seconds=90):
    root = Path(root)
    products = root/"derived/Build/Products"
    products.mkdir(parents=True)
    for product,bundle in [("NativeOwnerStudy-Runner.app",RUNNER),("NativeOwnerFixture.app",FIXTURE)]:
        app=products/"Debug-iphonesimulator"/product
        app.mkdir(parents=True)
        (app/"Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier":bundle}))
        (app/"executable").write_bytes(b"owned build fixture")
    plugin=products/"Debug-iphonesimulator/NativeOwnerStudy-Runner.app/PlugIns/NativeOwnerStudy.xctest"
    plugin.mkdir(parents=True)
    (plugin/"Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier":PLUGIN}))
    (products/"NativeOwnerStudy.xctestrun").write_bytes(plistlib.dumps({"NativeOwnerStudy":{
        "BlueprintName":"NativeOwnerStudy", "IsUITestBundle":True,
        "IsXCTRunnerHostedTestBundle":True,"UseUITargetAppProvidedByTests":True,
        "TestHostBundleIdentifier":RUNNER,
        "TestHostPath":"__TESTROOT__/Debug-iphonesimulator/NativeOwnerStudy-Runner.app",
        "TestBundlePath":"__TESTHOST__/PlugIns/NativeOwnerStudy.xctest",
        "DependentProductPaths":["__TESTROOT__/Debug-iphonesimulator/NativeOwnerFixture.app",
            "__TESTROOT__/Debug-iphonesimulator/NativeOwnerStudy-Runner.app",
            "__TESTROOT__/Debug-iphonesimulator/NativeOwnerStudy-Runner.app/PlugIns/NativeOwnerStudy.xctest"]}}))
    source=root/"source"
    (source/"native").mkdir(parents=True)
    (source/"fixture").mkdir()
    (source/"native/project.yml").write_text("name: NativeOwnerStudy")
    (source/"native/Study.m").write_text("// synthetic source")
    (source/"fixture/Fixture.swift").write_text("// synthetic fixture")
    return Configuration(root/"derived",root/"evidence",source,admission_seconds=seconds,
                         lease_root=root/"leases")

class NoTools:
    def start(self, *args, **kwargs):
        raise AssertionError("a refused device must start no process")

class Admission(unittest.TestCase):
    def test_wrong_device_refuses_before_tools_or_evidence(self):
        with tempfile.TemporaryDirectory() as root:
            evidence = Path(root) / "evidence"
            result = run_study("metadata", Configuration(Path(root), evidence,
                              Path(root), device_id="foreign"), Dependencies(NoTools()))
            self.assertEqual(result.status, "refused")
            self.assertEqual(result.reason, "DEVICE_NOT_OWNED")
            self.assertFalse(evidence.exists())

    def test_metadata_removes_only_its_new_runner_after_complete_stream_and_exit(self):
        with tempfile.TemporaryDirectory() as root:
            config = configuration(root)
            clock=Clock(); tools=Tools(clock,config)
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"completed")
            self.assertEqual(result.reason,"METADATA_COMPLETED")
            self.assertNotIn(RUNNER,tools.installed)
            self.assertEqual(tools.state,"Shutdown")
            self.assertIn(["xcrun","simctl","uninstall",UDID,RUNNER],tools.commands)
            self.assertNotIn(["xcrun","simctl","uninstall",UDID,FIXTURE],tools.commands)

    def test_objc_fixture_provenance_is_valid_for_the_actual_native_target(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root)
            (config.source_root/"fixture/Fixture.swift").rename(config.source_root/"fixture/Fixture.m")
            clock=Clock(); tools=Tools(clock,config)
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"completed")
            manifest=json.loads((config.evidence_directory/"build-manifest.json").read_text())
            self.assertTrue(any(row["path"].endswith("fixture/Fixture.m") for row in manifest))

    def test_reference_study_retains_new_fixture_device_and_runner_despite_normal_exit(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=Tools(clock,config)
            result=run_study("reference-study",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"retained")
            self.assertEqual(result.reason,"NATIVE_SETTLEMENT_UNCONFIRMED")
            self.assertEqual(tools.installed,{RUNNER,FIXTURE})
            self.assertEqual(tools.state,"Booted")
            self.assertFalse(any("uninstall" in argv for argv in tools.commands))
            self.assertIn(["xcrun","simctl","launch",UDID,FIXTURE],tools.commands)
            self.assertTrue(any(row.get("bundleId")==FIXTURE for row in result.retained_resources))

    def test_fixture_documents_need_not_exist_until_the_owned_app_launches(self):
        class LaunchCreatesDocuments(Tools):
            def start(self, argv, env, cwd):
                result=super().start(argv,env,cwd)
                if argv[:3]==["xcrun","simctl","get_app_container"] and argv[-1]=="data":
                    documents=self.configuration.source_root/"fixture-data/Documents"
                    if not any("launch" in call for call in self.commands):
                        (documents/"result.txt").unlink(missing_ok=True)
                        documents.rmdir()
                if argv[:3]==["xcrun","simctl","launch"]:
                    documents=self.configuration.source_root/"fixture-data/Documents"
                    documents.mkdir(exist_ok=True)
                    (documents/"result.txt").write_text(json.dumps(self.telemetry))
                return result
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=LaunchCreatesDocuments(clock,config)
            result=run_study("reference-study",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.reason,"NATIVE_SETTLEMENT_UNCONFIRMED")

    def test_a_parent_exit_with_an_owned_descendant_does_not_authorize_cleanup(self):
        class Descendant(Child):
            def has_live_owned_group(self): return True
        class DescendantTools(Tools):
            def start(self, argv, env, cwd):
                child=super().start(argv,env,cwd)
                if argv[0]=="xcodebuild":
                    child=Descendant(child.chunks[0][1])
                return child
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root,0.1); clock=Clock(); tools=DescendantTools(clock,config)
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"retained")
            self.assertEqual(result.reason,"ADMISSION_EXPIRED")
            self.assertTrue((config.evidence_directory/"stop-admission").exists())
            self.assertIn(RUNNER,tools.installed)


class Refusals(unittest.TestCase):
    def exercise(self, change, plan="metadata", seconds=90):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root,seconds); clock=Clock(); tools=Tools(clock,config)
            change(config,clock,tools)
            result=run_study(plan,config,Dependencies(tools,clock.now,clock.sleep))
            return result, tools

    def test_inventory_rejects_wrong_name_runtime_unavailable_state_and_duplicates(self):
        changes = [lambda d:{**d,"name":"foreign"},
                   lambda d:{**d,"isAvailable":False},
                   lambda d:{**d,"state":"Creating"},
                   lambda d:{**d,"udid":"foreign"}]
        for change in changes:
            with self.subTest(change=change):
                result,tools=self.exercise(lambda c,k,t:setattr(t,"inventory_change",change))
                self.assertEqual(result.status,"refused")
                self.assertFalse(any("boot" in argv or "uninstall" in argv for argv in tools.commands))
        class WrongRuntime(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                if argv[2:4]==["list","devices"]:
                    value=json.loads(child.chunks[0][1]); value["devices"]["foreign"]=value["devices"].pop(RUNTIME)
                    return Child(json.dumps(value).encode())
                return child
        for duplicate in (False,True):
            with tempfile.TemporaryDirectory() as root:
                config=configuration(root); clock=Clock()
                tools=WrongRuntime(clock,config)
                if duplicate:
                    original=tools.start
                    def start(argv,env,cwd):
                        child=original(argv,env,cwd)
                        if argv[2:4]==["list","devices"]:
                            value=json.loads(child.chunks[0][1]); value["devices"][RUNTIME]=value["devices"]["foreign"]
                            return Child(json.dumps(value).encode())
                        return child
                    tools.start=start
                result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual(result.status,"refused")

    def test_preexisting_bundle_or_ambiguous_absence_restores_only_the_initial_state(self):
        for bundle in (RUNNER,FIXTURE,None):
            with self.subTest(bundle=bundle):
                def change(c,k,t):
                    if bundle: t.installed.add(bundle)
                    else: t.absence_code=1
                result,tools=self.exercise(change)
                self.assertEqual(result.status,"refused")
                self.assertEqual(result.reason,"APP_ABSENCE_UNCONFIRMED")
                self.assertEqual(tools.state,"Shutdown")
                self.assertFalse(any("uninstall" in argv for argv in tools.commands))
                if bundle: self.assertIn(bundle,tools.installed)

    def test_nonfresh_evidence_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); config.evidence_directory.mkdir()
            sentinel=config.evidence_directory/"result.json"; sentinel.write_text("owned elsewhere")
            result=run_study("metadata",config,Dependencies(NoTools()))
            self.assertEqual(result.reason,"EVIDENCE_NOT_FRESH")
            self.assertEqual(sentinel.read_text(),"owned elsewhere")

    def test_bad_products_or_test_target_start_no_native_work(self):
        changes=[lambda c:(c.derived_data/"Build/Products/extra.xctestrun").write_bytes(b"duplicate"),
                 lambda c:(c.derived_data/"Build/Products/Debug-iphonesimulator/NativeOwnerStudy-Runner.app/Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier":"foreign"})),
                 lambda c:(c.derived_data/"Build/Products/NativeOwnerStudy.xctestrun").write_bytes(plistlib.dumps({"foreign":{}})),
                 lambda c:(c.source_root/"native/Study.m").unlink()]
        for change in changes:
            with self.subTest(change=change):
                result,tools=self.exercise(lambda c,k,t:change(c))
                self.assertEqual(result.status,"refused")
                self.assertFalse(any(argv[0]=="xcodebuild" for argv in tools.commands))
                self.assertEqual(tools.state,"Shutdown")

    def test_invalid_allowance_or_plan_starts_nothing(self):
        for seconds in (0,-1,301,float("inf"),float("nan"),True):
            with self.subTest(seconds=seconds):
                result,tools=self.exercise(lambda c,k,t:None,seconds=seconds)
                self.assertEqual(result.reason,"ADMISSION_ALLOWANCE_INVALID")
                self.assertEqual(tools.commands,[])
        result,tools=self.exercise(lambda c,k,t:None,plan="tap")
        self.assertEqual(result.reason,"PLAN_UNSUPPORTED")
        self.assertEqual(tools.commands,[])

    def test_all_commands_share_the_initial_deadline_and_receive_pre_spawn_ownership(self):
        class SlowTools(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                self.clock.value+=0.03
                return child
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root,0.07); clock=Clock(); tools=SlowTools(clock,config)
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.reason,"ADMISSION_EXPIRED")
            self.assertEqual(result.status,"retained")
            self.assertTrue((config.evidence_directory/"stop-admission").exists())
            self.assertFalse(any(argv[0]=="xcodebuild" for argv in tools.commands))
            for ledger,argv in zip(tools.started_ledgers,tools.commands):
                self.assertEqual(ledger["commands"][-1]["state"],"spawn-pending")
                self.assertEqual(ledger["commands"][-1]["argv"],argv)

    def test_reference_fixture_requires_exact_pid_generation_and_zero_counter(self):
        for telemetry in ({"pid":33334,"generation":0,"ordinary":0},
                          {"pid":33333,"generation":1,"ordinary":0},
                          {"pid":33333,"generation":0,"ordinary":1},
                          {"pid":True,"generation":0,"ordinary":0},
                          {"pid":33333,"generation":0,"ordinary":0,"extra":0}):
            with self.subTest(telemetry=telemetry):
                result,tools=self.exercise(lambda c,k,t:setattr(t,"telemetry",telemetry),"reference-study")
                self.assertEqual(result.status,"retained")
                self.assertEqual(result.reason,"FIXTURE_READINESS_UNCONFIRMED")
                self.assertFalse(any(argv[0]=="xcodebuild" for argv in tools.commands))
                self.assertIn(FIXTURE,tools.installed)

    def test_metadata_retains_on_pid_present_reused_or_inspection_error(self):
        for child in (Child(b"22222 /foreign/process\n"),Child(b"22222 NativeOwnerStudy-Runner\n"),
                      Child(stderr=b"inspection failed\n",code=1),Child(code=2)):
            with self.subTest(child=child):
                result,tools=self.exercise(lambda c,k,t:setattr(t,"ps",child))
                self.assertEqual(result.reason,"RUNNER_EXIT_UNCONFIRMED")
                self.assertEqual(result.status,"retained")
                self.assertIn(RUNNER,tools.installed)
                self.assertFalse(any("uninstall" in argv for argv in tools.commands))

    def test_derived_plan_binds_environment_paths_and_strips_unrelated_secrets(self):
        class CaptureEnvironment(Tools):
            def start(self,argv,env,cwd):
                self.environments=getattr(self,"environments",[])+[dict(env)]
                return super().start(argv,env,cwd)
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root)
            plan_path=config.derived_data/"Build/Products/NativeOwnerStudy.xctestrun"
            plan=plistlib.loads(plan_path.read_bytes())
            plan["NativeOwnerStudy"]["EnvironmentVariables"]={"TYPESAFE_API_KEY":"synthetic-only-canary",
                                                               "DYLD_FRAMEWORK_PATH":"__TESTROOT__/Debug-iphonesimulator"}
            plan_path.write_bytes(plistlib.dumps(plan))
            clock=Clock(); tools=CaptureEnvironment(clock,config)
            with patch("study.os.environ",{"PATH":"/usr/bin:/bin","TYPESAFE_API_KEY":"synthetic-only-canary"}):
                result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"completed")
            self.assertTrue(all("TYPESAFE_API_KEY" not in env for env in tools.environments))
            self.assertNotIn("TYPESAFE_API_KEY",tools.environment)
            self.assertEqual(tools.environment["JEV_NATIVE_OWNER_PLAN"],"metadata")
            self.assertEqual(Path(tools.environment["JEV_NATIVE_OWNER_STOP_FILE"]).resolve(),
                             (config.evidence_directory/"stop-admission").resolve())
            self.assertEqual(tools.environment["JEV_NATIVE_OWNER_REQUEST_ID"],result.request_id)
            derived=plistlib.loads((config.evidence_directory/"owned.xctestrun").read_bytes())
            self.assertTrue(derived["NativeOwnerStudy"]["TestBundlePath"].startswith(str(plan_path.parent.resolve())))
            self.assertNotIn(b"synthetic-only-canary",(config.evidence_directory/"owned.xctestrun").read_bytes())


class BuildOwnership(unittest.TestCase):
    def test_verified_build_directory_may_contain_double_underscores(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(Path(root)/"owned__build")
            clock=Clock(); tools=Tools(clock,config)
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"completed")
            self.assertEqual(result.reason,"METADATA_COMPLETED")

    def test_same_named_plan_cannot_launch_foreign_or_stale_artifacts(self):
        changes={
            "foreign-host":("TestHostPath","/tmp/Foreign-Runner.app"),
            "foreign-host-id":("TestHostBundleIdentifier","dev.foreign.runner"),
            "foreign-plugin":("TestBundlePath","/tmp/Foreign.xctest"),
            "foreign-plugin-id":("TestBundleIdentifier","dev.foreign.test"),
            "foreign-dependency":("DependentProductPaths",["/tmp/Foreign.app"]),
            "foreign-ui-path":("UITargetAppPath","/tmp/Foreign.app"),
            "foreign-ui-id":("UITargetAppBundleIdentifier","dev.foreign.app"),
            "missing-host-id":("TestHostBundleIdentifier",None),
            "unknown-startup-field":("AdditionalStartupTargets",["/tmp/Foreign.app"]),
        }
        for name,(field,value) in changes.items():
            with self.subTest(name=name),tempfile.TemporaryDirectory() as root:
                config=configuration(root); clock=Clock(); tools=Tools(clock,config)
                path=config.derived_data/"Build/Products/NativeOwnerStudy.xctestrun"
                plan=plistlib.loads(path.read_bytes())
                if value is None: plan["NativeOwnerStudy"].pop(field)
                else: plan["NativeOwnerStudy"][field]=value
                path.write_bytes(plistlib.dumps(plan))
                result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual(result.status,"refused")
                self.assertEqual(tools.commands,[],"artifact ownership must be checked before any simulator setup")

    def test_foreign_plugin_bundle_and_extra_startup_targets_are_refused(self):
        for mode in ("plugin-id","extra-legacy-target","extra-modern-target","extra-configuration"):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as root:
                config=configuration(root); clock=Clock(); tools=Tools(clock,config)
                path=config.derived_data/"Build/Products/NativeOwnerStudy.xctestrun"
                plan=plistlib.loads(path.read_bytes())
                if mode=="plugin-id":
                    plugin=config.derived_data/"Build/Products/Debug-iphonesimulator/NativeOwnerStudy-Runner.app/PlugIns/NativeOwnerStudy.xctest/Info.plist"
                    plugin.write_bytes(plistlib.dumps({"CFBundleIdentifier":"dev.foreign.test"}))
                elif mode=="extra-legacy-target": plan["ForeignStartup"]={"TestHostPath":"/tmp/Foreign.app"}
                else:
                    targets=[plan["NativeOwnerStudy"]]
                    if mode=="extra-modern-target": targets.append({"BlueprintName":"Foreign","TestHostPath":"/tmp/Foreign.app"})
                    plan={"TestConfigurations":[{"TestTargets":targets}]}
                    if mode=="extra-configuration": plan["TestConfigurations"].append({"TestTargets":[targets[0]]})
                path.write_bytes(plistlib.dumps(plan))
                result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual(result.status,"refused")
                self.assertEqual(tools.commands,[])

    def test_metadata_derived_plan_contains_only_verified_runner_and_plugin(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=Tools(clock,config)
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"completed")
            target=plistlib.loads((config.evidence_directory/"owned.xctestrun").read_bytes())["NativeOwnerStudy"]
            runner=(config.derived_data/"Build/Products/Debug-iphonesimulator/NativeOwnerStudy-Runner.app").resolve()
            plugin=runner/"PlugIns/NativeOwnerStudy.xctest"
            self.assertEqual(target["TestHostPath"],str(runner))
            self.assertEqual(target["TestBundlePath"],str(plugin))
            self.assertEqual(set(target["DependentProductPaths"]),{str(runner),str(plugin)})
            self.assertFalse(any(key.startswith("UITargetApp") for key in target))

    def test_single_modern_configuration_uses_the_same_verified_products(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=Tools(clock,config)
            path=config.derived_data/"Build/Products/NativeOwnerStudy.xctestrun"
            target=plistlib.loads(path.read_bytes())["NativeOwnerStudy"]
            path.write_bytes(plistlib.dumps({"TestConfigurations":[{"Name":"owned","TestTargets":[target]}]}))
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"completed")
            derived=plistlib.loads((config.evidence_directory/"owned.xctestrun").read_bytes())
            self.assertEqual(len(derived["TestConfigurations"]),1)
            self.assertEqual(len(derived["TestConfigurations"][0]["TestTargets"]),1)

    def test_foreign_runtime_library_and_launch_arguments_are_refused_before_tools(self):
        for field,value in (("TestingEnvironmentVariables",{"DYLD_INSERT_LIBRARIES":"/tmp/foreign.dylib"}),
                            ("TestingEnvironmentVariables",{"DYLD_FRAMEWORK_PATH":"/tmp/Foreign.framework"}),
                            ("UITargetAppEnvironmentVariables",{"DYLD_LIBRARY_PATH":"/tmp/foreign"}),
                            ("CommandLineArguments",["--foreign"]),
                            ("UITargetAppCommandLineArguments",["--foreign"])):
            with self.subTest(field=field,value=value),tempfile.TemporaryDirectory() as root:
                config=configuration(root); clock=Clock(); tools=Tools(clock,config)
                path=config.derived_data/"Build/Products/NativeOwnerStudy.xctestrun"
                plan=plistlib.loads(path.read_bytes()); plan["NativeOwnerStudy"][field]=value
                path.write_bytes(plistlib.dumps(plan))
                result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual(result.status,"refused")
                self.assertEqual(tools.commands,[])


class Streams(unittest.TestCase):
    exercise = Refusals.exercise
    def test_unknown_changed_duplicate_missing_and_invalid_records_retain(self):
        changes={
            "wrong-request":lambda rows:[{**r,"requestId":"foreign"} for r in rows],
            "duplicate":lambda rows:[rows[0],rows[0],*rows[1:]],
            "missing-finish":lambda rows:rows[:-1],
            "missing-start":lambda rows:rows[1:],
            "unknown-kind":lambda rows:[rows[0],{**rows[1],"kind":"complete"},rows[2]],
            "unknown-operation":lambda rows:[rows[0],{**rows[1],"operation":"tap"},rows[2]],
            "input":lambda rows:[{**r,"inputCalls":1} for r in rows],
            "bool-input":lambda rows:[{**r,"inputCalls":False} for r in rows],
            "bool-sequence":lambda rows:[{**rows[0],"sequence":False},*rows[1:]],
            "negative-time":lambda rows:[rows[0],{**rows[1],"elapsedMs":-1},rows[2]],
            "reversed-time":lambda rows:[rows[0],{**rows[1],"elapsedMs":3},rows[2]],
            "nan":lambda rows:[rows[0],{**rows[1],"elapsedMs":float("nan")},rows[2]],
            "extra-field":lambda rows:[rows[0],{**rows[1],"extra":1},rows[2]],
            "missing-required":lambda rows:[rows[0],{k:v for k,v in rows[1].items() if k!="inputCalls"},rows[2]],
            "bad-details":lambda rows:[rows[0],{**rows[1],"details":[]},rows[2]],
            "bad-plan":lambda rows:[rows[0],rows[1],{**rows[2],"details":{**rows[2]["details"],"plan":"reference-study"}}],
            "changed-pid":lambda rows:[rows[0],rows[1],{**rows[2],"details":{**rows[2]["details"],"runnerPID":22223}}],
            "missing-query-count":lambda rows:[rows[0],rows[1],{**rows[2],"details":{k:v for k,v in rows[2]["details"].items() if k!="appElementQueries"}}],
            "claimed-settlement":lambda rows:[rows[0],rows[1],{**rows[2],"details":{**rows[2]["details"],"nativeSettlement":"settled"}}],
            "claimed-coverage":lambda rows:[rows[0],{**rows[1],"details":{"ancestryComplete":True}},rows[2]],
            "claimed-association":lambda rows:[rows[0],rows[1],{**rows[2],"details":{**rows[2]["details"],"coverage":{"originalAncestry":"established","referenceLifetime":"unestablished","independentAssociations":"unestablished"}}}],
            "new-record-after-finish":lambda rows:[*rows,{**rows[1],"sequence":3}],
        }
        for name,change in changes.items():
            with self.subTest(name=name):
                result,tools=self.exercise(lambda c,k,t:setattr(t,"mutate",change))
                self.assertEqual(result.status,"retained")
                self.assertIn(RUNNER,tools.installed)
                self.assertFalse(any("uninstall" in argv for argv in tools.commands))

    def test_class_failure_query_count_or_local_flags_prevent_metadata_cleanup(self):
        cases=[("class_markers",0), ("class_markers",2), ("test_code",65)]
        for field,value in cases:
            with self.subTest(field=field,value=value):
                result,tools=self.exercise(lambda c,k,t:setattr(t,field,value))
                self.assertEqual(result.status,"retained")
                self.assertIn(RUNNER,tools.installed)
        for field,value in (("appElementQueries",1),("localMethodsReturned",False),
                            ("localReferencesReleased",False)):
            with self.subTest(field=field):
                def mutate(rows):
                    rows[-1]["details"][field]=value
                    return rows
                result,tools=self.exercise(lambda c,k,t:setattr(t,"mutate",mutate))
                self.assertEqual(result.reason,"METADATA_COMPLETION_UNCONFIRMED")
                self.assertIn(RUNNER,tools.installed)

    def test_utf8_string_bound_accepts_exact_limit_and_rejects_one_more_byte(self):
        for value,status in (("é"*512,"completed"),("é"*512+"x","retained")):
            with self.subTest(bytes=len(value.encode())):
                def mutate(rows):
                    rows[1]["details"]={"raw":value}
                    return rows
                result,_=self.exercise(lambda c,k,t:setattr(t,"mutate",mutate))
                self.assertEqual(result.status,status)

    def test_total_json_stream_limit_is_enforced_across_individually_valid_records(self):
        def oversized(rows):
            result=[rows[0]]
            for sequence in range(1,1300):
                result.append({**rows[1],"sequence":sequence,"elapsedMs":sequence,
                               "details":{"bounded":"x"*1024}})
            result.append({**rows[-1],"sequence":1300,"elapsedMs":1300})
            return result
        result,tools=self.exercise(lambda c,k,t:setattr(t,"mutate",oversized))
        self.assertEqual(result.reason,"RECORD_STREAM_LIMIT")
        self.assertIn(RUNNER,tools.installed)

    def test_exact_one_mib_json_stream_passes_and_one_more_byte_retains(self):
        def at_limit(rows,extra):
            for count in range(1000,1024):
                rows[1]["details"]={"chunks":["x"*1024]*count,"padding":""}
                wire=sum(len(json.dumps(row).encode())+1 for row in rows)
                remaining=1048576-wire
                if 0<=remaining<1024:
                    rows[1]["details"]["padding"]="x"*(remaining+extra)
                    self.assertEqual(sum(len(json.dumps(row).encode())+1 for row in rows),1048576+extra)
                    return rows
            raise AssertionError("test wire boundary could not be constructed")
        for extra in (0,1):
            with self.subTest(extra=extra):
                result,_=self.exercise(lambda c,k,t:setattr(t,"mutate",lambda rows:at_limit(rows,extra)))
                self.assertEqual(result.status,"completed" if extra==0 else "retained")
                if extra: self.assertEqual(result.reason,"RECORD_STREAM_LIMIT")

    def test_duplicate_json_key_and_embedded_marker_are_not_valid_records(self):
        class BrokenWire(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                if argv[0]=="xcodebuild":
                    original=child.chunks[0][1]
                    if self.mode=="duplicate-key":
                        original=original.replace(b'"inputCalls": 0',b'"inputCalls": 0, "inputCalls": 0',1)
                    else:
                        original=b"embedded "+original
                    child.chunks[0]=("stdout",original)
                return child
        for mode in ("duplicate-key","embedded"):
            with tempfile.TemporaryDirectory() as root:
                config=configuration(root); clock=Clock(); tools=BrokenWire(clock,config); tools.mode=mode
                result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual(result.status,"retained")
                self.assertEqual(result.reason,"MALFORMED_JSON" if mode=="duplicate-key" else "MALFORMED_RECORD_MARKER")

    def test_parent_limit_32_observed_edges_then_failure_is_honest(self):
        for count in (32,33):
            with self.subTest(count=count):
                def parents(rows):
                    result=[rows[0]]
                    for i in range(1,count+1):
                        result.append({**rows[1],"sequence":i,"elapsedMs":i,"operation":"parent",
                                       "details":{"edge":i,"parentPresent":True}})
                    result.append({**rows[1],"sequence":count+1,"elapsedMs":count+1,
                                   "operation":"parent","outcome":"failed","details":{"edges":32,"reason":"parent-limit"}})
                    result.append({**rows[-1],"sequence":count+2,"elapsedMs":count+2})
                    return result
                result,_=self.exercise(lambda c,k,t:setattr(t,"mutate",parents),"reference-study")
                self.assertEqual(result.reason,"NATIVE_SETTLEMENT_UNCONFIRMED" if count==32 else "PARENT_EDGE_LIMIT")

    def test_programmatic_recreation_is_one_owned_write_and_setup_activation_is_not_a_request(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=Tools(clock,config)
            def mutate(rows):
                activation={**rows[1],"operation":"fixture-recreation",
                    "details":{"setup":"activate","bundleId":FIXTURE}}
                recreation={**rows[1],"sequence":2,"elapsedMs":2,"operation":"fixture-recreation",
                    "details":{"request":"recreate"}}
                return [rows[0],activation,recreation,{**rows[2],"sequence":3,"elapsedMs":3}]
            tools.mutate=mutate
            result=run_study("reference-study",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.reason,"NATIVE_SETTLEMENT_UNCONFIRMED")
            self.assertTrue((config.source_root/"fixture-data/Documents/recreate.request").is_file())
            receipt=json.loads((config.evidence_directory/"recreation-write.json").read_text())
            self.assertEqual(receipt["writeCount"],1)
            self.assertEqual(receipt["inputCalls"],0)
            command_files=sorted(config.evidence_directory.glob("command-*.json"))
            commands=json.loads((config.evidence_directory/"ownership.json").read_text())["commands"]
            self.assertEqual(len(command_files),len(commands))
            self.assertEqual(len({json.loads(path.read_text())["index"] for path in command_files}),len(commands))

    def test_duplicate_recreation_does_not_overwrite_or_dispatch_input(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=Tools(clock,config)
            def mutate(rows):
                first={**rows[1],"operation":"fixture-recreation","details":{"request":"recreate"}}
                second={**first,"sequence":2,"elapsedMs":2}
                return [rows[0],first,second,{**rows[2],"sequence":3,"elapsedMs":3}]
            tools.mutate=mutate
            result=run_study("reference-study",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.reason,"FIXTURE_RECREATION_DUPLICATE")
            self.assertEqual((config.source_root/"fixture-data/Documents/recreate.request").read_bytes(),
                             b"owned no-input recreation\n")
            receipt=json.loads((config.evidence_directory/"recreation-write.json").read_text())
            self.assertEqual(receipt["writeCount"],1)

    def test_early_class_marker_is_not_normal_completion(self):
        class EarlyCompletion(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                if argv[0]=="xcodebuild":
                    output=child.chunks[0][1]
                    output=output.replace(b"JEV_NATIVE_OWNER_CLASS_COMPLETED\n",b"")
                    child.chunks[0]=("stdout",b"JEV_NATIVE_OWNER_CLASS_COMPLETED\n"+output)
                return child
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=EarlyCompletion(clock,config)
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual(result.status,"retained")
            self.assertEqual(result.reason,"CLASS_COMPLETION_ORDER")


class Processes(unittest.TestCase):
    def test_bad_numeric_flags_preserve_delayed_exit_without_cleanup(self):
        class DelayedExit(Child):
            def poll(self):
                self.stop_seen = (config.evidence_directory/"stop-admission").exists()
                return 0 if clock.now() >= 0.03 else None
            def has_live_owned_group(self): return self.poll() is None
            @property
            def streams_closed(self): return not self.chunks and self.poll() is not None
        class DelayedTools(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                if argv[0]=="xcodebuild":
                    self.child=DelayedExit(child.chunks[0][1])
                    return self.child
                return child
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=DelayedTools(clock,config)
            def numeric_flags(rows):
                rows[-1]["details"]["localMethodsReturned"]=1
                rows[-1]["details"]["localReferencesReleased"]=1
                return rows
            tools.mutate=numeric_flags
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertGreaterEqual(clock.now(),0.03)
            self.assertEqual((result.status,result.reason),("retained","RECORD_SCHEMA"))
            self.assertTrue(tools.child.stop_seen)
            self.assertEqual([row["sequence"] for row in result.records],[0,1])
            entry=json.loads((config.evidence_directory/"ownership.json").read_text())["commands"][-1]
            self.assertEqual(entry["parentReturncode"],0)
            self.assertEqual(entry["returncode"],0)
            self.assertEqual(entry["state"],"exited")
            self.assertEqual(entry["streamRefusal"],"RECORD_SCHEMA")
            self.assertEqual(entry["processObservation"],{
                "outcome":"completed","reason":"PROCESS_COMPLETED",
                "ownedGroupAbsent":True,"streamsClosed":True})
            receipt=json.loads((config.evidence_directory/f"command-{entry['index']:03d}.json").read_text())
            self.assertEqual(receipt["parentReturncode"],0)
            self.assertIn('"localMethodsReturned": 1',receipt["stdout"])
            self.assertFalse(any("uninstall" in argv for argv in tools.commands))
            self.assertEqual(sum(argv[0]=="xcodebuild" for argv in tools.commands),1)

    def test_record_refusal_survives_descendant_deadline_with_parent_exit_receipt(self):
        class Descendant(Child):
            def poll(self): return 65 if clock.now() >= 0.01 else None
            def has_live_owned_group(self): return True
            @property
            def streams_closed(self): return False
        class DescendantTools(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                return Descendant(child.chunks[0][1]) if argv[0]=="xcodebuild" else child
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root,0.05); clock=Clock(); tools=DescendantTools(clock,config)
            tools.mutate=lambda rows:[rows[0],{**rows[1],"unknown":True},rows[2]]
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual((result.status,result.reason),("retained","RECORD_SCHEMA"))
            self.assertAlmostEqual(clock.now(),0.05)
            entry=json.loads((config.evidence_directory/"ownership.json").read_text())["commands"][-1]
            self.assertEqual(entry["state"],"retained")
            self.assertEqual(entry["parentReturncode"],65)
            self.assertNotIn("returncode",entry)
            self.assertEqual(entry["processObservation"],{
                "outcome":"pending","reason":"ADMISSION_EXPIRED",
                "ownedGroupAbsent":False,"streamsClosed":None})
            receipt_path=config.evidence_directory/f"command-{entry['index']:03d}.json"
            self.assertTrue(receipt_path.exists(),"Observed parent exit must survive incomplete group supervision")
            receipt=json.loads(receipt_path.read_text())
            self.assertEqual(receipt["parentReturncode"],65)
            self.assertEqual(receipt["processObservation"]["reason"],"ADMISSION_EXPIRED")
            self.assertTrue(any(row.get("pid")==23456 for row in result.retained_resources))
            self.assertFalse(any("uninstall" in argv for argv in tools.commands))

    def test_record_refusal_keeps_its_reason_when_process_inspection_is_uncertain(self):
        class Uncertain(Child):
            def poll(self): return False if mode=="boolean-exit" else 0
            def has_live_owned_group(self):
                if mode=="group-error": raise OSError("inspection failed")
                return None if mode=="group-unknown" else False
            @property
            def streams_closed(self):
                if mode=="stream-error": raise OSError("stream inspection failed")
                return None if mode=="stream-unknown" else True
        class UncertainTools(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                return Uncertain(child.chunks[0][1]) if argv[0]=="xcodebuild" else child
        for mode in ("group-error","group-unknown","stream-error","stream-unknown","boolean-exit"):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as root:
                config=configuration(root); clock=Clock(); tools=UncertainTools(clock,config)
                tools.mutate=lambda rows:[rows[0],{**rows[1],"unknown":True},rows[2]]
                result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual((result.status,result.reason),("retained","RECORD_SCHEMA"))
                entry=json.loads((config.evidence_directory/"ownership.json").read_text())["commands"][-1]
                self.assertEqual(entry["state"],"retained")
                self.assertNotIn("returncode",entry)
                if mode!="boolean-exit": self.assertEqual(entry["parentReturncode"],0)
                self.assertEqual(entry["processObservation"]["outcome"],"pending")
                expected="LOCAL_STATE_UNCONFIRMED" if mode.endswith("error") else "PROCESS_ADAPTER_INVALID"
                self.assertEqual(entry["processObservation"]["reason"],expected)
                receipt=config.evidence_directory/f"command-{entry['index']:03d}.json"
                self.assertTrue(receipt.exists())
                self.assertFalse(any("uninstall" in argv for argv in tools.commands))

    def test_rejected_record_and_nonzero_exit_are_separate_facts(self):
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=Tools(clock,config)
            tools.test_code=65
            tools.mutate=lambda rows:[rows[0],{**rows[1],"unknown":True},rows[2]]
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual((result.status,result.reason),("retained","RECORD_SCHEMA"))
            entry=json.loads((config.evidence_directory/"ownership.json").read_text())["commands"][-1]
            self.assertEqual((entry["parentReturncode"],entry["returncode"]),(65,65))
            self.assertEqual(entry["processObservation"]["outcome"],"completed")
            self.assertFalse(any("uninstall" in argv for argv in tools.commands))

    def test_non_stream_inspection_error_preserves_its_established_reason(self):
        class GroupError(Child):
            def has_live_owned_group(self): raise OSError("inspection failed")
        class InventoryTools(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                return GroupError(child.chunks[0][1])
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root); clock=Clock(); tools=InventoryTools(clock,config)
            result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
            self.assertEqual((result.status,result.reason),("retained","LOCAL_STATE_UNCONFIRMED"))
            receipt=json.loads((config.evidence_directory/"command-001.json").read_text())
            self.assertEqual(receipt["parentReturncode"],0)
            self.assertEqual(receipt["processObservation"]["reason"],"LOCAL_STATE_UNCONFIRMED")
            self.assertNotIn("streamRefusal",receipt)
            self.assertEqual(len(tools.commands),1)

    def test_rejection_stops_later_recreation_in_the_same_or_subsequent_chunk(self):
        class Chunks(Child):
            def read_available(self):
                if not self.chunks: return []
                result,self.chunks=self.chunks[:1],self.chunks[1:]
                return result
            def poll(self):
                if self.read_started:
                    self.stop_seen=(config.evidence_directory/"stop-admission").exists()
                return 0 if not self.chunks else None
            def has_live_owned_group(self): return bool(self.chunks)
        class ChunkTools(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                if argv[0]=="xcodebuild":
                    rows=records(self.environment["JEV_NATIVE_OWNER_REQUEST_ID"],"reference-study")
                    first=[rows[0],{**rows[1],"unknown":True}]
                    if failure=="callback":
                        first[-1]={**rows[1],"operation":"fixture-recreation","details":{"request":"recreate"}}
                    later={**rows[1],"sequence":2,"elapsedMs":2,"operation":"fixture-recreation","details":{"request":"recreate"}}
                    head=("\n".join(PREFIX+json.dumps(row) for row in first)+"\n").encode()
                    tail=(PREFIX+json.dumps(later)+"\n").encode()
                    self.child=Chunks()
                    self.child.chunks=[("stdout",head+tail)] if same_chunk else [("stdout",head),("stdout",tail)]
                    self.child.read_started=True
                    return self.child
                if argv[2:3]==["get_app_container"] and argv[-1]=="data":
                    self.container_reads+=1
                    if failure=="callback" and self.container_reads==2:
                        return Child((str(config.source_root/"foreign-container")+"\n").encode())
                return child
        for failure,same_chunk in (("validation",True),("validation",False),("callback",False)):
            with self.subTest(failure=failure,same_chunk=same_chunk),tempfile.TemporaryDirectory() as root:
                config=configuration(root); clock=Clock(); tools=ChunkTools(clock,config); tools.container_reads=0
                result=run_study("reference-study",config,Dependencies(tools,clock.now,clock.sleep))
                expected="RECORD_SCHEMA" if failure=="validation" else "FIXTURE_CONTAINER_CHANGED"
                self.assertEqual((result.status,result.reason),("retained",expected))
                self.assertTrue(tools.child.stop_seen)
                self.assertEqual(tools.container_reads,1 if failure=="validation" else 2)
                self.assertFalse((config.source_root/"fixture-data/Documents/recreate.request").exists())
                self.assertNotIn(2,[row["sequence"] for row in result.records])
                native_entry=next(row for row in json.loads((config.evidence_directory/"ownership.json").read_text())["commands"] if row["argv"][0]=="xcodebuild")
                self.assertEqual(native_entry["streamRefusal"],expected)
                self.assertEqual(native_entry["returncode"],0)

    def test_refusal_retains_first_reason_on_later_output_or_adapter_failure(self):
        class BrokenOutput(Child):
            def read_available(self):
                self.reads+=1
                if self.reads==1: return super().read_available()
                if mode=="adapter-exception": raise RuntimeError("Adapter unavailable")
                if mode=="limit": return [("stdout",b"x"*8388608)]
                if mode=="invalid-channel": return [("foreign",b"x")]
                if mode=="invalid-type": return [("stdout","x")]
                return [("stdout",b"\xff")]
            def poll(self): return 0 if self.reads==2 else None
            def has_live_owned_group(self): return self.reads!=2
            @property
            def streams_closed(self): return self.reads==2
        class BrokenTools(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                if argv[0]=="xcodebuild":
                    self.child=BrokenOutput(child.chunks[0][1]); self.child.reads=0
                    return self.child
                return child
        for mode,reason in (("adapter-exception","PROCESS_ADAPTER_UNCONFIRMED"),
                            ("limit","PROCESS_OUTPUT_LIMIT"),("invalid-channel","PROCESS_ADAPTER_INVALID"),
                            ("invalid-type","PROCESS_ADAPTER_INVALID"),("invalid-utf8","PROCESS_OUTPUT_ENCODING")):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as root:
                config=configuration(root); clock=Clock(); tools=BrokenTools(clock,config)
                tools.mutate=lambda rows:[rows[0],{**rows[1],"unknown":True},rows[2]]
                result=run_study("metadata",config,Dependencies(tools,clock.now,clock.sleep))
                self.assertEqual((result.status,result.reason),("retained","RECORD_SCHEMA"))
                entry=json.loads((config.evidence_directory/"ownership.json").read_text())["commands"][-1]
                self.assertEqual(entry["state"],"retained")
                self.assertEqual(entry["processObservation"]["reason"],reason)
                receipt=json.loads((config.evidence_directory/f"command-{entry['index']:03d}.json").read_text())
                if mode=="invalid-utf8": self.assertEqual(receipt["outputEncoding"],"unconfirmed")
                else: self.assertLessEqual(len(receipt["stdout"].encode()),8388608)
                self.assertEqual([row["sequence"] for row in result.records],[0])

    def test_real_bad_record_child_exits_naturally_and_has_an_independent_receipt(self):
        real=ProcessTools()
        class RealBadTools(Tools):
            def start(self,argv,env,cwd):
                child=super().start(argv,env,cwd)
                if argv[0]!="xcodebuild": return child
                rows=records(self.environment["JEV_NATIVE_OWNER_REQUEST_ID"])
                rows[-1]["details"]["localMethodsReturned"]=1
                output="\n".join(PREFIX+json.dumps(row) for row in rows)+"\nJEV_NATIVE_OWNER_CLASS_COMPLETED"
                script="import sys,time; print("+repr(output)+",flush=True); time.sleep(0.08); sys.exit(65)"
                self.child=real.start([sys.executable,"-c",script],env,cwd)
                return self.child
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root,2); tools=RealBadTools(Clock(),config)
            result=run_study("metadata",config,Dependencies(tools))
            try:
                self.assertEqual((result.status,result.reason),("retained","RECORD_SCHEMA"))
                self.assertEqual(tools.child.poll(),65)
                entry=json.loads((config.evidence_directory/"ownership.json").read_text())["commands"][-1]
                self.assertEqual((entry["parentReturncode"],entry["returncode"]),(65,65))
                self.assertEqual(entry["processObservation"]["outcome"],"completed")
                self.assertTrue((config.evidence_directory/f"command-{entry['index']:03d}.json").exists())
                self.assertEqual(sum(argv[0]=="xcodebuild" for argv in tools.commands),1)
                self.assertFalse(any("uninstall" in argv for argv in tools.commands))
                self.assertTrue((config.evidence_directory/"stop-admission").exists())
            finally:
                tools.child.process.wait(timeout=2)  # Natural exit, including the old-implementation red replay.
                for handle in tools.child.files.values(): handle.close()

    def test_real_child_timeout_leaves_it_owned_alive_and_unreplayed(self):
        real=ProcessTools()
        class RealChildTools(Tools):
            def start(self,argv,env,cwd):
                if argv[0]!="xcodebuild": return super().start(argv,env,cwd)
                self.commands.append(argv); self.installed.add(RUNNER)
                test_plan=plistlib.loads(Path(argv[argv.index("-xctestrun")+1]).read_bytes())
                request=test_plan["NativeOwnerStudy"]["EnvironmentVariables"]["JEV_NATIVE_OWNER_REQUEST_ID"]
                row=records(request)[0]
                script="import time; print("+repr(PREFIX+json.dumps(row))+",flush=True); time.sleep(0.6)"
                self.child=real.start([sys.executable,"-c",script],env,cwd)
                return self.child
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root,0.25); tools=RealChildTools(Clock(),config)
            started=time.monotonic()
            result=run_study("metadata",config,Dependencies(tools))
            self.assertEqual(result.reason,"ADMISSION_EXPIRED")
            self.assertEqual(result.status,"retained")
            self.assertLess(time.monotonic()-started,0.55)
            self.assertIsNone(tools.child.poll())
            self.assertTrue((config.evidence_directory/"stop-admission").exists())
            self.assertEqual(sum(argv[0]=="xcodebuild" for argv in tools.commands),1)
            owned=[entry for entry in result.retained_resources if entry.get("pid")==tools.child.pid]
            self.assertTrue(owned)
            self.assertEqual(tools.child.process.wait(timeout=2),0)  # Natural exit; no signal.
            for handle in tools.child.files.values(): handle.close()

    def test_real_parent_exit_leaves_live_owned_grandchild_and_pipe(self):
        real=ProcessTools()
        class GrandchildTools(Tools):
            def start(self,argv,env,cwd):
                if argv[0]!="xcodebuild": return super().start(argv,env,cwd)
                self.commands.append(argv); self.installed.add(RUNNER)
                test_plan=plistlib.loads(Path(argv[argv.index("-xctestrun")+1]).read_bytes())
                request=test_plan["NativeOwnerStudy"]["EnvironmentVariables"]["JEV_NATIVE_OWNER_REQUEST_ID"]
                lines=[PREFIX+json.dumps(row) for row in records(request)]
                script=("import subprocess,sys; subprocess.Popen([sys.executable,'-c','import time; time.sleep(0.6)']); "
                        "print("+repr("\n".join(lines)+"\nJEV_NATIVE_OWNER_CLASS_COMPLETED")+",flush=True)")
                self.child=real.start([sys.executable,"-c",script],env,cwd)
                return self.child
        with tempfile.TemporaryDirectory() as root:
            config=configuration(root,0.25); tools=GrandchildTools(Clock(),config)
            result=run_study("metadata",config,Dependencies(tools))
            self.assertEqual(result.reason,"ADMISSION_EXPIRED")
            self.assertEqual(tools.child.poll(),0)
            self.assertTrue(tools.child.has_live_owned_group())
            self.assertFalse(any("uninstall" in argv for argv in tools.commands))
            time.sleep(0.65)  # Harmless descendant exits naturally.
            for handle in tools.child.files.values(): handle.close()

if __name__ == "__main__":
    unittest.main()
