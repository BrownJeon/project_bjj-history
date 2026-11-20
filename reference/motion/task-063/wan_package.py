#!/usr/bin/env python3
"""Package the reviewed task-063 candidate without changing its native video.

Run on M4 only after delivery-plan.json selects candidate-02 or candidate-03 and
marks its internal visual review as quality_reviewed (not user approval).
This script makes no network requests and loads no AI models.
It requires the already installed Pillow, ffmpeg and ffprobe. GIF/poster files
are previews; the delivered MP4 is a byte-for-byte copy of the native MP4.
"""

from fractions import Fraction
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT_PATH = Path.home() / '.local/share/bjj-rive/task-063/wan-local'
FFMPEG = Path('/opt/homebrew/bin/ffmpeg')
FFPROBE = Path('/opt/homebrew/bin/ffprobe')
ALLOWED_CANDIDATES = ('candidate-02', 'candidate-03')
EXPECTED_FPS = Fraction(24, 1)
DELIVERY_NAMES = (
    'tripod-sweep.mp4', 'preview.gif', 'poster.png', 'contact-sheet.png',
    'delivery-receipt.json',
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def describe(path):
    return {'file': path.name, 'bytes': path.stat().st_size, 'sha256': sha256(path)}


def read_json(path):
    require(path.is_file(), f'Required JSON file is missing: {path}')
    require(path.stat().st_size <= 4 * 1024 * 1024,
            f'Unexpectedly large JSON file: {path}')
    result = json.loads(path.read_text())
    require(isinstance(result, dict), f'Expected a JSON object: {path}')
    return result


def run(command, timeout=300):
    result = subprocess.run([str(item) for item in command], capture_output=True,
                            text=True, timeout=timeout, check=False)
    if result.returncode:
        # Keep diagnostic output bounded; do not retry with different settings.
        raise RuntimeError(
            f'{Path(command[0]).name} exited {result.returncode}: '
            + (result.stderr.strip()[-6000:] or 'no stderr was produced'))
    return result.stdout


def inspect_video(path, expected_frames, expected_width, expected_height):
    raw = run([FFPROBE, '-v', 'error', '-count_frames', '-show_streams',
               '-show_format', '-of', 'json', path])
    probe = json.loads(raw)
    streams = probe.get('streams', [])
    require(len(streams) == 1 and streams[0].get('codec_type') == 'video',
            'Native MP4 must contain exactly the generated video stream')
    video = streams[0]
    require(video.get('codec_name') == 'h264',
            f'Native codec is {video.get("codec_name")!r}; expected h264')
    for field in ('avg_frame_rate', 'r_frame_rate'):
        try:
            rate = Fraction(video[field])
        except (KeyError, ValueError, ZeroDivisionError) as error:
            raise ValueError(f'ffprobe did not supply a usable {field}') from error
        require(rate == EXPECTED_FPS,
                f'{field} is {rate}; expected exactly 24 fps')
    require((video.get('width'), video.get('height')) ==
            (expected_width, expected_height),
            'Native dimensions do not match the generation receipt plan')
    try:
        counted = int(video['nb_read_frames'])
    except (KeyError, ValueError) as error:
        raise ValueError('ffprobe could not count the decoded native frames') from error
    require(counted == expected_frames,
            f'Counted {counted} frames; receipt requires {expected_frames}')
    if video.get('nb_frames') not in (None, 'N/A'):
        require(int(video['nb_frames']) == expected_frames,
                'Container frame count differs from the generation receipt')
    expected_duration = Fraction(expected_frames, 1) / EXPECTED_FPS
    durations = {}
    if video.get('duration_ts') is not None and video.get('time_base'):
        durations['stream_timestamps'] = (
            Fraction(str(video['duration_ts'])) * Fraction(video['time_base']))
    for label, value in (
        ('stream_seconds', video.get('duration')),
        ('container_seconds', probe.get('format', {}).get('duration')),
    ):
        if value not in (None, 'N/A'):
            durations[label] = Fraction(str(value))
    require(durations, 'ffprobe did not report a native duration')
    # MP4 format duration is rounded to milliseconds; never accept a full-frame
    # discrepancy or repair it by cutting/stretching the original video.
    for label, duration in durations.items():
        require(abs(duration - expected_duration) <= Fraction(2, 1000),
                f'{label} is {float(duration):.6f}s; '
                f'expected {float(expected_duration):.6f}s')
    return {
        'codec': 'h264', 'fps': 24, 'fps_fraction': '24/1',
        'frames': counted, 'duration_seconds': float(expected_duration),
        'width': expected_width, 'height': expected_height,
        'reported_durations': {k: float(v) for k, v in durations.items()},
    }


def main():
    # Resolve every task path before writing, including existing symlinks.
    root = ROOT_PATH.resolve(strict=True)
    require(root == ROOT_PATH.absolute(), 'Task root must not be a symlink')

    def inside(path, exists=False):
        resolved = path.resolve(strict=exists)
        require(resolved.is_relative_to(root), f'Path escapes task root: {path}')
        return resolved

    plan_path = inside(root / 'delivery-plan.json', exists=True)
    plan = read_json(plan_path)
    require(plan.get('candidate') in ALLOWED_CANDIDATES,
            f'delivery-plan.json must select one of {ALLOWED_CANDIDATES}')
    require(plan.get('quality_reviewed') is True,
            'Internal visual review is pending: quality_reviewed must be true')
    candidate = plan['candidate']
    source_dir = inside(root / 'runs' / candidate, exists=True)
    source_receipt = inside(source_dir / 'generate-receipt.json', exists=True)
    generated = read_json(source_receipt)
    require(generated.get('status') == 'generated',
            'Generation receipt is not status=generated')
    require(generated.get('phase') == 'generate', 'Receipt phase is not generate')
    require(generated.get('paid_api_calls') == 0 and
            generated.get('image_upload') is False,
            'Receipt does not establish paid_api_calls=0 and image_upload=false')
    generation_plan = generated.get('plan', {})
    require(generation_plan.get('label') == candidate,
            'Generation receipt belongs to a different candidate')
    values = [generation_plan.get(name) for name in ('frames', 'width', 'height')]
    require(all(type(value) is int and value > 0 for value in values),
            'Generation receipt is missing positive integer frames/width/height')
    frames, width, height = values
    require(generated.get('output_shape') == [frames, height, width, 3],
            'Generation receipt output_shape does not match its plan')
    native = inside(source_dir / 'tripod-native.mp4', exists=True)
    require(native.is_file(), 'Native MP4 is missing')
    declared = generated.get('movie', {})
    native_description = describe(native)
    require(type(declared.get('bytes')) is int and
            declared['bytes'] == native_description['bytes'] > 0,
            'Native MP4 byte count differs from the generation receipt')
    require(declared.get('sha256') == native_description['sha256'],
            'Native MP4 SHA256 differs from the generation receipt')
    for executable in (FFMPEG, FFPROBE):
        require(executable.is_file(), f'Existing executable is missing: {executable}')
    video_info = inspect_video(native, frames, width, height)

    from PIL import Image

    contact = inside(source_dir / 'contact-sheet.png', exists=True)
    require(contact.is_file(), 'Generation contact sheet is missing')
    with Image.open(contact) as image:
        require(image.format == 'PNG', 'Generation contact sheet is not a PNG')
        image.verify()
    destination = inside(root / 'delivery' / candidate)
    destination.mkdir(parents=True, exist_ok=True)
    for name in DELIVERY_NAMES:
        output = inside(destination / name)
        require(not output.exists(),
                f'Delivery output already exists; no files were replaced: {output}')

    with tempfile.TemporaryDirectory(prefix='.package-', dir=destination) as temporary:
        stage = inside(Path(temporary), exists=True)
        movie = stage / 'tripod-sweep.mp4'
        shutil.copyfile(native, movie)
        require(describe(movie)['sha256'] == native_description['sha256'] and
                movie.stat().st_size == native_description['bytes'],
                'Native MP4 copy did not preserve bytes and SHA256')
        gif = stage / 'preview.gif'
        gif_filter = (
            '[0:v]fps=12,scale=512:512:force_original_aspect_ratio=decrease:'
            'flags=lanczos,split[a][b];'
            '[a]palettegen=stats_mode=diff[p];'
            '[b][p]paletteuse=dither=sierra2_4a'
        )
        run([FFMPEG, '-nostdin', '-v', 'error', '-n', '-i', native,
             '-filter_complex', gif_filter, '-loop', '0', gif])
        middle = (frames - 1) // 2
        poster = stage / 'poster.png'
        run([FFMPEG, '-nostdin', '-v', 'error', '-n', '-i', native,
             '-vf', f'select=eq(n\\,{middle})', '-frames:v', '1', poster])
        shutil.copyfile(contact, stage / 'contact-sheet.png')
        with Image.open(gif) as image:
            require(image.format == 'GIF' and max(image.size) == 512,
                    'GIF preview is not a 512px GIF')
            require(getattr(image, 'n_frames', 1) > 1,
                    'GIF preview contains fewer than two frames')
            gif_info = {'width': image.width, 'height': image.height,
                        'encoded_frames': image.n_frames, 'filter_fps': 12,
                        'loop': image.info.get('loop')}
            image.verify()
        with Image.open(poster) as image:
            require(image.format == 'PNG' and image.size == (width, height),
                    'Poster does not match the native frame dimensions')
            image.verify()
        require(sha256(stage / 'contact-sheet.png') == sha256(contact),
                'Contact sheet copy differs from its source')
        # Recheck the source before publishing staged artifacts. No operation in
        # this script writes, retimes, trims or replaces that source.
        require(describe(native) == native_description,
                'Native MP4 changed during packaging; nothing was published')
        receipt = {
            'schema_version': 1, 'status': 'packaged', 'candidate': candidate,
            'quality_reviewed': True, 'user_quality': 'pending',
            'user_quality_pending': True, 'paid_api_calls': 0,
            'external_upload': False, 'image_upload': False,
            'native_video_modified': False,
            'source_generate_receipt': str(source_receipt.relative_to(root)),
            'source_generate_receipt_sha256': sha256(source_receipt),
            'source_video': str(native.relative_to(root)),
            'movie': {**describe(movie), **video_info},
            'preview_gif': {**describe(gif), **gif_info},
            'poster': {**describe(poster), 'native_frame_index': middle,
                       'native_time_seconds': middle / 24},
            'contact_sheet': describe(stage / 'contact-sheet.png'),
            'preview_processing': 'ffmpeg fps/scale/palette only; native MP4 copied unchanged',
        }
        (stage / 'delivery-receipt.json').write_text(
            json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        # Receipt is moved last, so an interrupted run cannot present a complete
        # delivery receipt before all four artifacts have been published.
        for name in DELIVERY_NAMES:
            output = inside(destination / name)
            require(not output.exists(), f'Output appeared during packaging: {output}')
            (stage / name).rename(output)
    print(json.dumps({'status': 'packaged', 'delivery': str(destination),
                      'movie': receipt['movie'], 'user_quality': 'pending'},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'failed', 'error_type': type(error).__name__,
                          'reason': str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
