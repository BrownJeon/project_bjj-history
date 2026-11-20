"""Package the checked source independently from already verified motion media."""
from pathlib import Path
import hashlib,json,zipfile,datetime
TASK=Path.home()/'.local/share/bjj-rive/task-064'
plan=json.loads((TASK/'encode-plan.json').read_text())
out=TASK/plan['label'];project=TASK/'project'
for name in ['scene.rml','rive.yaml','timeline.json','model-receipt.json']:
    assert (project/name).is_file(),name
verification=json.loads((TASK/'kinematics-verification.json').read_text())
for key,path in [('profile',TASK/'rig_profile.json'),('timeline',project/'timeline.json'),('model_receipt',project/'model-receipt.json')]:
    assert hashlib.sha256(path.read_bytes()).hexdigest()==verification['inputs'][key]['sha256'],key
capture=json.loads((out/'capture-receipt.json').read_text())
assert hashlib.sha256((project/'scene.rml').read_bytes()).hexdigest()==capture['scene_rml_sha256']
archive=out/'constrained-character-rml.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for file in sorted(project.rglob('*')):
        if file.is_file():z.write(file,Path('constrained-character/project')/file.relative_to(project))
    for name in plan['source_files']:
        file=TASK/name;assert file.is_file();z.write(file,Path('constrained-character')/name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    names=z.namelist()
receipt=json.loads((out/'delivery-receipt.json').read_text())
receipt['files'][archive.name]={'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
receipt['source_package']={'file_count':len(names),'includes_timeline_and_model_receipt':True,'input_hashes_match_independent_verification':True,'scene_hash_matches_captured_source':True,'native_riv_binary':False,'files':names,'packaged_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(out/'delivery-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'source_package':receipt['source_package'],'archive':receipt['files'][archive.name]},indent=2))
