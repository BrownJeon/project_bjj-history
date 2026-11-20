"""Run task-owned Wan inference offline under the isolated Python venv."""
from pathlib import Path
import json,os,subprocess,threading
ROOT=Path.home()/'.local/share/bjj-rive/task-063/wan-local'
run=json.loads((ROOT/'launch.json').read_text())
assert run['phase'] in ['text','generate']
env={k:os.environ[k] for k in ['HOME','USER','PATH','TMPDIR','LANG','LC_ALL','SSL_CERT_FILE'] if k in os.environ}
env.update(HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',HF_HUB_DISABLE_IMPLICIT_TOKEN='1',DO_NOT_TRACK='1',TOKENIZERS_PARALLELISM='false',PYTHONUNBUFFERED='1')
plan=ROOT/run['plan'];assert plan.is_file() and plan.parent==ROOT
out=ROOT/'runs'/json.loads(plan.read_text())['label'];out.mkdir(parents=True,exist_ok=True)
with (out/(run['phase']+'-execution.log')).open('w') as log:
    p=subprocess.Popen([str(ROOT/'env/bin/python'),'-u',str(ROOT/'wan_infer.py'),'--phase',run['phase'],'--plan',str(plan)],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
    deadline=threading.Timer(3600,p.terminate);deadline.daemon=True;deadline.start()
    try:
        for line in p.stdout:print(line,end='',flush=True);log.write(line);log.flush()
        code=p.wait(timeout=30)
    except BaseException:
        p.terminate();raise
    finally:deadline.cancel()
raise SystemExit(code)
