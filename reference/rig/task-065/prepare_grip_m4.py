"""Use the uploaded photo's actual closed grip as a fixed hand pose skin.
Keep approved blue design and original source files intact in task-064.
"""
from pathlib import Path
import json,hashlib,math,shutil
from PIL import Image,ImageDraw,ImageFilter,ImageChops
ROOT=Path.home()/'.local/share/bjj-rive';TASK=ROOT/'task-065';OUT=TASK/'blue-character/project';OUT.mkdir(parents=True,exist_ok=True)
old=ROOT/'task-064/skin-v2/project';shutil.copytree(old/'assets',OUT/'assets',dirs_exist_ok=True)
manifest=json.loads((old/'skin-assets.json').read_text());photo=TASK/'reference/tripod-reference.png';source=Image.open(photo).convert('RGBA')
assert hashlib.sha256(photo.read_bytes()).hexdigest()=='a6e99ea8eab51254a3d5f53127904d91c22733ef3f55a22d90752c4b9770435d'
bbox=(856,966,1046,1117);x0,y0,x1,y1=bbox
poly=[(857,1049),(892,1038),(913,1030),(927,1010),(937,995),(950,982),(961,973),(964,974),(965,982),(972,989),(987,992),(1005,991),(1023,994),(1035,998),(1040,1005),(1039,1013),(1036,1019),(1039,1025),(1039,1033),(1036,1039),(1038,1045),(1035,1053),(1031,1057),(1033,1063),(1028,1070),(1015,1077),(985,1082),(958,1086),(938,1087),(916,1091),(889,1101),(866,1111),(860,1114)]
im=source.crop(bbox);mask=Image.new('L',im.size);ImageDraw.Draw(mask).polygon([(x-x0,y-y0) for x,y in poly],fill=255)
mask=mask.filter(ImageFilter.GaussianBlur(.3));im.putalpha(ImageChops.multiply(mask,im.getchannel('A')))
path=OUT/'assets/hand-near.png';im.save(path)
bind=json.loads((ROOT/'task-064/project/timeline.json').read_text())['frames'][0]['bones']['hand_near']
prox=[884,1080];grip=[1006,1038];dx,dy=grip[0]-prox[0],grip[1]-prox[1];length=math.hypot(dx,dy);ux,uy=dx/length,dy/length;vx,vy=-uy,ux
scale_u=36/length;scale_v=.30
vertices=[];triangles=[];nx=math.ceil(im.width/5)+1;ny=math.ceil(im.height/5)+1
for j in range(ny):
 for i in range(nx):
  x=x0+im.width*i/(nx-1);y=y0+im.height*j/(ny-1);u=((x-prox[0])*ux+(y-prox[1])*uy)*scale_u;v=((x-prox[0])*vx+(y-prox[1])*vy)*scale_v
  a=bind['world_rotation_rad'];c,s=math.cos(a),math.sin(a)
  vertices.append({'x':bind['origin'][0]+c*u-s*v,'y':bind['origin'][1]+s*u+c*v,'u':i/(nx-1),'v':j/(ny-1),'weights':{'hand_near':1}})
for j in range(ny-1):
 for i in range(nx-1):
  a=j*nx+i;triangles.extend([[a,a+1,a+nx],[a+1,a+nx+1,a+nx]])
for layer in manifest['layers']:
 if layer['name']=='hand-near':layer.update(file='assets/hand-near.png',width=im.width,height=im.height,vertices=vertices,triangles=triangles,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),source_bbox=list(bbox),source_image_sha256=hashlib.sha256(photo.read_bytes()).hexdigest(),fixed_pose='uploaded-photo ankle grip; palm/closed fingers; no per-frame image generation')
manifest['grip_pose_override']={'source_image_sha256':hashlib.sha256(photo.read_bytes()).hexdigest(),'source_bbox':list(bbox),'hand_bone':'hand_near','wrist_photo':prox,'ankle_contact_photo':grip,'hand_contact_local':[36,0],'source':'uploaded tripod photo; approved sheet head/gi/other limbs unchanged','new_model_or_paid_api':False}
(OUT/'skin-assets.json').write_text(json.dumps(manifest,indent=2)+'\n');im.resize((im.width*3,im.height*3)).save(TASK/'grip-pose-preview.png')
print(json.dumps({'manifest':str(OUT/'skin-assets.json'),'closed_hand_texture_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'vertices':len(vertices),'triangles':len(triangles)},indent=2))
