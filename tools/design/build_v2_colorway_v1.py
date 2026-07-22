#!/usr/bin/env python3
"""Normalize generated V2 colorway frames into the locked 48x64 runtime contract.

This script does not create or recolor artwork. It only scales, aligns, assembles,
and quality-checks frames produced by generate2dsprite's chroma-key processor.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
COLORWAY_ROOT = SPRITE_ROOT / "colorways/v1"
FRAME_SIZE = (48, 64)
FRAME_COUNT = 4
DIRECTIONS = (
    "down",
    "left",
    "right",
    "up",
    "down_left",
    "down_right",
    "up_left",
    "up_right",
)
ACTION_DURATIONS = {
    "idle": 220,
    "writing": 200,
    "researching": 220,
    "executing": 180,
    "syncing": 200,
    "error": 240,
}
CHARACTERS = {
    "boy": ("ai-agent-child-boy", "boy-child"),
    "girl": ("ai-agent-child-girl", "girl-child"),
    "genderless": ("ai-agent-child-genderless", "genderless-child"),
}


def chroma_fringe_mask(rgb: np.ndarray, visible: np.ndarray) -> np.ndarray:
    """Match hot magenta key spill without rejecting intentional purple artwork."""

    return (
        visible
        & (rgb[:, :, 0] > 180)
        & (rgb[:, :, 2] > 150)
        & (rgb[:, :, 1] < 130)
        & (rgb[:, :, 0] > rgb[:, :, 1] + 60)
        & (rgb[:, :, 2] > rgb[:, :, 1] + 40)
    )


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32)
    alpha = rgba[:, :, 3:4] / 255.0
    premultiplied = np.concatenate((rgba[:, :, :3] * alpha, rgba[:, :, 3:4]), axis=2)
    channels = [
        Image.fromarray(np.clip(premultiplied[:, :, index], 0, 255).astype(np.uint8)).resize(
            size, Image.Resampling.LANCZOS
        )
        for index in range(4)
    ]
    data = np.stack([np.asarray(channel, dtype=np.float32) for channel in channels], axis=2)
    out_alpha = data[:, :, 3:4]
    out_rgb = np.zeros_like(data[:, :, :3])
    np.divide(data[:, :, :3] * 255.0, out_alpha, out=out_rgb, where=out_alpha > 0)
    result = np.concatenate((np.clip(out_rgb, 0, 255), out_alpha), axis=2).astype(np.uint8)
    result[result[:, :, 3] < 24] = 0
    return Image.fromarray(result, mode="RGBA")


def normalize_frame(source: Path, reference: Path) -> Image.Image:
    generated = Image.open(source).convert("RGBA")
    reference_image = Image.open(reference).convert("RGBA")
    generated_data = np.asarray(generated).copy()
    generated_rgb = generated_data[:, :, :3].astype(np.int16)
    visible = generated_data[:, :, 3] > 0
    generated_data[chroma_fringe_mask(generated_rgb, visible)] = 0
    generated = Image.fromarray(generated_data, mode="RGBA")
    source_bbox = generated.getchannel("A").getbbox()
    target_bbox = reference_image.getchannel("A").getbbox()
    if source_bbox is None or target_bbox is None:
        raise RuntimeError(f"Transparent source/reference: {source} / {reference}")

    subject = generated.crop(source_bbox)
    target_size = (target_bbox[2] - target_bbox[0], target_bbox[3] - target_bbox[1])
    subject = resize_premultiplied(subject, target_size)
    subject_data = np.asarray(subject).copy()
    subject_rgb = subject_data[:, :, :3].astype(np.int16)
    subject_visible = subject_data[:, :, 3] > 0
    subject_data[chroma_fringe_mask(subject_rgb, subject_visible)] = 0
    subject = Image.fromarray(subject_data, mode="RGBA")
    cleaned_bbox = subject.getchannel("A").getbbox()
    if cleaned_bbox is None:
        raise RuntimeError(f"Chroma cleanup removed generated frame: {source}")
    subject = subject.crop(cleaned_bbox)
    if subject.size != target_size:
        subject = subject.resize(target_size, Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(subject, (target_bbox[0], target_bbox[1]))
    return canvas


def frame_qc(image: Image.Image, reference: Path) -> dict:
    data = np.asarray(image)
    rgb = data[:, :, :3].astype(np.int16)
    visible = data[:, :, 3] > 0
    bbox = image.getchannel("A").getbbox()
    reference_image = Image.open(reference).convert("RGBA")
    reference_data = np.asarray(reference_image)
    reference_visible = reference_data[:, :, 3] > 0
    reference_bbox = reference_image.getchannel("A").getbbox()
    if bbox is None or reference_bbox is None:
        raise RuntimeError(f"Transparent normalized/reference frame: {reference}")
    magenta = visible & (data[:, :, 0] > 180) & (data[:, :, 2] > 180) & (data[:, :, 1] < 100)
    chroma_fringe = chroma_fringe_mask(rgb, visible)
    meadow = visible & (rgb[:, :, 1] > rgb[:, :, 0] + 12) & (rgb[:, :, 1] > rgb[:, :, 2])
    purple_palette = (
        visible
        & (rgb[:, :, 2] > rgb[:, :, 1] + 20)
        & (rgb[:, :, 0] > rgb[:, :, 1] + 10)
        & (rgb[:, :, 2] > 80)
    )
    alpha_intersection = int((visible & reference_visible).sum())
    alpha_union = int((visible | reference_visible).sum())
    return {
        "size_px": list(image.size),
        "bbox": list(bbox),
        "reference_bbox": list(reference_bbox),
        "anchor_matches_reference": bbox[3] == reference_bbox[3],
        "visible_magenta_pixels": int(magenta.sum()),
        "chroma_fringe_pixels": int(chroma_fringe.sum()),
        "meadow_pixels": int(meadow.sum()),
        "purple_palette_pixels": int(purple_palette.sum()),
        "reference_alpha_iou": alpha_intersection / alpha_union if alpha_union else 1.0,
        "reference_alpha_changed_pixels": int((visible ^ reference_visible).sum()),
        "touches_edge": bool(bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= 48 or bbox[3] >= 64),
    }


def save_gif(frames: list[Image.Image], path: Path, duration: int, scale: int = 1) -> None:
    rendered = frames
    if scale != 1:
        rendered = [
            frame.resize((frame.width * scale, frame.height * scale), Image.Resampling.NEAREST)
            for frame in frames
        ]
    rendered[0].save(
        path,
        format="GIF",
        save_all=True,
        append_images=rendered[1:],
        duration=duration,
        loop=0,
        disposal=2,
        transparency=0,
    )


def sequence_paths(preset: str, character: str, kind: str, action: str | None):
    directory, prefix = CHARACTERS[character]
    legacy_root = SPRITE_ROOT / directory
    colorway_root = COLORWAY_ROOT / preset / directory
    if kind == "idle":
        output_dir = colorway_root / "idle"
        processor_dir = output_dir / "processor"
        sources = [processor_dir / f"idle-{index}.png" for index in range(1, 5)]
        references = [
            legacy_root / "idle/frames" / f"{prefix}-idle-wheelbase-v2-{index}-48x64.png"
            for index in range(1, 5)
        ]
        frame_names = [f"{prefix}-idle-{preset}-v1-{index}-48x64.png" for index in range(1, 5)]
        runtime_name = f"{prefix}-idle-{preset}-v1-strip-48x64.png"
        duration = ACTION_DURATIONS["idle"]
        label = "idle"
    elif kind == "action" and action in ACTION_DURATIONS and action != "idle":
        output_dir = colorway_root / "actions/v1" / action
        processor_dir = output_dir / "processor"
        sources = [processor_dir / f"{action}-{index}.png" for index in range(1, 5)]
        references = [
            legacy_root / "actions/v1" / action / "frames" / f"{prefix}-{action}-wheelbase-v2-{index}-48x64.png"
            for index in range(1, 5)
        ]
        frame_names = [f"{prefix}-{action}-{preset}-v1-{index}-48x64.png" for index in range(1, 5)]
        runtime_name = f"{prefix}-{action}-{preset}-v1-strip-48x64.png"
        duration = ACTION_DURATIONS[action]
        label = action
    else:
        raise RuntimeError("kind 必须是 idle，或配合 --action 使用 action")
    return output_dir, sources, references, frame_names, runtime_name, duration, label


def build_sequence(preset: str, character: str, kind: str, action: str | None) -> Path:
    output_dir, sources, references, frame_names, runtime_name, duration, label = sequence_paths(
        preset, character, kind, action
    )
    missing = [path for path in [*sources, *references] if not path.exists()]
    if missing:
        raise RuntimeError(f"Missing generated/reference frames: {[relative(path) for path in missing]}")

    frames_dir = output_dir / "frames"
    previews_dir = output_dir / "previews"
    frames_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)
    frames = []
    output_paths = []
    qcs = []
    for source, reference, frame_name in zip(sources, references, frame_names, strict=True):
        frame = normalize_frame(source, reference)
        qc = frame_qc(frame, reference)
        if (
            qc["visible_magenta_pixels"]
            or qc["chroma_fringe_pixels"]
            or qc["touches_edge"]
            or not qc["anchor_matches_reference"]
        ):
            raise RuntimeError(f"Frame QC failed for {source}: {qc}")
        if qc["meadow_pixels"] < 12:
            raise RuntimeError(f"Meadow palette missing from {source}: {qc}")
        output = frames_dir / frame_name
        frame.save(output)
        frames.append(frame)
        output_paths.append(output)
        qcs.append(qc)

    strip = Image.new("RGBA", (FRAME_SIZE[0] * FRAME_COUNT, FRAME_SIZE[1]), (0, 0, 0, 0))
    sheet = Image.new("RGBA", (FRAME_SIZE[0] * 2, FRAME_SIZE[1] * 2), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE[0], 0))
        sheet.alpha_composite(frame, ((index % 2) * FRAME_SIZE[0], (index // 2) * FRAME_SIZE[1]))

    runtime_path = output_dir / runtime_name
    sheet_path = output_dir / runtime_name.replace("-strip-", "-2x2-")
    gif_path = previews_dir / runtime_name.replace("-strip-48x64.png", "-preview-6x.gif")
    preview_path = previews_dir / runtime_name.replace("-strip-48x64.png", "-preview-6x.png")
    strip.save(runtime_path)
    sheet.save(sheet_path)
    save_gif(frames, gif_path, duration, scale=6)
    frames[0].resize((288, 384), Image.Resampling.NEAREST).save(preview_path)

    metadata = {
        "asset": f"{character}_{label}_{preset}",
        "revision": f"v2-colorway-{preset}-v1",
        "status": "approved",
        "frame_size_px": list(FRAME_SIZE),
        "frame_duration_ms": duration,
        "anchor_px": [24, 64],
        "source_kind": "imagegen_edit_then_generate2dsprite_cleanup",
        "processor_metadata": relative(output_dir / "processor/pipeline-meta.json"),
        "reference_frames": [relative(path) for path in references],
        "frames": [relative(path) for path in output_paths],
        "runtime_strip": relative(runtime_path),
        "sheet_2x2": relative(sheet_path),
        "qc": qcs,
        "sha256": {relative(path): sha256(path) for path in [*output_paths, runtime_path, sheet_path]},
    }
    metadata_path = output_dir / runtime_name.replace("-strip-48x64.png", "-meta.json")
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return runtime_path


def build_movement(preset: str, character: str) -> Path:
    directory, prefix = CHARACTERS[character]
    legacy_root = SPRITE_ROOT / directory / "moving/v1"
    output_dir = COLORWAY_ROOT / preset / directory / "moving/v1"
    cardinal_processor = output_dir / "cardinal/processor"
    diagonal_processor = output_dir / "diagonal-right/processor"
    generated_sources: dict[str, list[Path]] = {
        direction: [] for direction in DIRECTIONS
    }
    for row, direction in enumerate(("down", "left", "right", "up")):
        generated_sources[direction] = [
            cardinal_processor / f"cardinal-{row * 4 + index}.png"
            for index in range(1, 5)
        ]
    for row, direction in enumerate(("down_right", "up_right")):
        generated_sources[direction] = [
            diagonal_processor / f"diagonal-right-{row * 4 + index}.png"
            for index in range(1, 5)
        ]

    missing = [
        source
        for direction in ("down", "left", "right", "up", "down_right", "up_right")
        for source in generated_sources[direction]
        if not source.exists()
    ]
    if missing:
        raise RuntimeError(f"Missing movement processor frames: {[relative(path) for path in missing]}")

    frames: dict[str, list[Image.Image]] = {direction: [] for direction in DIRECTIONS}
    references: dict[str, list[Path]] = {direction: [] for direction in DIRECTIONS}
    qcs: dict[str, list[dict]] = {direction: [] for direction in DIRECTIONS}
    output_paths: list[Path] = []
    for direction in ("down", "left", "right", "up", "down_right", "up_right"):
        for index, source in enumerate(generated_sources[direction], start=1):
            reference = (
                legacy_root
                / "frames"
                / direction
                / f"{prefix}-move-{direction}-wheelbase-v2-{index}-48x64.png"
            )
            frame = normalize_frame(source, reference)
            frames[direction].append(frame)
            references[direction].append(reference)

    for left, right in (("down_left", "down_right"), ("up_left", "up_right")):
        frames[left] = [ImageOps.mirror(frame) for frame in frames[right]]
        references[left] = [
            legacy_root
            / "frames"
            / left
            / f"{prefix}-move-{left}-wheelbase-v2-{index}-48x64.png"
            for index in range(1, 5)
        ]

    for direction in DIRECTIONS:
        direction_dir = output_dir / "frames" / direction
        direction_dir.mkdir(parents=True, exist_ok=True)
        for index, (frame, reference) in enumerate(
            zip(frames[direction], references[direction], strict=True), start=1
        ):
            qc = frame_qc(frame, reference)
            if (
                qc["visible_magenta_pixels"]
                or qc["chroma_fringe_pixels"]
                or qc["touches_edge"]
                or not qc["anchor_matches_reference"]
                or qc["meadow_pixels"] < 12
            ):
                raise RuntimeError(f"Movement QC failed for {character}/{direction}/{index}: {qc}")
            output = direction_dir / f"{prefix}-move-{direction}-{preset}-v1-{index}-48x64.png"
            frame.save(output)
            output_paths.append(output)
            qcs[direction].append(qc)

    strips_dir = output_dir / "strips"
    previews_dir = output_dir / "previews"
    strips_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (FRAME_SIZE[0] * 4, FRAME_SIZE[1] * 8), (0, 0, 0, 0))
    strip_paths = []
    for row, direction in enumerate(DIRECTIONS):
        strip = Image.new("RGBA", (FRAME_SIZE[0] * 4, FRAME_SIZE[1]), (0, 0, 0, 0))
        for column, frame in enumerate(frames[direction]):
            strip.alpha_composite(frame, (column * FRAME_SIZE[0], 0))
            atlas.alpha_composite(frame, (column * FRAME_SIZE[0], row * FRAME_SIZE[1]))
        strip_path = strips_dir / f"{prefix}-move-{direction}-{preset}-v1-strip-48x64.png"
        strip.save(strip_path)
        strip_paths.append(strip_path)
        save_gif(
            frames[direction],
            previews_dir / f"{prefix}-move-{direction}-{preset}-v1-preview-6x.gif",
            125,
            scale=6,
        )

    atlas_path = output_dir / f"{prefix}-move-8dir-4frame-{preset}-v1-48x64.png"
    atlas.save(atlas_path)
    atlas.resize((atlas.width * 4, atlas.height * 4), Image.Resampling.NEAREST).save(
        previews_dir / f"{prefix}-move-8dir-4frame-{preset}-v1-preview-4x.png"
    )
    metadata = {
        "asset": f"{character}_movement_{preset}",
        "revision": f"v2-colorway-{preset}-v1",
        "status": "approved",
        "frame_size_px": list(FRAME_SIZE),
        "frame_duration_ms": 125,
        "anchor_px": [24, 64],
        "direction_order": list(DIRECTIONS),
        "phase_count": 4,
        "mirror_policy": {
            "down_left": "exact horizontal mirror of generated down_right",
            "up_left": "exact horizontal mirror of generated up_right",
        },
        "source_kind": "imagegen_edit_then_generate2dsprite_cleanup",
        "processor_metadata": [
            relative(cardinal_processor / "pipeline-meta.json"),
            relative(diagonal_processor / "pipeline-meta.json"),
        ],
        "frames": [relative(path) for path in output_paths],
        "strips": [relative(path) for path in strip_paths],
        "atlas": relative(atlas_path),
        "qc": qcs,
        "sha256": {relative(path): sha256(path) for path in [*output_paths, *strip_paths, atlas_path]},
    }
    metadata_path = output_dir / f"{prefix}-move-8dir-4frame-{preset}-v1-meta.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return atlas_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preset", default="meadow")
    parser.add_argument("--character", required=True, choices=CHARACTERS)
    parser.add_argument("--kind", required=True, choices=("idle", "action", "moving"))
    parser.add_argument("--action", choices=tuple(ACTION_DURATIONS))
    args = parser.parse_args()
    output = (
        build_movement(args.preset, args.character)
        if args.kind == "moving"
        else build_sequence(args.preset, args.character, args.kind, args.action)
    )
    print(relative(output))


if __name__ == "__main__":
    main()
