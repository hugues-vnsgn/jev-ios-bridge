import { lstat, statfs } from 'node:fs/promises';
const started = new Date().toISOString();
const start = process.hrtime.bigint();
const timer = setTimeout(() => { process.stderr.write('{"status":"STORAGE_SNAPSHOT_TIMEOUT","deadlineSeconds":10}\n'); process.exit(124); }, 10000);
const fields = ['dev','ino','uid','gid','mode','size','nlink','mtimeNs','ctimeNs'];
try {
  if (process.version !== 'v26.8.1' || process.argv.length !== 3 || process.argv[2] !== '--read-only-once') throw new Error('SNAPSHOT_INVOCATION_INVALID');
  const paths = [
    { role: 'internalCoreSimulator', path: '/Users/hugues_mini/Library/Developer/CoreSimulator', requiredBytes: 64424509440n },
    { role: 'samStaging', path: '/Volumes/Sam/jev-ios-bridge-release-2026-10-11/staging', requiredBytes: 75161927680n }
  ];
  const results = [];
  for (const item of paths) {
    const before = await lstat(item.path, {bigint:true});
    if (!before.isDirectory() || before.isSymbolicLink()) throw new Error('SNAPSHOT_PATH_TYPE_INVALID');
    if (item.role === 'samStaging' && (before.dev !== 16777242n || before.ino !== 79928n || before.uid !== 501n || before.gid !== 20n || before.mode !== 16832n)) throw new Error('SAM_STAGING_IDENTITY_MISMATCH');
    const queriedAt = new Date().toISOString();
    const raw = await statfs(item.path, {bigint:true});
    const after = await lstat(item.path, {bigint:true});
    if (fields.some(k => before[k] !== after[k])) throw new Error('SNAPSHOT_PATH_CHANGED');
    const available = raw.bavail * raw.bsize;
    const shortfall = item.requiredBytes > available ? item.requiredBytes - available : 0n;
    results.push({role:item.role,path:item.path,queriedAt,before:Object.fromEntries(fields.map(k=>[k,before[k].toString()])),after:Object.fromEntries(fields.map(k=>[k,after[k].toString()])),rawStatFs:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v.toString()])),availableBytes:available.toString(),requiredBytes:item.requiredBytes.toString(),shortfallBytes:shortfall.toString(),meetsRequirement:shortfall===0n});
  }
  if (results[0].before.dev === results[1].before.dev) throw new Error('FILESYSTEMS_NOT_DISTINCT');
  clearTimeout(timer);
  const output=JSON.stringify({status:'READ_ONLY_STORAGE_SNAPSHOT_COMPLETE',started,completed:new Date().toISOString(),elapsedNs:(process.hrtime.bigint()-start).toString(),node:process.version,statfsCalls:2,paths:results})+'\n';
  if (Buffer.byteLength(output)>65536) throw new Error('SNAPSHOT_OUTPUT_BOUND');
  process.stdout.write(output);
} catch (error) {
  clearTimeout(timer);
  process.stderr.write(JSON.stringify({status:'READ_ONLY_STORAGE_SNAPSHOT_FAILED',code:error.code??null,message:error.message.slice(0,1024)})+'\n');
  process.exitCode=3;
}
