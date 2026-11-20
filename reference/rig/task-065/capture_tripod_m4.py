"""Verify/inspect/capture the persistent constrained character in native Rive."""
from pathlib import Path
import hashlib,json,os,subprocess,time

BASE=Path.home()/'.local/share/bjj-rive'
TASK=BASE/'task-065'
PLAN=json.loads((TASK/'capture-plan.json').read_text())
if PLAN.get('rebuild',True):
    subprocess.run(['python3',str(TASK/'generate_dual_rive.py'),'--plan',str(TASK/'tripod-plan.json'),'--output',str(TASK/'project')],check=True)
PROJECT=TASK/'project'
assert PROJECT.is_dir()
label=PLAN['label'];assert label.replace('-','').isalnum()
OUT=TASK/label;OUT.mkdir(exist_ok=True)
cli=str(BASE/'tools/bin/rive')
env=dict(os.environ,RIVE_HOME=str(BASE/'tools'),RIVE_ANALYTICS='off',DO_NOT_TRACK='1',CI='1')
started=time.time()
verify=subprocess.run([cli,str(PROJECT),'--verify','--format=json'],env=env,text=True,capture_output=True)
(OUT/'verify.json').write_text(verify.stdout);(OUT/'verify.log').write_text(verify.stderr)
assert verify.returncode==0,verify.stdout+verify.stderr
inspected=subprocess.run([cli,'inspect',str(PROJECT),'--summary'],env=env,text=True,capture_output=True)
(OUT/'inspect.json').write_text(inspected.stdout);assert inspected.returncode==0,inspected.stderr
tree=json.loads(inspected.stdout);names=[a['name'] for a in tree['artboards']]
chosen=PLAN.get('artboards',['Clean','Rig']);assert all(name in names for name in chosen)
fps=PLAN.get('fps',24);times=PLAN.get('times')
if times is None:times=[f/fps for f in range(PLAN['frames'])]
report={'engine':'Actual Rive CLI 1.9.2','location':'M4 Pro','mode':PLAN['mode'],'fps':fps,'analytics':'off','login':False,'cloud_publish':False,'captures':{},'inspect':tree}
for name in chosen:
    folder=OUT/name;folder.mkdir(exist_ok=True)
    commands=['advance 1'];previous=0
    for i,t in enumerate(times,1):
        if t>previous:commands.append('advance %.9fs'%(t-previous))
        commands.append('screenshot '+str(folder/('frame-%04d.png'%i)));previous=t
    commands.append('quit')
    result=subprocess.run([cli,str(PROJECT),'--commands','--artboard='+name,'--viewport='+PLAN.get('viewport','800x1000'),'--fit=contain'],env=env,input='\n'.join(commands)+'\n',text=True,capture_output=True)
    (OUT/(name+'-capture.log')).write_text(result.stdout+result.stderr)
    assert result.returncode==0 and '\nerr ' not in result.stdout,result.stdout[-1800:]+result.stderr[-1800:]
    files=sorted(folder.glob('frame-*.png'));assert len(files)==len(times)
    report['captures'][name]={'count':len(files),'times':times if PLAN['mode']=='review' else None,'first_sha256':hashlib.sha256(files[0].read_bytes()).hexdigest(),'last_sha256':hashlib.sha256(files[-1].read_bytes()).hexdigest()}
report['dual_build_receipt']=json.loads((PROJECT/'dual-build-receipt.json').read_text())
report['elapsed_seconds']=round(time.time()-started,3)
report['scene_rml_sha256']=hashlib.sha256((PROJECT/'scene.rml').read_bytes()).hexdigest()
(OUT/'capture-receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2),flush=True)
