"""Fit only the white trouser cloth hem, keeping joint/foot geometry intact."""
from pathlib import Path
import json,math,shutil,hashlib
ROOT=Path.home()/'.local/share/bjj-rive';TASK=ROOT/'task-065';OLD=TASK/'white-character/project';OUT=TASK/'white-tripod-skin/project';OUT.mkdir(parents=True,exist_ok=True)
shutil.copytree(OLD/'assets',OUT/'assets',dirs_exist_ok=True)
r=json.loads((OLD/'skin-assets.json').read_text());rest=json.loads((ROOT/'task-064/project/timeline.json').read_text())['frames'][0]['bones'];counts={}
for layer in r['layers']:
 if layer['name'] not in ('leg-near','leg-far'):continue
 side=layer['name'].split('-')[1];name='shin_'+side;b=rest[name];c,s=math.cos(b['world_rotation_rad']),math.sin(b['world_rotation_rad']);count=0
 for v in layer['vertices']:
  dx,dy=v['x']-b['origin'][0],v['y']-b['origin'][1];u=c*dx+s*dy;z=-s*dx+c*dy
  if u>125:
   assert v['weights'].get(name,0)>.999
   u=125+(u-125)*(22/30)
   v['x']=b['origin'][0]+c*u-s*z;v['y']=b['origin'][1]+s*u+c*z;count+=1
 counts[layer['name']]=count
r['trouser_hem_fit']={'source_manifest_sha256':hashlib.sha256((OLD/'skin-assets.json').read_bytes()).hexdigest(),'cloth_hem_shortened_local_px':8,'starts_at_shin_local_px':125,'changed_vertices':counts,'bone_lengths_rotations_and_foot_skin_changed':False,'reason':'Expose bare ankle under the closed grip while retaining skin/cloth overlap across allowed ankle rotations'}
(OUT/'skin-assets.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r['trouser_hem_fit'],indent=2))
