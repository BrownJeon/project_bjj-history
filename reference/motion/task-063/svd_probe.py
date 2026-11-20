#!/usr/bin/env python3
"""One offline SVD candidate; this does not establish technique correctness.

Run with the existing M4 Python environment. No model download, service API,
source-image modification, package installation, or runtime monkeypatching.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import traceback

EXPECTED_SOURCE_SHA256 = "a6e99ea8eab51254a3d5f53127904d91c22733ef3f55a22d90752c4b9770435d"
MODEL = "stabilityai/stable-video-diffusion-img2vid-xt"
DEFAULT_ROOT = Path("/Users/brownjeon/.local/share/bjj-rive/task-063/svd-probe")
DEFAULT_SOURCE = Path("/Users/brownjeon/.local/share/bjj-rive/task-063/original.png")


def write_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def memory_snapshot() -> dict:
    result = {"unix_time": time.time()}
    try:
        import resource

        result["own_peak_rss_bytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except Exception:
        pass
    return result


def run_worker(args: argparse.Namespace) -> int:
    root = args.output
    start = time.monotonic()
    stages = []
    outcome = {
        "status": "failed",
        "model": MODEL,
        "input_source_sha256": EXPECTED_SOURCE_SHA256,
        "parameters": {
            "width": 512,
            "height": 512,
            "num_frames": 14,
            "num_inference_steps": 12,
            "fps": 7,
            "min_guidance_scale": 1.0,
            "max_guidance_scale": 2.0,
            "motion_bucket_id": 96,
            "noise_aug_strength": 0.015,
            "decode_chunk_size": 1,
            "seed": 6301,
            "dtype": "float16",
            "offload_device": "mps",
            "local_files_only": True,
        },
        "scope": "Uncontrolled image-to-video preservation/motion probe; not a verified tripod sweep",
        "stages": stages,
    }
    pipe = None
    torch = None

    def phase(name: str, **details) -> None:
        item = {"phase": name, "elapsed_seconds": round(time.monotonic() - start, 3), **details}
        stages.append(item)
        write_json(root / "progress.json", item)
        print(json.dumps(item), flush=True)

    try:
        phase("checking_source")
        actual_hash = digest(args.source)
        if actual_hash != EXPECTED_SOURCE_SHA256:
            raise ValueError(f"Source hash mismatch: {actual_hash}")

        phase("importing_existing_packages")
        import torch as imported_torch
        from diffusers import StableVideoDiffusionPipeline
        from PIL import Image, ImageDraw, ImageOps

        torch = imported_torch
        if not torch.backends.mps.is_available():
            raise RuntimeError("MPS is unavailable; no alternative-device retry is permitted")
        outcome["torch_version"] = torch.__version__
        torch.set_num_threads(4)
        torch.mps.set_per_process_memory_fraction(0.70)

        original = Image.open(args.source).convert("RGBA")
        fitted = ImageOps.contain(original, (488, 488), Image.Resampling.LANCZOS)
        letterbox = Image.new("RGB", (512, 512), (232, 232, 229))
        offset = ((512 - fitted.width) // 2, (512 - fitted.height) // 2)
        letterbox.paste(fitted, offset, fitted)
        letterbox.save(root / "input-letterbox.png")
        outcome["input_transform"] = {
            "original_size": list(original.size),
            "contained_size": list(fitted.size),
            "offset": list(offset),
            "crop": False,
            "transparent_background_composite_rgb": [232, 232, 229],
        }
        phase("loading_cached_model")
        load_started = time.monotonic()
        pipe = StableVideoDiffusionPipeline.from_pretrained(
            MODEL,
            cache_dir="/Users/brownjeon/.cache/huggingface/hub",
            variant="fp16",
            torch_dtype=torch.float16,
            use_safetensors=True,
            local_files_only=True,
        )
        pipe.enable_sequential_cpu_offload(device="mps")
        pipe.enable_attention_slicing("max")
        outcome["model_load_seconds"] = round(time.monotonic() - load_started, 3)
        phase("generating", **memory_snapshot())
        generation_started = time.monotonic()

        def callback(_pipeline, step_index, _timestep, callback_kwargs):
            phase("denoising", step=step_index + 1, total_steps=12)
            return callback_kwargs

        generator = torch.Generator(device="cpu").manual_seed(6301)
        with torch.inference_mode():
            frames = pipe(
                image=letterbox,
                height=512,
                width=512,
                num_frames=14,
                num_inference_steps=12,
                fps=7,
                min_guidance_scale=1.0,
                max_guidance_scale=2.0,
                motion_bucket_id=96,
                noise_aug_strength=0.015,
                decode_chunk_size=1,
                generator=generator,
                callback_on_step_end=callback,
                output_type="pil",
            ).frames[0]
        outcome["generation_seconds"] = round(time.monotonic() - generation_started, 3)
        phase("saving_candidate", frame_count=len(frames))
        frame_dir = root / "frames"
        frame_dir.mkdir(exist_ok=True)
        for index, frame in enumerate(frames):
            frame.convert("RGB").save(frame_dir / f"frame_{index:03d}.png")
        chosen = list(range(0, len(frames), 2))
        sheet = Image.new("RGB", (4 * 256, 2 * 280), (245, 245, 242))
        draw = ImageDraw.Draw(sheet)
        for cell, index in enumerate(chosen):
            x, y = (cell % 4) * 256, (cell // 4) * 280
            sheet.paste(frames[index].convert("RGB").resize((256, 256)), (x, y))
            draw.text((x + 7, y + 261), f"frame {index:02d} / {index / 7:.2f}s", fill=(20, 20, 20))
        draw.text((3 * 256 + 7, 280 + 30), "SVD motion probe", fill=(20, 20, 20))
        draw.text((3 * 256 + 7, 280 + 50), "Technique unverified", fill=(20, 20, 20))
        sheet.save(root / "contact-sheet.jpg", quality=94)
        encoding = subprocess.run(
            [
                "/opt/homebrew/bin/ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-framerate", "7", "-i", str(frame_dir / "frame_%03d.png"),
                "-frames:v", str(len(frames)), "-c:v", "libx264", "-preset", "fast",
                "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                str(root / "candidate.mp4"),
            ],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=45,
        )
        (root / "ffmpeg.log").write_text(encoding.stdout)
        if encoding.returncode:
            raise RuntimeError(f"FFmpeg encoding failed with exit code {encoding.returncode}")
        outcome.update(status="generated_unreviewed", frame_count=len(frames))
        phase("saved")
        return 0
    except Exception as error:
        outcome["error_type"] = type(error).__name__
        outcome["error"] = str(error)
        outcome["traceback"] = traceback.format_exc()
        print(outcome["traceback"], flush=True)
        phase("failed", error_type=type(error).__name__)
        return 1
    finally:
        outcome["memory_before_release"] = memory_snapshot()
        if pipe is not None:
            del pipe
        gc.collect()
        if torch is not None and torch.backends.mps.is_available():
            try:
                torch.mps.empty_cache()
            except Exception:
                pass
        outcome["worker_elapsed_seconds"] = round(time.monotonic() - start, 3)
        write_json(root / "worker-result.json", outcome)


def run_supervisor(args: argparse.Namespace) -> int:
    root = args.output
    root.mkdir(parents=True, exist_ok=True)
    if (root / "run-receipt.json").exists():
        raise RuntimeError("An existing run receipt is present; refusing an implicit retry")
    start = time.monotonic()
    environment = dict(os.environ)
    environment.update(
        HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
        HF_HUB_DISABLE_IMPLICIT_TOKEN="1",
        DO_NOT_TRACK="1", WANDB_DISABLED="true", PYTHONDONTWRITEBYTECODE="1",
        TOKENIZERS_PARALLELISM="false", PYTORCH_ENABLE_MPS_FALLBACK="0",
    )
    deadline = start + 600
    timed_out = False
    with (root / "execution.log").open("w") as log:
        process = subprocess.Popen(
            [sys.executable, "-B", str(Path(__file__).resolve()), "--worker",
             "--source", str(args.source), "--output", str(root)],
            env=environment, stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
        )
        next_heartbeat = start + 60
        while process.poll() is None:
            now = time.monotonic()
            if now >= deadline:
                timed_out = True
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=8)
                break
            if now >= next_heartbeat:
                progress_path = root / "progress.json"
                progress = json.loads(progress_path.read_text()) if progress_path.exists() else {}
                print(json.dumps({"heartbeat_seconds": round(now - start), "progress": progress}), flush=True)
                next_heartbeat += 60
            time.sleep(1)
    result_path = root / "worker-result.json"
    worker_result = json.loads(result_path.read_text()) if result_path.exists() else {}
    artifacts = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.name != "run-receipt.json":
            artifacts.append({"path": str(path.relative_to(root)), "bytes": path.stat().st_size, "sha256": digest(path)})
    receipt = {
        "status": "timed_out" if timed_out else worker_result.get("status", "failed"),
        "exit_code": process.returncode,
        "timed_out": timed_out,
        "timeout_seconds": 600,
        "elapsed_seconds": round(time.monotonic() - start, 3),
        "input_sha256": digest(args.source),
        "source_script_sha256": digest(Path(__file__)),
        "worker_result": worker_result,
        "artifacts": artifacts,
        "operational_api_called": False,
        "new_downloads_permitted": False,
        "model_or_package_installation_performed": False,
        "quality_review": "not_performed",
    }
    write_json(root / "run-receipt.json", receipt)
    print(json.dumps({"status": receipt["status"], "receipt": str(root / "run-receipt.json"),
                      "elapsed_seconds": receipt["elapsed_seconds"]}), flush=True)
    return 0 if receipt["status"] == "generated_unreviewed" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_ROOT)
    arguments = parser.parse_args()
    sys.exit(run_worker(arguments) if arguments.worker else run_supervisor(arguments))
