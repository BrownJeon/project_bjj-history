"""Download only an approved immutable five-file model, with size/SHA checks.

Runs on M4. No HF credentials, model code, services or user images are sent.
Requires an explicit local compatibility receipt before fetching large weights.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib,json,time,urllib.request

ROOT=Path.home()/'.local/share/bjj-rive/task-063/wan-local'
manifest=json.loads((ROOT/'model-manifest.json').read_text())
assert manifest['model_id']=='SceneWorks/wan2.2-ti2v-5b-mlx'
assert manifest['revision']=='bb1b055249614cf9d7cf4373fbdbc184b77dee88'
assert manifest['total_bytes']==17142889289
approval=json.loads((ROOT/'download-gate.json').read_text())
assert approval['user_approved'] and approval['compatibility_reviewed']
assert approval['runtime_commit']=='87db56a51758fefb748a359b90a5283bb8ba4837'
MODEL=ROOT/'model';MODEL.mkdir(exist_ok=True)
started=time.time()

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(8*1024**2),b''):h.update(chunk)
    return h.hexdigest()

def fetch(item):
    relative=item['rfilename'];name=Path(relative).name
    assert relative.startswith('q4/') and '/' not in name
    dest=MODEL/name;part=MODEL/(name+'.part')
    expected=item.get('lfs',{}).get('sha256')
    if dest.exists() and dest.stat().st_size==item['size'] and (not expected or digest(dest)==expected):
        print(json.dumps({'file':name,'status':'already_verified','bytes':item['size']}),flush=True)
        return {'file':name,'bytes':item['size'],'sha256':digest(dest),'cached':True}
    offset=part.stat().st_size if part.exists() else 0
    assert offset<=item['size']
    url='https://huggingface.co/'+manifest['model_id']+'/resolve/'+manifest['revision']+'/'+relative
    headers={'User-Agent':'bjj-local-wan-task063/1.0'}
    if offset:headers['Range']='bytes=%d-'%offset
    request=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(request,timeout=90) as response:
        if offset and response.status!=206:offset=0
        mode='ab' if offset else 'wb'
        count=offset;last=time.time()
        with part.open(mode) as f:
            while True:
                chunk=response.read(4*1024**2)
                if not chunk:break
                f.write(chunk);count+=len(chunk)
                if time.time()-last>20:
                    print(json.dumps({'file':name,'bytes':count,'expected':item['size'],'elapsed_seconds':round(time.time()-started,1)}),flush=True);last=time.time()
    assert part.stat().st_size==item['size'],name+' size mismatch'
    actual=digest(part)
    assert not expected or actual==expected,name+' SHA256 mismatch'
    part.replace(dest)
    result={'file':name,'bytes':dest.stat().st_size,'sha256':actual,'cached':False}
    print(json.dumps(dict(result,status='verified')),flush=True)
    return result

with ThreadPoolExecutor(max_workers=3) as pool:files=list(pool.map(fetch,manifest['files']))
receipt={'model_id':manifest['model_id'],'revision':manifest['revision'],'total_bytes':sum(f['bytes'] for f in files),'files':files,'elapsed_seconds':round(time.time()-started,3),'paid_api_calls':0,'user_image_upload':False}
(ROOT/'download-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'all_verified','bytes':receipt['total_bytes'],'elapsed_seconds':receipt['elapsed_seconds']}),flush=True)
