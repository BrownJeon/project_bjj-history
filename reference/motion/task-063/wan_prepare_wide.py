"""Preserve the reference pose and add room for a visible rearward landing."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageOps,ImageDraw,ImageFilter
ROOT=Path.home()/'.local/share/bjj-rive/task-063/wan-local'
source=ROOT.parent/'original.png'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='a6e99ea8eab51254a3d5f53127904d91c22733ef3f55a22d90752c4b9770435d'
im=Image.open(source).convert('RGBA');fitted=ImageOps.contain(im,(540,540),Image.Resampling.LANCZOS)
canvas=Image.new('RGBA',(896,672),(229,231,231,255));shadow=Image.new('RGBA',canvas.size);d=ImageDraw.Draw(shadow)
d.ellipse((45,597,422,636),fill=(62,67,74,75));d.ellipse((385,625,565,651),fill=(62,67,74,62))
canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(9)))
canvas.alpha_composite(fitted,(20,112));dest=ROOT/'tripod-input-wide.png';canvas.convert('RGB').save(dest)
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'input_sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'dimensions':[896,672],'whole_original_pose':True,'fit':[540,540],'offset':[20,112],'changes':['neutral mat composite','ground contact shadows','unoccupied landing area at right'],'character_redrawing':False}
(ROOT/'input-wide-receipt.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
