# Tripod sweep: local motion experiment

User-approved scope: install an isolated runtime on the existing M4 Pro,
download only the selected 17.14GB Wan Q4 files, and generate short motion from
the supplied photo and technique description. No paid generation API, external
photo/prompt upload, app/DB change or deployment was used.

## Recorded setup

- M4 Pro, 24GiB; independent Python 3.12.13 environment.
- Runtime `Blaizzy/mlx-video@87db56a51758fefb748a359b90a5283bb8ba4837`.
- Model `SceneWorks/wan2.2-ti2v-5b-mlx@bb1b055249614cf9d7cf4373fbdbc184b77dee88`,
  `q4/` only. Five files: 17,142,889,289 bytes. All expected hashes matched.
- Runtime and model headers matched; 85 installed dependencies passed pip check.
- The task adapter preserves native BF16 T5 weights and upstream FP32 attention,
  verifies finite text contexts, and reuses them in a separate generation process.
  The tokenizer is loaded from the supplied local JSON. HF offline and telemetry
  controls are enabled. Upstream sources remain unchanged.
- The MLX Metal allocator limit is about 16GiB for this process; it is not an
  OS-wide or RSS memory cap. No system limit was disabled.

## Results

| Candidate | Native output | Generation | Review |
|---|---|---|---|
| 01 | 384×384, 81f, 12 steps | 235.115s | Extra head/body: visual failure |
| 02 | 448×448, 97f, 40 steps | 964.091s | Identity improved; support/landing/framing insufficient |
| 03 | 512×384, 97f, 40 steps | 975.753s | Selected motion experiment; exact contacts/anatomy remain limited |

Candidate 03 adds empty landing space to the right without redrawing the input
characters. It shows the white-gi character lowering backward/right and the
blue-gi character following up. Main and coach reviewed 24 sampled frames and
the final frame. This is not a verified instructional demonstration: the exact
heel hook, hand/ankle contact, overlapping extremities and a skin-colored shape
behind the guard's pelvis remain ambiguous. User quality approval is pending.

Final native MP4 is unchanged: 97 frames at 24fps, 4.041667 seconds, H.264,
719,758 bytes, SHA256
`f6f940457204d47093ca772f377e70833a683302be3bdc30cfa6aa04b65d86fc`.
M4 and local full decoding reported zero errors. All four delivered file hashes
matched. The GIF is only a 12fps preview; motion was not interpolated or retimed.

## Paths and reproducibility

- Local delivery: `/Users/brownjeon/.codex/artifacts/bjj-t063/final-03/`.
- M4 task: `/Users/brownjeon/.local/share/bjj-rive/task-063/wan-local/`.
- Canonical evidence: `docs/verification/task-063-motion-remake.json` in the repo.
- `wan-model-manifest.json` fixes the model file list and expected hashes.
- `wan_preflight.py`, `wan_install.py`, `wan_download.py` prepare the isolated tool.
- `wan_prepare_input.py` / `wan_prepare_wide.py` create uncropped local inputs.
- `wan_infer.py` / `wan_launch.py` run offline text preparation and generation.
- `wan_contact_sheet.py` and `wan_package.py` produce review/delivery previews.
- Existing `reference/rive/task-062/m4_bridge.py` transports files through the
  already configured Ubuntu-to-M4 SSH route. It never uploads to an AI service.

Large weights and the runtime environment stay on M4. The original PNG remains
unchanged. Earlier failed Rive and SVD experiments are retained, not overwritten.
