"""Four actual native Rive baseline stills for the white character; M4 only."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import time

BASE = Path.home()/'.local/share/bjj-rive'
HERE = BASE/'task-065/white-character'
PROJECT = HERE/'project'
OUT = HERE/'review-01'
OUT.mkdir(parents=True,exist_ok=True)
CLI = str(BASE/'tools/bin/rive')
ENV = dict(os.environ,RIVE_HOME=str(BASE/'tools'),RIVE_ANALYTICS='off',DO_NOT_TRACK='1',CI='1')
started=time.time()
verify=subprocess.run([CLI,str(PROJECT),'--verify','--format=json'],env=ENV,text=True,capture_output=True)
(OUT/'verify.json').write_text(verify.stdout)
(OUT/'verify.log').write_text(verify.stderr)
assert verify.returncode==0,verify.stdout+verify.stderr
inspect=subprocess.run([CLI,'inspect',str(PROJECT),'--summary'],env=ENV,text=True,capture_output=True)
(OUT/'inspect.json').write_text(inspect.stdout)
assert inspect.returncode==0,inspect.stderr
captures=[]
for artboard,samples in [
    ('Clean',[(.5,'clean-neutral.png'),(2.25,'clean-curl.png'),(10.,'clean-squat.png')]),
    ('Rig',[(6.,'rig-knee.png')]),
]:
    commands=['advance 1'];previous=0
    for time_seconds,name in samples:
        commands.extend(['advance %.9fs'%(time_seconds-previous),'screenshot '+str(OUT/name)])
        previous=time_seconds
    commands.append('quit')
    result=subprocess.run([CLI,str(PROJECT),'--commands','--artboard='+artboard,
                           '--viewport=900x900','--fit=contain'],env=ENV,
                          input='\n'.join(commands)+'\n',text=True,capture_output=True)
    (OUT/(artboard+'-capture.log')).write_text(result.stdout+result.stderr)
    assert result.returncode==0 and '\nerr ' not in result.stdout,result.stdout+result.stderr
    for time_seconds,name in samples:
        path=OUT/name
        assert path.is_file() and path.stat().st_size>0,name
        captures.append({'file':name,'artboard':artboard,'sample_seconds':time_seconds,
                         'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
receipt={'engine':'Actual Rive CLI 1.9.2','location':'M4 Pro','motion':'unchanged task064 baseline',
         'scene_sha256':hashlib.sha256((PROJECT/'scene.rml').read_bytes()).hexdigest(),
         'verify_exit':verify.returncode,'inspect_exit':inspect.returncode,'captures':captures,
         'elapsed_seconds':round(time.time()-started,3),'paid_api_calls':0,'cloud_upload':False,
         'analytics':'off','profile_extended':False,'visual_review':'pending'}
(OUT/'capture-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
