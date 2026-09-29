# Print selected attributes of uiautomator XML nodes. Usage: uia-nodes.py file.xml [filter-substring]
import re,sys
s=open(sys.argv[1]).read(); s=s[s.index('<?xml'):]
flt=sys.argv[2] if len(sys.argv)>2 else ''
for m in re.finditer(r'<node ([^>]*?)/?>', s):
    at=dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1)))
    line={k:at[k] for k in ('class','text','resource-id','content-desc','scrollable','password','bounds') if at.get(k) not in (None,'','false')}
    if flt in str(line): print(line)
