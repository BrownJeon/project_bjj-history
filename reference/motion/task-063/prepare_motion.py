"""Build continuous photo layers, skin weights and a contact-linked motion on M4.

No generative API or new assets. Hidden strips are locally texture-filled and
are explicitly not evidence of the unseen pose. Rive does the final rendering.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path.home()/'.local/share/bjj-rive/task-063'
OUT = ROOT/'mesh-motion'
ASSETS = OUT/'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
source = ROOT/'original.png'
assert hashlib.sha256(source.read_bytes()).hexdigest() == 'a6e99ea8eab51254a3d5f53127904d91c22733ef3f55a22d90752c4b9770435d'
im = Image.open(source).convert('RGBA')
W,H = im.size
arr = np.asarray(im)
rgb = arr[:,:,:3].astype(float)
yy,xx = np.mgrid[0:H,0:W]

def polygon(points):
    m=Image.new('L',(W,H));ImageDraw.Draw(m).polygon(points,fill=255)
    return np.asarray(m)>0

blue = (rgb[:,:,2]-rgb[:,:,0]>23)&(rgb[:,:,2]-rgb[:,:,1]>5)
blue |= polygon([(0,580),(310,570),(352,753),(321,899),(53,950),(0,875)])
blue |= polygon([(407,865),(549,882),(602,954),(581,1050),(452,1028)])
pushpoly=polygon([(358,834),(404,652),(430,589),(637,585),(737,607),(837,562),(901,462),(955,451),(984,485),(963,556),(911,643),(765,717),(630,762),(590,916),(536,1011),(442,940)])
pushskin=polygon([(723,642),(783,612),(827,591),(853,560),(880,522),(903,487),(927,465),(944,463),(956,480),(956,509),(946,552),(931,593),(911,635),(880,666),(841,683),(785,709),(737,724)])
hookskin=polygon([(621,901),(643,839),(671,798),(704,798),(731,822),(751,867),(746,912),(715,941),(667,942)])
handskin=polygon([(865,1059),(913,1022),(978,998),(1014,1002),(1036,1014),(1025,1028),(1044,1043),(1039,1055),(1050,1068),(1047,1081),(1029,1090),(1014,1100),(983,1113),(950,1115),(892,1126)])
warm=(rgb[:,:,0]-rgb[:,:,2]>25)&(rgb[:,:,1]-rgb[:,:,2]>8)&(rgb[:,:,0]>55)
pushskin &= warm
hookskin &= warm
handskin &= warm
blue |= pushskin|hookskin|handskin
armpoly=polygon([(145,890),(288,878),(376,957),(498,1030),(646,1064),(791,1048),(875,1029),(916,1005),(974,993),(1035,1000),(1064,1056),(1055,1090),(1000,1126),(938,1141),(898,1161),(867,1196),(736,1211),(572,1200),(420,1173),(291,1127),(211,1014)])
hookpoly=polygon([(433,935),(636,910),(744,900),(826,931),(952,996),(930,1105),(824,1178),(628,1143),(482,1050)])
support=polygon([(0,580),(312,570),(366,772),(600,832),(637,1000),(591,1220),(0,1240)])|pushpoly|armpoly|hookpoly|pushskin|hookskin|handskin
blue &= support
owner=np.zeros((H,W),dtype=np.uint8)
# Every source pixel belongs to one opaque owner before hidden-strip fills.
owner[(yy>=550)&(xx<830)]=1 # white far leg
owner[(yy>=550)&(xx>=830)]=2 # white near leg
owner[(yy<605)&(xx<590)]=0 # keep the standing character's fingertips together
owner[blue]=3
owner[blue&hookpoly]=4
owner[blue&pushpoly]=5
owner[hookskin]=6
owner[blue&armpoly]=7
owner[handskin]=7
# Belt tails belong to the torso. Do not let brown gi pixels masquerade as skin.
bluebelt=polygon([(405,855),(551,881),(600,946),(582,1052),(442,1034)])
owner[bluebelt&(rgb[:,:,0]>rgb[:,:,2]+15)&(rgb[:,:,0]>rgb[:,:,1]+8)]=3
whitebelt=polygon([(737,444),(1010,406),(1045,510),(923,582),(845,667),(738,632)])
owner[whitebelt&(~pushskin)&(~blue)&(rgb[:,:,0]>rgb[:,:,2]+15)]=0
names=['white_upper','white_far_leg','white_near_leg','blue_body','blue_hook_leg','blue_push_leg','blue_hook_foot','blue_grip_arm']
layers={}
for k,name in enumerate(names):
    alpha=np.where(owner==k,arr[:,:,3],0).astype(np.uint8)
    a=arr.copy();a[:,:,3]=alpha
    layers[name]=Image.fromarray(a)

def underfill(name,mask,box):
    """Clone only missing strips under existing foreground; keep originals above."""
    texture=im.crop(box).resize((W,H),Image.Resampling.BICUBIC)
    texture.putalpha(Image.fromarray((mask*255).astype('uint8')))
    texture.alpha_composite(layers[name]);layers[name]=texture

def cloth_capsule(name,points,width,texture_box):
    mask=Image.new('L',(W,H));draw=ImageDraw.Draw(mask)
    draw.line(points,fill=255,width=width,joint='curve')
    r=width/2
    for x,y in points:draw.ellipse((x-r,y-r,x+r,y+r),fill=255)
    underfill(name,np.asarray(mask)>0,texture_box)

# These small reconstructions are hidden in the uploaded pose, not new anatomy.
hip_back=polygon([(790,479),(973,477),(1044,578),(978,657),(852,633),(804,595)])
underfill('white_upper',pushskin&hip_back,(978,581,1056,721))
torso=polygon([(108,897),(326,847),(533,968),(544,1139),(371,1197),(157,1114)])
underfill('blue_body',((owner==7)|(owner==5))&torso,(197,952,351,1104))
far_mask=Image.new('L',(W,H));d=ImageDraw.Draw(far_mask)
d.line([(852,552),(657,692)],fill=255,width=106)
d.line([(657,692),(679,895)],fill=255,width=76)
for x,y,r in [(852,552,53),(657,692,49),(679,895,38)]:d.ellipse((x-r,y-r,x+r,y+r),fill=255)
underfill('white_far_leg',np.asarray(far_mask)>0,(618,759,697,846))
ankle_mask=Image.new('L',(W,H));d=ImageDraw.Draw(ankle_mask)
d.line([(1010,1000),(1000,1137)],fill=255,width=56)
d.ellipse((978,1110,1039,1170),fill=255)
underfill('white_near_leg',(np.asarray(ankle_mask)>0)&handskin,(1034,1104,1051,1146))

# Continuous cloth beneath photographed occlusions prevents holes opening at
# waist, shoulder and knee. These are derived texture reconstructions.
cloth_capsule('white_near_leg',[(949,567),(1001,794)],143,(965,623,1035,785))
cloth_capsule('white_near_leg',[(1001,794),(1007,1001)],96,(990,790,1055,949))
cloth_capsule('white_far_leg',[(852,552),(657,692),(679,895)],91,(619,758,698,847))
cloth_capsule('blue_push_leg',[(495,990),(482,660)],155,(427,639,610,720))
cloth_capsule('blue_push_leg',[(482,660),(722,677)],133,(489,628,666,715))
cloth_capsule('blue_hook_leg',[(495,990),(762,1040),(665,925)],137,(677,982,820,1030))
underfill('blue_body',polygon([(98,860),(315,817),(523,914),(608,1024),(473,1190),(224,1176),(85,1051)]),(177,928,351,1107))
pelvis=Image.new('L',(W,H));ImageDraw.Draw(pelvis).ellipse((772,472,1034,660),fill=255)
underfill('white_upper',np.asarray(pelvis)>0,(972,615,1047,753))

# Rest points are estimated from visible features; occluded hook knee is inferred.
pts={
 'bh':(495,990),'bs':(245,955),'bn':(210,855),'bhead':(220,768),
 'bpk':(482,660),'bpa':(738,677),'bpc':(915,520),
 'bhk':(762,1040),'bha':(665,925),'bhc':(690,870),
 'be':(545,1145),'bw':(887,1094),'bc':(998,1049),
 'wh':(900,540),'wc':(823,300),'wn':(769,246),'whead':(666,179),
 'wls':(710,300),'wle':(510,383),'wlw':(344,453),
 'wrs':(982,267),'wre':(1081,350),'wrw':(1147,461),
 'wnh':(949,567),'wnk':(1001,794),'wna':(1007,1040),'wnt':(963,1193),
 'wfh':(852,552),'wfk':(657,692),'wfa':(679,895),
}
pts={k:np.array(v,dtype=float) for k,v in pts.items()}
definitions={
 'blue_spine':('bh','bs'),'blue_head':('bn','bhead'),
 'blue_push_thigh':('bh','bpk'),'blue_push_shin':('bpk','bpa'),'blue_push_foot':('bpa','bpc'),
 'blue_hook_thigh':('bh','bhk'),'blue_hook_shin':('bhk','bha'),'blue_hook_foot':('bha','bhc'),
 'blue_upper_arm':('bs','be'),'blue_forearm':('be','bw'),'blue_hand':('bw','bc'),
 'white_spine':('wh','wc'),'white_head':('wn','whead'),
 'white_upper_l':('wls','wle'),'white_fore_l':('wle','wlw'),
 'white_upper_r':('wrs','wre'),'white_fore_r':('wre','wrw'),
 'white_near_thigh':('wnh','wnk'),'white_near_shin':('wnk','wna'),'white_near_foot':('wna','wnt'),
 'white_far_thigh':('wfh','wfk'),'white_far_shin':('wfk','wfa'),
}

def angle(v):return math.atan2(v[1],v[0])
def rot(a):return np.array([[math.cos(a),-math.sin(a)],[math.sin(a),math.cos(a)]])
def smooth(v):v=np.clip(v,0,1);return v*v*v*(v*(v*6-15)+10)
def phase(t,a,b):return float(smooth((t-a)/(b-a)))
def mix(a,b,u):return np.array(a)*(1-u)+np.array(b)*u
def rigid(p,origin,target,r):return np.asarray(target)+rot(r)@(p-origin)
def ik(h,a,l1,l2,sign):
    v=a-h;distance=np.linalg.norm(v);d=float(np.clip(distance,abs(l1-l2)+.01,l1+l2-.00001));n=v/max(distance,.00001)
    along=(l1*l1-l2*l2+d*d)/(2*d);height=math.sqrt(max(0,l1*l1-along*along))
    return h+along*n+sign*height*np.array([-n[1],n[0]])
def soft_reachable(h,a,length,beta=8):
    v=a-h;d=np.linalg.norm(v)
    safe=length-beta*float(np.logaddexp(0,(length-d)/beta))
    return h+v/max(d,.001)*max(.01,safe)
def lens(*keys):return [float(np.linalg.norm(pts[b]-pts[a])) for a,b in zip(keys,keys[1:])]
def bone(a,b):
    v=b-a;return {'x':float(a[0]),'y':float(a[1]),'rotation':angle(v),'length':float(np.linalg.norm(v))}

rest={name:bone(pts[a],pts[b]) for name,(a,b) in definitions.items()}
BP=lens('bh','bpk','bpa');BH=lens('bh','bhk','bha');BA=lens('bs','be','bw')
WN=lens('wnh','wnk','wna');WF=lens('wfh','wfk','wfa')

def pose(t):
    load=phase(t,.55,1.6);push=phase(t,1.55,3.65);fall=phase(t,3.1,5.5);settle=phase(t,5.4,6.35);follow=phase(t,5.7,7.5)
    # Hip initially rises a little as the near leg straightens, then falls.
    wh=pts['wh']+np.array([118*push+182*fall, -35*push+597*fall])
    wr=math.radians(-2*load+31*push+51*fall-2*settle)
    wna=pts['wna']+np.array([-49*push-77*fall, -15*push+48*fall])
    nh=rigid(pts['wnh'],pts['wh'],wh,wr)
    # Projected knee changes side through an actually straight leg, not a pop.
    switch=phase(t,1.55,5.5)
    pin=math.exp(-((switch-.36)/.115)**4)
    v=nh-wna;d=np.linalg.norm(v);targetd=d+(sum(WN)-d)*pin
    corrected=wna+v/max(d,.01)*min(targetd,sum(WN)-.00001)
    wh+=corrected-nh;nh=corrected
    nsign=-1 if switch<.36 else 1
    nk=ik(nh,wna,*WN,nsign)
    fh=rigid(pts['wfh'],pts['wh'],wh,wr)
    wfa=pts['wfa']+np.array([-38*push+352*fall, 8*push+30*fall])
    wfa=soft_reachable(fh,wfa,sum(WF))
    fk=ik(fh,wfa,*WF,1)
    bh=pts['bh']+np.array([-12*load+17*push+60*follow, 8*load+4*fall-17*follow])
    br=math.radians(-1*load+4*push+19*follow)
    bs=rigid(pts['bs'],pts['bh'],bh,br)
    bn=rigid(pts['bn'],pts['bh'],bh,br)
    bpc=rigid(pts['bpc'],pts['wh'],wh,wr)
    # Hip contact releases gently after landing, avoiding a forced knee twist.
    release=phase(t,5.5,6.6)
    bpc=mix(bpc,bh+np.array([483,-130]),release*.25)
    foot_delta=wr*(1-release*.3)
    bpa=bpc-rot(foot_delta)@(pts['bpc']-pts['bpa'])
    bpk=ik(bh,bpa,*BP,-1)
    shin_delta=angle(wna-nk)-rest['white_near_shin']['rotation']
    # Grip follows the ankle during force application and settles after landing.
    bc=wna+(pts['bc']-pts['wna'])
    bw=bc-rot(shin_delta)@(pts['bc']-pts['bw'])
    be=ik(bs,bw,*BA,1)
    hookrel=phase(t,3.6,5.5)
    bhc=mix(wfa+(pts['bhc']-pts['wfa']),bh+np.array([240,-80]),hookrel)
    bhd=br+math.radians(7)*push
    bha=bhc-rot(bhd)@(pts['bhc']-pts['bha'])
    bhk=ik(bh,bha,*BH,1)
    p={
      'bh':bh,'bs':bs,'bn':bn,'bhead':bn+rot(br*.82)@(pts['bhead']-pts['bn']),
      'bpk':bpk,'bpa':bpa,'bpc':bpc,'bhk':bhk,'bha':bha,'bhc':bhc,
      'be':be,'bw':bw,'bc':bc,'wh':wh,'wc':rigid(pts['wc'],pts['wh'],wh,wr),
      'wn':rigid(pts['wn'],pts['wh'],wh,wr),'wnh':nh,'wnk':nk,'wna':wna,
      'wnt':wna+rot(shin_delta*.82)@(pts['wnt']-pts['wna']),
      'wfh':fh,'wfk':fk,'wfa':wfa,
    }
    p['whead']=p['wn']+rot(wr-math.radians(7)*fall)@(pts['whead']-pts['wn'])
    # Arms lag the trunk slightly, then open for the receiving fall.
    arm_lag=math.radians(13)*phase(t,3.2,5.3)
    for side in ['l','r']:
        s='w'+side+'s';e='w'+side+'e';w='w'+side+'w'
        p[s]=rigid(pts[s],pts['wh'],wh,wr)
        a=wr-arm_lag if side=='l' else wr+arm_lag*.45
        p[e]=p[s]+rot(a)@(pts[e]-pts[s])
        p[w]=p[e]+rot(a-math.radians(6)*fall)@(pts[w]-pts[e])
    return {name:bone(p[a],p[b]) for name,(a,b) in definitions.items()},p

groups={
 'blue_body':['blue_spine','blue_head'],
 'blue_hook_leg':['blue_hook_thigh','blue_hook_shin'],
 'blue_hook_foot':['blue_hook_shin','blue_hook_foot'],
 'blue_push_leg':['blue_push_thigh','blue_push_shin','blue_push_foot','blue_spine'],
 'blue_grip_arm':['blue_upper_arm','blue_forearm','blue_hand','blue_spine'],
 'white_upper':['white_spine','white_head','white_upper_l','white_fore_l','white_upper_r','white_fore_r'],
 'white_near_leg':['white_near_thigh','white_near_shin','white_near_foot','white_spine'],
 'white_far_leg':['white_far_thigh','white_far_shin','white_spine'],
}

def weights(x,y,names):
    point=np.array([x,y],float);dist=[]
    for name in names:
        a,b=definitions[name];v=pts[b]-pts[a];u=np.clip(np.dot(point-pts[a],v)/max(1,np.dot(v,v)),0,1)
        dist.append(float(np.linalg.norm(point-(pts[a]+u*v))))
    w=1/(np.array(dist)**2+23**2)**2
    if names in [groups['white_near_leg'],groups['white_far_leg']]:
        rigid_hip=float(smooth((690-y)/95))
        idx=names.index('white_spine');w/=max(float(w.sum()),1e-12);w*=1-rigid_hip;w[idx]+=rigid_hip
    if names==groups['blue_push_leg']:
        body=float(smooth((y-885)/110));idx=names.index('blue_spine')
        w/=max(float(w.sum()),1e-12);w*=1-body;w[idx]+=body
    if names==groups['blue_grip_arm'] and x>865:
        hand=float(smooth((x-850)/40));idx=names.index('blue_hand')
        w/=max(float(w.sum()),1e-12);w*=1-hand;w[idx]+=hand
    # Keep faces effectively rigid, with a blended band at the neck.
    if names==groups['blue_body']:
        head=float(smooth((897-y)/72));w=np.array([1-head,head])
    if names==groups['white_upper'] and y<260 and x<835:
        head=float(smooth((285-y)/45));idx=names.index('white_head');w*=1-head;w[idx]+=head*max(.001,float(w.sum()))*100
    order=np.argsort(w)[-4:];s=float(w[order].sum())
    return {names[i]:float(w[i]/s) for i in order if w[i]/s>1e-6}

front_to_back=['blue_grip_arm','blue_push_leg','blue_hook_foot','white_upper','white_near_leg','blue_body','white_far_leg','blue_hook_leg']
spec={'width':1760,'height':1320,'fps':30,'duration_frames':240,'background':'FF15171E','bones':[dict(name=n,**v) for n,v in rest.items()],'layers':[],'frames':[]}
layer_manifest={}
for name in front_to_back:
    img=layers[name];file=ASSETS/(name+'.png');img.save(file)
    bounds=img.getbbox();x0,y0,x1,y1=bounds
    xs=np.linspace(max(0,x0-2),min(W,x1+2),max(3,math.ceil((x1-x0)/27)+1))
    ys=np.linspace(max(0,y0-2),min(H,y1+2),max(3,math.ceil((y1-y0)/27)+1))
    vertices=[{'x':float(x),'y':float(y),'u':float(x/W),'v':float(y/H),'weights':weights(x,y,groups[name])} for y in ys for x in xs]
    triangles=[];nx=len(xs)
    for j in range(len(ys)-1):
        for i in range(nx-1):
            a=j*nx+i;b=a+1;c=a+nx;d=c+1
            triangles.extend([[a,b,c],[b,d,c]])
    spec['layers'].append({'name':name,'file':str(file),'vertices':vertices,'triangles':triangles})
    layer_manifest[name]={'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bounds':bounds,'vertices':len(vertices),'triangles':len(triangles)}

maximum=0;previous=None;reach=0;contacts=[]
for f in range(241):
    t=f/30
    if f==0:bp={n:dict(v) for n,v in rest.items()};p=pts
    else:bp,p=pose(t)
    if previous:
        for n,b in bp.items():
            a=b['rotation'];old=previous[n]['rotation']
            while a-old>math.pi:a-=2*math.pi
            while a-old<-math.pi:a+=2*math.pi
            b['rotation']=a;maximum=max(maximum,abs(a-old))
    spec['frames'].append({'frame':f,'bones':bp});previous=bp
    for n,b in bp.items():reach=max(reach,abs(b['length']-rest[n]['length']))
    if f in [0,45,90,135,180,240]:contacts.append({'frame':f,'near_ankle':p['wna'].tolist(),'hip_foot':p['bpc'].tolist(),'white_hip':p['wh'].tolist()})

(OUT/'poses.json').write_text(json.dumps(spec,separators=(',',':'))+'\n')
rebuild=Image.new('RGBA',(W,H))
for name in reversed(front_to_back):rebuild.alpha_composite(layers[name])
back=Image.new('RGBA',(W,H),'#15171e');back.alpha_composite(rebuild);back.convert('RGB').save(OUT/'rest-reconstruction.png')
atlas=Image.new('RGB',(1600,900),'#15171e');draw=ImageDraw.Draw(atlas)
for idx,name in enumerate(front_to_back):
    pic=layers[name].copy();pic.thumbnail((390,405));tile=Image.new('RGBA',(400,450),'#242933');tile.alpha_composite(pic,((400-pic.width)//2,30+(405-pic.height)//2))
    atlas.paste(tile.convert('RGB'),((idx%4)*400,(idx//4)*450));draw.text(((idx%4)*400+12,(idx//4)*450+8),name,fill='white')
atlas.save(OUT/'layers-atlas.png')
receipt={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'layers':layer_manifest,'bones':len(rest),'max_adjacent_rotation_rad':maximum,'max_segment_length_delta_px':reach,'contact_samples':contacts,'hidden_texture_fills':['far white leg behind blue leg','white hip strip behind pushing foot','white ankle behind gripping hand','blue torso behind upper arm'],'representation':'continuous native mesh, LBS weights; photographed front surfaces only'}
(OUT/'preparation-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['layers','contact_samples']},indent=2),flush=True)
