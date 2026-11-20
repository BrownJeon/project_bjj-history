"""Run through m4_bridge.py; job configuration lives only in task-061/run-plan.json."""
from pathlib import Path
import json
import os
import subprocess
import time

base = Path.home() / '.local/share/bjj-blender'
task = base / 'task-061'
plan = json.loads((task / 'run-plan.json').read_text())
label = plan['label']
assert label.replace('-', '').isalnum()
output = task / label
output.mkdir(parents=True, exist_ok=True)
binary = base / 'tools/blender-4.5.15/Blender.app/Contents/MacOS/Blender'
source = task / 'source/make_sample.py'
args = [str(binary), '--background', '--factory-startup', '--python-exit-code', '1',
        '--python', str(source), '--', '--output-dir', str(output),
        '--preview-frames', plan.get('preview_frames', '1,72,144,240'),
        '--samples', str(plan.get('samples', 16)),
        '--resolution-percent', str(plan.get('resolution_percent', 50))]
if plan.get('render_all'):
    args.append('--render-all')
env = os.environ.copy()
env['BLENDER_USER_CONFIG'] = str(task / 'blender-config')
env['BLENDER_USER_SCRIPTS'] = str(task / 'blender-scripts')
start = time.time()
print(json.dumps({'phase': 'render_started', 'label': label, 'args': args}), flush=True)
with (output / 'render.log').open('w') as log:
    result = subprocess.run(args, env=env, stdout=log, stderr=subprocess.STDOUT)
files = [p for p in sorted(output.rglob('*')) if p.is_file()]
report = {
    'returncode': result.returncode,
    'elapsed_seconds': round(time.time() - start, 3),
    'plan': plan,
    'output': str(output),
    'file_count': len(files),
    'files_sample': [str(p.relative_to(output)) for p in files[:12]],
    'png_count': sum(p.suffix.lower() == '.png' for p in files),
}
(output / 'render-job.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
print('\n'.join((output / 'render.log').read_text().splitlines()[-25:]), flush=True)
raise SystemExit(result.returncode)
