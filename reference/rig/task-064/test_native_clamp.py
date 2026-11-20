"""M4 native-runtime proof: over-limit request must render as the limit pose."""
from pathlib import Path
import hashlib,json,math,os,subprocess,xml.etree.ElementTree as E
from PIL import Image,ImageChops

ROOT=Path.home()/'.local/share/bjj-rive';OUT=ROOT/'task-064/clamp-proof';PROJECT=OUT/'project'
PROJECT.mkdir(parents=True,exist_ok=True)
r=E.Element('Rive',{'version':'1','kind':'fragment'});counter=0
def add(parent,kind,**attrs):
    global counter
    counter+=1
    return E.SubElement(parent,kind,{k:str(v).lower() if isinstance(v,bool) else str(v) for k,v in dict(id='0:'+str(counter),**attrs).items()})
def rect(parent,x,width,height,color):
    shape=add(parent,'Shape',x=x,y=0)
    add(shape,'Rectangle',width=width,height=height,cornerRadiusTL=height/2)
    fill=add(shape,'Fill');add(fill,'SolidColor',colorValue=color)
for name,angle,constrained in [('RequestedBeyond',-2.5,True),('ReferenceLimit',-1.4,True),('NoLimit',-2.5,False)]:
    board=add(r,'Artboard',name=name,width=400,height=400)
    style=add(board,'LayoutComponentStyle');board.set('styleId',style.get('id'))
    upper=add(board,'RootBone',name='upper',x=160,y=125,length=100,rotation=.8)
    fore=add(upper,'Bone',name='forearm',length=110,rotation=angle)
    if constrained:add(fore,'RotationConstraint',name='elbow_bounds',doesCopy=False,min=True,max=True,minValue=-1.4,maxValue=0,minMaxSpaceValue='local',strength=1)
    rect(upper,50,110,28,'FF245CA8');rect(fore,55,120,24,'FF37B9CE')
    marker=add(fore,'Shape',x=110,y=0);add(marker,'Ellipse',width=18,height=18);fill=add(marker,'Fill');add(fill,'SolidColor',colorValue='FFFFC870')
    fill=add(board,'Fill');add(fill,'SolidColor',colorValue='FF15171E')
E.indent(r,space='  ');(PROJECT/'scene.rml').write_text('<?xml version="1.0" encoding="utf-8"?>\n'+E.tostring(r,encoding='unicode'))
(PROJECT/'rive.yaml').write_text('name: bjj-native-clamp-proof\nmain: RequestedBeyond\n')
env=dict(os.environ,RIVE_HOME=str(ROOT/'tools'),RIVE_ANALYTICS='off',DO_NOT_TRACK='1',CI='1');cli=str(ROOT/'tools/bin/rive')
verify=subprocess.run([cli,str(PROJECT),'--verify','--format=json'],env=env,text=True,capture_output=True)
(OUT/'verify.json').write_text(verify.stdout);assert verify.returncode==0,verify.stdout+verify.stderr
for board in ['RequestedBeyond','ReferenceLimit','NoLimit']:
    result=subprocess.run([cli,str(PROJECT),'--commands','--artboard='+board,'--viewport=400x400','--fit=contain'],env=env,input='advance 1\nscreenshot '+str(OUT/(board+'.png'))+'\nquit\n',text=True,capture_output=True)
    assert result.returncode==0 and '\nerr ' not in result.stdout,result.stdout+result.stderr
images={n:Image.open(OUT/(n+'.png')).convert('RGBA') for n in ['RequestedBeyond','ReferenceLimit','NoLimit']}
same=images['RequestedBeyond'].tobytes()==images['ReferenceLimit'].tobytes()
different=images['RequestedBeyond'].tobytes()!=images['NoLimit'].tobytes()
report={'engine':'Rive CLI 1.9.2 actual M4 render','parent_rotation_radians':.8,'requested_local_rotation_radians':-2.5,'lower_local_limit_radians':-1.4,'upper_local_limit_radians':0,'native_constraint':'RotationConstraint, local min/max, strength 1, no target/copy','beyond_limit_pixels_equal_reference_limit':same,'beyond_limit_pixels_differ_from_unconstrained':different,'images':{n:hashlib.sha256((OUT/(n+'.png')).read_bytes()).hexdigest() for n in images}}
(OUT/'clamp-receipt.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2),flush=True)
assert same and different,'Native local rotation limit proof failed'
