"""Package native Rive captures as a comparison preview on M4."""
from pathlib import Path
import hashlib
import json
import subprocess
import time
import zipfile

from PIL import Image,ImageDraw,ImageFont

TASK=Path.home()/'.local/share/bjj-rive/task-062'
PLAN=json.loads((TASK/'run-plan.json').read_text())
OUT=TASK/PLAN['label']
assert PLAN['mode']=='full'
assert all((OUT/b/('frame-%04d.png'%i)).exists() for b in ('Clean','Rig') for i in range(1,289))
FFMPEG='/opt/homebrew/bin/ffmpeg'
FONT='/System/Library/Fonts/AppleSDGothicNeo.ttc'
font_index=0
for index in range(12):
    try:
        if ImageFont.truetype(FONT,32,index=index).getname()[1].lower() in ('bold','semibold'):
            font_index=index;break
    except OSError:break


def font(size):return ImageFont.truetype(FONT,size,index=font_index)


def package_frame(i):
    canvas=Image.new('RGB',(1600,1000),'#15171e')
    d=ImageDraw.Draw(canvas)
    d.text((40,20),'2D 싱글엑스 가드',font=font(36),fill='white')
    d.text((40,85),'원본 2D 파츠',font=font(24),fill='#c5c9d0')
    d.text((840,85),'Rive 뼈대 · 관절',font=font(24),fill='#c5c9d0')
    for x,board in ((0,'Clean'),(800,'Rig')):
        im=Image.open(OUT/board/('frame-%04d.png'%i)).convert('RGB')
        canvas.paste(im.resize((800,750),Image.Resampling.LANCZOS),(x,125))
    d.line((800,125,800,875),fill='#35404a',width=2)
    t=(i-1)/24
    label='01  발목 접촉' if t<1.5 else ('02  몸을 낮추며 진입' if t<5 else ('03  골반과 안쪽 훅 연결' if t<7.5 else '04  한 다리를 감싸 유지'))
    d.line((40,890,1560,890),fill='#35404a',width=2)
    d.text((40,910),label,font=font(30),fill='white')
    d.text((40,960),'파랑 · 서 있는 역할     흰색 · 가드',font=font(20),fill='#a9b2bf')
    return canvas


started=time.time()
frames=OUT/'comparison-frames';frames.mkdir(exist_ok=True)
for i in range(1,289):package_frame(i).save(frames/('frame-%04d.png'%i),compress_level=2)
movie=OUT/'rive-2d-single-x-comparison.mp4'
with (OUT/'encode.log').open('w') as log:
    subprocess.run([FFMPEG,'-y','-hide_banner','-framerate','24','-i',str(frames/'frame-%04d.png'),
                    '-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',
                    '-movflags','+faststart','-an',str(movie)],check=True,stdout=log,stderr=subprocess.STDOUT)
    subprocess.run([FFMPEG,'-y','-hide_banner','-i',str(movie),'-filter_complex',
                    'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
                    '-loop','0',str(OUT/'preview.gif')],check=True,stdout=log,stderr=subprocess.STDOUT)
    subprocess.run([FFMPEG,'-v','error','-i',str(movie),'-f','null','-'],check=True,stdout=log,stderr=subprocess.STDOUT)
package_frame(217).save(OUT/'poster.png')
contact=Image.new('RGB',(1600,1000))
for i,frame in enumerate((13,85,145,217)):
    im=package_frame(frame).resize((800,500),Image.Resampling.LANCZOS)
    contact.paste(im,((i%2)*800,(i//2)*500))
contact.save(OUT/'contact-sheet.png')
project=TASK/'project'
with zipfile.ZipFile(OUT/'rive-2d-project.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(project.rglob('*')):
        if p.is_file() and (p.suffix in ('.rml','.yaml','.png','.json') or p.name.endswith('.riv')):
            z.write(p,Path('bjj-single-x-2d')/p.relative_to(project))
probe=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)],text=True))
files={}
for name in ('rive-2d-single-x-comparison.mp4','preview.gif','poster.png','contact-sheet.png','rive-2d-project.zip'):
    p=OUT/name;files[name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
receipt={'engine':'Actual Rive CLI 1.9.2 native captures','fps':24,'frames':288,'duration_seconds':12,
         'dimensions':[1600,1000],'rendered_artboards':['Clean','Rig'],'no_login_or_cloud_publish':True,
         'paid_generation_api_calls':0,'caption_composite':'Pillow; does not generate character motion',
         'encode_elapsed_seconds':round(time.time()-started,3),'files':files,'ffprobe':probe,'decode_errors':0}
(OUT/'delivery-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='ffprobe'},indent=2),flush=True)
