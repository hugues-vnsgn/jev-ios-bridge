import { join, resolve } from 'node:path';
import { constants } from 'node:fs';
export const deviceRoot='/Library/Developer/CoreSimulator/Profiles/DeviceTypes';
export const defaultRuntime='/Library/Developer/CoreSimulator/Profiles/Runtimes';
export const volumeRoot='/Library/Developer/CoreSimulator/Volumes';
export const cryptexRoot='/private/var/run/com.apple.security.cryptexd/mnt';
export const runtimeSuffix='/Library/Developer/CoreSimulator/Profiles/Runtimes';
export const developerDirectory='/Applications/Xcode.app/Contents/Developer';
export const fixedPlists=['/Applications/Xcode.app/Contents/Info.plist','/Applications/Xcode.app/Contents/version.plist','/System/Library/CoreServices/SystemVersion.plist'];
export const legacyGrammar=/^iOS_[0-9]{1,3}[A-Z]{1,3}[0-9]{1,6}[a-z]?$/;
export const cryptexGrammar=/^com\.apple\.iPhoneOS\.SimulatorRuntime-v[0-9]{1,3}(?:\.[0-9]{1,5}){2,3}\.[A-Za-z0-9]{1,64}$/;
export const canonical=p=>typeof p==='string'&&p.startsWith('/')&&resolve(p)===p&&!p.includes('\0')&&p.length<=4096&&p.split('/').every(n=>n.length<=255);
export const nameOK=n=>typeof n==='string'&&/^[^/\0]{1,255}$/.test(n);
export const statArgsOK=args=>args.length===0||(args.length===1&&args[0]!==null&&typeof args[0]==='object'&&Object.keys(args[0]).join(',')==='bigint'&&args[0].bigint===true);
export const readOK=(buffer,offset,length,position)=>Buffer.isBuffer(buffer)&&buffer.length<=65537&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>0&&length<=65537&&offset+length<=buffer.length&&position===null;
export const readonlyFlags=constants.O_RDONLY|constants.O_NOFOLLOW;
export const environmentFor=homedir=>({HOME:homedir,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:developerDirectory});
export class ProbeGuardError extends Error { constructor(operation,path,detail){super('Probe guard mismatch: '+operation+' '+String(path));this.operation=operation;this.path=path;this.detail=detail;} }
export function createGuard(onFailure=()=>{}){
 const stats=new Set(['/']),plists=new Set(fixedPlists),dirs=new Map([[deviceRoot,'devices'],[defaultRuntime,'runtimes'],[volumeRoot,'legacy-namespace'],[cryptexRoot,'cryptex-namespace']]);
 const mounts=new Map(),devices=new Set(),runtimes=new Set(),candidates={legacy:new Set(),cryptex:new Set()};
 function require(ok,operation,path,detail){if(!ok){const error=new ProbeGuardError(operation,path,detail);onFailure(error);throw error;}}
 function addPath(p){require(canonical(p),'planned-path',p);let current='/';for(const part of p.split('/').filter(Boolean)){current=join(current,part);stats.add(current);}}
 function addPlist(p){addPath(p);plists.add(p);}
 for(const p of [...fixedPlists,...dirs.keys(),developerDirectory,'/Applications/Xcode.app/Contents/MacOS/Xcode',developerDirectory+'/usr/bin/simctl','/usr/bin/xcrun','/usr/bin/plutil','/usr/sbin/diskutil',developerDirectory+'/Platforms/iPhoneSimulator.platform'])addPath(p);
 function observeListing(p,values){
  require(dirs.has(p)&&Array.isArray(values)&&values.length<=1000,'listing-budget',p,{entries:values?.length});
  const kind=dirs.get(p);
  if(kind==='devices'||kind==='runtimes'){
   const suffix=kind==='devices'?'.simdevicetype':'.simruntime';
   for(const name of values.filter(n=>nameOK(n)&&n.endsWith(suffix))){
    const bundle=join(p,name),inventory=kind==='devices'?devices:runtimes;inventory.add(bundle);
    require(inventory.size<=1000,kind==='devices'?'device-budget':'aggregate-runtime-budget',p,{count:inventory.size});
    addPlist(bundle+'/Contents/Info.plist');addPlist(bundle+'/Contents/Resources/profile.plist');
    if(kind==='runtimes')addPlist(bundle+'/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist');
   }
  }else{
   const legacy=kind==='legacy-namespace',grammar=legacy?legacyGrammar:cryptexGrammar,label=legacy?'legacy':'cryptex';
   for(const name of values){
    // Return invalid names unchanged; the pinned production enumeration refuses them.
    if(legacy?!/^[A-Za-z0-9_-]{1,255}$/.test(name):!nameOK(name))continue;
    if(!legacy&&!grammar.test(name))continue;
    const mount=join(p,name),root=mount+runtimeSuffix;addPath(root);dirs.set(root,'runtimes');
    if(grammar.test(name)){candidates[label].add(mount);require(candidates[label].size<=64,label+'-mount-budget',p,{count:candidates[label].size});mounts.set(mount,label);}
   }
  }
  return values;
 }
 const commandKind=(executable,args)=>{
  if(executable==='/usr/bin/plutil'&&Array.isArray(args)&&args.length===6&&args.slice(0,5).join('\0')==='-convert\0json\0-o\0-\0--'&&canonical(args[5])&&plists.has(args[5]))return 'plutil';
  if(executable==='/usr/sbin/diskutil'&&Array.isArray(args)&&args.length===3&&args[0]==='info'&&args[1]==='-plist'&&canonical(args[2])&&mounts.has(args[2]))return 'diskutil';
 };
 function launchOK(executable,args,options,homedir){
  const kind=commandKind(executable,args),env=environmentFor(homedir);
  return Boolean(kind)&&options?.shell===false&&Object.keys(options).sort().join(',')==='env,shell,stdio'
   &&JSON.stringify(options.stdio)===JSON.stringify(['ignore','pipe','pipe'])
   &&options.env&&Object.keys(options.env).sort().join(',')===Object.keys(env).sort().join(',')
   &&Object.entries(env).every(([k,v])=>options.env[k]===v);
 }
 return {require,observeListing,commandKind,launchOK,statAllowed:p=>canonical(p)&&stats.has(p),directoryAllowed:p=>canonical(p)&&dirs.has(p),
  openAllowed:(p,flags,args)=>canonical(p)&&plists.has(p)&&flags===readonlyFlags&&args.length===0,
  outputCap:(executable,args)=>executable==='/usr/bin/plutil'&&args[5]===fixedPlists[0]?131072:65536,
  inventory:()=>({deviceBundles:devices.size,runtimeBundles:runtimes.size,legacyMounts:candidates.legacy.size,cryptexMounts:candidates.cryptex.size,
   approvedMounts:[...mounts].map(([path,kind])=>({path,kind})),directories:[...dirs].map(([path,kind])=>({path,kind})),plistPaths:[...plists]})};
}
export function statSurface(path,s){
 const fields={};const unsafeIntegerFields=[];
 for(const k of ['dev','ino','uid','gid','mode','size','nlink','rdev','blocks','blksize','atimeMs','mtimeMs','ctimeMs','birthtimeMs','atimeNs','mtimeNs','ctimeNs','birthtimeNs']){
  const v=s[k];if(v===undefined)continue;
  fields[k]=typeof v==='bigint'?{representation:'bigint',decimal:v.toString()}:{representation:typeof v,value:v};
  if(['dev','ino','uid','gid','mode','size','nlink','rdev','blocks','blksize'].includes(k)&&typeof v==='number'&&!Number.isSafeInteger(v))unsafeIntegerFields.push(k);
 }
 return {path,type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other',fields,unsafeIntegerFields};
}
export function losslessIdentity(path,s){
 const fields={};for(const k of ['dev','ino','uid','gid','mode','size','nlink','ctimeNs','mtimeNs']){
  if(typeof s[k]!=='bigint')throw new ProbeGuardError('lossless-identity',path,{field:k,representation:typeof s[k]});
  fields[k]=s[k].toString();
 }
 return {path,type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other',...fields};
}
export function sameLossless(a,b){return Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([k,v])=>b[k]===v);}
