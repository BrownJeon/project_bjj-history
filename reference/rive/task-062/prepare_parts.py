"""Extract rigging cutouts from the approved sheets; run with existing Pillow on M4."""
from collections import deque
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = Path.home() / '.local/share/bjj-rive/task-062'
OUT = BASE / 'project'
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)

# Joint pivots were read against the original 1536x1024 character sheets.
# Each extracted PNG is oriented so proximal -> distal runs along local +X.
PARTS = {
    'head': ((300,315),(300,145),[(229,174),(244,157),(255,151),(260,141),(280,145),(296,128),(311,143),(327,137),(328,151),(349,158),(343,166),(362,177),(350,183),(362,201),(351,207),(354,226),(346,233),(341,253),(329,271),(329,284),(319,293),(320,310),(281,310),(279,290),(266,275),(258,254),(247,239),(245,224),(236,219),(243,203),(232,198),(244,183)]),
    'torso': ((300,550),(300,315),[(269,274),(331,274),(364,305),(365,335),(353,382),(356,423),(364,471),(366,549),(345,554),(336,580),(311,580),(302,548),(286,548),(276,581),(252,577),(255,551),(229,550),(231,475),(237,429),(239,380),(227,337),(229,309)]),
    'upper_arm_l': ((239,325),(187,426),[(222,304),(245,314),(254,339),(244,372),(222,413),(219,438),(171,432),(177,401),(191,364),(203,332)]),
    'forearm_l': ((187,426),(164,516),[(170,415),(221,426),(210,464),(196,506),(179,527),(134,513),(143,480),(154,443)]),
    'hand_l': ((164,516),(166,574),[(153,510),(176,515),(177,530),(184,548),(181,562),(176,566),(173,553),(171,551),(173,571),(169,582),(162,582),(158,574),(151,570),(146,559),(147,542),(151,527)]),
    'upper_arm_r': ((365,325),(406,427),[(349,312),(373,302),(389,325),(402,358),(416,391),(434,430),(391,441),(379,406),(366,373),(351,344)]),
    'forearm_r': ((406,427),(435,517),[(389,418),(434,419),(444,453),(451,479),(465,514),(420,530),(409,497),(399,462)]),
    'hand_r': ((435,517),(437,575),[(423,512),(444,511),(449,535),(453,550),(453,563),(448,573),(441,581),(435,583),(432,576),(435,559),(430,551),(429,565),(423,568),(418,561),(420,546),(423,533)]),
    'thigh_l': ((247,560),(232,724),[(207,544),(297,548),(288,583),(280,615),(270,656),(260,712),(258,739),(197,740),(195,699),(194,638),(198,583)]),
    'shin_l': ((232,724),(224,881),[(198,705),(259,710),(260,746),(256,785),(254,833),(254,883),(244,890),(194,885),(192,838),(194,791),(197,749)]),
    'foot_l': ((224,881),(206,925),[(198,876),(250,880),(250,900),(253,917),(246,930),(235,941),(211,942),(188,940),(174,935),(170,928),(178,917),(195,901)]),
    'thigh_r': ((351,560),(363,724),[(302,547),(385,544),(393,586),(399,634),(397,681),(392,740),(333,739),(330,705),(324,662),(315,616)]),
    'shin_r': ((363,724),(370,882),[(332,707),(393,706),(395,750),(395,792),(399,835),(399,884),(344,890),(341,844),(339,799),(336,751)]),
    'foot_r': ((370,882),(387,925),[(345,879),(397,879),(400,899),(413,915),(419,929),(413,938),(397,943),(375,941),(355,937),(347,929),(346,907)]),
}


def clean_background(crop, mask, offset, full, tolerance=7):
    """Only remove border-connected pixels close to the sheet's sampled backdrop."""
    w,h = crop.size
    pixels = crop.load()
    alpha = mask.load()
    eligible = bytearray(w*h)
    for y in range(h):
        bg = full.getpixel((100, y + offset[1]))[:3]
        for x in range(w):
            rgb = pixels[x,y][:3]
            eligible[y*w+x] = int(alpha[x,y] == 0 or max(abs(rgb[k]-bg[k]) for k in range(3)) <= tolerance)
    seen = bytearray(w*h)
    queue = deque()
    for y in range(h):
        for x in range(w):
            if (x in (0,w-1) or y in (0,h-1) or alpha[x,y]==0) and eligible[y*w+x]:
                at=y*w+x
                if not seen[at]:seen[at]=1;queue.append(at)
    while queue:
        at=queue.popleft();x,y=at%w,at//w
        for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0<=nx<w and 0<=ny<h:
                j=ny*w+nx
                if eligible[j] and not seen[j]:seen[j]=1;queue.append(j)
    for y in range(h):
        for x in range(w):
            if seen[y*w+x]:alpha[x,y]=0
    return mask.filter(ImageFilter.GaussianBlur(.38))


manifest = {'schema_version':1,'representation':'approved_2d_sheet_cutouts',
            'parts':{},'characters':{},'originals':{},'no_ai_image_generation':True}
atlas = Image.new('RGB',(1400,900),'#15171e')
draw = ImageDraw.Draw(atlas)
for row,color in enumerate(('blue','white')):
    source_path=BASE/'originals'/f'{color}.png'
    source=Image.open(source_path).convert('RGBA')
    digest=hashlib.sha256(source_path.read_bytes()).hexdigest()
    expected={'blue':'b53b8055020ae83c23e8926fcf42dc9dddb48ad05d13893bfc5933f34635ce8a',
              'white':'ab83010155438952c6a9bb211f35bb283880201553b2f52f090d5e62d0b2d271'}[color]
    assert digest==expected
    manifest['originals'][color]={'sha256':digest,'bytes':source_path.stat().st_size}
    manifest['characters'][color]={}
    for column,(part,(prox,distal,poly)) in enumerate(PARTS.items()):
        left=min(p[0] for p in poly)-3;top=min(p[1] for p in poly)-3
        right=max(p[0] for p in poly)+4;bottom=max(p[1] for p in poly)+4
        cropped=source.crop((left,top,right,bottom))
        mask=Image.new('L',cropped.size)
        ImageDraw.Draw(mask).polygon([(x-left,y-top) for x,y in poly],fill=255)
        # White cloth shadows resemble the sheet backdrop. Keep those pixels;
        # use only exact backdrop matching for garments to avoid torn cutouts.
        tolerance=1 if color=='white' and part not in ('head','hand_l','hand_r','foot_l','foot_r') else 7
        mask=clean_background(cropped,mask,(left,top),source,tolerance)
        if color=='blue' and part not in ('head','hand_l','hand_r','foot_l','foot_r'):
            # Indigo cotton, brown belt and warm skin are distinct from the
            # cool pale sheet. Remove remaining guide-line/background fringe.
            rgb=cropped.load();alpha=mask.load()
            for y in range(cropped.height):
                for x in range(cropped.width):
                    r,g,b=rgb[x,y][:3]
                    keep=(b-r>15 and b-g>15) or r-g>12 or r+g+b<330
                    if not keep:alpha[x,y]=0
            mask=mask.filter(ImageFilter.GaussianBlur(.25))
        cropped.putalpha(mask)
        # Restore full-sheet coordinates before sampling into bone space.
        page=Image.new('RGBA',source.size);page.alpha_composite(cropped,(left,top))
        dx,dy=distal[0]-prox[0],distal[1]-prox[1]
        length=math.hypot(dx,dy);ux,uy=dx/length,dy/length;vx,vy=-uy,ux
        projections=[((x-prox[0])*ux+(y-prox[1])*uy,(x-prox[0])*vx+(y-prox[1])*vy) for x,y in poly]
        minx=min(p[0] for p in projections)-5;maxx=max(p[0] for p in projections)+5
        miny=min(p[1] for p in projections)-5;maxy=max(p[1] for p in projections)+5
        pivot=(-minx,-miny);size=(math.ceil(maxx-minx),math.ceil(maxy-miny))
        output=page.transform(size,Image.Transform.AFFINE,(ux,vx,prox[0]-ux*pivot[0]-vx*pivot[1],
                                                        uy,vy,prox[1]-uy*pivot[0]-vy*pivot[1]),Image.Resampling.BICUBIC)
        name=f'{color}-{part}';path=ASSETS/(name+'.png');output.save(path)
        entry={'file':f'assets/{name}.png','width':size[0],'height':size[1],
               'pivot':[round(v,4) for v in pivot],'source_length':round(length,4),
               'source_joint_proximal':list(prox),'source_joint_distal':list(distal),
               'source_sha256':digest,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        manifest['parts'][name]=entry;manifest['characters'][color][part]=entry
        tile_x=(column%7)*200;tile_y=row*450+(column//7)*225
        thumb=output.copy();thumb.thumbnail((184,184))
        atlas.paste(thumb,(tile_x+(200-thumb.width)//2,tile_y+20),thumb)
        draw.text((tile_x+10,tile_y+206),name,fill='white')
(OUT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
atlas.save(BASE/'parts-atlas.png')
print(json.dumps({'parts':len(manifest['parts']),'manifest':str(OUT/'asset-manifest.json'),'originals':manifest['originals']},indent=2),flush=True)
