"""Local whole-image compositing for the user-approved photo-to-video run."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageOps,ImageDraw,ImageFilter

ROOT=Path.home()/'.local/share/bjj-rive/task-063/wan-local'
source=ROOT.parent/'original.png'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='a6e99ea8eab51254a3d5f53127904d91c22733ef3f55a22d90752c4b9770435d'
original=Image.open(source).convert('RGBA')
fitted=ImageOps.contain(original,(600,600),Image.Resampling.LANCZOS)
canvas=Image.new('RGBA',(640,640),(229,231,231,255))
floor=Image.new('RGBA',canvas.size);d=ImageDraw.Draw(floor)
d.ellipse((70,594,583,630),fill=(62,67,74,60))
canvas.alpha_composite(floor.filter(ImageFilter.GaussianBlur(12)))
offset=((640-fitted.width)//2,620-fitted.height)
canvas.alpha_composite(fitted,offset)
dest=ROOT/'tripod-input.png';canvas.convert('RGB').save(dest)
receipt={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'input_sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'whole_image_contained':True,'size':[640,640],'offset':offset,'character_redrawing':False,'changes':['composite transparency on neutral mat color','soft ground shadow','uncropped padding']}
(ROOT/'input-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
