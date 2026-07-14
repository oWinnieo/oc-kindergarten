#!/usr/bin/env python3
"""Combine approved cardinal walking with generated diagonals into an 8-dir bundle."""

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
CHAR_DIR = (
    ROOT
    / "assets/design/sprites/characters/ai-agent-child-genderless"
)
V1_DIR = CHAR_DIR / "walking/v1"
V2_DIR = CHAR_DIR / "walking/v2"
PROCESSED_DIR = V2_DIR / "processed-64"
FRAMES_DIR = V2_DIR / "frames"
SHEETS_DIR = V2_DIR / "sheets"
STRIPS_DIR = V2_DIR / "strips"
GIFS_DIR = V2_DIR / "gifs"
PREVIEWS_DIR = V2_DIR / "previews"

SHEET = SHEETS_DIR / "genderless-child-walk-8dir-4frame-48x64.png"
DIAGONAL_PREVIEW = PREVIEWS_DIR / "genderless-child-walk-diagonal-preview-3x.png"
MAP_QA_GIF = PREVIEWS_DIR / "genderless-child-walk-8dir-map-qa.gif"
META = V2_DIR / "genderless-child-walk-8dir-48x64-meta.json"

CARDINAL_DIRECTIONS = ("down", "left", "right", "up")
DIAGONAL_DIRECTIONS = ("down_left", "down_right", "up_left", "up_right")
# Keep the accepted v1 row indices stable, then append the four diagonals.
DIRECTION_ROWS = CARDINAL_DIRECTIONS + DIAGONAL_DIRECTIONS
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


def load_frames() -> dict[str, list[Image.Image]]:
    frames: dict[str, list[Image.Image]] = {}
    for direction in CARDINAL_DIRECTIONS:
        frames[direction] = [
            Image.open(
                V1_DIR / "frames" / direction / f"walk-{direction}-{index}.png"
            ).convert("RGBA")
            for index in range(1, 5)
        ]

    for row, direction in enumerate(DIAGONAL_DIRECTIONS):
        row_frames = []
        for col in range(4):
            source_index = row * 4 + col + 1
            source = Image.open(PROCESSED_DIR / f"diagonal-{source_index}.png").convert(
                "RGBA"
            )
            row_frames.append(clean_frame(source.crop(SOURCE_CROP)))
        frames[direction] = row_frames
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


def compose_diagonal_preview(frames: dict[str, list[Image.Image]]) -> None:
    gap = 4
    canvas = Image.new(
        "RGBA",
        (
            gap + 4 * (FRAME_SIZE[0] + gap),
            gap + 4 * (FRAME_SIZE[1] + gap),
        ),
        (224, 238, 240, 255),
    )
    for row, direction in enumerate(DIAGONAL_DIRECTIONS):
        for col, frame in enumerate(frames[direction]):
            canvas.alpha_composite(
                frame,
                (
                    gap + col * (FRAME_SIZE[0] + gap),
                    gap + row * (FRAME_SIZE[1] + gap),
                ),
            )
    canvas.resize(
        (canvas.width * 3, canvas.height * 3), Image.Resampling.NEAREST
    ).save(DIAGONAL_PREVIEW)


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
        raise RuntimeError(f"Eight-direction QA path does not loop: {anchor}")
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
        qc["directions"][direction] = direction_qc
    return qc


def main() -> None:
    for directory in (FRAMES_DIR, SHEETS_DIR, STRIPS_DIR, GIFS_DIR, PREVIEWS_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    frames = load_frames()
    write_runtime_bundle(frames)
    compose_diagonal_preview(frames)
    compose_map_qa(frames)
    qc = build_qc(frames)
    all_frames = [
        item for direction in DIRECTION_ROWS for item in qc["directions"][direction]
    ]
    if any(item["touches_runtime_edge"] for item in all_frames):
        raise RuntimeError("An eight-direction runtime frame touches its 48x64 edge")
    if any(item["visible_magenta_pixels"] for item in all_frames):
        raise RuntimeError("Visible magenta remains in an eight-direction frame")

    metadata = {
        "character_id": "ai-agent-child-genderless",
        "action": "walk",
        "revision": "eight_direction_v2",
        "status": "superseded_gait_phase_issue",
        "superseded_by": "walking/v3/genderless-child-walk-8dir-alternating-48x64-meta.json",
        "extends": "assets/design/sprites/characters/ai-agent-child-genderless/walking/v1/genderless-child-walk-4dir-48x64-meta.json",
        "frame_size_px": list(FRAME_SIZE),
        "frame_count_per_direction": 4,
        "direction_rows": {
            direction: index for index, direction in enumerate(DIRECTION_ROWS)
        },
        "frame_order": [
            "left_foot_contact",
            "passing",
            "right_foot_contact",
            "passing_loop_close",
        ],
        "frame_duration_ms": FRAME_DURATION_MS,
        "anchor": "feet_bottom_center",
        "anchor_offset_px": [24, 64],
        "movement_vectors": {
            "down": [0, 1],
            "left": [-1, 0],
            "right": [1, 0],
            "up": [0, -1],
            "down_left": [-0.7071, 0.7071],
            "down_right": [0.7071, 0.7071],
            "up_left": [-0.7071, -0.7071],
            "up_right": [0.7071, -0.7071],
        },
        "diagonal_speed_rule": "normalize diagonal input by 1/sqrt(2)",
        "diagonal_raw": str(
            (
                V2_DIR / "raw/genderless-child-walk-diagonal-4x4-magenta-raw.png"
            ).relative_to(ROOT)
        ),
        "diagonal_prompt": str(
            (
                V2_DIR
                / "raw/genderless-child-walk-diagonal-4x4-magenta-raw.prompt.txt"
            ).relative_to(ROOT)
        ),
        "diagonal_processor_meta": str(
            (PROCESSED_DIR / "pipeline-meta.json").relative_to(ROOT)
        ),
        "sheet": str(SHEET.relative_to(ROOT)),
        "strips": {
            direction: str(
                (
                    STRIPS_DIR
                    / f"genderless-child-walk-{direction}-strip-48x64.png"
                ).relative_to(ROOT)
            )
            for direction in DIRECTION_ROWS
        },
        "gifs": {
            direction: str(
                (
                    GIFS_DIR / f"genderless-child-walk-{direction}-48x64.gif"
                ).relative_to(ROOT)
            )
            for direction in DIRECTION_ROWS
        },
        "diagonal_preview": str(DIAGONAL_PREVIEW.relative_to(ROOT)),
        "map_qa_gif": str(MAP_QA_GIF.relative_to(ROOT)),
        "qc": qc,
    }
    META.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({"sheet": str(SHEET.relative_to(ROOT)), "frames": len(all_frames)}, indent=2))


if __name__ == "__main__":
    main()
