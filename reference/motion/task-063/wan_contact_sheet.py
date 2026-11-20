"""Create aspect-preserving review sheets from the generated native video."""
from pathlib import Path
import json,subprocess,tempfile
from PIL import Image,ImageDraw
ROOT=Path.home()/'.local/share/bjj-rive/task-063/wan-local'
plan=json.loads((ROOT/'review-plan.json').read_text());candidate=plan['candidate']
assert candidate in ['candidate-02','candidate-03']
folder=ROOT/'runs'/candidate
receipt=json.loads((folder/'generate-receipt.json').read_text());assert receipt['status']=='generated'
native=folder/'tripod-native.mp4'
with tempfile.TemporaryDirectory(dir=folder,prefix='review-frames-') as temp:
    pattern=str(Path(temp)/'frame-%04d.png')
    subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(native),'-vf','fps=6',pattern],check=True)
    frames=sorted(Path(temp).glob('*.png'))
    sheet=Image.new('RGB',(4*320,((len(frames)+3)//4)*264),'#15171e');draw=ImageDraw.Draw(sheet)
    for i,file in enumerate(frames):
        im=Image.open(file).convert('RGB');im.thumbnail((320,240),Image.Resampling.LANCZOS)
        x=(i%4)*320;y=(i//4)*264
        sheet.paste(im,(x+(320-im.width)//2,y+(240-im.height)//2))
        draw.text((x+10,y+244),f'{i/6:.2f}s',fill='white')
    sheet.save(folder/'contact-sheet-detailed.png')
    # Preserve the automatic square thumbnail sheet; replace only this
    # generated review image, never the native video or user reference.
    old=folder/'contact-sheet.png';saved=folder/'contact-sheet-automatic.png'
    if old.exists() and not saved.exists():old.rename(saved)
    picks=[round(i*(len(frames)-1)/7) for i in range(8)]
    small=Image.new('RGB',(4*384,2*320),'#15171e');d=ImageDraw.Draw(small)
    for i,k in enumerate(picks):
        im=Image.open(frames[k]).convert('RGB');im.thumbnail((384,288),Image.Resampling.LANCZOS)
        x=(i%4)*384;y=(i//4)*320
        small.paste(im,(x+(384-im.width)//2,y+(288-im.height)//2));d.text((x+10,y+298),f'{k/6:.2f}s',fill='white')
    small.save(folder/'contact-sheet.png')
print(json.dumps({'candidate':candidate,'sampled_frames':len(frames),'fps':6,'aspect_preserved':True,'native_video_modified':False}))
