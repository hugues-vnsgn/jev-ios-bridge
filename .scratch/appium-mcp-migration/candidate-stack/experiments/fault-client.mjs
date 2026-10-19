import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,open,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
const run=promisify(execFile);
const [platform,mode]=process.argv.slice(2);assert.ok(['ios','android'].includes(platform));
assert.ok(['lost-create','lost-action','late-action','cancel-action','process-failure'].includes(mode));
const root=resolve(import.meta.dirname,'..');const preparationPath=join(root,'evidence/dedicated-device-preparation.json');
const prep=JSON.parse(await readFile(preparationPath,'utf8'));const directory=join(root,'evidence',`fault-${platform}-${mode}`);
await mkdir(directory,{mode:0o700});
async function persist(file,value){
  const temp=file+'.tmp';const fd=await open(temp,'w',0o600);
  try{await fd.writeFile(JSON.stringify(value,null,2)+'\n');await fd.sync();}finally{await fd.close();}
  await rename(temp,file);const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}
}
const gate=join(directory,'dispatch.json');await persist(gate,{closed:false});
const state={version:1,platform,mode,requests:[],outcome:null,quarantined:true,leaseReleased:false};
const statePath=join(directory,'client.json');const work=join(root,'runtime',`fault-${platform}-${mode}`);await mkdir(work);
const vendor=await open(join(directory,'vendor.log'),'w');
const env={PATH:process.env.PATH,HOME:work,TMPDIR:work,ANDROID_HOME:join(process.env.HOME,'Library/Android/sdk'),ANDROID_SDK_ROOT:join(process.env.HOME,'Library/Android/sdk'),AI_VISION_ENABLED:'false',APPIUM_MCP_OTEL_ENABLED:'false',APPIUM_MCP_ON_CLIENT_DISCONNECT:'skip'};
assert.ok(!Object.keys({...getDefaultEnvironment(),...env}).includes('TYPESAFE_API_KEY'));
const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'runtime/fault-server.mjs'),preparationPath,platform,mode,directory],cwd:work,env,stderr:vendor.fd});
const client=new Client({name:'jev-phase1-fault-tracer',version:'0.1.0'},{capabilities:{}});
async function send(name,args,options={}){
  assert.equal(JSON.parse(await readFile(gate,'utf8')).closed,false);
  const entry={request:{name,arguments:args},disposition:'outstanding'};state.requests.push(entry);await persist(statePath,state);
  try{entry.reply=await client.callTool(entry.request,undefined,{timeout:240000,...options});entry.disposition='reply-received';await persist(statePath,state);assert.ok(!entry.reply.isError);return entry.reply;}
  catch(error){entry.disposition='uncertain';entry.failure=String(error);await persist(statePath,state);throw error;}
}
async function waitFor(predicate,timeoutMs=10000){
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){try{const record=JSON.parse(await readFile(join(directory,'server.json'),'utf8'));if(predicate(record))return record;}catch{}
    await new Promise(resolve=>setTimeout(resolve,25));}
  throw new Error('Expected durable server event not observed');
}
try{
 await client.connect(transport);state.serverPid=transport.pid;
 state.serverBirth=(await run('ps',['-p',String(transport.pid),'-o','lstart='])).stdout.trim();
 assert.deepEqual(client.getServerVersion(),{name:'MCP Appium',version:'1.97.0'});
 const caps=platform==='ios'?{platformName:'iOS','appium:automationName':'XCUITest','appium:udid':prep.ios.udid,'appium:simulatorDevicesSetPath':prep.ios.set,'appium:bundleId':'dev.jevbridge.diagnostic','appium:usePreinstalledWDA':true,'appium:prebuiltWDAPath':join(root,'runtime/wda-16.14.2/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app'),'appium:wdaLocalPort':18100,'appium:mjpegServerPort':18101,'appium:noReset':true,'appium:shouldTerminateApp':false}:{platformName:'Android','appium:automationName':'UiAutomator2','appium:udid':prep.android.serial,'appium:appPackage':'dev.jevbridge.diagnostic','appium:appActivity':'.MainActivity','appium:systemPort':18200,'appium:mjpegServerPort':18201,'appium:noReset':true,'appium:shouldTerminateApp':false};
 state.capabilities=caps;await persist(statePath,state);
 const controller=new AbortController();
 const creation=send('appium_session_management',{action:'create',platform,capabilities:JSON.stringify(caps)},mode==='lost-create'?{signal:controller.signal}:{});
 creation.catch(()=>{});
 if(mode==='lost-create'){
   await waitFor(r=>r.commands[0]?.state==='terminal',240000);controller.abort(new Error('Injected lost creation reply'));
   try{await creation;assert.fail('Lost creation reply must not arrive');}catch(error){assert.notEqual(error.code,'ERR_ASSERTION');}
   assert.equal(state.sessionId,undefined);
 }else{
   const created=await creation;assert.equal(created.structuredContent?.sessions.length,1);
   state.sessionId=created.structuredContent.sessions[0].sessionId;
   const action='appium_gesture';
   // A single press on empty app background: no commerce data or text is entered.
   const args={sessionId:state.sessionId,action:mode==='cancel-action'||mode==='process-failure'?'long_press':'tap',x:100,y:700,...((mode==='cancel-action'||mode==='process-failure')?{duration:4000}:{})};
   const pending=send(action,args,{signal:controller.signal});pending.catch(()=>{});
   await waitFor(r=>r.commands.at(-1)?.request.name===action);
   if(mode==='cancel-action'||mode==='process-failure')await new Promise(resolve=>setTimeout(resolve,500));
   else if(mode==='lost-action'||mode==='late-action')await waitFor(r=>r.commands.at(-1)?.state==='terminal');
   if(mode==='process-failure')process.kill(transport.pid,'SIGKILL');
   else controller.abort(new Error('Injected '+mode));
   try{await pending;assert.fail('Fault action must not confirm');}catch(error){assert.notEqual(error.code,'ERR_ASSERTION');}
 }
 state.outcome='inconclusive';await persist(gate,{closed:true,closedAt:new Date().toISOString()});await persist(statePath,state);
 if(mode==='late-action'){
   await waitFor(r=>typeof r.commands.at(-1)?.lateReplySentAt==='number');
   assert.equal(JSON.parse(await readFile(statePath,'utf8')).outcome,'inconclusive');state.lateReplyIgnored=true;
 }
 await client.close();state.serverExited=true;
 try{process.kill(state.serverPid,0);assert.fail('Owned server still running');}catch(error){assert.equal(error.code,'ESRCH');}
 const {stdout}=await run('python3',[join(root,'runtime/fence-owned.py'),platform,join(directory,'native-stop.json')]);
 state.nativeStop=JSON.parse(await readFile(join(directory,'native-stop.json'),'utf8'));assert.equal(state.nativeStop.observedOwnedComponentsStopped,true);
 assert.equal(state.requests.filter(x=>x.request.name==='appium_session_management').length,1);
 assert.equal(state.requests.filter(x=>x.request.name==='appium_gesture').length,mode==='lost-create'?0:1);
 state.nativeWorkDisposition='owned-components-observed-stopped';state.noMutationReplay=true;
 state.quarantineRecordReadableAfterServerExit=JSON.parse(await readFile(statePath,'utf8')).quarantined===true;
 await persist(statePath,state);console.log(JSON.stringify({platform,mode,outcome:state.outcome,quarantined:true,leaseReleased:false,nativeWorkDisposition:state.nativeWorkDisposition,noMutationReplay:true}));
}finally{
 await client.close();await vendor.close();await persist(statePath,state);
}
