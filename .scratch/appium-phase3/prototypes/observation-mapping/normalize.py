"""Throwaway candidate normalization. Unobserved mappings remain proposals."""
import json,sys,xml.etree.ElementTree as ET

def normalize(xml,platform):
 root=ET.fromstring(xml)
 if platform=='ios':
  roles={'Application':'application','Window':'window','Button':'button','Key':'keyboard-key','TextField':'text-field','SecureTextField':'text-field','TextView':'text-field','Menu':'menu','StaticText':'text','Image':'image','Switch':'switch','Slider':'slider','Cell':'cell','ScrollView':'scroll-view','Table':'list','CollectionView':'list','Tab':'tab'}
  rows=[]
  for n in root.iter():
   a=n.attrib
   if not a.get('type','').startswith('XCUIElementType'):continue
   kind=a['type'].removeprefix('XCUIElementType');role=roles.get(kind,'other')
   state={k:a[k]=='true' for k in ['enabled','visible','focused','selected'] if k in a}
   row={'ref':f'p{len(rows)+1}','role':role,'actions':[],'state':state,'frame':{k:float(a.get(k,0)) for k in ['x','y','width','height']}}
   for k in ['label','value','placeholder']:
    if a.get(k):row[k]=a[k]
   if a.get('name'):row['identifier']=a['name']
   if role in ['button','switch','text-field','cell','tab']:row['actions'].append('tap')
   if role=='text-field':row['actions'].append('typeText')
   if role in ['scroll-view','list']:row['actions'].append('swipeWithin')
   rows.append(row)
  return rows
 def node(n):
  import re
  a=n.attrib;bounds=list(map(int,re.findall(r'-?\d+',a.get('bounds','[0,0][0,0]'))));x,y,r,b=bounds
  d={k:a[k] for k in ['class','text','hint','content-desc','resource-id'] if k in a}
  for k in ['checkable','checked','clickable','enabled','focused','selected','scrollable','password']:
   if k in a:d[k]=a[k]=='true'
  if 'displayed' in a:d['visible']=a['displayed']=='true'
  d['rect']={'x':x,'y':y,'width':r-x,'height':b-y};d['children']=[node(c) for c in n];return d
 return {'hierarchy':[node(n) for n in root]}
if __name__=='__main__':
 print(json.dumps(normalize(open(sys.argv[2]).read(),sys.argv[1]),indent=2))
