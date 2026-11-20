"""Bundle the frozen RML project, prepared assets and exact verification inputs."""
from pathlib import Path
import json,zipfile,hashlib,datetime
ROOT=Path.home()/'.local/share/bjj-rive';TASK=ROOT/'task-065';OUT=TASK/'final-01'
verified=json.loads((TASK/'kinematics-verification.json').read_text());assert verified['status']=='pass'
local_plan=json.loads((TASK/'tripod-plan.verified-local.json').read_text());m4_plan=json.loads((TASK/'tripod-plan.json').read_text())
def numeric_plan(p):
 p=json.loads(json.dumps(p));p.pop('profile_file');p.pop('bind_timeline_file')
 for c in p['characters'].values():c.pop('assets_manifest')
 return p
assert numeric_plan(local_plan)==numeric_plan(m4_plan),'Pose/contact data changed between local verification and M4 execution'
assert hashlib.sha256((TASK/'tripod-plan.verified-local.json').read_bytes()).hexdigest()==verified['plan_sha256']
assert hashlib.sha256((TASK/'tripod-profile.json').read_bytes()).hexdigest()==verified['profile_sha256']
assert hashlib.sha256((TASK/'project/scene.rml').read_bytes()).hexdigest()==verified['rml_source']['scene_sha256']
files=[]
def include(file,relative):
 assert file.is_file(),str(file);files.append((file,'bjj-tripod/'+relative))
for name in ['generate_character.py','rig_profile.json','project/timeline.json','skin-v2/generate_skin.py']:
 include(ROOT/'task-064'/name,'task-064/'+name)
for name in ['README.md','plan_tripod.py','generate_dual_rive.py','tripod-profile.json','verify_tripod.py','kinematics-verification.json','native-clamp-proof.json','test_native_clamp_m4.py','prepare_grip_m4.py','fit_white_hem_m4.py','capture_tripod_m4.py','encode_tripod_m4.py','package_tripod_m4.py','motion-plan-receipt.json']:
 include(TASK/name,'task-065/'+name)
include(TASK/'tripod-plan.verified-local.json','task-065/tripod-plan.json')
include(TASK/'tripod-plan.json','task-065/tripod-plan.m4.json')
for folder in ['project','blue-character/project','white-tripod-skin/project']:
 for file in sorted((TASK/folder).rglob('*')):
  if file.is_file():include(file,'task-065/'+str(file.relative_to(TASK)))
for file,name in [(TASK/'reference/tripod-reference.png','tripod-reference.png'),(ROOT/'task-064/skin-v2/source/blue-gi-brown-belt.png','approved-blue-gi.png'),(TASK/'white-character/source/white-gi-brown-belt.png','approved-white-gi.png')]:
 include(file,'task-065/reference/'+name)
archive=OUT/'tripod-rml-source.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for file,name in files:z.write(file,name)
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
receipt=json.loads((OUT/'delivery-receipt.json').read_text());receipt['files'][archive.name]={'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()};receipt['source_package']={'file_count':len(files),'files':[n for _,n in files],'verified_local_plan_included':True,'m4_execution_plan_included':True,'plan_difference':'absolute input paths only; numeric poses, contacts, mirrors and all other fields identical','core_hashes_match_independent_verification':True,'native_riv_export':False,'packaged_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(OUT/'delivery-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'source_package_file_count':len(files),'archive':receipt['files'][archive.name]},indent=2))
