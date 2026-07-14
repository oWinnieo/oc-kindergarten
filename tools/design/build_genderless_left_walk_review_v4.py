#!/usr/bin/env python3
"""Build a slow, single-direction review for the corrected left walk cycle."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
CHAR_DIR = ROOT / "assets/design/sprites/characters/ai-agent-child-genderless"
V3_DIR = CHAR_DIR / "walking/v3"
REVIEW_DIR = CHAR_DIR / "walking/v4/left-review"
FRAMES_DIR = REVIEW_DIR / "frames"
PREVIEWS_DIR = REVIEW_DIR / "previews"

CONTACT_PREVIEW = PREVIEWS_DIR / "genderless-child-left-contact-ab-preview-12x.png"
SLOW_GIF = PREVIEWS_DIR / "genderless-child-left-walk-slow-review-12x.gif"
STRIP = REVIEW_DIR / "genderless-child-left-walk-review-strip-48x64.png"
META = REVIEW_DIR / "genderless-child-left-walk-review-meta.json"

FRAME_SIZE = (48, 64)
LEG_SWAP_SPLIT_Y = 46
REVIEW_DURATIONS_MS = [900, 600, 900, 600]


def build_opposite_contact(contact_a: Image.Image, previous_b: Image.Image) -> Image.Image:
    corrected = previous_b.copy()
    corrected.paste((0, 0, 0, 0), (0, LEG_SWAP_SPLIT_Y, 48, 64))
    swapped_legs = contact_a.crop(
        (0, LEG_SWAP_SPLIT_Y, 48, 64)
    ).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    corrected.alpha_composite(swapped_legs, (0, LEG_SWAP_SPLIT_Y))

    # Keep the opposite arm phase and restore the backpack edge above the legs.
    backpack_restore = previous_b.crop((32, LEG_SWAP_SPLIT_Y, 48, 54))
    corrected.alpha_composite(backpack_restore, (32, LEG_SWAP_SPLIT_Y))
    return corrected


def review_frame(frame: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (64, 80), (224, 238, 240, 255))
    canvas.alpha_composite(frame, (8, 8))
    return canvas.resize((768, 960), Image.Resampling.NEAREST).convert("RGB")


def save_slow_gif(frames: list[Image.Image]) -> None:
    review_frames = [review_frame(frame) for frame in frames]
    stacked = Image.new("RGB", (768, 960 * len(review_frames)))
    for index, frame in enumerate(review_frames):
        stacked.paste(frame, (0, index * 960))
    paletted = stacked.convert(
        "P", palette=Image.Palette.ADAPTIVE, colors=256, dither=Image.Dither.NONE
    )
    gif_frames = [
        paletted.crop((0, index * 960, 768, (index + 1) * 960))
        for index in range(len(review_frames))
    ]
    gif_frames[0].save(
        SLOW_GIF,
        save_all=True,
        append_images=gif_frames[1:],
        duration=REVIEW_DURATIONS_MS,
        loop=0,
        disposal=2,
    )


def save_contact_preview(contact_a: Image.Image, contact_b: Image.Image) -> None:
    canvas = Image.new("RGBA", (128, 80), (224, 238, 240, 255))
    canvas.alpha_composite(contact_a, (8, 8))
    canvas.alpha_composite(contact_b, (72, 8))
    canvas.resize((1536, 960), Image.Resampling.NEAREST).save(CONTACT_PREVIEW)


def frame_qc(frames: list[Image.Image]) -> list[dict]:
    result = []
    for index, frame in enumerate(frames, start=1):
        pixels = np.asarray(frame.convert("RGBA"))
        visible = pixels[:, :, 3] > 0
        magenta = (
            visible
            & (pixels[:, :, 0] > 180)
            & (pixels[:, :, 2] > 180)
            & (pixels[:, :, 1] < 100)
        )
        bbox = frame.getbbox() or (0, 0, 0, 0)
        result.append(
            {
                "frame": index,
                "bbox": list(bbox),
                "visible_magenta_pixels": int(magenta.sum()),
                "touches_edge": (
                    bbox[0] <= 0
                    or bbox[1] <= 0
                    or bbox[2] >= 48
                    or bbox[3] >= 64
                ),
            }
        )
    return result


def main() -> None:
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

    contact_a = Image.open(V3_DIR / "frames/left/walk-left-1.png").convert("RGBA")
    passing_a = Image.open(V3_DIR / "frames/left/walk-left-2.png").convert("RGBA")
    previous_b = Image.open(V3_DIR / "frames/left/walk-left-3.png").convert("RGBA")
    passing_b = Image.open(V3_DIR / "frames/left/walk-left-4.png").convert("RGBA")
    contact_b = build_opposite_contact(contact_a, previous_b)
    frames = [contact_a, passing_a, contact_b, passing_b]

    strip = Image.new("RGBA", (192, 64), (0, 0, 0, 0))
    for index, frame in enumerate(frames, start=1):
        frame.save(FRAMES_DIR / f"walk-left-{index}.png")
        strip.alpha_composite(frame, ((index - 1) * 48, 0))
    strip.save(STRIP)
    save_contact_preview(contact_a, contact_b)
    save_slow_gif(frames)

    qc = frame_qc(frames)
    if any(item["touches_edge"] for item in qc):
        raise RuntimeError("A left-review frame touches its 48x64 edge")
    if any(item["visible_magenta_pixels"] for item in qc):
        raise RuntimeError("Visible magenta remains in the left-review frames")

    contact_a_pixels = np.asarray(contact_a.convert("RGBA"))
    contact_b_pixels = np.asarray(contact_b.convert("RGBA"))
    changed_pixels = int(np.any(contact_a_pixels != contact_b_pixels, axis=2).sum())
    metadata = {
        "character_id": "ai-agent-child-genderless",
        "action": "walk_left",
        "status": "visual_approval_candidate",
        "scope": "left direction only; other directions frozen",
        "frame_size_px": list(FRAME_SIZE),
        "frame_order": [
            "left_leg_contact",
            "passing_a",
            "right_leg_contact",
            "passing_b",
        ],
        "review_durations_ms": REVIEW_DURATIONS_MS,
        "correction": {
            "method": "approved-pixel lower-limb depth-layer phase swap",
            "split_y": LEG_SWAP_SPLIT_Y,
            "contact_a_b_changed_pixels": changed_pixels,
            "visual_rule": "bright near-left shoe leads in A; dark far-right shoe leads at screen-left in B",
        },
        "strip": str(STRIP.relative_to(ROOT)),
        "contact_preview": str(CONTACT_PREVIEW.relative_to(ROOT)),
        "slow_preview_gif": str(SLOW_GIF.relative_to(ROOT)),
        "qc": qc,
    }
    META.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({"preview": str(SLOW_GIF.relative_to(ROOT)), "frames": 4}, indent=2))


if __name__ == "__main__":
    main()
