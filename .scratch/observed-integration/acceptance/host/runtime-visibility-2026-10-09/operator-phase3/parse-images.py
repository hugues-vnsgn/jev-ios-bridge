import os, sys, json, plistlib, hashlib, datetime, stat, re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
EXPECTED_CWD = '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic'
INPUT = '/Library/Developer/CoreSimulator/Images/images.plist'
if os.getcwd() != EXPECTED_CWD or len(sys.argv) != 2 or sys.argv[1] != INPUT:
    raise RuntimeError('Guard rejected cwd/argv')
if any(k in os.environ for k in ('TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT')):
    raise RuntimeError('Guard rejected inherited key/loader environment')
LIMIT=1024*1024
sensitive=re.compile(r'token|secret|credential|password|passphrase|auth|api[-_]?key|cookie|session|bearer|private[-_]?key',re.I)
trace=[]
def info(s):
    return dict(type='symlink' if stat.S_ISLNK(s.st_mode) else 'directory' if stat.S_ISDIR(s.st_mode) else 'file' if stat.S_ISREG(s.st_mode) else 'other',uid=s.st_uid,gid=s.st_gid,mode='0'+oct(s.st_mode&0o7777)[2:],nlink=s.st_nlink,size=s.st_size,dev=s.st_dev,ino=s.st_ino,mtimeNs=s.st_mtime_ns,ctimeNs=s.st_ctime_ns)
def stamp(s):
    return (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_mode,s.st_uid,s.st_gid,s.st_nlink)
def string_redact(v):
    if '://' in v:
        try:
            p=urlsplit(v); pairs=parse_qsl(p.query,keep_blank_values=True)
            changed=bool(p.username or p.password) or any(sensitive.search(k) for k,_ in pairs)
            if changed:
                netloc=p.netloc.rsplit('@',1)[-1]
                return urlunsplit((p.scheme,netloc,p.path,urlencode([(k,'REDACTED' if sensitive.search(k) else x) for k,x in pairs]),p.fragment))
        except Exception:
            pass
    return re.sub(r'(Bearer\s+)[A-Za-z0-9._~+/=-]+',r'\1<REDACTED>',v,flags=re.I)
def sanitize(v):
    if isinstance(v,dict):
        return {str(k):'<REDACTED>' if sensitive.search(str(k)) else sanitize(x) for k,x in v.items()}
    if isinstance(v,(list,tuple)):
        return [sanitize(x) for x in v]
    if isinstance(v,plistlib.UID):
        return {'$type':'plistlib.UID','value':v.data}
    if isinstance(v,datetime.datetime):
        return {'$type':'datetime','iso':v.isoformat(),'timezoneDeclared':v.tzinfo is not None}
    if isinstance(v,bytes):
        return {'$type':'data','byteCount':len(v),'sha256':hashlib.sha256(v).hexdigest()}
    if isinstance(v,str):
        return string_redact(v)
    if v is None or isinstance(v,(bool,int,float)):
        return v
    raise TypeError('Unexpected plist value type: '+type(v).__name__)
def verify_chain():
    cur=''
    for component in INPUT.split('/'):
        if not component:
            continue
        cur += '/'+component
        s=os.lstat(cur); trace.append(dict(method='lstat-chain',path=cur,**info(s)))
        if stat.S_ISLNK(s.st_mode) or (cur != INPUT and not stat.S_ISDIR(s.st_mode)):
            raise RuntimeError('Uncertain or symbolic-link input chain: '+cur)
def read_stable():
    verify_chain()
    before=os.lstat(INPUT)
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > LIMIT:
        raise RuntimeError('Unsafe type/link count or input size cap')
    fd=os.open(INPUT,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        opened=os.fstat(fd)
        if stamp(before) != stamp(opened):
            raise RuntimeError('Input replaced at open')
        chunks=[]; size=0
        while True:
            b=os.read(fd,65536)
            if not b:
                break
            size+=len(b)
            if size > LIMIT:
                raise RuntimeError('Input read exceeds1MiB')
            chunks.append(b)
        final=os.fstat(fd); after=os.lstat(INPUT)
        if stamp(before)!=stamp(final) or stamp(before)!=stamp(after):
            raise RuntimeError('Input changed while read')
        data=b''.join(chunks)
        record=dict(path=INPUT,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),before=info(before),opened=info(opened),finalHandle=info(final),after=info(after),openFlags=os.O_RDONLY|os.O_NOFOLLOW)
        trace.append(dict(method='stable-read-hash',**record))
        return data,record,stamp(before)
    finally:
        os.close(fd)
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
result=dict(schemaVersion=1,input=INPUT,cwd=os.getcwd(),startedAt=started,pythonVersion=sys.version,parser='Python standard-library plistlib.loads',trace=trace)
code=0
try:
    data,before,before_stamp=read_stable(); result['before']=before
    value=None; parse_exception=None
    try:
        value=plistlib.loads(data)
    except Exception as e:
        parse_exception=dict(type=type(e).__name__,module=type(e).__module__,message=string_redact(str(e)),args=sanitize(list(e.args)))
    after_data,after,after_stamp=read_stable(); result['after']=after
    result['stableAcrossParse']=before_stamp==after_stamp and data==after_data
    if not result['stableAcrossParse']:
        raise RuntimeError('Input changed across parse')
    if parse_exception:
        result.update(status='PARSE_FAILED',parsingException=parse_exception); code=3
    else:
        result.update(status='PARSED_STABLE',sanitizedValue=sanitize(value),parsingException=None)
except Exception as e:
    result.update(status='BOUNDED_STOP',exception=dict(type=type(e).__name__,module=type(e).__module__,message=string_redact(str(e)),errno=getattr(e,'errno',None))); code=2
result['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
result['redaction']='Recursive credential/token/auth/session keys and URL credentials redacted; datetime/UID/data types preserved as tags; data bytes never stored.'
print(json.dumps(result,indent=2,allow_nan=False))
sys.exit(code)
