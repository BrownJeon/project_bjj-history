"""Compose the native character/rig captures; never synthesize motion frames."""
from pathlib import Path
import hashlib,json,subprocess,time,zipfile
from PIL import Image,ImageDraw,ImageFont
TASK=Path.home()/'.local/share/bjj-rive/task-064/skin-v2'
PLAN=json.loads((TASK/'encode-plan.json').read_text())
OUT=TASK/PLAN['label'];N=PLAN['frames'];FPS=PLAN['fps']
assert all((OUT/board/('frame-%04d.png'%f)).exists() for board in ['Clean','Rig'] for f in range(1,N+1))
FONT='/System/Library/Fonts/AppleSDGothicNeo.ttc'
def font(size):return ImageFont.truetype(FONT,size,index=0)
def frame(i):
    canvas=Image.new('RGB',(1600,1160),'#15171e');d=ImageDraw.Draw(canvas)
    d.text((36,18),'캐릭터 디자인 · 고정 골격 적용',font=font(36),fill='#f4f6f8')
    d.text((36,66),'디자인 적용',font=font(23),fill='#bcc7d3');d.text((836,66),'뼈대 · 관절',font=font(23),fill='#81dbe4')
    for x,board in [(16,'Clean'),(816,'Rig')]:
        source=Image.open(OUT/board/('frame-%04d.png'%i)).convert('RGB')
        source.thumbnail((768,960),Image.Resampling.LANCZOS)
        canvas.paste(source,(x+(768-source.width)//2,100+(960-source.height)//2))
    t=(i-1)/FPS;caption='중립 자세'
    for stage in PLAN['stages']:
        if t>=stage['start']:caption=stage['caption']
    d.line((36,1065,1564,1065),fill='#35434c',width=2)
    d.text((36,1080),caption,font=font(30),fill='white')
    d.text((36,1126),'본 길이 고정  ·  관절 회전 제한  ·  고정 측면 시점',font=font(20),fill='#b4c0cc')
    return canvas

start=time.time();composite=OUT/'composite';composite.mkdir(exist_ok=True)
for i in range(1,N+1):frame(i).save(composite/('frame-%04d.png'%i),compress_level=2)
ff='/opt/homebrew/bin/ffmpeg';movie=OUT/'designed-character-motions.mp4'
with (OUT/'encode.log').open('w') as log:
    subprocess.run([ff,'-y','-hide_banner','-framerate',str(FPS),'-i',str(composite/'frame-%04d.png'),'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(movie)],check=True,stdout=log,stderr=subprocess.STDOUT)
    subprocess.run([ff,'-y','-hide_banner','-i',str(movie),'-filter_complex','fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0',str(OUT/'preview.gif')],check=True,stdout=log,stderr=subprocess.STDOUT)
decode=subprocess.run([ff,'-v','error','-i',str(movie),'-f','null','-'],capture_output=True,text=True)
assert decode.returncode==0 and not decode.stderr,decode.stderr
frame(1).save(OUT/'character-rig.png')
contact=Image.new('RGB',(1600,1160),'#15171e')
for i,t in enumerate(PLAN['contact_times']):
    image=frame(min(N,round(t*FPS)+1)).resize((800,580),Image.Resampling.LANCZOS);contact.paste(image,((i%2)*800,(i//2)*580))
contact.save(OUT/'contact-sheet.png')
Image.open(OUT/'Clean/frame-0001.png').save(OUT/'designed-character.png')
with zipfile.ZipFile(OUT/'designed-character-rml.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['generate_character.py','rig_profile.json','project/scene.rml','project/rive.yaml','project/timeline.json','project/model-receipt.json','verify_kinematics.py']:
        file=TASK.parent/name;assert file.is_file(),name;z.write(file,Path('task-064')/name)
    for file in sorted((TASK/'project').rglob('*')):
        if file.is_file():z.write(file,Path('task-064/skin-v2/project')/file.relative_to(TASK/'project'))
    for name in PLAN.get('source_files',[]):
        file=TASK/name;assert file.is_file(),name;z.write(file,Path('task-064/skin-v2')/name)
with zipfile.ZipFile(OUT/'designed-character-rml.zip') as z:
    assert z.testzip() is None
    package_names=z.namelist()
probe=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)],text=True))
names=['designed-character-motions.mp4','preview.gif','character-rig.png','designed-character.png','contact-sheet.png','designed-character-rml.zip']
report={'engine':'Native Rive CLI character/rig captures, composed on M4','fps':FPS,'frames':N,'duration_seconds':N/FPS,'dimensions':[1600,1160],'paid_api_calls':0,'cloud_upload':False,'original_art_or_db_replaced':False,'user_quality':'pending','range_definition':'character demonstration profile; not a medical normal-range certification','source_package_files':package_names,'encode_seconds':round(time.time()-start,3),'decode_errors':0,'files':{n:{'bytes':(OUT/n).stat().st_size,'sha256':hashlib.sha256((OUT/n).read_bytes()).hexdigest()} for n in names},'ffprobe':probe}
(OUT/'delivery-receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='ffprobe'},indent=2),flush=True)
