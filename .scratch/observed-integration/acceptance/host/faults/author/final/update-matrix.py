import pathlib,json,re,hashlib,os,copy
os.umask(0o077);root=pathlib.Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/observed-host-faults');e=pathlib.Path('/tmp/jev-observed-ticket09-evidence');p=root/'tests/fixtures/observed-host/case-matrix.json';m=json.loads(p.read_text());original=json.loads((e/'pre-audit-source/tests/fixtures/observed-host/case-matrix.json').read_text());originalIds={r['id'] for r in original['rows']};added=[]
def add(template,id,variant,transport=None,expected=None):
 r=copy.deepcopy(template);r.update(id=id,variant=variant,verdict='UNVERIFIED',evidence='Post-audit complete gates pending');
 if transport:r['transport']=transport
 if expected:r['expected']=expected
 added.append(r)
for tr in ['cli','mcp']:
 template=next(r for r in m['rows'] if r['id'].startswith('H01.01.'+tr+'.action.'))
 add(template,'H01.01.'+tr+'.action.after-absent-max-adjacent','action/after-absent-max-adjacent')
 template=next(r for r in m['rows'] if r['id'].startswith('H01.02.'+tr+'.'))
 for guard in ['before','after']:
  for n in [1,11,12]:add(template,f'H01.02.{tr}.{guard}.absent{n}',f'{guard}/absent{n}',expected='ALLOCATION_NOT_FOUND proves accepted absent guard length; zero backend calls/reservations')
 for name in ['below','at','above']:
  template=next(r for r in m['rows'] if r['id'].startswith('H04.03.'+tr+'.'))
  add(template,f'H04.03.{tr}.staging-{name}',f'staging/{name}',expected='Staging threshold = minFree2000 + held1000 + actual artifact bytes; below STORAGE_UNAVAILABLE/no reservation/effects; at/above ready with exact held bytes and single preparation command sequence')
 template=next(r for r in m['rows'] if r['id'].startswith('H04.04.'+tr+'.'))
 for stage in ['pre-create','pre-install']:
  for volume in ['simulator','staging']:add(template,f'H04.07.{tr}.{volume}.{stage}',f'{volume}/{stage}',expected='STORAGE_UNAVAILABLE/committed retained refused/null action binding; pre-create releases pure1000 hold and no device commands; pre-install retains1000 and exactly create/boot/list, no install or later calls')
for r in m['rows']:
 if r['id'].startswith('H03.01.cli.'):add(r,r['id'].replace('.cli.','.mcp.'),r['variant'],transport='mcp')
m['rows']+=added
assert len({r['id'] for r in m['rows']})==len(m['rows']);assert originalIds.issubset({r['id'] for r in m['rows']})
spans={}
for name in ['tests/observed-host-fault.test.ts','tests/observed-public-races.test.ts','tests/observed-crash.test.ts']:
 lines=(root/name).read_text().splitlines();starts=[(i,re.search(r'H\d\d\.\d\d',l).group()) for i,l in enumerate(lines) if 'test(' in l and re.search(r'H\d\d\.\d\d',l)]
 for k,(i,family) in enumerate(starts):
  end=starts[k+1][0] if k+1<len(starts) else len(lines);spans[family]=(name+':'+str(i+1),[name+':'+str(n+1) for n in range(i,end) if 'assert.' in lines[n]])
for row in m['rows']:
 family='.'.join(row['id'].split('.')[:2]);row['test'],row['assertionLocations']=spans[family];row['verdict']='UNVERIFIED';row['evidence']='Post-audit complete gates pending'
 if family=='H01.01':
  kind,variant=row['variant'].split('/');code='UNSUPPORTED_VERSION' if variant=='unsupported-version' or kind=='action' and variant=='missing-version' else 'INVALID_REQUEST';row['expected']=f'{code}; CLI3/MCPisError; no calls; global pristine database bytes and capacity0 establish no inserted/released reservations including changed IDs'
 if family=='H02.02' and row['transport']=='mcp':row['expected']='Actual MCP flag variant: exactly five retained observed tools, start/prepare absent; denied calls SDK -32602/Tool NAME not found, no result/store/backend effects; retained reads/cancel/retire available at flag0'
 if family=='H04.04':row['expected']='Exact ARTIFACT_INVALID (runtime HOST_PREREQUISITE_MISSING); pre-reservation no record/held bytes/effects; source mutation committed retained refused/pure hold released/device calls0; staged mutation committed retained refused/held1000/exactly create boot list; install/touch0, no retry'
 if family in ['H05.08','H05.10']:row['expected']='Actual delegated public wait settles WAIT_CANCELLED with aborted signal before owner barrier released; SDK suppresses cancelled reply; owner still alive, DB bytes/snapshot/cancel flag/backend calls unchanged'
 if family=='H03.01':row['transportRole']='Caller preparation/start/conflict='+row['transport']+'; final retained read additionally MCP; owner transport matches caller'
m['inventoryReconciliation']={'originalIds':362,'addedIds':len(added),'finalIds':len(m['rows']),'expectedExecutedTests':193,'originalExecutedTests':178,'addedExecutedTests':15,'originalInventorySha256':hashlib.sha256(json.dumps(sorted(originalIds)).encode()).hexdigest()}
m['completenessAudit']={'report':'/tmp/jev-ticket09-spec-completeness-esc18h5n/review.md','preAuditFreeze':'/tmp/jev-observed-ticket09-evidence/owned-runtime-final-freeze.json','preAuditAssociation':'/tmp/jev-observed-ticket09-evidence/pre-audit-association.json','closureFamilies':{'F1':['H04.04'],'F2':['H03.01'],'F3':['H05.08','H05.10'],'F4':['H02.02'],'F5':['H01.01','H01.02'],'F6':['H04.03','H04.07']},'classification':'Six proof gaps; no product defect; earlier178-test greens do not certify complete H coverage'}
p.write_text(json.dumps(m,indent=2)+'\n')
old=json.loads((e/'owned-runtime-final-freeze.json').read_text());old.update(inventoryRows=len(m['rows']),expectedTests=193);old['files']={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in old['files']};(e/'owned-post-audit-freeze.json').write_text(json.dumps(old,indent=2)+'\n')
protected=json.loads((e/'protected-advanced-freeze.json').read_text());assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h['working'] for p,h in protected['files'].items());(e/'protected-post-audit-freeze.json').write_text(json.dumps(protected,indent=2)+'\n')
print(json.dumps(m['inventoryReconciliation']))
