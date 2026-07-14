#!/usr/bin/env python3
"""Build review-ready 48x64 diagonal walk contact pairs."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RUN_DIR = (
    ROOT
    / "assets/design/sprites/characters/ai-agent-child-genderless"
    / "walking/v5/diagonal-contact-pairs"
)
PROCESSED_DIR = RUN_DIR / "processed-64"
FRAMES_DIR = RUN_DIR / "frames"
PAIRS_DIR = RUN_DIR / "pairs"
PREVIEWS_DIR = RUN_DIR / "previews"
SHEET = RUN_DIR / "genderless-child-diagonal-contact-pairs-4x2-48x64.png"
META = RUN_DIR / "genderless-child-diagonal-contact-pairs-48x64-meta.json"

FRAME_SIZE = (48, 64)
SOURCE_CROP = (8, 0, 56, 64)
PREVIEW_SCALE = 6
PREVIEW_GAP = 4
PREVIEW_BACKGROUND = (224, 238, 240, 255)
GIF_DURATION_MS = 900

DIRECTIONS = ("down_left", "down_right", "up_left", "up_right")
FORWARD_FEET = ("left", "right")


def clean_frame(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    fringe = (
        (pixels[:, :, 0] > 180)
        & (pixels[:, :, 2] > 180)
        & (pixels[:, :, 1] < 100)
    )
    pixels[fringe, 3] = 0
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels, mode="RGBA")


def rgb_preview(frame: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", FRAME_SIZE, PREVIEW_BACKGROUND)
    canvas.alpha_composite(frame)
    return canvas.convert("RGB").resize(
        (FRAME_SIZE[0] * PREVIEW_SCALE, FRAME_SIZE[1] * PREVIEW_SCALE),
        Image.Resampling.NEAREST,
    )


def save_slow_gif(frames: list[Image.Image], path: Path) -> None:
    preview_frames = [rgb_preview(frame) for frame in frames]
    preview_frames[0].save(
        path,
        save_all=True,
        append_images=preview_frames[1:],
        duration=GIF_DURATION_MS,
        loop=0,
        optimize=False,
        disposal=2,
    )


def frame_qc(frame: Image.Image) -> dict:
    pixels = np.asarray(frame.convert("RGBA"))
    visible = pixels[:, :, 3] > 0
    magenta = (
        visible
        & (pixels[:, :, 0] > 180)
        & (pixels[:, :, 2] > 180)
        & (pixels[:, :, 1] < 100)
    )
    bbox = frame.getbbox() or (0, 0, 0, 0)
    return {
        "size": list(frame.size),
        "bbox": list(bbox),
        "visible_pixels": int(visible.sum()),
        "visible_magenta_pixels": int(magenta.sum()),
        "touches_runtime_edge": (
            bbox[0] <= 0
            or bbox[1] <= 0
            or bbox[2] >= FRAME_SIZE[0]
            or bbox[3] >= FRAME_SIZE[1]
        ),
    }


def main() -> None:
    for directory in (FRAMES_DIR, PAIRS_DIR, PREVIEWS_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    frames: dict[str, list[Image.Image]] = {}
    qc = {}
    sheet = Image.new(
        "RGBA",
        (FRAME_SIZE[0] * 2, FRAME_SIZE[1] * len(DIRECTIONS)),
        (0, 0, 0, 0),
    )

    source_index = 1
    for row, direction in enumerate(DIRECTIONS):
        direction_dir = FRAMES_DIR / direction
        direction_dir.mkdir(parents=True, exist_ok=True)
        direction_frames = []
        direction_qc = []
        pair = Image.new(
            "RGBA", (FRAME_SIZE[0] * 2, FRAME_SIZE[1]), (0, 0, 0, 0)
        )

        for col, forward_foot in enumerate(FORWARD_FEET):
            if direction == "down_right" and forward_foot == "left":
                frame = frames["down_left"][1].transpose(
                    Image.Transpose.FLIP_LEFT_RIGHT
                )
                derivation = "exact_horizontal_mirror_of_down_left_right_foot_forward"
            else:
                source = Image.open(
                    PROCESSED_DIR / f"diagonal-contact-{source_index}.png"
                ).convert("RGBA")
                frame = clean_frame(source.crop(SOURCE_CROP))
                derivation = f"processed_diagonal_contact_{source_index}"
            filename = f"walk-{direction}-{forward_foot}-foot-forward-48x64.png"
            frame.save(direction_dir / filename)
            direction_frames.append(frame)
            direction_qc.append(
                {
                    "forward_foot": forward_foot,
                    "derivation": derivation,
                    "file": str((direction_dir / filename).relative_to(ROOT)),
                    **frame_qc(frame),
                }
            )
            pair.alpha_composite(frame, (col * FRAME_SIZE[0], 0))
            sheet.alpha_composite(frame, (col * FRAME_SIZE[0], row * FRAME_SIZE[1]))
            source_index += 1

        pair_path = PAIRS_DIR / f"genderless-child-walk-{direction}-contact-pair-48x64.png"
        pair.save(pair_path)
        save_slow_gif(
            direction_frames,
            PREVIEWS_DIR / f"genderless-child-walk-{direction}-contact-pair-slow-6x.gif",
        )
        frames[direction] = direction_frames
        qc[direction] = {
            "frames": direction_qc,
            "changed_pixels": int(
                np.any(
                    np.asarray(direction_frames[0]) != np.asarray(direction_frames[1]),
                    axis=2,
                ).sum()
            ),
        }

    sheet.save(SHEET)

    preview = Image.new(
        "RGBA",
        (
            PREVIEW_GAP + 2 * (FRAME_SIZE[0] + PREVIEW_GAP),
            PREVIEW_GAP + len(DIRECTIONS) * (FRAME_SIZE[1] + PREVIEW_GAP),
        ),
        PREVIEW_BACKGROUND,
    )
    for row, direction in enumerate(DIRECTIONS):
        for col, frame in enumerate(frames[direction]):
            preview.alpha_composite(
                frame,
                (
                    PREVIEW_GAP + col * (FRAME_SIZE[0] + PREVIEW_GAP),
                    PREVIEW_GAP + row * (FRAME_SIZE[1] + PREVIEW_GAP),
                ),
            )
    preview.resize(
        (preview.width * PREVIEW_SCALE, preview.height * PREVIEW_SCALE),
        Image.Resampling.NEAREST,
    ).save(PREVIEWS_DIR / "genderless-child-diagonal-contact-pairs-preview-6x.png")

    all_frames = [item for direction in DIRECTIONS for item in qc[direction]["frames"]]
    META.write_text(
        json.dumps(
            {
                "status": "visual_approval_candidate",
                "character": "ai-agent-child-genderless",
                "action": "diagonal walking contact pairs",
                "frame_size_px": list(FRAME_SIZE),
                "anchor_px": [24, 64],
                "sheet_order": {
                    "rows": list(DIRECTIONS),
                    "columns": ["left_foot_forward", "right_foot_forward"],
                },
                "right_direction_method": (
                    "strict horizontal mirror of the corresponding left-direction "
                    "source with anatomical foot labels swapped"
                ),
                "review_frame_duration_ms": GIF_DURATION_MS,
                "source": str(PROCESSED_DIR.relative_to(ROOT)),
                "sheet": str(SHEET.relative_to(ROOT)),
                "qc": qc,
                "qc_summary": {
                    "frame_count": len(all_frames),
                    "all_frames_48x64": all(
                        frame["size"] == list(FRAME_SIZE) for frame in all_frames
                    ),
                    "visible_magenta_pixels": sum(
                        frame["visible_magenta_pixels"] for frame in all_frames
                    ),
                    "edge_touch_frames": [
                        frame["file"]
                        for frame in all_frames
                        if frame["touches_runtime_edge"]
                    ],
                },
            },
            indent=2,
            ensure_ascii=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "sheet": str(SHEET.relative_to(ROOT)),
                "preview": str(
                    (
                        PREVIEWS_DIR
                        / "genderless-child-diagonal-contact-pairs-preview-6x.png"
                    ).relative_to(ROOT)
                ),
                "frames": len(all_frames),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
