"""Prepare source-sheet textures and continuous limb meshes on the existing M4.
No generative image/model call. This is a local character-skin asset pipeline.
"""
from pathlib import Path
import json,math,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageFont
BASE=Path.home()/'.local/share/bjj-rive/task-064'
HERE=Path.home()/'.local/share/bjj-rive/task-065/white-character';OUT=HERE/'project';ASSETS=OUT/'assets';ASSETS.mkdir(parents=True,exist_ok=True)
source_path=HERE/'source/white-gi-brown-belt.png'
assert hashlib.sha256(source_path.read_bytes()).hexdigest()=='ab83010155438952c6a9bb211f35bb283880201553b2f52f090d5e62d0b2d271'
source=Image.open(source_path).convert('RGBA')
timeline=json.loads((BASE/'project/timeline.json').read_text());rest=timeline['frames'][0]['bones']
profile=json.loads((BASE/'rig_profile.json').read_text());specs={b['name']:b for b in profile['bones']}

def world(bone,u,v):
 b=rest[bone];a=b['world_rotation_rad'];c,s=math.cos(a),math.sin(a)
 return [b['origin'][0]+u*c-v*s,b['origin'][1]+u*s+v*c]
def frame_for(bone,point):
 b=rest[bone];a=b['world_rotation_rad'];c,s=math.cos(a),math.sin(a);dx=point[0]-b['origin'][0];dy=point[1]-b['origin'][1]
 return [c*dx+s*dy,-s*dx+c*dy]
def mesh(bbox,mapper,spacing=10):
 x0,y0,x1,y1=bbox;nx=math.ceil((x1-x0)/spacing)+1;ny=math.ceil((y1-y0)/spacing)+1
 vs=[];tris=[]
 for j in range(ny):
  y=y0+(y1-y0)*j/(ny-1)
  for i in range(nx):
   x=x0+(x1-x0)*i/(nx-1);pos,w=mapper(x,y)
   vs.append({'x':pos[0],'y':pos[1],'u':i/(nx-1),'v':j/(ny-1),'weights':w})
 for j in range(ny-1):
  for i in range(nx-1):
   a=j*nx+i;tris += [[a,a+1,a+nx],[a+1,a+nx+1,a+nx]]
 return vs,tris

def texture(name,bbox,polygon,kind='blue',reconstruct=False):
 x0,y0,x1,y1=bbox;crop=source.crop(bbox);mask=Image.new('L',crop.size);ImageDraw.Draw(mask).polygon([(x-x0,y-y0) for x,y in polygon],fill=255)
 if reconstruct:
  # Fill only surfaces hidden by the sleeve using cotton/belt pixels from this
  # same approved sheet. The visible collar, side silhouette and belt tail stay.
  p=crop.load()
  for y in range(max(y0,310),min(y1,547)):
   for x in range(max(x0,712),min(x1,806)):
    if y<452:
     sx=242+int((x-712)/94*24);sy=310+int((y-310)/142*135)
    elif y<480:sx=238+int((x-712)/94*30);sy=455+int((y-452)/28*20)
    else:sx=287+int((x-712)/94*28);sy=485+int((y-480)/67*56)
    p[x-x0,y-y0]=source.getpixel((sx,sy))
 if name.startswith('leg-'):
  # The approved side sheet's hanging hand overlaps the upper trouser.
  # Reconstruct that hidden cotton before skinning; do not retain finger
  # outlines in either duplicated leg texture.
  patch=Image.new('L',crop.size)
  ImageDraw.Draw(patch).polygon([(x-x0,y-y0) for x,y in [(760,535),(801,532),(817,556),(819,589),(811,619),(762,619),(759,588)]],fill=255)
  patch=patch.filter(ImageFilter.GaussianBlur(2.2));arr=np.asarray(crop).copy().astype(float);mix=np.asarray(patch).astype(float)/255
  for yy in range(crop.height):
   sy=yy+y0
   for xx in range(crop.width):
    if mix[yy,xx]>0:
     sx=737+int((xx+x0-760)*.23)
     sample=np.array(source.getpixel((sx,sy)),dtype=float)
     arr[yy,xx]=arr[yy,xx]*(1-mix[yy,xx])+sample*mix[yy,xx]
  crop=Image.fromarray(np.clip(arr,0,255).astype('uint8'),'RGBA')
 a=np.asarray(crop).copy();alpha=np.asarray(mask).copy();rgb=a[:,:,:3].astype(float)
 if kind=='skin':
  keep=(rgb[:,:,0]>rgb[:,:,1]+9)&(rgb[:,:,0]>rgb[:,:,2]+15)
  alpha=np.where(keep,alpha,0).astype('uint8')
 else:
  # White cotton is NOT chroma keyed. A traced contour retains the garment;
  # remove only sheet-coloured background reachable from outside that contour.
  from collections import deque
  bg=np.asarray(source)[y0:y1,685:686,:3].astype(float)
  threshold=12 if kind=='head' else 5
  eligible=(np.max(np.abs(rgb-bg),axis=2)<threshold)|(alpha==0)
  if kind in ('blue','cloth'):
   # Protect the complete white fabric interior even when its colour matches
   # the sheet. Flood removal is confined to the traced edge band.
   interior=np.asarray(mask.filter(ImageFilter.MinFilter(9)))>250
   eligible[interior]=False
  seen=np.zeros(alpha.shape,dtype=bool);q=deque();h,w=alpha.shape
  for yy in range(h):
   for xx in range(w):
    if eligible[yy,xx] and (xx in (0,w-1) or yy in (0,h-1) or alpha[yy,xx]==0):seen[yy,xx]=1;q.append((xx,yy))
  while q:
   xx,yy=q.popleft()
   for xn,yn in [(xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)]:
    if 0<=xn<w and 0<=yn<h and eligible[yn,xn] and not seen[yn,xn]:seen[yn,xn]=1;q.append((xn,yn))
  alpha[seen]=0
  if kind in ('blue','cloth'):
   # Reject exposed skin remnants after hidden sleeve/hand cotton repair.
   skin=(rgb[:,:,0]>rgb[:,:,1]+9)&(rgb[:,:,0]>rgb[:,:,2]+15)
   yy,xx=np.indices(alpha.shape);sx=xx+x0;sy=yy+y0
   belt_zone=(((sy>=451)&(sy<=484))|((sx>=825)&(sy>=453))) if kind=='blue' else np.zeros(alpha.shape,dtype=bool)
   alpha[skin&~belt_zone]=0
 crop.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(.27)))
 file=ASSETS/(name+'.png');crop.save(file)
 return file,crop
layers=[];thumbs=[]
def layer(name,bbox,poly,mapper,order,kind='blue',reconstruct=False):
 path,im=texture(name,bbox,poly,kind,reconstruct);vs,tris=mesh(bbox,mapper,8 if 'head' not in name else 14)
 layers.append({'name':name,'file':'assets/'+path.name,'width':im.width,'height':im.height,'vertices':vs,'triangles':tris,'order':order,'source_bbox':bbox,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()});thumbs.append((name,im))

def limb_map(side,chain,y,xs,widths,segments):
 # Map one contiguous garment surface into the unchanged rig's bind pose.
 # Shoulder/knee blending removes rigid cut seams; both ends retain one bone.
 def fn(x,sy):
  k=min(len(y)-2,max(0,next((i for i in range(len(y)-1) if sy<=y[i+1]),len(y)-2)))
  t=(sy-y[k])/(y[k+1]-y[k]);cx=xs[k]+t*(xs[k+1]-xs[k]);width=widths[k]+t*(widths[k+1]-widths[k]);bone=chain[k]+'_'+side
  length=specs[bone]['length'];u=t*length;v=-(x-cx)*width
  p=world(bone,u,v)
  # Smooth only a short neighborhood of the hinge, using a valid normalized
  # two-bone weight. Geometric rest points are continuous on the hinge line.
  hinge=y[1];span=22 if chain[0]=='upper_arm' else 26
  blend=max(0.,min(1.,(sy-(hinge-span))/(2*span)))
  w={chain[0]+'_'+side:1-blend,chain[1]+'_'+side:blend}
  return p,{n:v for n,v in w.items() if v>1e-8}
 return fn
legpoly=[(713,546),(820,546),(818,579),(814,612),(808,644),(800,677),(792,715),(787,761),(789,813),(788,885),(720,887),(717,849),(716,810),(714,766),(719,724),(724,678),(724,628),(721,586)]
sleevepoly=[(733,298),(754,301),(771,317),(777,347),(784,382),(794,422),(799,454),(805,489),(809,520),(755,533),(745,508),(737,475),(728,439),(718,403),(710,371),(705,340),(713,314)]
handpoly=[(772,516),(792,514),(800,536),(806,556),(808,575),(803,598),(798,605),(793,604),(792,583),(789,607),(783,609),(779,603),(780,582),(775,600),(770,599),(767,590),(768,568),(766,548)]
footpoly=[(736,882),(782,882),(784,895),(798,906),(817,916),(848,924),(859,931),(854,937),(835,939),(793,938),(748,937),(727,932),(725,923),(730,906)]
for side,legorder,armorder in [('far',10,25),('near',20,60)]:
 lm=limb_map(side,['thigh','shin'],[549,710,888],[773,760,757],[.66,.68,.73],None)
 layer('leg-'+side,(706,535,835,896),legpoly,lm,legorder,'cloth')
 foot='foot_'+side
 def fm(x,y,bone=foot):return world(bone,(x-754)*76/104,12+(y-938)*.56),{bone:1.}
 layer('foot-'+side,(720,878,865,943),footpoly,fm,legorder+1,'skin')
 am=limb_map(side,['upper_arm','forearm'],[327,425,522],[741,763,783],[.95,.9,.86],None)
 layer('sleeve-'+side,(700,294,815,539),sleevepoly,am,armorder,'cloth')
 hand='hand_'+side
 def hm(x,y,bone=hand):return world(bone,(y-522)*.64,-(x-(783+(y-522)*.12))*.64),{bone:1.}
 layer('hand-'+side,(762,510,814,614),handpoly,hm,armorder+1,'skin')
# A connected torso anchored at the original spine. Compress only the jacket
# hem below the belt to fit the already approved rig dimensions.
def torso(x,y):
 u=(474-y)*190/(474-281) if y<=474 else -(y-474)*.4
 center=773+(474-y)*(-.04)
 return world('spine',u,(x-center)*.87),{'spine':1.}
bodypoly=[(737,263),(768,267),(796,279),(814,311),(825,351),(831,405),(836,451),(843,463),(850,485),(850,526),(856,579),(840,585),(830,543),(713,551),(717,515),(727,468),(730,420),(721,371),(712,333),(720,293)]
layer('jacket-belt',(703,258,860,590),bodypoly,torso,40,'blue',True)
headpoly=[(738,154),(742,136),(751,149),(764,132),(770,145),(784,138),(781,150),(800,147),(795,160),(817,161),(807,174),(825,178),(814,190),(827,204),(816,208),(817,220),(810,226),(820,233),(812,240),(813,249),(805,259),(788,263),(782,277),(781,291),(746,286),(746,268),(730,257),(720,246),(712,238),(704,229),(713,216),(698,212),(711,198),(700,195),(714,181),(708,175),(724,165),(720,158)]
def head(x,y):return world('head',(277-y)*80/110,(x-773)*.73),{'head':1.}
layer('head-face-hair',(697,130,838,295),headpoly,head,50,'head')
manifest={'schema_version':1,'representation':'approved white-gi side-view raster textures on unchanged hierarchical constrained rig; continuous sleeve/leg image meshes','source_image_sha256':hashlib.sha256(source_path.read_bytes()).hexdigest(),'source_file':'source/white-gi-brown-belt.png','profile_sha256':hashlib.sha256((BASE/'rig_profile.json').read_bytes()).hexdigest(),'timeline_sha256':hashlib.sha256((BASE/'project/timeline.json').read_bytes()).hexdigest(),'layers':layers,'paid_api_calls':0,'cloud_upload':False,'new_model':False,'reconstructed_hidden_surfaces':'Jacket under sleeve and hidden belt use cloth/brown-belt pixels from the same approved white-gi front view; side face, hand, foot and visible side details retain source pixels. The hanging hand occluding the upper trouser is replaced with adjacent same-sheet trouser cotton in both leg textures. Far limbs reuse side texture; no unseen-side AI generation.'}
(OUT/'skin-assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
canvas=Image.new('RGB',(1400,660),'#20232b');d=ImageDraw.Draw(canvas)
for i,(name,im) in enumerate(thumbs):
 tile=im.copy();tile.thumbnail((250,270));x=(i%5)*280;y=(i//5)*330;canvas.paste(tile,(x+(280-tile.width)//2,y+15),tile);d.text((x+15,y+305),name,fill='white')
canvas.save(HERE/'skin-texture-atlas.png')
print(json.dumps({'layers':len(layers),'vertices':sum(len(x['vertices']) for x in layers),'triangles':sum(len(x['triangles']) for x in layers),'manifest':str(OUT/'skin-assets.json'),'source_sha256':manifest['source_image_sha256']},indent=2))
