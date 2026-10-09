from pathlib import Path
import hashlib,json,os,sys
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime');label,node,purpose=sys.argv[1:4];args=json.loads(sys.argv[4]);base=json.loads((r/'baseline.json').read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert all(sha(p)==h for p,h in base['protected440'].items())
exact='/opt/homebrew/Cellar/node/26.8.1/bin/node' if node=='26' else '/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'
source={p:sha(p) for p in base['source441']};source.update({p:sha(p) for p in base['ownedPaths'] if Path(p).exists()});assert len(source)==443
owned={p:sha(p) for p in base['ownedPaths']};name=label+'-node'+node;d=r/name;d.mkdir(mode=0o700)
env={'PATH':str(Path(exact).parent)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':'/Users/hugues_mini','LANG':'C','LC_ALL':'C','NPM_CONFIG_USERCONFIG':str((r/'npm-empty-userconfig').resolve()),'NPM_CONFIG_GLOBALCONFIG':str((r/'npm-empty-globalconfig').resolve()),'NPM_CONFIG_CACHE':str((r/'npm-cache').resolve())}
job={'argv':[exact,*args],'cwd':str(Path.cwd()),'evidenceDirectory':str(d),'env':env,'purpose':purpose,'evidenceUmask':'077','commandChildUmask':'022','candidateSource443':source,'protected440Match':True,'owned3':owned,'removedInheritedEnvironmentNames':sorted(set(os.environ)-set(env)),'credentialAndNodeOverridesScrubbed':True}
with (r/(name+'-job.json')).open('x') as f:f.write(json.dumps(job,indent=2)+'\n')
