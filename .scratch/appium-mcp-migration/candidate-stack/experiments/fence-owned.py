from pathlib import Path
import sys,json,subprocess,urllib.request,os,time
root=Path(__file__).resolve().parent.parent
record=json.loads((root/'evidence/dedicated-device-preparation.json').read_text())
platform=sys.argv[1];output=Path(sys.argv[2]);assert platform in ['ios','android']
receipt={'kind':'manual-feasibility-native-stop','platform':platform,'gatePassed':False,'leaseReleased':False}
def cmd(args):
 p=subprocess.run(args,capture_output=True,text=True,timeout=40);return {'args':args,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
def status(port):
 try:
  with urllib.request.urlopen(f'http://127.0.0.1:{port}/status',timeout=2) as response:return {'reachable':True,'httpStatus':response.status}
 except Exception as error:return {'reachable':False,'errorType':type(error).__name__}
if platform=='ios':
 device=record['ios'];args=['xcrun','simctl','--set',device['set']];receipt['device']=device['udid']
 assert device['udid']!='FA791D0E-4E55-42EA-ABDB-663D6D85AD5D'
 receipt['beforeLaunchctl']=cmd(args+['spawn',device['udid'],'launchctl','list'])
 receipt['beforeEndpoint']=status(18100)
 receipt['terminate']=cmd(args+['terminate',device['udid'],'com.facebook.WebDriverAgentRunner.xctrunner'])
 receipt['afterLaunchctl']=cmd(args+['spawn',device['udid'],'launchctl','list'])
 receipt['afterEndpoint']=status(18100)
 assert receipt['afterLaunchctl']['exitCode']==0
 assert not receipt['afterEndpoint']['reachable']
 assert not any('WebDriverAgentRunner' in row and row.split()[0]!='-' for row in receipt['afterLaunchctl']['stdout'].splitlines())
else:
 serial=record['android']['serial'];args=['adb','-s',serial];receipt['device']=serial
 name=cmd(args+['emu','avd','name']);assert record['android']['name'] in name['stdout'];receipt['avdIdentity']=name
 receipt['beforeProcesses']=cmd(args+['shell','ps','-A'])
 receipt['forceStops']=[cmd(args+['shell','am','force-stop',pkg]) for pkg in ['io.appium.uiautomator2.server','io.appium.uiautomator2.server.test','io.appium.settings']]
 receipt['disableOwnedPackages']=[cmd(args+['shell','pm','disable-user','--user','0',pkg]) for pkg in ['io.appium.uiautomator2.server','io.appium.uiautomator2.server.test','io.appium.settings']]
 assert all(x['exitCode']==0 and 'disabled-user' in x['stdout'] for x in receipt['disableOwnedPackages'])
 time.sleep(5)
 receipt['disabledPackages']=cmd(args+['shell','pm','list','packages','-d'])
 assert all('package:'+pkg+'\n' in receipt['disabledPackages']['stdout'] for pkg in ['io.appium.uiautomator2.server','io.appium.uiautomator2.server.test','io.appium.settings'])
 receipt['afterProcesses']=cmd(args+['shell','ps','-A'])
 receipt['activityProcesses']=cmd(args+['shell','dumpsys','activity','processes'])
 assert receipt['activityProcesses']['exitCode']==0
 assert receipt['activityProcesses']['stdout'].startswith('ACTIVITY MANAGER RUNNING PROCESSES (dumpsys activity processes)')
 receipt['forwardInventory']=cmd(['adb','forward','--list'])
 assert all(x['exitCode']==0 for x in receipt['forceStops'])
 assert receipt['afterProcesses']['exitCode']==0
 assert not any(pkg in receipt['afterProcesses']['stdout'] for pkg in ['io.appium.uiautomator2.server','io.appium.settings'])
 receipt['instrumentationState']='not separately validated; package process and forward observations only'
 inventory=cmd(['adb','forward','--list'])
 receipt['ownedForwardInventoryBeforeRemoval']=inventory
 mapping=[row.split() for row in inventory['stdout'].splitlines() if row.strip()]
 receipt['removeOwnedForwards']=[]
 for local,remote in [('tcp:18200','tcp:6790'),('tcp:18201','tcp:7810')]:
  match=[row for row in mapping if len(row)==3 and row[1]==local]
  assert all(row==[serial,local,remote] for row in match), 'Unexpected port owner; refuse cleanup'
  if match:
   removed=cmd(args+['forward','--remove',local]);receipt['removeOwnedForwards'].append(removed);assert removed['exitCode']==0
 receipt['ownedForwardInventoryAfterRemoval']=cmd(['adb','forward','--list'])
 assert not any(len(row.split())==3 and row.split()[1] in ['tcp:18200','tcp:18201'] for row in receipt['ownedForwardInventoryAfterRemoval']['stdout'].splitlines())
 receipt['afterEndpoint']=status(18200);assert not receipt['afterEndpoint']['reachable']
 import socket
 with socket.socket() as sock:
  sock.settimeout(2);receipt['ownedPortConnectResult']=sock.connect_ex(('127.0.0.1',18200))
 assert receipt['ownedPortConnectResult']!=0, 'Owned host port still accepts connections'
 with socket.socket() as sock:
  sock.settimeout(2);receipt['ownedMjpegPortConnectResult']=sock.connect_ex(('127.0.0.1',18201))
 assert receipt['ownedMjpegPortConnectResult']!=0
receipt['observedOwnedComponentsStopped']=True
with output.open('w') as file:json.dump(receipt,file,indent=2);file.write('\n');file.flush();os.fsync(file.fileno())
print(platform,'owned components stopped')
