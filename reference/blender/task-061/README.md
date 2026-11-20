# Blender single-X guard sample

`make_sample.py` is a standalone Blender 4.5 LTS script. It creates two articulated,
stylized adult characters from procedural geometry, referring to the approved
blue/white gi character sheets. Blue has silver hair/blue eyes, White has dark
hair/brown eyes, and both wear a brown belt. The script does not modify those
reference images and does not need external textures, models, paid assets or APIs.

The 12-second, 24fps scene shows ankle contact, reclining entry, placing the outer
foot at the standing partner's hip and the inside foot behind the captured leg,
then holding. There is no sweep, joint lock or twisting finish. Joint targets use
two-link IK calculations, two-bone garment armatures with blended vertex weights,
and baked transformations; the characters do not depend
on a Python frame handler after the `.blend` file is saved.

```sh
Blender --background --factory-startup --python make_sample.py -- \
  --output-dir /absolute/task-061-preview \
  --preview-frames 1,72,144,240 --samples 16 --resolution-percent 50

Blender --background --factory-startup --python make_sample.py -- \
  --output-dir /absolute/task-061-final \
  --preview-frames 1,144,240 --samples 32 --resolution-percent 100 --render-all
```

Outputs: `single-x-guard-sample.blend`, `pose-metadata.json`, `build-info.json`,
preview PNGs and (only with `--render-all`) a `frames/frame-0001.png` sequence.
`encode_m4_sample.py` handles FFmpeg encoding and Korean caption PNG overlays
with the already-installed Pillow, on the same M4. No generated AI imagery or
paid service is used.

The second iteration replaces separate cylindrical sleeves/pants and spherical
joints with continuous skinned garment meshes. Long tapered bangs, temple locks
and nape hair replace the short rounded first-pass hair. A side three-quarter
camera makes the captured leg, outer-heel/hip and ankle grip easier to inspect.

This is a procedural 3D approximation, not the original 2D art converted
into a finished production character. Cloth is shaped rigid geometry, not a cloth
simulation. Hands, hair, facial features and gi folds are simplified. IK targets
and surface contact need frame-by-frame visual inspection; the metadata does not
prove collision-free motion or educational accuracy. It is not a verified lesson
demonstration until the user/qualified coach has reviewed it. Rendering on M4 and
the measured speed are verified separately by the parent session.

## Produced sample (2026-11-10)

- M4 Pro, 24GiB, macOS 26.3; official Blender 4.5.15 LTS arm64, checksum and code signature checked.
- 288 frames / 24fps / 12 seconds; 960x720 scene padded with captions to a 960x960 H.264 MP4.
- Full EEVEE job including four preview frames: 93.62 seconds, 24 samples. Encoding, poster and GIF: 2.032 seconds.
- Source and encoding use local geometry, standard-library code, Blender, existing FFmpeg/Pillow; no paid generation APIs or purchased assets.
- Delivered `.blend` reopened with auto-execution disabled: eight two-bone armatures, frames 1–288, baked movement, no Python frame handlers.
- Six downloaded deliverables matched their M4 byte counts and SHA256. MP4 decoded without error.
- Delivery: `/Users/brownjeon/.codex/artifacts/bjj-t061/final-01/`; M4 retained source/frames/project: `/Users/brownjeon/.local/share/bjj-blender/task-061/final-01/`.
- Verification receipt: `docs/verification/task-061-blender-sample.json`.

The main session made final pose refinements: closer outer-heel/hip target,
inside hook and knee alignment, visible-side hand target, and an offset/yawed
seated starting pose before the pelvis moves underneath the leg. Exact grips,
two-person pressure/collision and fidelity to the original 2D faces still need
further production work. The user has not approved the visual/technical quality.
