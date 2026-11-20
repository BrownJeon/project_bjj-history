# White gi character: unchanged baseline rig

Prepared on the existing M4 with Pillow/NumPy and native Rive CLI. No new
installation, generative image call, paid API or cloud publication was used.
The task-064 character and original PNG were read only.

The approved white-gi sheet supplies the visible face, black hair, brown belt,
white cotton, hands and feet. White cotton uses hand-traced silhouettes and
edge-connected backdrop removal, with the garment interior protected. Hidden
cloth beneath the sleeve and the hand over the thigh is reconstructed using
cloth/belt pixels from that same sheet. Far limbs reuse the same side texture;
this does not reconstruct a genuinely unseen view.

## Preserved baseline

- Sixteen hierarchical bones and sixteen native local RotationConstraints on
  both Clean and Rig artboards; unchanged 15 seconds at 24 fps.
- Profile SHA256: `ce9e93d2c1a2d637a59d3d20b8dafe57f42671ed103ccfae9ab99a24e6dd50f8`.
- Timeline SHA256: `72f1570e147a16954fbb8201b133f59589f21021cf6d64c2f167a0be408faa96`.
- Source PNG SHA256: `ab83010155438952c6a9bb211f35bb283880201553b2f52f090d5e62d0b2d271`.
- No proposed tripod angle range or new motion profile was applied.

The local `rig_profile.json` and `project/timeline.json` are exact copies of
the task-064 baseline. The limits are sample animation limits, not medical
normal ranges. `baseline-copy-receipt.json` records their M4 sources and hashes.

## Actual native review

`review-01/verify.json` reports success, no errors and no warnings. Each
artboard contains RootBone 1, Bone 15, RotationConstraint 16, Mesh 10, Skin 10,
MeshVertex/Weight 4399, and KeyFrameDouble 6498. The CPU frame-zero bind identity
error is at most `1.28e-13` pixels. The two artifacts are distinct evidence:
`skin-build-receipt.json` describes source generation; `capture-receipt.json`
describes the subsequent actual native run.

Four actual 900×900 native PNGs were downloaded and visually inspected:

- `review-01/clean-neutral.png`: original face/hair, white gi and brown belt.
- `review-01/clean-curl.png`: continuous sleeve following the elbow bend.
- `review-01/clean-squat.png`: baseline shallow squat and stationary soles.
- `review-01/rig-knee.png`: the cyan hierarchy and lifted bending leg.

No large holes in white fabric or retained finger marks on the thigh were
observed after the mask correction. Fine jagged raster edges and the restored
rear jacket hem remain visible limitations. These stills do not establish
quality for deep tripod poses, a second viewpoint or full motion playback.
User visual approval remains pending.

## Reproduction on M4

The task-owned directory is
`/Users/brownjeon/.local/share/bjj-rive/task-065/white-character`.
`prepare_skin_m4.py` reads the original copied to `source/white-gi-brown-belt.png`
and task-064 profile/timeline read only. `generate_skin.py` reads the task-owned
baseline copies and reuses only Drawing from task-064. Run in this order using
the existing M4 Python environment:

```sh
python3 prepare_skin_m4.py
python3 generate_skin.py
python3 capture_review_m4.py
```

The capture script sets `RIVE_HOME` to the existing tools directory and
`RIVE_ANALYTICS=off`, `DO_NOT_TRACK=1`, `CI=1`. It captures only four baseline
stills. The generator does not alter the baseline profile or timeline.
Native image layers, mesh vertices, weights, triangles and explicit layer order
are in `project/skin-assets.json`; prepared PNGs are in `project/assets/`.
