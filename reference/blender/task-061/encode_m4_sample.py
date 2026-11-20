"""Encode the task's rendered frames on M4 using its existing FFmpeg."""
from pathlib import Path
import hashlib
import json
import subprocess
import time
from PIL import Image, ImageDraw, ImageFont

base = Path.home() / '.local/share/bjj-blender/task-061'
plan = json.loads((base / 'run-plan.json').read_text())
label = plan['label']
assert label.replace('-', '').isalnum()
output = base / label
meta = json.loads((output / 'pose-metadata.json').read_text())
fps, total = meta['fps'], meta['frames']
frames = output / 'frames'
assert all((frames / ('frame-%04d.png' % f)).exists() for f in range(1, total + 1))
ffmpeg, ffprobe = '/opt/homebrew/bin/ffmpeg', '/opt/homebrew/bin/ffprobe'
texts = {
    'title': '싱글엑스 가드',
    'subtitle': '진입 · 유지   /   3D 동작 샘플',
    'phase1': '01   발목 접촉',
    'phase2': '02   골반을 다리 아래로',
    'phase3': '03   바깥발과 안쪽 훅 연결',
    'phase4': '04   감싸서 유지',
    'roles': '파랑 · 서 있는 역할       흰색 · 가드',
}
for key, value in texts.items():
    (output / (key + '.txt')).write_text(value, encoding='utf-8')
font_path = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
font_index = 0
for index in range(12):
    try:
        candidate = ImageFont.truetype(font_path, 40, index=index)
        if candidate.getname()[1].lower() in ('semibold', 'bold'):
            font_index = index
            break
    except OSError:
        break


def caption_layer(phase):
    canvas = Image.new('RGBA', (960, 960), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 960, 119), fill='#17232e')
    draw.rectangle((0, 840, 960, 960), fill='#17232e')
    for text, size, y, color in (
        (texts['title'], 40, 24, '#ffffff'),
        (texts['subtitle'], 22, 80, '#adbcca'),
        (texts[phase], 30, 858, '#ffffff'),
        (texts['roles'], 20, 912, '#b1bdc8'),
    ):
        font = ImageFont.truetype(font_path, size, index=font_index)
        draw.text((48, y), text, font=font, fill=color)
    draw.rectangle((48, 837, 912, 839), fill='#456174')
    path = output / (phase + '.png')
    canvas.save(path)
    return path


layers = [caption_layer('phase' + str(i)) for i in range(1, 5)]
graph = ['[0:v]pad=960:960:0:120:color=0x17232e[base]']
times = ('lt(t,1.3)', 'gte(t,1.3)*lt(t,4.6)', 'gte(t,4.6)*lt(t,6.6)', 'gte(t,6.6)')
for i, enable in enumerate(times, 1):
    prior = 'base' if i == 1 else 's' + str(i - 1)
    graph.append(f"[{prior}][{i}:v]overlay=0:0:shortest=1:enable='{enable}'[s{i}]")
movie = output / 'single-x-guard-sample.mp4'
started = time.time()
with (output / 'encode.log').open('w') as log:
    inputs = [ffmpeg, '-y', '-hide_banner', '-framerate', str(fps), '-start_number', '1',
              '-i', str(frames / 'frame-%04d.png')]
    for layer in layers:
        inputs += ['-loop', '1', '-i', str(layer)]
    subprocess.run(inputs + ['-filter_complex', ';'.join(graph), '-map', '[s4]',
                    '-r', str(fps), '-frames:v', str(total),
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart', '-an', str(movie)], check=True,
                   stdout=log, stderr=subprocess.STDOUT)
    subprocess.run([ffmpeg, '-y', '-hide_banner', '-ss', '8', '-i', str(movie),
                    '-frames:v', '1', str(output / 'poster.png')],
                   check=True, stdout=log, stderr=subprocess.STDOUT)
    subprocess.run([ffmpeg, '-y', '-hide_banner', '-i', str(movie),
                    '-filter_complex',
                    'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
                    '-loop', '0', str(output / 'preview.gif')],
                   check=True, stdout=log, stderr=subprocess.STDOUT)
probe = json.loads(subprocess.check_output([
    ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(movie)], text=True))
with (output / 'decode.log').open('w') as log:
    subprocess.run([ffmpeg, '-v', 'error', '-i', str(movie), '-f', 'null', '-'],
                   check=True, stdout=log, stderr=subprocess.STDOUT)
files = {}
for name in ('single-x-guard-sample.mp4', 'single-x-guard-sample.blend', 'poster.png',
             'preview.gif', 'pose-metadata.json', 'build-info.json'):
    p = output / name
    files[name] = {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
report = {'encoder': 'FFmpeg on Apple M4 Pro', 'captions': 'Pillow PNG layers on M4',
          'encode_elapsed_seconds': round(time.time() - started, 3),
          'fps': fps, 'frames': total, 'duration_seconds': total / fps,
          'additional_generation_api_calls': 0, 'decode_errors': 0,
          'files': files, 'ffprobe': probe}
(output / 'delivery-receipt.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'ffprobe'}, ensure_ascii=False, indent=2), flush=True)
