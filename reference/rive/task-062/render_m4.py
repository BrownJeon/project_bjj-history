"""Verify and capture the actual Rive scene on M4; no login or publishing."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import time

BASE = Path.home() / '.local/share/bjj-rive'
TASK = BASE / 'task-062'
PROJECT = TASK / 'project'
CLI = BASE / 'tools/bin/rive'
PLAN = json.loads((TASK / 'run-plan.json').read_text())
label = PLAN['label']
assert label.replace('-', '').isalnum()
OUT = TASK / label
OUT.mkdir(exist_ok=True)
env = os.environ.copy()
env.update({'RIVE_HOME':str(BASE/'tools'),'RIVE_ANALYTICS':'off','DO_NOT_TRACK':'1','CI':'1'})

started = time.time()
verified = subprocess.run([str(CLI),str(PROJECT),'--verify','--format=json'],env=env,capture_output=True,text=True)
(OUT/'verify.json').write_text(verified.stdout)
(OUT/'verify.log').write_text(verified.stderr)
assert verified.returncode == 0, verified.stdout + verified.stderr
inspected = subprocess.run([str(CLI),'inspect',str(PROJECT),'--summary'],env=env,capture_output=True,text=True)
(OUT/'inspect.json').write_text(inspected.stdout)
assert inspected.returncode == 0, inspected.stdout + inspected.stderr
tree = json.loads(inspected.stdout)
names = [a['name'] for a in tree['artboards']]
chosen = PLAN.get('artboards',names)
assert len(chosen) == 2 and all(n in names for n in chosen)
report = {'engine':'Rive CLI 1.9.2','location':'Apple M4 Pro','mode':PLAN['mode'],
          'analytics':'off','login':False,'cloud_publish':False,'artboards':chosen,'captures':{}}
print(json.dumps({'phase':'native_rive_capture','mode':PLAN['mode'],'artboards':chosen}),flush=True)

for board in chosen:
    folder=OUT/board
    folder.mkdir(exist_ok=True)
    if PLAN['mode']=='review':
        times=PLAN.get('times',[0,.8,3.5,5.5,8.5,11.9])
    else:
        times=[i/24 for i in range(288)]
    commands=['advance 1']
    previous=0
    for i,t in enumerate(times,1):
        if t>previous:commands.append('advance %.9fs' % (t-previous))
        commands.append('screenshot '+str(folder/('frame-%04d.png'%i)))
        previous=t
    commands.append('quit')
    result=subprocess.run([str(CLI),str(PROJECT),'--commands','--artboard='+board,
                           '--viewport=1024x960','--fit=contain'],env=env,
                          input='\n'.join(commands)+'\n',capture_output=True,text=True)
    (OUT/(board+'-capture.log')).write_text(result.stdout+result.stderr)
    assert result.returncode==0 and '\nerr ' not in result.stdout, result.stdout[-2000:]+result.stderr[-2000:]
    files=sorted(folder.glob('frame-*.png'))
    assert len(files)==len(times)
    report['captures'][board]={'count':len(files),'times':times if PLAN['mode']=='review' else None,
                               'first_sha256':hashlib.sha256(files[0].read_bytes()).hexdigest(),
                               'last_sha256':hashlib.sha256(files[-1].read_bytes()).hexdigest()}
report['elapsed_seconds']=round(time.time()-started,3)
report['inspect']=tree
report['sources']={str(p.relative_to(PROJECT)):hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in PROJECT.glob('*.rml')}
(OUT/'capture-receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2),flush=True)
