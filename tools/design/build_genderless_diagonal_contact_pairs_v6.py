#!/usr/bin/env python3
"""Build stable 48x64 diagonal contact pairs from approved project sprites."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
CHARACTER_DIR = (
    ROOT / "assets/design/sprites/characters/ai-agent-child-genderless"
)
V3_FRAMES = CHARACTER_DIR / "walking/v3/frames"
CARDINAL_FRAMES = CHARACTER_DIR / "walking/v5/cardinal-contact-pairs/frames"
RUN_DIR = CHARACTER_DIR / "walking/v6/diagonal-contact-pairs"
FRAMES_DIR = RUN_DIR / "frames"
PAIRS_DIR = RUN_DIR / "pairs"
PREVIEWS_DIR = RUN_DIR / "previews"
SHEET = RUN_DIR / "genderless-child-diagonal-contact-pairs-v6-4x2-48x64.png"
META = RUN_DIR / "genderless-child-diagonal-contact-pairs-v6-48x64-meta.json"

FRAME_SIZE = (48, 64)
PREVIEW_SCALE = 6
PREVIEW_GAP = 4
PREVIEW_BACKGROUND = (224, 238, 240, 255)
GIF_DURATION_MS = 1100

DIRECTIONS = ("down_left", "down_right", "up_left", "up_right")
FORWARD_FEET = ("left", "right")

SOURCE_CONFIG = {
    "down_left": {
        "base": V3_FRAMES / "down_left/walk-down_left-2.png",
        "contacts": {
            "left": CARDINAL_FRAMES
            / "front/walk-front-left-foot-forward-48x64.png",
            "right": CARDINAL_FRAMES
            / "front/walk-front-right-foot-forward-48x64.png",
        },
        "lower_body_box": (10, 47, 38, 64),
    },
    "up_left": {
        "base": V3_FRAMES / "up_left/walk-up_left-2.png",
        "contacts": {
            "left": CARDINAL_FRAMES
            / "back/walk-back-left-foot-forward-48x64.png",
            "right": CARDINAL_FRAMES
            / "back/walk-back-right-foot-forward-48x64.png",
        },
        "lower_body_box": (10, 48, 38, 64),
    },
}


def clean_frame(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    visible = pixels[:, :, 3] > 0
    magenta_fringe = (
        visible
        & (pixels[:, :, 0] > 180)
        & (pixels[:, :, 2] > 180)
        & (pixels[:, :, 1] < 100)
    )
    pixels[magenta_fringe, 3] = 0
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels, mode="RGBA")


def compose_left_direction(direction: str, forward_foot: str) -> Image.Image:
    config = SOURCE_CONFIG[direction]
    base = Image.open(config["base"]).convert("RGBA")
    contact = Image.open(config["contacts"][forward_foot]).convert("RGBA")
    box = config["lower_body_box"]
    base.paste(contact.crop(box), (box[0], box[1]))
    return clean_frame(base)


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
        "mode": frame.mode,
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

    frames = {
        "down_left": [
            compose_left_direction("down_left", foot) for foot in FORWARD_FEET
        ],
        "up_left": [
            compose_left_direction("up_left", foot) for foot in FORWARD_FEET
        ],
    }
    frames["down_right"] = [
        frames["down_left"][1].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        frames["down_left"][0].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
    ]
    frames["up_right"] = [
        frames["up_left"][1].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        frames["up_left"][0].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
    ]

    sheet = Image.new(
        "RGBA",
        (FRAME_SIZE[0] * 2, FRAME_SIZE[1] * len(DIRECTIONS)),
        (0, 0, 0, 0),
    )
    qc = {}

    for row, direction in enumerate(DIRECTIONS):
        direction_dir = FRAMES_DIR / direction
        direction_dir.mkdir(parents=True, exist_ok=True)
        pair = Image.new(
            "RGBA", (FRAME_SIZE[0] * 2, FRAME_SIZE[1]), (0, 0, 0, 0)
        )
        direction_qc = []

        for col, forward_foot in enumerate(FORWARD_FEET):
            frame = frames[direction][col]
            filename = f"walk-{direction}-{forward_foot}-foot-forward-48x64.png"
            path = direction_dir / filename
            frame.save(path)
            pair.alpha_composite(frame, (col * FRAME_SIZE[0], 0))
            sheet.alpha_composite(frame, (col * FRAME_SIZE[0], row * FRAME_SIZE[1]))
            direction_qc.append(
                {
                    "forward_foot": forward_foot,
                    "file": str(path.relative_to(ROOT)),
                    **frame_qc(frame),
                }
            )

        pair.save(
            PAIRS_DIR
            / f"genderless-child-walk-{direction}-contact-pair-v6-48x64.png"
        )
        save_slow_gif(
            frames[direction],
            PREVIEWS_DIR
            / f"genderless-child-walk-{direction}-contact-pair-v6-slow-6x.gif",
        )
        qc[direction] = {
            "frames": direction_qc,
            "changed_pixels": int(
                np.any(
                    np.asarray(frames[direction][0])
                    != np.asarray(frames[direction][1]),
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
    ).save(
        PREVIEWS_DIR / "genderless-child-diagonal-contact-pairs-v6-preview-6x.png"
    )

    all_frames = [item for direction in DIRECTIONS for item in qc[direction]["frames"]]
    META.write_text(
        json.dumps(
            {
                "status": "visual_approval_candidate",
                "version": "v6",
                "character": "ai-agent-child-genderless",
                "action": "diagonal walking contact pairs",
                "frame_size_px": list(FRAME_SIZE),
                "anchor_px": [24, 64],
                "sheet_order": {
                    "rows": list(DIRECTIONS),
                    "columns": ["left_foot_forward", "right_foot_forward"],
                },
                "construction": {
                    "direction_identity": (
                        "v3 diagonal frame preserves head, torso, arms, and backpack"
                    ),
                    "leg_contact_source": (
                        "approved v5 front/back cardinal left-right contact frames"
                    ),
                    "right_direction_method": (
                        "exact horizontal mirror with forward-foot labels swapped"
                    ),
                    "lower_body_boxes": {
                        key: list(value["lower_body_box"])
                        for key, value in SOURCE_CONFIG.items()
                    },
                },
                "review_frame_duration_ms": GIF_DURATION_MS,
                "sheet": str(SHEET.relative_to(ROOT)),
                "qc": qc,
                "qc_summary": {
                    "frame_count": len(all_frames),
                    "all_frames_48x64_rgba": all(
                        frame["size"] == list(FRAME_SIZE)
                        and frame["mode"] == "RGBA"
                        for frame in all_frames
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
                "run_dir": str(RUN_DIR.relative_to(ROOT)),
                "preview": str(
                    (
                        PREVIEWS_DIR
                        / "genderless-child-diagonal-contact-pairs-v6-preview-6x.png"
                    ).relative_to(ROOT)
                ),
                "frames": len(all_frames),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
