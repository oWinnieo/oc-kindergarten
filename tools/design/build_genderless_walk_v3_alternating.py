#!/usr/bin/env python3
"""Build an eight-direction walk with verified A/B opposite contact sources."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from build_genderless_walk_v1 import (
    FOUNDATION,
    MAP_PROPS,
    save_rgb_gif,
    save_transparent_gif,
)


ROOT = Path(__file__).resolve().parents[2]
CHAR_DIR = ROOT / "assets/design/sprites/characters/ai-agent-child-genderless"
V2_DIR = CHAR_DIR / "walking/v2"
V3_DIR = CHAR_DIR / "walking/v3"
CARDINAL_DIR = V3_DIR / "processed-cardinal-64"
OPPOSITE_DIR = V3_DIR / "processed-opposite-64"
FRAMES_DIR = V3_DIR / "frames"
SHEETS_DIR = V3_DIR / "sheets"
STRIPS_DIR = V3_DIR / "strips"
GIFS_DIR = V3_DIR / "gifs"
PREVIEWS_DIR = V3_DIR / "previews"

SHEET = SHEETS_DIR / "genderless-child-walk-8dir-alternating-4frame-48x64.png"
CONTACT_PREVIEW = PREVIEWS_DIR / "genderless-child-walk-contact-ab-preview-3x.png"
MAP_QA_GIF = PREVIEWS_DIR / "genderless-child-walk-8dir-alternating-map-qa.gif"
META = V3_DIR / "genderless-child-walk-8dir-alternating-48x64-meta.json"

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
CARDINAL_DIRECTIONS = DIRECTIONS[:4]
DIAGONAL_DIRECTIONS = DIRECTIONS[4:]
DIRECTION_ROWS = DIRECTIONS
CARDINAL_CONTACT_INDICES = {
    "down": (1, 2),
    "left": (3, 4),
    "right": (5, 6),
    "up": (7, 8),
}
DIAGONAL_OPPOSITE_INDICES = {
    "down_left": 5,
    "down_right": 6,
    "up_left": 7,
    "up_right": 8,
}
FRAME_SIZE = (48, 64)
SOURCE_CROP = (8, 0, 56, 64)
FRAME_DURATION_MS = 140
MAP_FRAME_DURATION_MS = 100


def clean_frame(frame: Image.Image) -> Image.Image:
    pixels = np.asarray(frame.convert("RGBA")).copy()
    magenta_fringe = (
        (pixels[:, :, 0] > 180)
        & (pixels[:, :, 2] > 180)
        & (pixels[:, :, 1] < 100)
    )
    pixels[magenta_fringe, 3] = 0
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels, mode="RGBA")


def clean_crop(frame: Image.Image) -> Image.Image:
    return clean_frame(frame.convert("RGBA").crop(SOURCE_CROP))


def load_frames() -> dict[str, list[Image.Image]]:
    frames: dict[str, list[Image.Image]] = {}
    for direction in CARDINAL_DIRECTIONS:
        contact_a_index, contact_b_index = CARDINAL_CONTACT_INDICES[direction]
        contact_a = clean_crop(
            Image.open(CARDINAL_DIR / f"cardinal-contact-{contact_a_index}.png")
        )
        contact_b = clean_crop(
            Image.open(CARDINAL_DIR / f"cardinal-contact-{contact_b_index}.png")
        )
        passing_a = Image.open(
            V2_DIR / "frames" / direction / f"walk-{direction}-2.png"
        ).convert("RGBA")
        passing_b = Image.open(
            V2_DIR / "frames" / direction / f"walk-{direction}-4.png"
        ).convert("RGBA")
        frames[direction] = [contact_a, passing_a, contact_b, passing_b]

    for direction in DIAGONAL_DIRECTIONS:
        contact_a = Image.open(
            V2_DIR / "frames" / direction / f"walk-{direction}-1.png"
        ).convert("RGBA")
        contact_b = clean_crop(
            Image.open(
                OPPOSITE_DIR
                / f"opposite-contact-{DIAGONAL_OPPOSITE_INDICES[direction]}.png"
            )
        )
        passing_a = Image.open(
            V2_DIR / "frames" / direction / f"walk-{direction}-2.png"
        ).convert("RGBA")
        passing_b = Image.open(
            V2_DIR / "frames" / direction / f"walk-{direction}-4.png"
        ).convert("RGBA")
        frames[direction] = [contact_a, passing_a, contact_b, passing_b]
    return frames


def write_runtime_bundle(frames: dict[str, list[Image.Image]]) -> None:
    sheet = Image.new(
        "RGBA",
        (FRAME_SIZE[0] * 4, FRAME_SIZE[1] * len(DIRECTION_ROWS)),
        (0, 0, 0, 0),
    )
    for row, direction in enumerate(DIRECTION_ROWS):
        direction_dir = FRAMES_DIR / direction
        direction_dir.mkdir(parents=True, exist_ok=True)
        strip = Image.new("RGBA", (FRAME_SIZE[0] * 4, FRAME_SIZE[1]), (0, 0, 0, 0))
        for col, frame in enumerate(frames[direction]):
            frame.save(direction_dir / f"walk-{direction}-{col + 1}.png")
            x = col * FRAME_SIZE[0]
            strip.alpha_composite(frame, (x, 0))
            sheet.alpha_composite(frame, (x, row * FRAME_SIZE[1]))
        strip.save(STRIPS_DIR / f"genderless-child-walk-{direction}-strip-48x64.png")
        save_transparent_gif(
            frames[direction],
            GIFS_DIR / f"genderless-child-walk-{direction}-48x64.gif",
            FRAME_DURATION_MS,
        )
    sheet.save(SHEET)


def compose_contact_preview(frames: dict[str, list[Image.Image]]) -> None:
    gap = 4
    # Four rows, with two directions per row and A/B adjacent for direct comparison.
    pair_rows = (
        ("down", "left"),
        ("right", "up"),
        ("down_left", "down_right"),
        ("up_left", "up_right"),
    )
    canvas = Image.new(
        "RGBA",
        (
            gap + 4 * (FRAME_SIZE[0] + gap),
            gap + 4 * (FRAME_SIZE[1] + gap),
        ),
        (224, 238, 240, 255),
    )
    for row, directions in enumerate(pair_rows):
        for pair_index, direction in enumerate(directions):
            for contact_index, frame_index in enumerate((0, 2)):
                col = pair_index * 2 + contact_index
                canvas.alpha_composite(
                    frames[direction][frame_index],
                    (
                        gap + col * (FRAME_SIZE[0] + gap),
                        gap + row * (FRAME_SIZE[1] + gap),
                    ),
                )
    canvas.resize(
        (canvas.width * 3, canvas.height * 3), Image.Resampling.NEAREST
    ).save(CONTACT_PREVIEW)


def compose_map_frame(
    frame: Image.Image, anchor: tuple[int, int], prop_images: list[dict]
) -> Image.Image:
    scene = Image.open(FOUNDATION).convert("RGBA")
    renderables = list(prop_images)
    renderables.append(
        {
            "image": frame,
            "position": (anchor[0] - 24, anchor[1] - 64),
            "sort_y": anchor[1],
            "stable_order": 100,
        }
    )
    renderables.sort(key=lambda item: (item["sort_y"], item["stable_order"]))
    for renderable in renderables:
        scene.alpha_composite(renderable["image"], renderable["position"])
    return scene.convert("RGB")


def compose_map_qa(frames: dict[str, list[Image.Image]]) -> None:
    prop_images = [
        {
            "image": Image.open(path).convert("RGBA"),
            "position": position,
            "sort_y": sort_y,
            "stable_order": stable_order,
        }
        for path, position, sort_y, stable_order in MAP_PROPS
    ]
    segments = (
        ("right", 8, 0),
        ("up_right", 6, -6),
        ("up", 0, -8),
        ("up_left", -6, -6),
        ("left", -8, 0),
        ("down_left", -6, 6),
        ("down", 0, 8),
        ("down_right", 6, 6),
    )
    anchor = [224, 224]
    scene_frames = []
    for direction, delta_x, delta_y in segments:
        for frame_index in range(4):
            scene_frames.append(
                compose_map_frame(frames[direction][frame_index], tuple(anchor), prop_images)
            )
            anchor[0] += delta_x
            anchor[1] += delta_y
    if anchor != [224, 224]:
        raise RuntimeError(f"Corrected QA path does not loop: {anchor}")
    save_rgb_gif(scene_frames, MAP_QA_GIF, MAP_FRAME_DURATION_MS)


def build_qc(frames: dict[str, list[Image.Image]]) -> dict:
    qc = {"directions": {}}
    for direction in DIRECTION_ROWS:
        direction_qc = []
        for index, frame in enumerate(frames[direction], start=1):
            pixels = np.asarray(frame.convert("RGBA"))
            visible = pixels[:, :, 3] > 0
            magenta = (
                visible
                & (pixels[:, :, 0] > 180)
                & (pixels[:, :, 2] > 180)
                & (pixels[:, :, 1] < 100)
            )
            bbox = frame.getbbox() or (0, 0, 0, 0)
            direction_qc.append(
                {
                    "frame": index,
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
            )
        contact_a = np.asarray(frames[direction][0].convert("RGBA"))
        contact_b = np.asarray(frames[direction][2].convert("RGBA"))
        qc["directions"][direction] = {
            "frames": direction_qc,
            "contact_a_b_changed_pixels": int(
                np.any(contact_a != contact_b, axis=2).sum()
            ),
        }
    return qc


def main() -> None:
    for directory in (FRAMES_DIR, SHEETS_DIR, STRIPS_DIR, GIFS_DIR, PREVIEWS_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    frames = load_frames()
    write_runtime_bundle(frames)
    compose_contact_preview(frames)
    compose_map_qa(frames)
    qc = build_qc(frames)
    all_frame_qc = [
        item
        for direction in DIRECTION_ROWS
        for item in qc["directions"][direction]["frames"]
    ]
    if any(item["touches_runtime_edge"] for item in all_frame_qc):
        raise RuntimeError("A corrected runtime frame touches its 48x64 edge")
    if any(item["visible_magenta_pixels"] for item in all_frame_qc):
        raise RuntimeError("Visible magenta remains in a corrected frame")
    if any(
        qc["directions"][direction]["contact_a_b_changed_pixels"] < 100
        for direction in DIRECTION_ROWS
    ):
        raise RuntimeError("A contact A/B pair is insufficiently different")

    metadata = {
        "character_id": "ai-agent-child-genderless",
        "action": "walk",
        "revision": "eight_direction_v3_true_leg_alternation",
        "status": "rejected_left_gait_phase",
        "known_issue": "left direction frame 3 does not clearly advance the opposite leg",
        "left_replacement_candidate": "walking/v4/left-review/genderless-child-left-walk-review-meta.json",
        "supersedes": [
            "walking/v1/genderless-child-walk-4dir-48x64-meta.json",
            "walking/v2/genderless-child-walk-8dir-48x64-meta.json",
        ],
        "correction": "frame 1 and frame 3 use opposite contact legs in every direction",
        "frame_size_px": list(FRAME_SIZE),
        "frame_count_per_direction": 4,
        "direction_rows": {
            direction: index for index, direction in enumerate(DIRECTION_ROWS)
        },
        "frame_order": [
            "contact_a",
            "passing_a",
            "contact_b_opposite_leg",
            "passing_b",
        ],
        "frame_duration_ms": FRAME_DURATION_MS,
        "anchor": "feet_bottom_center",
        "anchor_offset_px": [24, 64],
        "diagonal_speed_rule": "normalize diagonal input by 1/sqrt(2)",
        "cardinal_contact_source": str(
            (
                V3_DIR / "raw/genderless-child-cardinal-contact-pairs-4x2-magenta.png"
            ).relative_to(ROOT)
        ),
        "opposite_contact_source": str(
            (
                V3_DIR / "raw/genderless-child-opposite-contact-8dir-2x4-magenta.png"
            ).relative_to(ROOT)
        ),
        "sheet": str(SHEET.relative_to(ROOT)),
        "contact_preview": str(CONTACT_PREVIEW.relative_to(ROOT)),
        "map_qa_gif": str(MAP_QA_GIF.relative_to(ROOT)),
        "qc": qc,
    }
    META.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({"sheet": str(SHEET.relative_to(ROOT)), "frames": len(all_frame_qc)}, indent=2))


if __name__ == "__main__":
    main()
