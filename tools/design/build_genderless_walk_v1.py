#!/usr/bin/env python3
"""Package the accepted genderless four-direction walk into 48x64 runtime assets."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
CHAR_DIR = (
    ROOT
    / "assets/design/sprites/characters/ai-agent-child-genderless"
)
WALK_DIR = CHAR_DIR / "walking/v1"
PROCESSED_DIR = WALK_DIR / "processed-normalized-64"
FRAMES_DIR = WALK_DIR / "frames"
SHEETS_DIR = WALK_DIR / "sheets"
STRIPS_DIR = WALK_DIR / "strips"
GIFS_DIR = WALK_DIR / "gifs"
PREVIEWS_DIR = WALK_DIR / "previews"

SHEET = SHEETS_DIR / "genderless-child-walk-4x4-48x64.png"
PREVIEW = PREVIEWS_DIR / "genderless-child-walk-4dir-preview-3x.png"
MAP_QA_GIF = PREVIEWS_DIR / "genderless-child-walk-map-qa.gif"
META = WALK_DIR / "genderless-child-walk-4dir-48x64-meta.json"

FOUNDATION = (
    ROOT
    / "assets/design/maps/classroom-corner/art/v1/classroom-corner-foundation-512x288.png"
)
MAP_PROPS = (
    (
        ROOT
        / "assets/design/maps/classroom-corner/props/reading-bookshelf/v1/reading-bookshelf-96x44.png",
        (24, 40),
        84,
        10,
    ),
    (
        ROOT
        / "assets/design/maps/classroom-corner/props/reading-book-bin/v1/reading-book-bin-48x40.png",
        (128, 44),
        84,
        20,
    ),
    (
        ROOT
        / "assets/design/maps/classroom-corner/props/block-table/v2/block-table-96x56-left-to-right.png",
        (352, 56),
        112,
        30,
    ),
    (
        ROOT
        / "assets/design/maps/classroom-corner/props/toy-bin/v2/toy-bin-40x48-left-to-right.png",
        (456, 64),
        112,
        40,
    ),
)

DIRECTIONS = ("down", "left", "right", "up")
FRAME_SIZE = (48, 64)
SOURCE_CROP = (8, 0, 56, 64)
FRAME_DURATION_MS = 140
MAP_FRAME_DURATION_MS = 100


def save_transparent_gif(frames: list[Image.Image], out_path: Path, duration: int) -> None:
    key = (255, 0, 254)
    width, height = frames[0].size
    stacked = Image.new("RGB", (width, height * len(frames)), key)
    for index, frame in enumerate(frames):
        red, green, blue, alpha = frame.convert("RGBA").split()
        hard_mask = alpha.point(lambda value: 255 if value >= 128 else 0)
        stacked.paste(
            Image.merge("RGB", (red, green, blue)),
            (0, index * height),
            hard_mask,
        )

    paletted = stacked.convert(
        "P", palette=Image.Palette.ADAPTIVE, colors=256, dither=Image.Dither.NONE
    )
    palette = list(paletted.getpalette() or [])
    while len(palette) < 768:
        palette.append(0)
    key_index = min(
        range(256),
        key=lambda index: sum(
            (palette[index * 3 + channel] - key[channel]) ** 2
            for channel in range(3)
        ),
    )
    if key_index != 0:
        lut = np.arange(256, dtype=np.uint8)
        lut[0], lut[key_index] = key_index, 0
        paletted = Image.fromarray(lut[np.asarray(paletted)], mode="P")
        for channel in range(3):
            zero_index = channel
            key_palette_index = key_index * 3 + channel
            palette[zero_index], palette[key_palette_index] = (
                palette[key_palette_index],
                palette[zero_index],
            )
        paletted.putpalette(palette)

    gif_frames = [
        paletted.crop((0, index * height, width, (index + 1) * height))
        for index in range(len(frames))
    ]
    gif_frames[0].save(
        out_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=duration,
        loop=0,
        disposal=2,
        transparency=0,
        background=0,
    )


def save_rgb_gif(frames: list[Image.Image], out_path: Path, duration: int) -> None:
    width, height = frames[0].size
    stacked = Image.new("RGB", (width, height * len(frames)))
    for index, frame in enumerate(frames):
        stacked.paste(frame.convert("RGB"), (0, index * height))
    paletted = stacked.convert(
        "P", palette=Image.Palette.ADAPTIVE, colors=256, dither=Image.Dither.NONE
    )
    gif_frames = [
        paletted.crop((0, index * height, width, (index + 1) * height))
        for index in range(len(frames))
    ]
    gif_frames[0].save(
        out_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=duration,
        loop=0,
        disposal=2,
    )


def load_runtime_frames() -> dict[str, list[Image.Image]]:
    result = {}
    for direction in DIRECTIONS:
        direction_dir = FRAMES_DIR / direction
        direction_dir.mkdir(parents=True, exist_ok=True)
        frames = []
        for index in range(1, 5):
            source = Image.open(PROCESSED_DIR / f"{direction}-{index}.png").convert(
                "RGBA"
            )
            frame = source.crop(SOURCE_CROP)
            pixels = np.asarray(frame).copy()
            magenta_fringe = (
                (pixels[:, :, 0] > 180)
                & (pixels[:, :, 2] > 180)
                & (pixels[:, :, 1] < 100)
            )
            pixels[magenta_fringe, 3] = 0
            pixels[pixels[:, :, 3] == 0, :3] = 0
            frame = Image.fromarray(pixels, mode="RGBA")
            frame.save(direction_dir / f"walk-{direction}-{index}.png")
            frames.append(frame)
        result[direction] = frames
    return result


def compose_sheet(frames: dict[str, list[Image.Image]]) -> None:
    sheet = Image.new("RGBA", (FRAME_SIZE[0] * 4, FRAME_SIZE[1] * 4), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        strip = Image.new("RGBA", (FRAME_SIZE[0] * 4, FRAME_SIZE[1]), (0, 0, 0, 0))
        for col, frame in enumerate(frames[direction]):
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


def compose_preview(frames: dict[str, list[Image.Image]]) -> None:
    gap = 4
    canvas = Image.new(
        "RGBA",
        (
            gap + 4 * (FRAME_SIZE[0] + gap),
            gap + 4 * (FRAME_SIZE[1] + gap),
        ),
        (224, 238, 240, 255),
    )
    for row, direction in enumerate(DIRECTIONS):
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
    ).save(PREVIEW)


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
        ("up", 0, -8),
        ("left", -8, 0),
        ("down", 0, 8),
    )
    anchor = [224, 224]
    scene_frames = []
    for direction, delta_x, delta_y in segments:
        for step in range(8):
            scene_frames.append(
                compose_map_frame(frames[direction][step % 4], tuple(anchor), prop_images)
            )
            anchor[0] += delta_x
            anchor[1] += delta_y
    if anchor != [224, 224]:
        raise RuntimeError(f"Map QA path does not loop: {anchor}")
    save_rgb_gif(scene_frames, MAP_QA_GIF, MAP_FRAME_DURATION_MS)


def frame_qc(frames: dict[str, list[Image.Image]]) -> dict:
    idle = Image.open(
        CHAR_DIR / "idle/frames/idle-planted-antenna-v7-wide38-1.png"
    ).convert("RGBA")
    idle_box = idle.getbbox()
    qc = {"idle_reference_bbox": list(idle_box or (0, 0, 0, 0)), "directions": {}}
    for direction in DIRECTIONS:
        direction_qc = []
        for index, frame in enumerate(frames[direction], start=1):
            pixels = np.asarray(frame)
            visible = pixels[:, :, 3] > 0
            magenta = (
                visible
                & (pixels[:, :, 0] > 180)
                & (pixels[:, :, 2] > 180)
                & (pixels[:, :, 1] < 100)
            )
            bbox = frame.getbbox() or (0, 0, 0, 0)
            touches_edge = bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= 48 or bbox[3] >= 64
            direction_qc.append(
                {
                    "frame": index,
                    "bbox": list(bbox),
                    "visible_pixels": int(visible.sum()),
                    "visible_magenta_pixels": int(magenta.sum()),
                    "touches_runtime_edge": touches_edge,
                }
            )
        qc["directions"][direction] = direction_qc
    return qc


def main() -> None:
    for directory in (FRAMES_DIR, SHEETS_DIR, STRIPS_DIR, GIFS_DIR, PREVIEWS_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    frames = load_runtime_frames()
    compose_sheet(frames)
    compose_preview(frames)
    compose_map_qa(frames)
    qc = frame_qc(frames)

    all_frames = [item for direction in DIRECTIONS for item in qc["directions"][direction]]
    if any(item["touches_runtime_edge"] for item in all_frames):
        raise RuntimeError("A runtime walking frame touches its 48x64 edge")
    if any(item["visible_magenta_pixels"] for item in all_frames):
        raise RuntimeError("Visible magenta remains in a runtime walking frame")

    metadata = {
        "character_id": "ai-agent-child-genderless",
        "action": "walk",
        "revision": "four_direction_v1",
        "status": "superseded_gait_phase_issue",
        "superseded_by": "walking/v3/genderless-child-walk-8dir-alternating-48x64-meta.json",
        "frame_size_px": list(FRAME_SIZE),
        "directions": list(DIRECTIONS),
        "direction_rows": {direction: index for index, direction in enumerate(DIRECTIONS)},
        "frame_order": [
            "left_foot_contact",
            "passing",
            "right_foot_contact",
            "passing_loop_close",
        ],
        "frame_duration_ms": FRAME_DURATION_MS,
        "anchor": "feet_bottom_center",
        "anchor_offset_px": [24, 64],
        "source_raw": str(
            (
                WALK_DIR / "raw/genderless-child-walk-4x4-magenta-safe-margin.png"
            ).relative_to(ROOT)
        ),
        "normalized_raw": str(
            (
                WALK_DIR / "raw/genderless-child-walk-4x4-magenta-normalized.png"
            ).relative_to(ROOT)
        ),
        "normalization_meta": str(
            (
                WALK_DIR / "raw/genderless-child-walk-grid-normalization-meta.json"
            ).relative_to(ROOT)
        ),
        "processor_meta": str(
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
            for direction in DIRECTIONS
        },
        "gifs": {
            direction: str(
                (
                    GIFS_DIR / f"genderless-child-walk-{direction}-48x64.gif"
                ).relative_to(ROOT)
            )
            for direction in DIRECTIONS
        },
        "preview": str(PREVIEW.relative_to(ROOT)),
        "map_qa_gif": str(MAP_QA_GIF.relative_to(ROOT)),
        "qc": qc,
    }
    META.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({"sheet": str(SHEET.relative_to(ROOT)), "frames": len(all_frames)}, indent=2))


if __name__ == "__main__":
    main()
