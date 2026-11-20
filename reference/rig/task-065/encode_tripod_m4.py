"""Encode the native two-character captures on M4 using existing FFmpeg."""
from pathlib import Path
import json,subprocess,hashlib,time,zipfile
from PIL import Image,ImageDraw,ImageFont
TASK=Path.home()/'.local/share/bjj-rive/task-065'
PLAN=json.loads((TASK/'encode-plan.json').read_text());OUT=TASK/PLAN['label']
MOTION=json.loads((TASK/'tripod-plan.json').read_text());N=PLAN['frames'];FPS=MOTION['fps']
FONT='/System/Library/Fonts/AppleSDGothicNeo.ttc'
def font(n):return ImageFont.truetype(FONT,n,index=0)
phase_names={'setup':'01 세 접촉 만들기','load':'02 자세 압축 · 준비','push_pull':'03 골반 밀기 + 발목·훅 당기기','controlled_fall':'04 상대 골반이 뒤로 내려감 · 발 회수','follow':'05 발목 제어를 유지하며 상체 따라오기','result_hold':'넘어뜨린 뒤 · 발목 제어 유지'}
contact_names={'ankle_grip':('1','#ffca65'),'hip_sole':('2','#3ad4c5'),'far_leg_hook':('3','#c09bff')}
CROP=(180,160,1380,930)
def frame(i,board):
 c=Image.new('RGB',(1280,1010),'#171b24');d=ImageDraw.Draw(c)
 d.text((40,18),'트라이포드 스윕 · 고정 골격 시연',font=font(34),fill='#f2f4f6')
 d.text((40,64),'파랑: 가드  /  흰색: 스윕 받는 상대'+('  ·  골격 표시' if board=='Rig' else ''),font=font(21),fill='#b9c5d3')
 im=Image.open(OUT/board/('frame-%04d.png'%i)).convert('RGB');assert im.size==(1600,950)
 c.paste(im.crop(CROP),(40,100))
 pose=MOTION['frames'][i-1]
 for contact in pose['contacts']:
  if not contact['active']:continue
  x,y=contact['point_b'];x=x-CROP[0]+40;y=y-CROP[1]+100
  number,color=contact_names[contact['name']]
  d.ellipse((x-12,y-12,x+12,y+12),outline=color,width=2)
  d.line((x+9,y-9,x+19,y-19),fill=color,width=2)
  d.ellipse((x+15,y-33,x+33,y-15),fill=color,outline='#172334',width=1)
  d.text((x+24,y-25),number,font=font(13),fill='#15202b',anchor='mm')
 d.text((40,887),phase_names[pose['phase']],font=font(28),fill='white')
 line='① 발목 제어   ② 골반 밀기   ③ 반대 다리 훅' if len(pose['contacts'])>1 else '골반·훅 접촉 해제 → 발목 제어 유지 · 상체 따라오기'
 d.text((40,931),line,font=font(21),fill='#b8c7d8')
 d.text((40,975),'고정 길이 · 공통 관절 제한 · 로컬 모션 샘플',font=font(17),fill='#8999ad')
 fade=min(1.,i/5.,(N+1-i)/8.)
 if fade<1:c=Image.blend(Image.new('RGB',c.size,'#171b24'),c,fade)
 return c
start=time.time();ff='/opt/homebrew/bin/ffmpeg'
with (OUT/'encode.log').open('w') as log:
 for board,name in [('Clean','tripod-sweep.mp4'),('Rig','tripod-rig.mp4')]:
  assert len(list((OUT/board).glob('frame-*.png')))==N
  folder=OUT/('composite-'+board);folder.mkdir(exist_ok=True)
  for i in range(1,N+1):frame(i,board).save(folder/('frame-%04d.png'%i),compress_level=2)
  subprocess.run([ff,'-y','-hide_banner','-framerate',str(FPS),'-i',str(folder/'frame-%04d.png'),'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(OUT/name)],check=True,stdout=log,stderr=subprocess.STDOUT)
 subprocess.run([ff,'-y','-hide_banner','-i',str(OUT/'tripod-sweep.mp4'),'-filter_complex','fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0',str(OUT/'preview.gif')],check=True,stdout=log,stderr=subprocess.STDOUT)
probes={}
for name in ['tripod-sweep.mp4','tripod-rig.mp4']:
 result=subprocess.run([ff,'-v','error','-i',str(OUT/name),'-f','null','-'],capture_output=True,text=True);assert result.returncode==0 and not result.stderr,result.stderr
 probes[name]=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(OUT/name)],text=True))
frame(13,'Clean').save(OUT/'poster.png');frame(min(N,round(4.8*FPS)+1),'Rig').save(OUT/'rig-poster.png')
cs=Image.new('RGB',(1920,1515),'#171b24')
for j,t in enumerate([.5,2.7,4.8,6,7.5,10.5]):
 tile=frame(min(N,round(t*FPS)+1),'Clean').resize((640,505),Image.Resampling.LANCZOS);cs.paste(tile,((j%3)*640,(j//3)*505))
# Two rows; retain only used rows rather than an empty third.
cs.crop((0,0,1920,1010)).save(OUT/'contact-sheet.png')
files=['tripod-sweep.mp4','tripod-rig.mp4','preview.gif','poster.png','rig-poster.png','contact-sheet.png']
report={'engine':'Actual native Rive captures; contact labels/composition/encoding on existing M4 tools','frames':N,'fps':FPS,'seconds':N/FPS,'dimensions':[1280,1010],'native_crop':list(CROP),'crop_fixed_for_all_frames':True,'presentation':'hollow contact rings/captions and a brief fade at the loop boundary; native character poses unchanged','decode_errors':0,'paid_api_calls':0,'cloud_upload':False,'encode_seconds':round(time.time()-start,3),'user_quality':'pending','files':{n:{'bytes':(OUT/n).stat().st_size,'sha256':hashlib.sha256((OUT/n).read_bytes()).hexdigest()} for n in files},'ffprobe':probes}
(OUT/'delivery-receipt.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='ffprobe'},indent=2),flush=True)
