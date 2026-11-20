"""Generate and capture the native weighted mesh scene, using the M4 CLI."""
from pathlib import Path
import hashlib,json,os,subprocess,time

ROOT=Path.home()/'.local/share/bjj-rive/task-063'
MOTION=ROOT/'mesh-motion'
PROJECT=MOTION/'project'
PLAN=json.loads((ROOT/'capture-plan.json').read_text())
OUT=ROOT/PLAN['label'];OUT.mkdir(exist_ok=True)
started=time.time()
subprocess.run(['python3',str(ROOT/'generate_rive.py'),'--input',str(MOTION/'poses.json'),'--output-dir',str(PROJECT)],check=True)
CLI=ROOT.parent/'tools/bin/rive'
env=dict(os.environ,RIVE_HOME=str(ROOT.parent/'tools'),RIVE_ANALYTICS='off',DO_NOT_TRACK='1',CI='1')
v=subprocess.run([str(CLI),str(PROJECT),'--verify','--format=json'],env=env,text=True,capture_output=True)
(OUT/'verify.json').write_text(v.stdout);(OUT/'verify.log').write_text(v.stderr)
assert v.returncode==0,v.stdout+v.stderr
i=subprocess.run([str(CLI),'inspect',str(PROJECT),'--summary'],env=env,text=True,capture_output=True)
(OUT/'inspect.json').write_text(i.stdout);assert i.returncode==0,i.stderr
inspect=json.loads(i.stdout)
assert [a['name'] for a in inspect['artboards']]==['Clean']
times=PLAN.get('times',[j/30 for j in range(240)])
commands=['advance 1'];previous=0
for n,t in enumerate(times,1):
 if t>previous:commands.append('advance %.9fs'%(t-previous))
 commands.append('screenshot '+str(OUT/('frame-%04d.png'%n)));previous=t
commands.append('quit')
r=subprocess.run([str(CLI),str(PROJECT),'--commands','--artboard=Clean','--viewport=1760x1320','--fit=contain'],env=env,input='\n'.join(commands)+'\n',text=True,capture_output=True)
(OUT/'capture.log').write_text(r.stdout+r.stderr)
assert r.returncode==0 and '\nerr ' not in r.stdout,r.stdout[-2000:]+r.stderr[-2000:]
frames=sorted(OUT.glob('frame-*.png'));assert len(frames)==len(times)
receipt={'engine':'Actual native Rive CLI 1.9.2 weighted-image mesh','location':'M4 Pro','elapsed_seconds':round(time.time()-started,3),'frames':len(frames),'times':times if len(times)<20 else None,'inspect':inspect,'source_rml_sha256':hashlib.sha256((PROJECT/'scene.rml').read_bytes()).hexdigest(),'analytics':'off','login':False,'cloud_publish':False,'first_frame_sha256':hashlib.sha256(frames[0].read_bytes()).hexdigest(),'last_frame_sha256':hashlib.sha256(frames[-1].read_bytes()).hexdigest()}
(OUT/'capture-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2),flush=True)
