import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { z } from 'zod/v4';
import { admissionRoot, canonicalDevice } from './admission.js';
import { AdmissionError, AdmissionSqlite, parseMigrationDeclaration, type MigrationDeclaration } from './admission-sqlite.js';
import { DEFAULT_LEASE_ROOT } from './lease.js';
import type { ImportedObservedAction } from './admission-migration.js';
import type { UpgradeReceipt, PreservedRecords } from './admission-upgrade.js';

export type ImportSource = { path: string; sha256: string; kind: 'lease' | 'journal'; evidence: unknown };
export type ImportQuarantine = { kind: 'device'; device: string } | { kind: 'name'; name: string };
export type ImportPlan = { declaration: MigrationDeclaration; sources: ImportSource[];
  quarantines: { target: ImportQuarantine; path: string; sha256: string; evidence: unknown }[];
  actions: Omit<ImportedObservedAction, 'allocationId'>[]; exclusions: string[] };
export type ImportReceipt = { version: 1; kind: 'import'; id: string; guardToken: string; time: number;
  binaryVersion: string; declaration: MigrationDeclaration; declarationDigest: string; sourceSetDigest: string;
  backup: UpgradeReceipt['backup']; sources: ImportSource[]; skipped: { path: string; sha256: string }[];
  quarantines: string[]; importedActions: string[]; preserved: PreservedRecords };
export type ImportTestOptions = { root: string; backend: 'fake'; defaultRoots: { leases: string; journal: string };
  host?: () => HostInventory;
  checkpoint?: (point: 'guarded' | 'backupVerified' | 'beforeCommit' | 'afterCommit' | 'recoveryCommitted') => void };
const leaseSchema = z.object({ pid: z.number().int().positive().max(2147483647), token: z.string().min(1), deviceId: z.string().min(1),
  createdAt: z.string().refine(value => Number.isFinite(Date.parse(value))), runId: z.string().optional(), ownedProcesses: z.array(z.string()).optional() });
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
function refused(reason: NonNullable<AdmissionError['reason']>): never {
  throw new AdmissionError('IMPORT_REFUSED', 'Legacy source import refused', reason);
}
function readSource(path: string): { bytes: Buffer; sha256: string } {
  try {
    const initial = lstatSync(path);
    if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1 || initial.uid !== process.getuid?.()) refused('SOURCE_UNSAFE');
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.dev !== initial.dev || stat.ino !== initial.ino || stat.size > 16 * 1024 * 1024) refused('SOURCE_UNSAFE');
      const bytes = readFileSync(fd);
      const after = fstatSync(fd);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || bytes.length !== stat.size) refused('SOURCE_INCONSISTENT');
      return { bytes, sha256: hash(bytes) };
    } finally { closeSync(fd); }
  } catch (error) {
    if (error instanceof AdmissionError) throw error;
    refused((error as NodeJS.ErrnoException).code === 'ELOOP' ? 'SOURCE_UNSAFE' : 'SOURCE_UNREADABLE');
  }
}
function sourceLocation(path:string):string {
  try {lstatSync(path);}
  catch(error) {
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    return join(sourceLocation(dirname(path)),basename(path));
  }
  return realpathSync(path);
}
function sourceDirectory(path: string, required: boolean, destination: string): string | undefined {
  if (!isAbsolute(path)) refused('SOURCE_UNSAFE');
  const requested=resolve(path);
  const separate=(root:string)=>{
    if(root===destination||root.startsWith(destination+sep)||destination.startsWith(root+sep))refused('SOURCE_UNSAFE');
  };
  separate(requested);
  let stat:ReturnType<typeof lstatSync>|undefined;
  try {stat=lstatSync(requested);}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')refused('SOURCE_UNREADABLE');}
  if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()))refused('SOURCE_UNSAFE');
  let root:string;
  try {root=sourceLocation(requested);}catch{refused('SOURCE_UNREADABLE');}
  separate(root);
  if(!stat){if(required)refused('SOURCE_UNREADABLE');return undefined;}
  return root;
}

type RecordObject = Record<string, unknown>;
type HistoricalRecord = ImportedObservedAction['records'][number];
type HistoricalAction = { actionId: string; device: string; records: HistoricalRecord[];
  intents: { directory: string; value: unknown }[]; results: { directory: string; value: RecordObject }[] };
function object(value: unknown): value is RecordObject { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function readRecord(path: string, source: { files: HistoricalRecord[] }): HistoricalRecord {
  const {bytes, sha256}=readSource(path);
  let record: unknown;
  try {record=JSON.parse(bytes.toString('utf8'));} catch {refused('SOURCE_INCONSISTENT');}
  const result={path,sha256,record};source.files.push(result);return result;
}
function identity(record: unknown): { device: string; rawDevice: string; actionId: string; record: RecordObject } {
  if (!object(record) || typeof record.deviceId !== 'string' || typeof record.actionId !== 'string'
    || !record.actionId.length || record.actionId.length > 1024 || !Object.hasOwn(record, 'intent')) refused('SOURCE_INCONSISTENT');
  return { device: canonicalDevice(record.deviceId), rawDevice: record.deviceId, actionId: record.actionId, record };
}
const resultSchema = z.object({
  status: z.enum(['outcome_observed', 'already_satisfied', 'refused', 'inconclusive']),
  actionAttempted: z.boolean(), actionAcknowledged: z.boolean(), observations: z.number().int().nonnegative(),
});
function completedOutcome(result: RecordObject): ImportedObservedAction['outcome'] {
  const parsed = resultSchema.safeParse(result.result);
  if (!parsed.success || result.status !== 'completed') return 'inconclusive';
  const value = parsed.data;
  if (value.actionAcknowledged && !value.actionAttempted) return 'inconclusive';
  if (value.status === 'outcome_observed' && (!value.actionAttempted || !value.actionAcknowledged)) return 'inconclusive';
  if ((value.status === 'already_satisfied' || value.status === 'refused') && (value.actionAttempted || value.actionAcknowledged)) return 'inconclusive';
  return value.status;
}
function readJournal(source: { root: string; files: HistoricalRecord[] }, actions: Map<string, HistoricalAction>, devices: Map<string, boolean>, destination: string): void {
  for (const directoryName of readdirSync(source.root).sort()) {
    const directory = join(source.root, directoryName);
    const stat = lstatSync(directory);
    sourceDirectory(directory, true, destination);
    if (!/^[a-f\d]{64}$/.test(directoryName) || !stat.isDirectory() || stat.isSymbolicLink()) refused('SOURCE_INCONSISTENT');
    const names = readdirSync(directory).sort();
    if (!names.length) refused('SOURCE_INCONSISTENT');
    for (const name of names) {
      const publishedName = name.replace(/\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp$/i, '');
      const temporary = publishedName !== name;
      const match = /^([a-f\d]{64})\.(intent|result)\.json$/.exec(publishedName);
      if (!match && !['claim.json', 'quarantine.json'].includes(publishedName)) refused('SOURCE_INCONSISTENT');
      const sourceRecord = readRecord(join(directory, name), source);
      if (publishedName === 'quarantine.json') {
        const record = sourceRecord.record;
        if (!object(record) || typeof record.deviceId !== 'string' || hash(record.deviceId) !== directoryName) refused('SOURCE_INCONSISTENT');
        devices.set(canonicalDevice(record.deviceId), true);
        continue;
      }
      const parsed = identity(sourceRecord.record);
      if (hash(parsed.rawDevice) !== directoryName || (match && hash(parsed.actionId) !== match[1])) refused('SOURCE_INCONSISTENT');
      let action = actions.get(parsed.actionId);
      if (action && action.device !== parsed.device) refused('SOURCE_INCONSISTENT');
      if (!action) {
        action = { actionId: parsed.actionId, device: parsed.device, records: [], intents: [], results: [] };
        actions.set(parsed.actionId, action);
      }
      devices.set(parsed.device, devices.get(parsed.device) ?? false);
      action.records.push(sourceRecord);
      if (temporary || publishedName === 'claim.json') devices.set(parsed.device, true);
      if (match?.[2] === 'intent' && parsed.record.status === 'in-flight') action.intents.push({ directory, value: parsed.record.intent });
      else if (match?.[2] === 'result') action.results.push({ directory, value: parsed.record });
      else devices.set(parsed.device, true);
    }
  }
}

function scan(declaration: Pick<MigrationDeclaration, 'additionalLeaseRoots' | 'additionalJournalRoots' | 'excludedDevices'>, options: { root: string; defaultRoots: ImportTestOptions['defaultRoots'] }, allowLive = false): Omit<ImportPlan, 'declaration'> {
  const plan: Omit<ImportPlan, 'declaration'> = { sources: [], quarantines: [], actions: [], exclusions: declaration.excludedDevices.map(value=>canonicalDevice(value)) };
  const roots = new Set<string>(), devices=new Map<string,boolean>();
  for (const [path, required] of [[options.defaultRoots.leases, false], ...declaration.additionalLeaseRoots.map(path => [path, true] as const)] as const) {
    const root = sourceDirectory(path, required, options.root);
    if (!root || roots.has(root)) continue;
    roots.add(root);
    let names: string[];
    try { names = readdirSync(root).sort(); } catch { refused('SOURCE_UNREADABLE'); }
    for (const name of names) {
      const match = /^(.*)\.lock(?:\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp)?$/i.exec(name);
      if (!match?.[1]) refused('SOURCE_INCONSISTENT');
      const path = join(root, name), { bytes, sha256 } = readSource(path);
      let raw: unknown;
      try { raw = JSON.parse(bytes.toString('utf8')); } catch { refused('SOURCE_INCONSISTENT'); }
      const record = leaseSchema.safeParse(raw);
      if (!record.success || record.data.deviceId.toUpperCase() !== match[1].toUpperCase()) refused('SOURCE_INCONSISTENT');
      if (!allowLive) {
        try { process.kill(record.data.pid, 0); refused('HOLDER_ALIVE'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') refused('HOLDER_ALIVE'); }
      }
      let target: ImportQuarantine;
      try { target = { kind: 'device', device: canonicalDevice(match[1]) }; }
      catch { target = { kind: 'name', name: match[1].toUpperCase() }; }
      if(target.kind==='device')devices.set(target.device,true);
      plan.sources.push({ path, sha256, kind: 'lease', evidence: record.data });
      plan.quarantines.push({ target, path, sha256, evidence: record.data });
    }
  }
  const actions=new Map<string,HistoricalAction>(), journals=new Set<string>();
  for(const [path,required] of [[options.defaultRoots.journal,false],...declaration.additionalJournalRoots.map(path=>[path,true] as const)] as const) {
    const root=sourceDirectory(path,required,options.root);
    if(!root||journals.has(root))continue;
    if(roots.has(root))refused('SOURCE_CONFLICT');
    journals.add(root);
    const source={root,files:[] as HistoricalRecord[]};
    try {readJournal(source,actions,devices,options.root);} catch(error) {
      if(error instanceof AdmissionError&&error.code==='IMPORT_REFUSED')throw error;
      refused(error instanceof AdmissionError?'SOURCE_INCONSISTENT':typeof (error as NodeJS.ErrnoException).code==='string'?'SOURCE_UNREADABLE':'SOURCE_INCONSISTENT');
    }
    for(const file of source.files)plan.sources.push({...file,kind:'journal',evidence:file.record});
  }
  for(const action of actions.values()) {
    if(!action.intents.length||!action.results.length||action.results.some(result=>completedOutcome(result.value)==='inconclusive')
      ||action.intents.some(intent=>!isDeepStrictEqual(intent.value,action.intents[0]!.value)||!action.results.some(result=>result.directory===intent.directory))
      ||action.results.some(result=>!action.intents.some(intent=>intent.directory===result.directory)||!isDeepStrictEqual(result.value.intent,action.intents[0]?.value)||!isDeepStrictEqual(result.value.result,action.results[0]!.value.result)))devices.set(action.device,true);
  }
  for(const device of plan.exclusions)devices.set(device,true);
  for(const action of actions.values())plan.actions.push({actionId:action.actionId,device:action.device,readOnly:true,
    outcome:devices.get(action.device)?'inconclusive':completedOutcome(action.results[0]!.value),records:action.records});
  for(const [device,uncertain] of devices) {
    if(!uncertain||plan.exclusions.includes(device)||plan.quarantines.some(q=>q.target.kind==='device'&&q.target.device===device))continue;
    const source=plan.sources.find(source=>source.kind==='journal'&&object(source.evidence)&&typeof source.evidence.deviceId==='string'&&source.evidence.deviceId.toUpperCase()===device);
    if(!source)refused('SOURCE_INCONSISTENT');
    plan.quarantines.push({target:{kind:'device',device},path:source.path,sha256:source.sha256,evidence:{version:1,cause:'historical-journal'}});
  }
  plan.sources.sort((a,b)=>a.path.localeCompare(b.path));
  return plan;
}
export function importAdmissionForTesting(raw: unknown, options: ImportTestOptions): ImportReceipt {
  if (options.backend !== 'fake') throw new AdmissionError('INVALID_REQUEST', 'Import tests require a fake backend');
  const declaration = parseMigrationDeclaration(raw);
  requireCleanPreflight(preflightAdmissionForTesting(raw, options));
  return AdmissionSqlite.importLegacy({ root: options.root, mode: 'test' }, () => ({declaration,...scan(declaration, options)}), options.checkpoint);
}
export function importAdmission(raw: unknown): ImportReceipt {
  const declaration = parseMigrationDeclaration(raw);
  const root = admissionRoot();
  requireCleanPreflight(preflightAdmission(raw));
  return AdmissionSqlite.importLegacy({ root, mode: 'production' }, () => ({declaration,...scan(declaration, { root, defaultRoots: {
    leases: DEFAULT_LEASE_ROOT, journal: join(userInfo().homedir, 'Library/Application Support/jev-ios-bridge/observed-actions'),
  } })}));
}

export type HostInventory = {
  processes: { pid: number; startedAt: string; role: 'bridge' | 'mcp' }[];
  handles: { pid: number; path: string }[];
  installs: { source: string; version: string | null }[];
  failures: string[];
};
const emptyHost = (): HostInventory => ({processes:[],handles:[],installs:[],failures:[]});
export type PreflightReport = {
  version: 1; kind: 'preflight'; ready: boolean;
  checks: { name: string; passed: boolean }[];
  host: HostInventory; store: ReturnType<typeof AdmissionSqlite.inspectMaintenance>;
  sourceRefusal?: { code: 'IMPORT_REFUSED'; reason: NonNullable<AdmissionError['reason']> };
  leases: ImportSource[]; plannedQuarantines: ImportPlan['quarantines'];
};
export function discoverAdmissionHost(options: { root:string;home:string;project:string;
  command?:(name:string,args:string[])=>{status:number|null;stdout:string;stderr:string;failed?:boolean} }): HostInventory {
  const {root,home,project}=options;
  const command=options.command??((name:string,args:string[])=>{
    const result=spawnSync(name,args,{encoding:'utf8',timeout:5000,maxBuffer:4*1024*1024});
    return {status:result.status,stdout:result.stdout??'',stderr:result.stderr??'',failed:!!result.error};
  });
  const result=emptyHost();
  const processes=command('ps',['-axo','pid=,lstart=,command=']);
  if(processes.status!==0||processes.failed)result.failures.push('process-discovery');
  else for(const line of processes.stdout.split('\n')) {
    const match=/^\s*(\d+)\s+(.{24})\s+(.+)$/.exec(line);
    if(!match||Number(match[1])===process.pid)continue;
    const command=match[3]!;
    if(/(?:^|\s)(?:\S*\/)?(?:jev-ios-bridge)(?:\s|$)|(?:^|\s)(?:\S*\/)?(?:dist|src)\/(?:cli|mcp\/index)\.(?:js|ts)(?:\s|$)/.test(command)) {
      result.processes.push({pid:Number(match[1]),startedAt:match[2]!,role:command.includes('mcp')?'mcp':'bridge'});
    }
  }
  const handles=command('lsof',['-nP','-Fpn','+D',root]);
  if(handles.failed||(handles.status!==0&&!(handles.status===1&&!handles.stderr.trim())))result.failures.push('handle-discovery');
  let pid=0;
  for(const line of (handles.stdout??'').split('\n')) {
    if(line.startsWith('p'))pid=Number(line.slice(1));
    if(line.startsWith('n')&&pid!==process.pid)result.handles.push({pid,path:line.slice(1)});
  }
  function readJson(path: string): unknown {
    try {const stat=lstatSync(path);if(!stat.isFile()||stat.size>4*1024*1024)throw new Error();return JSON.parse(readFileSync(path,'utf8'));}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')result.failures.push('install-discovery');return undefined;}
  }
  function packageVersion(directory: string): string|null {
    const value=readJson(join(directory,'package.json'));
    return object(value)&&value.name==='jev-ios-bridge'&&typeof value.version==='string'?value.version:null;
  }
  for(const [provider,path] of [['claude',join(home,'.claude/plugins/installed_plugins.json')],['codex',join(home,'.codex/plugins/installed_plugins.json')]] as const) {
    const registry=readJson(path);
    if(object(registry)&&object(registry.plugins))for(const [name,entries] of Object.entries(registry.plugins)) {
      if(!name.startsWith('jev-ios-bridge@')||!Array.isArray(entries))continue;
      for(const entry of entries)if(object(entry))result.installs.push({source:provider+':'+name,version:typeof entry.installPath==='string'?packageVersion(entry.installPath):null});
    }
  }
  for(const path of [join(project,'.mcp.json'),join(home,'.claude.json')]) {
    const config=readJson(path);
    if(!object(config)||!object(config.mcpServers))continue;
    for(const [name,server] of Object.entries(config.mcpServers)) {
      if(!object(server))continue;
      const args=Array.isArray(server.args)?server.args.filter((value):value is string=>typeof value==='string'):[];
      if(!name.includes('jev-ios-bridge')&&!args.some(arg=>arg.includes('jev-ios-bridge')))continue;
      const script=args.find(arg=>/\/dist\/mcp\/index\.js$/.test(arg));
      result.installs.push({source:path+':'+name,version:script?packageVersion(resolve(script,'../../..')):null});
    }
  }
  const local=packageVersion(join(project,'node_modules/jev-ios-bridge'));
  if(local)result.installs.push({source:'project-package',version:local});
  const codexPath=join(home,'.codex/config.toml');
  try {
    const config=readFileSync(codexPath,'utf8');
    for(const block of config.split(/(?=^\[)/m)) {
      if(!/^\[(?:mcp_servers\.|plugins[.\]])/.test(block))continue;
      if(!block.includes('jev-ios-bridge'))continue;
      const values=[...block.matchAll(/"([^"\n]+)"/g)].map(match=>match[1]!);
      const script=values.find(value=>/\/dist\/mcp\/index\.js$/.test(value));
      const path=values.find(value=>isAbsolute(value)&&value.includes('jev-ios-bridge'));
      result.installs.push({source:'codex',version:script?packageVersion(resolve(script,'../../..')):path?packageVersion(path):null});
    }
  } catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')result.failures.push('install-discovery');}
  return result;
}
function hostChecks(host:HostInventory) {
  return [
    {name:'processes',passed:host.processes.length===0},
    {name:'open-handles',passed:host.handles.length===0},
    {name:'installs',passed:host.installs.every(install=>install.version!==null&&/^(?:1\.(?:[4-9]|[1-9]\d+)\.|[2-9]\d*\.)/.test(install.version))},
    {name:'discovery',passed:host.failures.length===0},
  ];
}
function preflight(raw: unknown, options: {root:string;mode:'test'|'production';defaultRoots:ImportTestOptions['defaultRoots'];host:()=>HostInventory}): PreflightReport {
  const host=options.host(),store=AdmissionSqlite.inspectMaintenance(options);
  const declaration=raw===undefined?store.migration?.declaration??{additionalJournalRoots:[],additionalLeaseRoots:[],excludedDevices:[]}:parseMigrationDeclaration(raw);
  let plan:Omit<ImportPlan,'declaration'>={sources:[],quarantines:[],actions:[],exclusions:[]};
  let sourceRefusal:PreflightReport['sourceRefusal'];
  try {
    plan=scan(declaration,options,true);
    for(const source of plan.sources) {
      if(store.importedSources.some(old=>old.path===source.path&&old.sha256!==source.sha256))sourceRefusal={code:'IMPORT_REFUSED',reason:'SOURCE_CONFLICT'};
    }
    for(const source of plan.sources)if(source.kind==='lease') {
      const record=leaseSchema.parse(source.evidence);
      try {process.kill(record.pid,0);sourceRefusal={code:'IMPORT_REFUSED',reason:'HOLDER_ALIVE'};}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')sourceRefusal={code:'IMPORT_REFUSED',reason:'HOLDER_ALIVE'};}
    }
  } catch(error) {
    if(!(error instanceof AdmissionError)||error.code!=='IMPORT_REFUSED'||!error.reason)throw error;
    sourceRefusal={code:'IMPORT_REFUSED',reason:error.reason};
  }
  const checks=[...hostChecks(host),
    {name:'guard',passed:store.guard===null},
    {name:'active-attempts',passed:store.activeAttempts.length===0},
    {name:'backups',passed:store.backups.every(backup=>backup.verified)},
    {name:'sources',passed:sourceRefusal===undefined},
  ];
  return {version:1,kind:'preflight',ready:checks.every(check=>check.passed),checks,host,store,
    leases:plan.sources.filter(source=>source.kind==='lease'),plannedQuarantines:plan.quarantines.filter(quarantine=>!store.importedSources.some(old=>old.path===quarantine.path&&old.sha256===quarantine.sha256)),...(sourceRefusal?{sourceRefusal}:{})};
}
export function preflightAdmissionForTesting(raw: unknown, options: Omit<ImportTestOptions,'checkpoint'>): PreflightReport {
  if(options.backend!=='fake')throw new AdmissionError('INVALID_REQUEST','Preflight tests require a fake backend');
  return preflight(raw,{...options,mode:'test',host:options.host??emptyHost});
}
export function preflightAdmission(raw?: unknown): PreflightReport {
  const root=admissionRoot();
  return preflight(raw,{root,mode:'production',defaultRoots:{leases:DEFAULT_LEASE_ROOT,journal:join(userInfo().homedir,'Library/Application Support/jev-ios-bridge/observed-actions')},host:()=>discoverAdmissionHost({root,home:userInfo().homedir,project:process.cwd()})});
}
export function requireCleanPreflight(report: PreflightReport): void {
  if(report.sourceRefusal)throw new AdmissionError('IMPORT_REFUSED','Legacy source import refused',report.sourceRefusal.reason);
  if(!report.ready)throw new AdmissionError('STATE_UNAVAILABLE','Activation preflight refused: '+report.checks.filter(check=>!check.passed).map(check=>check.name).join(', '));
}

export function requireMaintenanceRecoveryHost(options?: Pick<ImportTestOptions,'root'|'backend'|'host'>): void {
  if(options&&options.backend!=='fake')throw new AdmissionError('INVALID_REQUEST','Recovery tests require a fake backend');
  const host=options?(options.host??emptyHost)():discoverAdmissionHost({root:admissionRoot(),home:userInfo().homedir,project:process.cwd()});
  const failures=hostChecks(host).filter(check=>!check.passed);
  if(failures.length)throw new AdmissionError('STATE_UNAVAILABLE','Activation preflight refused: '+failures.map(check=>check.name).join(', '));
}
export function recoverImportAdmissionForTesting(raw:unknown,options:ImportTestOptions) {
  if(options.backend!=='fake')throw new AdmissionError('INVALID_REQUEST','Import tests require a fake backend');
  const declaration=parseMigrationDeclaration(raw);
  requireMaintenanceRecoveryHost(options);
  return AdmissionSqlite.recoverImport({root:options.root,mode:'test'},declaration,options.checkpoint);
}
export function recoverImportAdmission(raw:unknown) {
  const declaration=parseMigrationDeclaration(raw);
  requireMaintenanceRecoveryHost();
  return AdmissionSqlite.recoverImport({root:admissionRoot(),mode:'production'},declaration);
}

export function admissionStatusForTesting(options: Pick<ImportTestOptions,'root'|'backend'>) {
  if(options.backend!=='fake')throw new AdmissionError('INVALID_REQUEST','Status tests require a fake backend');
  return {version:1,kind:'admission-status',...AdmissionSqlite.inspectMaintenance({root:options.root,mode:'test'})};
}
export function admissionStatus() {
  return {version:1,kind:'admission-status',...AdmissionSqlite.inspectMaintenance({root:admissionRoot(),mode:'production'})};
}
