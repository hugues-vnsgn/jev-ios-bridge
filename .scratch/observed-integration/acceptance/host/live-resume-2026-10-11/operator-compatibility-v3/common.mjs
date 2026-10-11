import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
export const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
export const dir='.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-compatibility-v3';
export const rootHead='1f69ec7d3d648189cd631259c1c9427c5b8e1b0e';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export async function readRepo(path){
 const p=resolve(repo,path);if(!p.startsWith(repo+'/')||p===join(repo,'.env'))throw new Error('Outside authorized repository reads');
 let current=repo;const parts=relative(repo,p).split('/');
 for(let i=0;i<parts.length;i++){current=join(current,parts[i]);const s=await fs.lstat(current,{bigint:true});if(s.isSymbolicLink()||(i<parts.length-1&&!s.isDirectory()))throw new Error('Repository alias');}
 const before=await fs.lstat(p,{bigint:true});if(!before.isFile()||before.nlink!==1n)throw new Error('Not a regular single-link input');
 const key=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.size,s.nlink,s.ctimeNs,s.mtimeNs].map(String).join(':');
 const handle=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{if(key(before)!==key(await handle.stat({bigint:true})))throw new Error('Input replaced');const bytes=await handle.readFile();
  if(key(before)!==key(await handle.stat({bigint:true}))||key(before)!==key(await fs.lstat(p,{bigint:true})))throw new Error('Input changed');return bytes;
 }finally{await handle.close();}
}
export async function writeNew(name,value){
 const p=resolve(repo,dir,name);if(!p.startsWith(join(repo,dir)+'/'))throw new Error('Outside private evidence');
 const parent=await fs.lstat(join(repo,dir));if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o777)!==0o700)throw new Error('Private evidence directory mismatch');
 await fs.writeFile(p,Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
export async function snapshot(groups){
 const capturedAtUtc=new Date().toISOString(),records={},mismatches=[];
 for(const [group,map]of Object.entries(groups)){
  const files=[];for(const [path,expectedSha256]of Object.entries(map)){
   try{const bytes=await readRepo(path),actualSha256=sha(bytes),match=actualSha256===expectedSha256;files.push({path,bytes:bytes.length,expectedSha256,actualSha256,match});if(!match)mismatches.push({group,path,expectedSha256,actualSha256});}
   catch(e){files.push({path,expectedSha256,match:false,error:{name:e.name,message:e.message,code:e.code??null}});mismatches.push({group,path,error:e.message});}
  }records[group]={count:files.length,allMatch:files.every(x=>x.match),files};
 }return {capturedAtUtc,allMatch:mismatches.length===0,mismatches,groups:records};
}
export async function seal(name='artifact-hashes-result.json'){
 const files=[];async function walk(relativePath=''){
  const entries=await fs.readdir(join(repo,dir,relativePath));
  for(const n of entries.sort()){
   const rel=relativePath?relativePath+'/'+n:n;if(rel===name)continue;const p=join(repo,dir,rel),s=await fs.lstat(p);
   if(s.isSymbolicLink())throw new Error('Evidence alias');
   if(s.isDirectory()){if((s.mode&0o777)!==0o700)throw new Error('Evidence directory mode');await walk(rel);}
   else{if(!s.isFile()||(s.mode&0o777)!==0o600)throw new Error('Evidence file mode');const bytes=await readRepo(dir+'/'+rel);files.push({path:rel,bytes:bytes.length,sha256:sha(bytes),mode:'0600'});}
  }
 }await walk();await writeNew(name,{schemaVersion:1,createdAtUtc:new Date().toISOString(),scope:'Every evidence file except this manifest itself.',files});
}
