"""Install the user-approved pinned runtime into the isolated M4 task venv."""
from pathlib import Path
import hashlib,json,os,subprocess,tarfile,time,urllib.request

ROOT=Path.home()/'.local/share/bjj-rive/task-063/wan-local'
SHA='87db56a51758fefb748a359b90a5283bb8ba4837'
PYTHON=ROOT/'env/bin/python'
assert PYTHON.exists()
started=time.time()
archive=ROOT/('mlx-video-'+SHA+'.tar.gz')
url='https://codeload.github.com/Blaizzy/mlx-video/tar.gz/'+SHA
if not archive.exists():
    with urllib.request.urlopen(url,timeout=60) as response,archive.open('wb') as f:
        while chunk:=response.read(1024**2):f.write(chunk)
source=ROOT/('mlx-video-'+SHA)
if not source.exists():
    with tarfile.open(archive) as tar:
        for item in tar.getmembers():
            p=Path(item.name)
            assert not p.is_absolute() and '..' not in p.parts
            assert p.parts[0]=='mlx-video-'+SHA
            assert item.isfile() or item.isdir(),'Special archive entry denied'
        # The bridge's system Python predates tarfile's filter argument.
        # All entries above are restricted to relative regular files/dirs;
        # symlinks, traversal, absolute paths and special files are rejected.
        tar.extractall(ROOT)
assert (source/'pyproject.toml').exists()
env={k:os.environ[k] for k in ('HOME','USER','PATH','TMPDIR','LANG','LC_ALL','SSL_CERT_FILE') if k in os.environ}
env.update(PIP_DISABLE_PIP_VERSION_CHECK='1',PIP_NO_INPUT='1',HF_HUB_DISABLE_TELEMETRY='1',DO_NOT_TRACK='1',TOKENIZERS_PARALLELISM='false')
print(json.dumps({'phase':'installing_task_runtime','commit':SHA,'source_archive_bytes':archive.stat().st_size,'source_archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}),flush=True)
with (ROOT/'install.log').open('w') as log:
    result=subprocess.run([str(PYTHON),'-m','pip','install','--index-url','https://pypi.org/simple',str(source)],env=env,stdout=log,stderr=subprocess.STDOUT)
if result.returncode:
    print((ROOT/'install.log').read_text()[-5000:]);raise SystemExit(result.returncode)
freeze=subprocess.check_output([str(PYTHON),'-m','pip','freeze'],env=env,text=True)
(ROOT/'requirements-installed.txt').write_text(freeze)
check=subprocess.run([str(PYTHON),'-m','pip','check'],env=env,text=True,capture_output=True)
report={'status':'installed' if check.returncode==0 else 'dependency_check_failed','commit':SHA,'source':str(source),'python':str(PYTHON),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'elapsed_seconds':round(time.time()-started,3),'package_count':len(freeze.splitlines()),'pip_check':check.stdout+check.stderr,'service_changes':False,'model_loaded':False,'photos_uploaded':False}
(ROOT/'install-receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2),flush=True)
assert check.returncode==0
