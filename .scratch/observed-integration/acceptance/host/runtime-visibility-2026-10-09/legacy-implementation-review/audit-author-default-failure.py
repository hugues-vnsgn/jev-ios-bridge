"""Audit retained defaults, preserving Node24 failure; no execution of tests."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
os.umask(0o077)
root = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
parent = Path(__file__).resolve().parent
preserved = parent.parent / 'legacy-candidate-evidence'
context = json.loads((parent / 'candidate-cli-context.json').read_text())
index = json.loads((preserved / 'failure-preservation-index.json').read_text())
paths = {f['authorRelativePath']: preserved / f['path'] for f in index['files']}
checks=[]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name, passed):
    checks.append({'name':name,'pass':bool(passed)})
    assert passed,name
failure = json.loads(paths['default-failure-index.json'].read_text())
check('frozen candidate', failure['candidateCommit'] == context['candidate'])
check('all Source/protected/compiled vectors match freeze', failure['source443'] == context['source443'] and failure['protected440'] == context['protected440'] and failure['compiled69'] == context['compiled69'])
records={}
last=None
for runtime, exitCode, expected in [('26',0,{'tests':2198,'pass':2198,'fail':0,'cancelled':0,'skipped':0,'todo':0}),('24',1,{'tests':2198,'pass':2195,'fail':2,'cancelled':1,'skipped':0,'todo':0})]:
    prefix='actual-default-node'+runtime+'/'
    commandPath, resultPath = paths[prefix+'command.json'], paths[prefix+'result.json']
    command=json.loads(commandPath.read_text());result=json.loads(resultPath.read_text())
    stdoutPath,stderrPath=paths[prefix+'stdout.txt'],paths[prefix+'stderr.txt']
    check(runtime+' command/result/raw hashes',sha(commandPath)==result['receiptSha256'] and sha(stdoutPath)==command['stdoutSha256']==result['stdoutSha256'] and sha(stderrPath)==command['stderrSha256']==result['stderrSha256'])
    executable='/opt/homebrew/Cellar/node/26.8.1/bin/node' if runtime=='26' else '/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'
    check(runtime+' unmodified official default argv',command['argv']==[executable,'/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'])
    check(runtime+' actual closed exit preserved',command['exitCode']==result['exitCode']==exitCode and result['actualCloseRecorded'])
    check(runtime+' Source freeze before/after',command['candidateSource443']==result['source443']==context['source443'] and result['source443Unchanged'] and command['protected440Match'] and result['protected440Match'])
    check(runtime+' inherited environment scrub',all(k not in command['env'] for k in ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS']))
    check(runtime+' serial after previous actual close',last is None or last<=command['startedAtUtc'])
    last=command['completedAtUtc']
    raw=stdoutPath.read_text();counts={}
    for key in expected:
        values=re.findall(r'(?m)^(?:# |ℹ )'+key+r' (\d+)\s*$',raw)
        assert values,key
        counts[key]=int(values[-1])
    check(runtime+' raw count agreement',counts==expected and all(result['counts'].get(k)==v for k,v in counts.items()))
    check(runtime+' prior compiled remains freeze',result['compiled69']==context['compiled69'])
    buildReached='\n> rm -rf dist && tsc -p tsconfig.build.json\n' in raw
    check(runtime+' build reach truth',buildReached==(runtime=='26') and failure['actualDefaults'][runtime]['defaultBuildReached']==buildReached)
    check(runtime+' original host traces absent qualification','HOST_EVIDENCE_DIR' not in command['env'])
    records[runtime]={'receipt':str(commandPath.relative_to(root)),'receiptSha256':sha(commandPath),'rawStdoutSha256':sha(stdoutPath),'rawStderrSha256':sha(stderrPath),'counts':counts,'exit':exitCode,'buildReached':buildReached,'originalPublicFaultTraces':'not retained; HOST_EVIDENCE_DIR absent; no reconstruction','close':last}
raw24=paths['actual-default-node24/stdout.txt'].read_text()
for text in ['test timed out after 1000ms','0 !== 1','Fixture setup: milestone backend:snapshot-ui:1 not reached']:
    check('confirmed error '+text,text in raw24)
check('failure result truth',failure['node24DefaultBuildNotReached'] and failure['noDefaultRetryOrSignal'] and failure['causeBeyondTheseErrors']=='not inferred; Root diagnosis pending')
record={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'PASS provenance; Node24 default FAIL','candidate':context['candidate'],'records':records,'checks':checks,'sourceUnchanged':True,'lowerCause':'unresolved; fresh diagnostic traces cannot reconstruct prior missing public traces','scope':'Read-only rehash of retained official commands/raw results. Both-node implementation acceptance is blocked on the failed Node24 default. No native or live acceptance inferred.'}
out=parent/'root-author-default-failure-audit.json'
assert not out.exists()
out.write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'status':record['status'],'checks':len(checks),'sha256':sha(out)}))
