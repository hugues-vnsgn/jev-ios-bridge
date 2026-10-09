import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
if (process.cwd() !== repo) throw new Error('Unexpected probe cwd');
for (const key of ['TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS']) {
  if (Object.hasOwn(process.env, key)) throw new Error('Query environment was not scrubbed: ' + key);
}
const module = await import(pathToFileURL(join(repo, 'dist/observed/allocation-config.js')).href);
const { installedHost, allocationSourceProcess, verifyInstalledCompatibility } = module;
if (![installedHost, allocationSourceProcess, verifyInstalledCompatibility].every(f => typeof f === 'function')) throw new Error('Required compiled read-only seam is unavailable');
const nativeHost = installedHost();
const fsTrace = [], processTrace = [], children = [], metadata = new Map();
let sequence = 0;
const stamp = () => ({ sequence: ++sequence, atUtc: new Date().toISOString() });
const deviceRoot = '/Library/Developer/CoreSimulator/Profiles/DeviceTypes';
const runtimeRoot = '/Library/Developer/CoreSimulator/Profiles/Runtimes';
const volumeRoot = '/Library/Developer/CoreSimulator/Volumes';
const fixedPlists = ['/Applications/Xcode.app/Contents/Info.plist', '/Applications/Xcode.app/Contents/version.plist', '/System/Library/CoreServices/SystemVersion.plist'];
const fixedStat = [...fixedPlists, deviceRoot, runtimeRoot, volumeRoot,
  '/Applications/Xcode.app/Contents/MacOS/Xcode', '/Applications/Xcode.app/Contents/Developer/usr/bin/simctl', '/usr/bin/xcrun', '/usr/bin/plutil',
  '/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform'];
const deviceSuffix = new Set(['', '/Contents', '/Contents/Info.plist', '/Contents/Resources', '/Contents/Resources/profile.plist']);
const runtimeSuffix = new Set(['', '/Contents', '/Contents/Info.plist', '/Contents/Resources', '/Contents/Resources/profile.plist',
  '/Contents/Resources/RuntimeRoot', '/Contents/Resources/RuntimeRoot/System', '/Contents/Resources/RuntimeRoot/System/Library',
  '/Contents/Resources/RuntimeRoot/System/Library/CoreServices', '/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist']);
function canonical(p) { return typeof p === 'string' && p.startsWith('/') && resolve(p) === p && !p.includes('\0') && p.length <= 4096; }
function allowedPlist(p) {
  return canonical(p) && (fixedPlists.includes(p)
    || /^\/Library\/Developer\/CoreSimulator\/Profiles\/DeviceTypes\/[^/]+\.simdevicetype\/Contents\/(?:Info\.plist|Resources\/profile\.plist)$/.test(p)
    || /^\/Library\/Developer\/CoreSimulator\/(?:Profiles\/Runtimes|Volumes\/[A-Za-z0-9_-]{1,255}\/Library\/Developer\/CoreSimulator\/Profiles\/Runtimes)\/[^/]+\.simruntime\/Contents\/(?:Info\.plist|Resources\/profile\.plist|Resources\/RuntimeRoot\/System\/Library\/CoreServices\/SystemVersion\.plist)$/.test(p));
}
function runtimeRootsFor(p) {
  const m = p.match(/^\/Library\/Developer\/CoreSimulator\/Volumes\/([A-Za-z0-9_-]{1,255})(?:\/|$)/);
  return [runtimeRoot, ...(m ? [volumeRoot + '/' + m[1] + '/Library/Developer/CoreSimulator/Profiles/Runtimes'] : [])];
}
function allowedStat(p) {
  if (!canonical(p)) return false;
  if (p === '/' || fixedStat.some(target => target === p || target.startsWith(p + '/'))) return true;
  const d = p.match(/^\/Library\/Developer\/CoreSimulator\/Profiles\/DeviceTypes\/([^/]+\.simdevicetype)(.*)$/);
  if (d && deviceSuffix.has(d[2])) return true;
  for (const root of runtimeRootsFor(p)) {
    if (root === p || root.startsWith(p + '/')) return true;
    if (p.startsWith(root + '/')) {
      const m = p.slice(root.length + 1).match(/^([^/]+\.simruntime)(.*)$/);
      if (m && runtimeSuffix.has(m[2])) return true;
    }
  }
  return false;
}
function allowedDirectory(p) {
  return canonical(p) && ([deviceRoot, runtimeRoot, volumeRoot].includes(p)
    || /^\/Library\/Developer\/CoreSimulator\/Volumes\/[A-Za-z0-9_-]{1,255}\/Library\/Developer\/CoreSimulator\/Profiles\/Runtimes$/.test(p));
}
function guard(ok, operation, p) { if (!ok) throw new Error('Probe guard rejected ' + operation + ': ' + p); }
function stats(s) {
  return { type: s.isSymbolicLink() ? 'symlink' : s.isDirectory() ? 'directory' : s.isFile() ? 'file' : 'other', uid:s.uid, gid:s.gid,
    mode:(s.mode & 0o7777).toString(8).padStart(4,'0'), nlink:s.nlink, size:s.size,
    trustFlags:{symlink:s.isSymbolicLink(),unexpectedOwner:![0,nativeHost.account.uid].includes(s.uid),groupOrOtherWritable:Boolean(s.mode & 0o022)} };
}
const guardedFs = {
  async lstat(p) {
    guard(allowedStat(p), 'lstat', p); const entry = { ...stamp(), method:'lstat', path:p };
    try { const s = await fs.lstat(p); fsTrace.push({...entry,ok:true,...stats(s)}); return s; }
    catch(e) { fsTrace.push({...entry,ok:false,code:e.code ?? null}); throw e; }
  },
  async readdir(p) {
    guard(allowedDirectory(p), 'readdir', p); const entry = {...stamp(),method:'readdir',path:p};
    try { const values = await fs.readdir(p); fsTrace.push({...entry,ok:true,entries:values}); return values; }
    catch(e) { fsTrace.push({...entry,ok:false,code:e.code ?? null}); throw e; }
  },
  async open(p, flags) {
    guard(allowedPlist(p) && flags === (constants.O_RDONLY | constants.O_NOFOLLOW), 'open-readonly', p);
    const entry = {...stamp(),method:'open',path:p,flags}; let handle;
    try { handle = await fs.open(p, flags); fsTrace.push({...entry,ok:true}); }
    catch(e) { fsTrace.push({...entry,ok:false,code:e.code ?? null}); throw e; }
    const chunks=[]; let complete=false;
    return {
      async stat() { const s=await handle.stat(); fsTrace.push({...stamp(),method:'handle.stat',path:p,ok:true,...stats(s)}); return s; },
      async read(buffer, offset, length, position) {
        guard(Buffer.isBuffer(buffer) && Number.isSafeInteger(length) && length <= 65536 && position === null, 'handle.read',p);
        const r=await handle.read(buffer,offset,length,position); if (r.bytesRead) chunks.push(Buffer.from(buffer.subarray(offset,offset+r.bytesRead))); else complete=true;
        fsTrace.push({...stamp(),method:'handle.read',path:p,bytesRead:r.bytesRead,ok:true}); return r;
      },
      async close() {
        await handle.close(); const bytes=Buffer.concat(chunks); const hash=createHash('sha256').update(bytes).digest('hex');
        const old=metadata.get(p) ?? {path:p,reads:[]}; old.reads.push({sha256:hash,bytes:bytes.length,completeRead:complete}); metadata.set(p,old);
        fsTrace.push({...stamp(),method:'handle.close',path:p,ok:true});
      }
    };
  }
};
const host = {...nativeHost,fs:new Proxy(guardedFs,{get(target,key){ if(key in target)return target[key]; throw new Error('Probe guard rejected filesystem method: '+String(key)); }})};
function guardChild(executable,args,options) {
  guard(executable==='/usr/bin/plutil' && Array.isArray(args) && args.length===6 && args.slice(0,5).join('\0')==='-convert\0json\0-o\0-\0--' && allowedPlist(args[5]) && options.shell===false,'child',executable);
}
const launch = (executable,args,options) => {
  guardChild(executable,args,options);
  for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS']) guard(!Object.hasOwn(options.env,key),'child-environment',key);
  const entry={...stamp(),argv:[executable,...args],cwd:process.cwd(),startedAt:new Date().toISOString(),environmentKeys:Object.keys(options.env).sort(),stdout:'',stderr:'',exitCode:null,signal:null};
  const child=spawn(executable,args,options); children.push(entry);
  child.stdout.on('data',x=>{entry.stdout+=x.toString('utf8');}); child.stderr.on('data',x=>{entry.stderr+=x.toString('utf8');});
  child.on('error',e=>{entry.errorCode=e.code ?? null;});
  child.once('close',(code,signal)=>{entry.exitCode=code;entry.signal=signal;entry.completedAt=new Date().toISOString();});
  return child;
};
const reviewedProcess = allocationSourceProcess(host, [], launch);
const metadataProcess = async (executable,args,options) => {
  guardChild(executable,args,options); const entry={...stamp(),argv:[executable,...args],cwd:process.cwd(),startedAt:new Date().toISOString(),timeoutMs:options.timeoutMs,maxOutputBytes:options.maxOutputBytes}; processTrace.push(entry);
  try { const r=await reviewedProcess(executable,args,options); Object.assign(entry,{completedAt:new Date().toISOString(),...r}); return r; }
  catch(e) { Object.assign(entry,{completedAt:new Date().toISOString(),errorCode:e.code ?? null,errorName:e.name,errorMessage:e.message}); throw e; }
};
const request={deviceTypeId:'com.apple.CoreSimulator.SimDeviceType.iPhone-17',runtimeId:'com.apple.CoreSimulator.SimRuntime.iOS-27-0'};
const startedAt=new Date().toISOString(); let exactResult,exitCode;
try {
  const compatibility=await verifyInstalledCompatibility(request,host,metadataProcess,AbortSignal.timeout(60000));
  exactResult={status:'compatibility-success',compatibility}; exitCode=0;
} catch(e) {
  exactResult={status:e.reason ?? 'unexpected-error',errorName:e.name,errorMessage:e.message}; exitCode=e.reason==='HOST_PREREQUISITE_MISSING'?3:2;
}
const result={schemaVersion:1,scope:'One actual unchanged compiled read-only compatibility lookup; no stores/devices or acceptance certification.',
  compiledModule:'dist/observed/allocation-config.js',processFactory:'allocationSourceProcess',briefSymbolDiscrepancy:'installedHostProcess is not exported; allocationSourceProcess is the actual reviewed installed-host process factory.',
  request,cwd:process.cwd(),startedAt,completedAt:new Date().toISOString(),host:{platform:host.platform,architecture:host.architecture,uid:host.account.uid},exactResult,exitCode,
  fsTrace,processTrace,children,metadataInputs:[...metadata.values()],
  lastSuccessfulLookup:fsTrace.filter(x=>x.ok).at(-1) ?? null,firstFilesystemFailure:fsTrace.find(x=>x.ok===false) ?? null,
  lastTrustFailureCandidate:fsTrace.filter(x=>x.trustFlags && Object.values(x.trustFlags).some(Boolean)).at(-1) ?? null,
  liveRows:{L01:'UNVERIFIED',L02:'UNVERIFIED',L03:'UNVERIFIED',L04:'UNVERIFIED',L05:'UNVERIFIED'}};
console.log(JSON.stringify(result,null,2)); process.exitCode=exitCode;
