import pathlib,sys,json,plistlib
base=pathlib.Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-sam-setup-preparation-2026-10-11')
if len(sys.argv)!=2 or sys.argv[1] not in ['sam-before.stdout.bin','sam-after.stdout.bin']:raise RuntimeError('Unapproved parser input')
raw=(base/sys.argv[1]).read_bytes()
if len(raw)>65536:raise RuntimeError('Plist output too large')
a=plistlib.loads(raw)
strings=['MountPoint','DeviceIdentifier','DeviceNode','ParentWholeDisk','DiskUUID','VolumeUUID','FilesystemType']
booleans=['Internal','Writable','WritableMedia','WritableVolume','GlobalPermissionsEnabled','SupportsGlobalPermissionsDisable']
if not isinstance(a,dict) or any(type(a.get(k)) is not str for k in strings) or any(type(a.get(k)) is not bool for k in booleans):raise RuntimeError('Missing or untyped volume fields')
print(json.dumps({k:a[k] for k in strings+booleans}))
