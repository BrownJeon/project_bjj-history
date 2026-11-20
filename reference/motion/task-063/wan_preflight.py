"""Prepare an isolated task-owned Python environment; never touch services."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,time

ROOT=Path.home()/'.local/share/bjj-rive/task-063/wan-local'
ROOT.mkdir(exist_ok=True)
source=ROOT.parent/'original.png'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='a6e99ea8eab51254a3d5f53127904d91c22733ef3f55a22d90752c4b9770435d'
python=Path('/opt/homebrew/bin/python3.12')
assert python.exists()
disk=shutil.disk_usage(ROOT)
assert disk.free>30*1024**3,'Need at least 30GiB free for the selected model and task environment'
started=time.time()
before=subprocess.check_output(['ps','-axo','comm=,rss='],text=True)
procs=[line.strip() for line in before.splitlines() if any(n in line.lower() for n in ['python','ollama','redis'])]
env=ROOT/'env'
if not (env/'bin/python').exists():
    subprocess.run([str(python),'-m','venv',str(env)],check=True)
report={'created_at_unix':time.time(),'root':str(ROOT),'python':subprocess.check_output([str(env/'bin/python'),'--version'],text=True).strip(),'machine':subprocess.check_output(['sysctl','-n','machdep.cpu.brand_string'],text=True).strip(),'ram_bytes':int(subprocess.check_output(['sysctl','-n','hw.memsize'],text=True)),'disk_free_bytes':disk.free,'existing_named_process_rss_kib':procs,'venv_created':True,'service_changes':False,'model_downloaded':False,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'elapsed_seconds':round(time.time()-started,3)}
(ROOT/'preflight.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2),flush=True)
