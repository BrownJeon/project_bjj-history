# Native Rive 2D single-X study

The generator uses the supplied original-character PNG cutouts and manifest.
Every limb is parented to an actual Rive `RootBone`/`Bone` chain. Images preserve
the same 0.9 source scale; no simple vector characters replace the source art.
Two artboards contain the same 12-second, 24fps baked native timeline:

- `Clean`: source-character cutouts.
- `Rig`: the same cutouts and bones, plus colored bone axes and joint circles.

The pose is ankle control → reclining entry → placing the outer foot on the
captured-side hip and the inner hook behind that same leg → hold. The cutouts
are rigid articulated parts, not a skinned cloth mesh. Source front-view art
rotating in a 2D plane cannot reproduce all 3D occlusion/foreshortening; this is
a comparison sample, not verified instructional footage.

Each limb keeps one geometric IK branch throughout the clip. The near foot starts
raised by the captured calf, and the far foot starts moving during the reclining
phase along a hip-relative polar arc, avoiding a path through its own hip.
Native rotation keys are unwrapped before interpolation;
generator stdout reports both reach error and the maximum adjacent-frame bone
rotation change. Reach alone is not a continuity or contact-quality pass.
The current generated clip has a computed maximum adjacent bone rotation change
of 0.056067 radians (about 3.22 degrees) at 24fps, with no steps above 0.35 radians;
actual runtime inspection and visual checking remain the parent's verification.

```sh
python3 generate_project.py --manifest asset-manifest.json --project-dir project
```

The parent copies the local project and assets to the isolated M4 directory,
then uses the installed official CLI 1.9.2 to run `--verify`, `inspect --summary`
and actual `Clean`/`Rig` PNG captures. Generator stdout contains pose coordinates
and reach errors for checking before recording the result. It writes only
`project/scene.rml` and `project/rive.yaml`.

All CLI calls use the isolated `RIVE_HOME`, `RIVE_ANALYTICS=off`,
`DO_NOT_TRACK=1` and `CI=1`. No account, publish, push, cloud render, Luau,
AnimaScript or external API is part of this project.

## Recorded native result (2026-11-10)

The M4 Pro rendered 288 frames for each of `Clean` and `Rig` using actual Rive
CLI 1.9.2. Verification reported no errors or warnings; inspection reported no
problems after the fixed-branch IK correction. Independently parsed rotation
keys have a maximum adjacent step of 0.0560663 radians (3.212 degrees).
Capture and verification took 32.153 seconds. Side-by-side composition,
encoding and packaging took 14.285 seconds. These timings exclude authoring.

The comparison MP4 is 12 seconds, 24fps, 1600×1000 H.264/yuv420p, 288 frames.
Full FFmpeg decoding completed without errors. Original source hashes, all
28 derived parts and all five delivery hashes were checked. The verification
receipt is `docs/verification/task-062-rive-2d-sample.json` in the repository.

Local delivery files are under
`/Users/brownjeon/.codex/artifacts/bjj-t062/final-01/`: MP4, GIF, poster,
contact sheet and `rive-2d-project.zip`. The ZIP contains RML, YAML, the asset
manifest and 28 PNGs. It contains no published/signed `.riv` or editor `.rev`.

This is a rigid-cutout rigging study. Joint cut edges, depth ordering,
foreshortening and hand/foot contact need further authoring; native schema and
motion-continuity checks do not establish instructional accuracy. User quality
approval and app integration remain pending. No login, cloud upload/publish,
paid generation API, app/DB change or deployment was used.

Authoring references were read from the actual installed CLI: `docs rigging`,
`assets`, `skeleton`, `transforms`, `easing`, `format`, and the `RootBone`,
`Bone`, `Image`, `DrawRules`, `DrawTarget`, `LinearAnimation`, `Ellipse` and
`Rectangle` schemas. RML is generated from those current definitions.
