import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base=process.argv[2];assert(base,'Pass the P08-evidence directory');
const read=name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const canonical=event=>JSON.stringify(Object.fromEntries(Object.entries(event).sort()));
const summary={};
for(const platform of ['android','ios']){
 const raw=fs.readFileSync(path.join(base,platform,platform==='ios'?'console.log':'logcat.log'),'utf8');
 const events=raw.split('\n').flatMap(line=>{const match=line.match(/FIXTURE_EVENT (\{.*\})/);return match?[JSON.parse(match[1])]:[];});
 const attempts=read(platform+'/attempts.json');
 for(const attempt of attempts)for(const event of attempt.events)assert(events.some(native=>canonical(native)===canonical(event)),platform+' missing raw event '+attempt.label);
 for(const prefix of ['element-click-','pointer-centre-']){
  const rows=attempts.filter(row=>row.label.startsWith(prefix));assert.equal(rows.length,3);
  for(const row of rows){assert.equal(row.events.length,1);assert.equal(row.events[0].kind,'tap');assert.equal(row.events[0].control,prefix==='element-click-'?'recorder.alpha':'recorder.beta');}
 }
 const screenshot=read(platform+'/screenshot.json');assert.equal(screenshot.native.format,'png');assert.equal(screenshot.jpeg.format,'jpeg');assert(Math.max(screenshot.jpeg.width,screenshot.jpeg.height)<=800);assert.deepEqual(screenshot.before,screenshot.after);
 const png=fs.readFileSync(path.join(base,platform,'screen-native.png'));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),screenshot.native.width);assert.equal(png.readUInt32BE(20),screenshot.native.height);
 const jpeg=fs.readFileSync(path.join(base,platform,'screen-800.jpg'));assert.equal(jpeg.subarray(0,2).toString('hex'),'ffd8');
 const shutdown=read(platform+'/shutdown-verified.json');assert.equal(shutdown.observations.length,6);for(const sample of shutdown.observations){assert(sample.deviceOffline);assert(sample.ownedPortsClosed);}
 assert.equal(read(platform+'/close.json').exitState.code,0);
 summary[platform]={rawFixtureEvents:events.length,operations:attempts.map(({label,events})=>({label,callbacks:events.map(({control,kind,durationMs})=>({control,kind,...(durationMs===undefined?{}:{durationMs})}))})),screenshot};
}
const proof=read('android/coordinate-proof.json');assert.deepEqual(proof.converted,{x:226,y:152});assert.equal(proof.events.length,1);assert.equal(proof.events[0].control,'recorder.gamma');assert.equal(proof.events[0].kind,'tap');
assert.deepEqual(read('android/settings-before.json'),read('android/settings-after.json'));
const hashes=read('frozen-before.json');for(const [file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,file);
for(const check of read('checks.json'))assert.equal(check.exitCode,0,check.name);
assert.equal(fs.readFileSync(path.join(base,'main-before.txt'),'utf8'),fs.readFileSync(path.join(base,'main-after.txt'),'utf8'));
console.log(JSON.stringify({passed:true,frozenFiles:Object.keys(hashes).length,...summary},null,2));
