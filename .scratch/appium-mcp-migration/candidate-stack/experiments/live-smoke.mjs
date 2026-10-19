import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { DOMParser } from '@xmldom/xmldom';
const platform = process.argv[2];
assert.ok(['ios', 'android'].includes(platform));
const root = resolve(import.meta.dirname, '..');
const preparationPath = join(root, 'evidence/dedicated-device-preparation.json');
const preparation = JSON.parse(await readFile(preparationPath, 'utf8'));
assert.equal(preparation.status, 'prepared');
const work = join(root, 'runtime', `smoke-${platform}`);
await mkdir(work, { recursive: true });
const stderr = await open(join(root, 'evidence', `smoke-${platform}-vendor.log`), 'w');
const env = { PATH: process.env.PATH, HOME: work, TMPDIR: work,
  ANDROID_HOME: join(process.env.HOME, 'Library/Android/sdk'),
  ANDROID_SDK_ROOT: join(process.env.HOME, 'Library/Android/sdk'),
  AI_VISION_ENABLED: 'false', APPIUM_MCP_OTEL_ENABLED: 'false',
  APPIUM_MCP_ON_CLIENT_DISCONNECT: 'skip', APPIUM_MCP_APPS_ENABLED: 'true',
};
assert.ok(!Object.keys({...getDefaultEnvironment(), ...env}).includes('TYPESAFE_API_KEY'));
const transport = new StdioClientTransport({ command: process.execPath,
  args: [join(root, 'runtime/feasibility-server.mjs'), preparationPath, platform],
  cwd: work, env, stderr: stderr.fd,
});
const client = new Client({name:'jev-phase1-live-smoke',version:'0.1.0'},
  {capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
const evidence = {platform, kind:'disposable-live-smoke', startedAt:new Date().toISOString(),
  requests:[], nativeFenceEstablished:false, leaseReleased:false};
let sessionId;
const output = join(root, 'evidence', `smoke-${platform}.json`);
async function persist() { await writeFile(output, JSON.stringify(evidence, null, 2)+'\n'); }
async function call(name,args) {
  const entry={request:{name,arguments:args}, disposition:'outstanding'};
  evidence.requests.push(entry); await persist();
  try { entry.reply=await client.callTool(entry.request, undefined, {timeout:240000});
    entry.disposition='reply-received'; await persist(); assert.ok(!entry.reply.isError, JSON.stringify(entry.reply)); return entry.reply;
  } catch(error) { entry.failure=String(error); entry.disposition='uncertain'; await persist(); throw error; }
}
function text(reply) { return reply.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'); }
function source(reply) {
  const match=/^Page source retrieved successfully: \n```xml ([\s\S]+)```$/.exec(text(reply));
  assert.ok(match, 'Required XML envelope');
  const errors=[];
  const doc=new DOMParser({onError:(level,message)=>errors.push(level+': '+message)}).parseFromString(match[1], 'text/xml');
  assert.equal(errors.length,0,errors.join('\n'));
  assert.equal(doc.documentElement.tagName, platform==='ios'?'AppiumAUT':'hierarchy');
  return {xml:match[1],doc};
}
function summary(doc) {
  for(const node of Array.from(doc.getElementsByTagName('*'))) {
    if(node.getAttribute(platform==='ios'?'name':'resource-id')==='selection.summary')
      return node.getAttribute(platform==='ios'?'value':'text');
  }
  throw new Error('Required selection.summary missing');
}
const timeout=setTimeout(()=>{void transport.close();},360000);
try {
  await client.connect(transport); evidence.serverProcessId=transport.pid; evidence.server=client.getServerVersion();
  assert.deepEqual(evidence.server,{name:'MCP Appium',version:'1.97.0'});
  evidence.tools=(await client.listTools()).tools;
  const discovery=JSON.parse(await readFile(join(root,'evidence/candidate-discovery.json'),'utf8'));
  for(const tool of evidence.tools) assert.deepEqual(tool.inputSchema,discovery.tools.find(x=>x.name===tool.name).inputSchema);
  const caps=platform==='ios'?{
    platformName:'iOS','appium:automationName':'XCUITest','appium:udid':preparation.ios.udid,
    'appium:simulatorDevicesSetPath':preparation.ios.set,'appium:bundleId':'dev.jevbridge.diagnostic',
    'appium:usePreinstalledWDA':true,'appium:prebuiltWDAPath':join(root,'runtime/wda-16.14.2/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app'),
    'appium:wdaLocalPort':18100,'appium:mjpegServerPort':18101,'appium:showXcodeLog':false,
    'appium:noReset':true,'appium:shouldTerminateApp':false,
    'appium:settings[pageSourceExcludedAttributes]':'',
  }:{platformName:'Android','appium:automationName':'UiAutomator2','appium:udid':preparation.android.serial,
    'appium:appPackage':'dev.jevbridge.diagnostic','appium:appActivity':'.MainActivity',
    'appium:systemPort':18200,'appium:mjpegServerPort':18201,'appium:noReset':true,
    'appium:shouldTerminateApp':false,'appium:skipDeviceInitialization':false};
  evidence.capabilities=caps;
  const created=await call('appium_session_management',{action:'create',platform,capabilities:JSON.stringify(caps)});
  const sessions=created.structuredContent?.sessions;
  assert.equal(created.structuredContent?.extensionVersion,1);assert.equal(sessions?.length,1);
  const owned=sessions[0];assert.equal(owned.ownership,'owned');assert.equal(owned.capabilities['appium:udid'],caps['appium:udid']);
  assert.match(owned.sessionId,/^[a-f0-9-]{36}$/i);sessionId=owned.sessionId;evidence.sessionId=sessionId;await persist();
  const before=source(await call('appium_get_page_source',{sessionId}));
  evidence.before=summary(before.doc);assert.equal(evidence.before,'Selected: None');
  const located=await call('appium_find_elements',{sessionId,strategy:platform==='ios'?'accessibility id':'xpath',selector:platform==='ios'?'choose.apple':"//*[@resource-id='choose.apple']"});
  const elements=JSON.parse(text(located)).elements;assert.equal(elements.length,1);assert.equal(typeof elements[0].elementId,'string');assert.ok(elements[0].elementId.length);
  await call('appium_gesture',{sessionId,action:'tap',elementUUID:elements[0].elementId});
  const after=source(await call('appium_get_page_source',{sessionId}));evidence.after=summary(after.doc);assert.equal(evidence.after,'Selected: Apple');
  const shot=await call('appium_screenshot',{sessionId});
  const screenshot=shot.structuredContent?.screenshot;assert.equal(screenshot?.mimeType,'image/png');
  const png=Buffer.from(screenshot.data,'base64');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16)>0&&png.readUInt32BE(20)>0);
  const screenshotPath=join(root,'evidence',`smoke-${platform}.png`);await writeFile(screenshotPath,png);
  evidence.screenshot={path:screenshotPath,sha256:createHash('sha256').update(png).digest('hex'),width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
  evidence.roundTrip='passed';await persist();
} catch(error) { evidence.failure=String(error);await persist();throw error; }
finally {
  if(sessionId) {
    try { await call('appium_session_management',{action:'delete',sessionId});evidence.deleteReplyReceived=true; }
    catch(error) { evidence.cleanupFailure=String(error); }
  }
  clearTimeout(timeout);await client.close();await stderr.close();evidence.dispatchClosed=true;await persist();
  console.log(JSON.stringify({platform,roundTrip:evidence.roundTrip??'failed',sessionId,leaseReleased:false}));
}
