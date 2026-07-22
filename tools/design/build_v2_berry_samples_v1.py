#!/usr/bin/env python3
"""Build pixel-preserving Berry V1 boy samples from the approved classic frames.

The approved imagegen palette board supplies the color language. This candidate-only
tool deliberately does not redraw poses: it changes RGB values inside two constrained
semantic masks while preserving every alpha pixel, bounding box, frame anchor, prop,
and non-target pixel from the classic runtime source.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
CLASSIC_ROOT = SPRITE_ROOT / "ai-agent-child-boy"
BERRY_ROOT = SPRITE_ROOT / "colorways/v1/berry"
PALETTE_REFERENCE = (
    SPRITE_ROOT / "colorways/v1/palette-board/processor/colorway-4.png"
)
FRAME_SIZE = (48, 64)
FRAME_COUNT = 4

# Sample order is also the review-board row order.
SEQUENCES = {
    "idle": {
        "semantic": "neutral_front_idle",
        "orientation": "down_front",
        "duration_ms": 220,
        "source_dir": CLASSIC_ROOT / "idle/frames",
        "source_pattern": "boy-child-idle-wheelbase-v2-{index}-48x64.png",
        "output_dir": BERRY_ROOT / "samples/ai-agent-child-boy/idle",
        "output_prefix": "boy-child-idle-berry-sample-v1",
    },
    "moving_down": {
        "semantic": "mechanical_glide",
        "orientation": "down_front",
        "duration_ms": 125,
        "source_dir": CLASSIC_ROOT / "moving/v1/frames/down",
        "source_pattern": "boy-child-move-down-wheelbase-v2-{index}-48x64.png",
        "output_dir": BERRY_ROOT / "samples/ai-agent-child-boy/moving/v1/down",
        "output_prefix": "boy-child-move-down-berry-sample-v1",
    },
    "executing": {
        "semantic": "place_toy_block",
        "orientation": "up_back",
        "duration_ms": 180,
        "source_dir": CLASSIC_ROOT / "actions/v1/executing/frames",
        "source_pattern": "boy-child-executing-wheelbase-v2-{index}-48x64.png",
        "output_dir": BERRY_ROOT / "samples/ai-agent-child-boy/actions/v1/executing",
        "output_prefix": "boy-child-executing-berry-sample-v1",
    },
    "error": {
        "semantic": "inspect_diagnostic_reader",
        "orientation": "down_front",
        "duration_ms": 240,
        "source_dir": CLASSIC_ROOT / "actions/v1/error/frames",
        "source_pattern": "boy-child-error-wheelbase-v2-{index}-48x64.png",
        "output_dir": BERRY_ROOT / "samples/ai-agent-child-boy/actions/v1/error",
        "output_prefix": "boy-child-error-berry-sample-v1",
    },
}

# Derived from the approved Berry boy candidate on the palette board. The two ramps
# keep the cap raspberry-forward and the clothing coral-forward.
CAP_RAMP = (
    (104, 31, 69),
    (138, 37, 83),
    (182, 47, 98),
    (217, 70, 114),
    (240, 108, 134),
    (250, 154, 170),
)
CLOTHING_RAMP = (
    (104, 31, 61),
    (135, 38, 67),
    (168, 47, 80),
    (205, 57, 76),
    (235, 76, 92),
    (245, 127, 125),
    (248, 148, 136),
)


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_paths(sequence: dict) -> list[Path]:
    return [
        sequence["source_dir"] / sequence["source_pattern"].format(index=index)
        for index in range(1, FRAME_COUNT + 1)
    ]


def output_paths(sequence: dict) -> list[Path]:
    frames_dir = sequence["output_dir"] / "frames"
    return [
        frames_dir / f"{sequence['output_prefix']}-{index}-48x64.png"
        for index in range(1, FRAME_COUNT + 1)
    ]


def ramp_color(luma: int, ramp: tuple[tuple[int, int, int], ...], thresholds: tuple[int, ...]):
    for index, threshold in enumerate(thresholds):
        if luma < threshold:
            return ramp[index]
    return ramp[-1]


def target_masks(
    image: Image.Image,
    *,
    character: str,
    protect_side_props: bool,
    cap_yellow_crown_offset: int | None,
) -> tuple[np.ndarray, np.ndarray]:
    """Find only the classic blue cap crown and yellow clothing/backpack regions."""

    data = np.asarray(image.convert("RGBA"))
    rgb = data[:, :, :3].astype(np.int16)
    visible = data[:, :, 3] > 0
    alpha_bbox = image.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise RuntimeError("Classic source frame is transparent")
    left, top, right, bottom = alpha_bbox
    yy, xx = np.indices(visible.shape)

    # The cap crown is the saturated blue component above the face. Cyan eyes are
    # lower and do not enter this vertical mask; the yellow bill is intentionally kept.
    cap_zone = yy <= min(bottom - 1, top + 19)
    cap_blue = (
        character == "boy"
    ) & (
        visible
        & cap_zone
        & (rgb[:, :, 2] > rgb[:, :, 0] + 45)
        & (rgb[:, :, 2] > rgb[:, :, 1] + 20)
        & (rgb[:, :, 2] > 75)
    )
    cap_yellow_crown = (
        character == "boy" and cap_yellow_crown_offset is not None
    ) & (
        visible
        & (
            yy
            <= min(
                bottom - 1,
                top + (cap_yellow_crown_offset or 0),
            )
        )
        & (rgb[:, :, 0] > 115)
        & (rgb[:, :, 1] > 75)
        & (rgb[:, :, 0] > rgb[:, :, 2] + 55)
        & (rgb[:, :, 1] > rgb[:, :, 2] + 35)
    )

    # Yellow clothing/backpack is constrained to the torso envelope. This excludes
    # the yellow cap bill, wheel hubs, waist status light and side-held task props.
    horizontal_margin = 7 if protect_side_props else 2
    torso_zone = (
        (yy >= top + 20)
        & (yy < bottom - 10)
        & (xx >= left + horizontal_margin)
        & (xx < right - horizontal_margin)
    )
    clothing_yellow = (
        visible
        & torso_zone
        & (rgb[:, :, 0] > 115)
        & (rgb[:, :, 1] > 75)
        & (rgb[:, :, 0] > rgb[:, :, 2] + 55)
        & (rgb[:, :, 1] > rgb[:, :, 2] + 35)
        & (rgb[:, :, 0] >= rgb[:, :, 1] - 25)
    )
    return cap_blue | cap_yellow_crown, clothing_yellow


def recolor_frame(
    source: Image.Image,
    *,
    character: str = "boy",
    protect_side_props: bool,
    cap_yellow_crown_offset: int | None = 10,
) -> tuple[Image.Image, dict]:
    source = source.convert("RGBA")
    if source.size != FRAME_SIZE:
        raise RuntimeError(f"Expected {FRAME_SIZE}, found {source.size}")
    original = np.asarray(source).copy()
    output = original.copy()
    cap_mask, clothing_mask = target_masks(
        source,
        character=character,
        protect_side_props=protect_side_props,
        cap_yellow_crown_offset=cap_yellow_crown_offset,
    )
    rgb = original[:, :, :3].astype(np.int32)
    luma = (
        rgb[:, :, 0] * 299 + rgb[:, :, 1] * 587 + rgb[:, :, 2] * 114
    ) // 1000

    for y, x in np.argwhere(cap_mask):
        output[y, x, :3] = ramp_color(
            int(luma[y, x]), CAP_RAMP, (70, 95, 125, 155, 190)
        )
    for y, x in np.argwhere(clothing_mask):
        output[y, x, :3] = ramp_color(
            int(luma[y, x]), CLOTHING_RAMP, (75, 105, 135, 165, 195, 225)
        )

    result = Image.fromarray(output.astype(np.uint8), mode="RGBA")
    target_mask = cap_mask | clothing_mask
    changed = np.any(original != output, axis=2)
    source_bbox = source.getchannel("A").getbbox()
    result_bbox = result.getchannel("A").getbbox()
    qc = {
        "size_px": list(result.size),
        "source_bbox": list(source_bbox) if source_bbox else None,
        "output_bbox": list(result_bbox) if result_bbox else None,
        "alpha_exact_match": bool(np.array_equal(original[:, :, 3], output[:, :, 3])),
        "bbox_exact_match": source_bbox == result_bbox,
        "cap_pixels_recolored": int(cap_mask.sum()),
        "clothing_pixels_recolored": int(clothing_mask.sum()),
        "rgb_changed_pixels": int(changed.sum()),
        "changed_pixels_outside_target_masks": int((changed & ~target_mask).sum()),
        "unchanged_target_pixels": int((target_mask & ~changed).sum()),
        "touches_edge": bool(
            result_bbox
            and (
                result_bbox[0] <= 0
                or result_bbox[1] <= 0
                or result_bbox[2] >= FRAME_SIZE[0]
                or result_bbox[3] >= FRAME_SIZE[1]
            )
        ),
    }
    if (
        not qc["alpha_exact_match"]
        or not qc["bbox_exact_match"]
        or (character == "boy" and qc["cap_pixels_recolored"] < 6)
        or (character != "boy" and qc["cap_pixels_recolored"] != 0)
        or qc["clothing_pixels_recolored"] < 12
        or qc["changed_pixels_outside_target_masks"]
        or qc["unchanged_target_pixels"]
        or qc["touches_edge"]
    ):
        raise RuntimeError(f"Berry sample frame QC failed: {qc}")
    return result, qc


def save_gif(frames: list[Image.Image], path: Path, duration_ms: int, scale: int = 6) -> None:
    rendered = [
        frame.resize((frame.width * scale, frame.height * scale), Image.Resampling.NEAREST)
        for frame in frames
    ]
    rendered[0].save(
        path,
        format="GIF",
        save_all=True,
        append_images=rendered[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        transparency=0,
    )


def assemble_strip(frames: list[Image.Image]) -> Image.Image:
    strip = Image.new("RGBA", (FRAME_SIZE[0] * FRAME_COUNT, FRAME_SIZE[1]), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE[0], 0))
    return strip


def assemble_sheet(frames: list[Image.Image]) -> Image.Image:
    sheet = Image.new("RGBA", (FRAME_SIZE[0] * 2, FRAME_SIZE[1] * 2), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(
            frame,
            ((index % 2) * FRAME_SIZE[0], (index // 2) * FRAME_SIZE[1]),
        )
    return sheet


def build_sequence(name: str, sequence: dict) -> tuple[Image.Image, Image.Image]:
    sources = source_paths(sequence)
    missing = [path for path in sources if not path.exists()]
    if missing:
        raise RuntimeError(f"Missing classic sample sources: {[relative(path) for path in missing]}")
    output_dir = sequence["output_dir"]
    frames_dir = output_dir / "frames"
    previews_dir = output_dir / "previews"
    frames_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    outputs = output_paths(sequence)
    frames: list[Image.Image] = []
    qcs: list[dict] = []
    for source_path, output_path in zip(sources, outputs, strict=True):
        frame, qc = recolor_frame(
            Image.open(source_path),
            character="boy",
            protect_side_props=name == "executing",
        )
        frame.save(output_path)
        frames.append(frame)
        qcs.append(qc)

    strip = assemble_strip(frames)
    sheet = assemble_sheet(frames)
    strip_path = output_dir / f"{sequence['output_prefix']}-strip-48x64.png"
    sheet_path = output_dir / f"{sequence['output_prefix']}-2x2-48x64.png"
    preview_path = previews_dir / f"{sequence['output_prefix']}-preview-6x.png"
    gif_path = previews_dir / f"{sequence['output_prefix']}-preview-6x.gif"
    strip.save(strip_path)
    sheet.save(sheet_path)
    strip.resize((strip.width * 6, strip.height * 6), Image.Resampling.NEAREST).save(
        preview_path
    )
    save_gif(frames, gif_path, int(sequence["duration_ms"]))

    metadata = {
        "asset": f"boy_{name}_berry_sample",
        "revision": "v2-colorway-berry-sample-v1",
        "status": "candidate_not_runtime",
        "semantic": sequence["semantic"],
        "orientation": sequence["orientation"],
        "frame_size_px": list(FRAME_SIZE),
        "frame_count": FRAME_COUNT,
        "anchor_px": [24, 64],
        "frame_duration_ms": sequence["duration_ms"],
        "source_kind": "pixel_preserving_palette_transfer_from_approved_classic",
        "palette_reference": relative(PALETTE_REFERENCE),
        "reference_frames": [relative(path) for path in sources],
        "frames": [relative(path) for path in outputs],
        "runtime_candidate_strip": relative(strip_path),
        "review_sheet_2x2": relative(sheet_path),
        "preview_png": relative(preview_path),
        "preview_gif": relative(gif_path),
        "palette_contract": {
            "recolored": ["boy_cap_crown", "clothing_and_backpack"],
            "unchanged": [
                "cap_bill",
                "face_and_eyes",
                "white_shell",
                "pale_blue_sleeves",
                "wheels",
                "waist_status_light",
                "task_props",
            ],
            "alpha_policy": "exact classic alpha bytes",
        },
        "qc": qcs,
        "sha256": {
            relative(path): sha256(path)
            for path in [*outputs, strip_path, sheet_path, preview_path, gif_path]
        },
    }
    metadata_path = output_dir / f"{sequence['output_prefix']}-meta.json"
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return assemble_strip([Image.open(path).convert("RGBA") for path in sources]), strip


def build_review(rows: list[tuple[Image.Image, Image.Image]]) -> Path:
    review_dir = BERRY_ROOT / "review"
    review_dir.mkdir(parents=True, exist_ok=True)
    board = Image.new(
        "RGBA",
        (FRAME_SIZE[0] * FRAME_COUNT * 2, FRAME_SIZE[1] * len(rows)),
        (0, 0, 0, 0),
    )
    for row, (classic, berry) in enumerate(rows):
        board.alpha_composite(classic, (0, row * FRAME_SIZE[1]))
        board.alpha_composite(berry, (FRAME_SIZE[0] * FRAME_COUNT, row * FRAME_SIZE[1]))
    review_path = review_dir / "boy-sample-classic-vs-berry-v1-4x.png"
    board.resize((board.width * 4, board.height * 4), Image.Resampling.NEAREST).save(
        review_path
    )
    return review_path


def write_audit(review_path: Path) -> None:
    audit = {
        "audit_id": "berry-runtime-gap-v1",
        "status": "sample_validation_in_progress",
        "runtime_contract_status": "not_exposed",
        "palette_reference": relative(PALETTE_REFERENCE),
        "production_target": {
            "characters": 3,
            "runtime_sheets": 21,
            "runtime_frames": 168,
            "locked_deliverables": 231,
        },
        "production_approved": {
            "runtime_sheets": 0,
            "runtime_frames": 0,
            "locked_deliverables": 0,
        },
        "candidate_samples": {
            "character": "boy",
            "sequences": list(SEQUENCES),
            "frames": len(SEQUENCES) * FRAME_COUNT,
            "review": relative(review_path),
        },
        "remaining_gate": [
            "user approves the boy idle/moving_down/executing/error palette samples",
            "complete boy movement directions and researching/writing/syncing",
            "complete all girl and genderless idle/movement/actions",
            "build and check a 231-file Berry approval lock",
            "only then add berry to the application appearance contract",
        ],
    }
    (BERRY_ROOT / "asset-audit-v1.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def verify_outputs() -> None:
    checked = 0
    for name, sequence in SEQUENCES.items():
        sources = source_paths(sequence)
        outputs = output_paths(sequence)
        for source_path, output_path in zip(sources, outputs, strict=True):
            if not output_path.exists():
                raise RuntimeError(f"Missing Berry sample: {relative(output_path)}")
            expected, _ = recolor_frame(
                Image.open(source_path),
                character="boy",
                protect_side_props=name == "executing",
            )
            actual = Image.open(output_path).convert("RGBA")
            if expected.tobytes() != actual.tobytes():
                raise RuntimeError(f"Berry sample is stale: {relative(output_path)}")
            checked += 1
        metadata_path = sequence["output_dir"] / f"{sequence['output_prefix']}-meta.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("status") != "candidate_not_runtime":
            raise RuntimeError(f"Unexpected sample status: {relative(metadata_path)}")
        if metadata.get("semantic") != sequence["semantic"]:
            raise RuntimeError(f"Semantic drift in metadata: {name}")

    audit_path = BERRY_ROOT / "asset-audit-v1.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    if audit.get("runtime_contract_status") != "not_exposed":
        raise RuntimeError("Berry must not enter the runtime contract during sample review")
    review_path = BERRY_ROOT / "review/boy-sample-classic-vs-berry-v1-4x.png"
    if not review_path.exists():
        raise RuntimeError(f"Missing review board: {relative(review_path)}")
    print(f"Validated {checked} pixel-preserving Berry boy sample frames")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        verify_outputs()
        return
    if not PALETTE_REFERENCE.exists():
        raise RuntimeError(f"Missing approved palette reference: {relative(PALETTE_REFERENCE)}")
    rows = [build_sequence(name, sequence) for name, sequence in SEQUENCES.items()]
    review_path = build_review(rows)
    write_audit(review_path)
    verify_outputs()
    print(relative(review_path))


if __name__ == "__main__":
    main()
