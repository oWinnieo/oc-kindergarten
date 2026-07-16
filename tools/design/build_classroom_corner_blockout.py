#!/usr/bin/env python3
"""Build the first 16x9 tile classroom-corner layout blockout."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "assets/design/maps/classroom-corner/blockout"

TILE_SIZE = 32
GRID_SIZE = (16, 9)
CANVAS_SIZE = (GRID_SIZE[0] * TILE_SIZE, GRID_SIZE[1] * TILE_SIZE)

BLOCKOUT = OUT_DIR / "classroom-corner-layout-blockout-512x288.png"
LAYOUT_DATA = OUT_DIR / "classroom-corner-layout.json"

CHARACTERS = [
    {
        "id": "boy-reading-spawn",
        "character": "boy",
        "anchor_px": [96, 232],
        "source": "assets/design/sprites/characters/v2/ai-agent-child-boy/idle/frames/boy-child-idle-wheelbase-v2-1-48x64.png",
        "collision_footprint_px": [30, 6],
    },
    {
        "id": "girl-center-spawn",
        "character": "girl",
        "anchor_px": [256, 232],
        "source": "assets/design/sprites/characters/v2/ai-agent-child-girl/idle/frames/girl-child-idle-wheelbase-v2-1-48x64.png",
        "collision_footprint_px": [26, 6],
    },
    {
        "id": "genderless-block-spawn",
        "character": "genderless",
        "anchor_px": [416, 232],
        "source": "assets/design/sprites/characters/v2/ai-agent-child-genderless/idle/frames/genderless-child-idle-wheelbase-v2-1-48x64.png",
        "collision_footprint_px": [30, 6],
    },
]

OBJECTS = [
    {
        "id": "reading-bookshelf",
        "type": "bookshelf",
        "rect_tiles": [1, 2, 4, 1],
        "collision": True,
        "render_layer": "wall_props",
        "label": "BOOKSHELF",
        "fill": "#5079A5",
    },
    {
        "id": "reading-book-bin",
        "type": "book_bin",
        "rect_tiles": [1, 3, 2, 1],
        "collision": True,
        "render_layer": "floor_props",
        "label": "BOOK BIN",
        "fill": "#D85F55",
    },
    {
        "id": "reading-rug",
        "type": "rug",
        "rect_tiles": [1, 4, 5, 3],
        "collision": False,
        "render_layer": "floor_detail",
        "label": "READING RUG",
        "fill": "#E9898B",
    },
    {
        "id": "block-table",
        "type": "activity_table",
        "rect_tiles": [11, 3, 3, 2],
        "collision": True,
        "render_layer": "floor_props",
        "label": "BLOCK TABLE",
        "fill": "#E5AE3A",
    },
    {
        "id": "toy-bin",
        "type": "toy_storage",
        "rect_tiles": [14, 3, 1, 2],
        "collision": True,
        "render_layer": "floor_props",
        "label": "TOYS",
        "fill": "#4E9DA4",
    },
]


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def tile_rect(rect_tiles: list[int]) -> tuple[int, int, int, int]:
    x, y, width, height = rect_tiles
    return (
        x * TILE_SIZE,
        y * TILE_SIZE,
        (x + width) * TILE_SIZE,
        (y + height) * TILE_SIZE,
    )


def centered_text(
    draw: ImageDraw.ImageDraw,
    rect: tuple[int, int, int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: str,
) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    height = box[3] - box[1]
    x0, y0, x1, y1 = rect
    draw.text(
        ((x0 + x1 - width) / 2, (y0 + y1 - height) / 2 - box[1]),
        text,
        font=font,
        fill=fill,
    )


def build_walkability() -> list[list[int]]:
    grid = [[0 for _ in range(GRID_SIZE[0])] for _ in range(GRID_SIZE[1])]
    for y in range(2, GRID_SIZE[1]):
        for x in range(GRID_SIZE[0]):
            grid[y][x] = 1

    for item in OBJECTS:
        if not item["collision"]:
            continue
        x, y, width, height = item["rect_tiles"]
        for row in range(y, y + height):
            for column in range(x, x + width):
                grid[row][column] = 0
    return grid


def draw_blockout() -> Image.Image:
    image = Image.new("RGB", CANVAS_SIZE, "#E8EFF1")
    draw = ImageDraw.Draw(image)
    label_font = load_font(11, bold=True)
    small_font = load_font(9, bold=True)

    wall_rect = (0, 0, CANVAS_SIZE[0], TILE_SIZE * 2)
    floor_rect = (0, TILE_SIZE * 2, CANVAS_SIZE[0], CANVAS_SIZE[1])
    draw.rectangle(wall_rect, fill="#D6E3E6")
    draw.rectangle(floor_rect, fill="#EFE2C5")

    main_walkway = (0, TILE_SIZE * 6, CANVAS_SIZE[0], CANVAS_SIZE[1])
    center_corridor = (TILE_SIZE * 6, TILE_SIZE * 2, TILE_SIZE * 10, TILE_SIZE * 6)
    draw.rectangle(main_walkway, fill="#D7EEF0")
    draw.rectangle(center_corridor, fill="#D7EEF0")

    draw.rectangle((TILE_SIZE * 7, 16, TILE_SIZE * 9, 48), fill="#FFFFFF", outline="#83979B", width=2)
    centered_text(draw, (TILE_SIZE * 7, 16, TILE_SIZE * 9, 48), "DISPLAY", small_font, "#526469")

    for item in OBJECTS:
        rect = tile_rect(item["rect_tiles"])
        draw.rectangle(rect, fill=item["fill"], outline="#37464A", width=2)
        centered_text(draw, rect, item["label"], small_font, "#172126")

    centered_text(draw, center_corridor, "OPEN CORRIDOR", label_font, "#52757B")
    centered_text(draw, (192, 256, 320, 288), "MAIN WALKWAY", label_font, "#52757B")

    for x in range(0, CANVAS_SIZE[0] + 1, TILE_SIZE):
        draw.line((x, 0, x, CANVAS_SIZE[1]), fill="#8FA1A4", width=1)
    for y in range(0, CANVAS_SIZE[1] + 1, TILE_SIZE):
        draw.line((0, y, CANVAS_SIZE[0], y), fill="#8FA1A4", width=1)

    for actor in CHARACTERS:
        sprite = Image.open(ROOT / actor["source"]).convert("RGBA")
        anchor_x, anchor_y = actor["anchor_px"]
        top_left = (anchor_x - 24, anchor_y - 64)
        image.paste(sprite, top_left, sprite)
        actor["frame_top_left_px"] = list(top_left)
        actor["anchor_tile"] = [anchor_x / TILE_SIZE, anchor_y / TILE_SIZE]

    return image


def write_layout_data(walkability: list[list[int]]) -> None:
    data = {
        "map_id": "classroom-corner-blockout-v1",
        "status": "layout_blockout",
        "visual_asset_source": "procedural_placeholder",
        "map_mode": "tile_mode",
        "visual_model": "layered_tilemap",
        "runtime_object_model": ["interactive_scene_objects", "scene_hooks"],
        "collision_model": ["tile_collision", "trigger_zones"],
        "engine_target": "project-native",
        "canvas_px": list(CANVAS_SIZE),
        "tile_size_px": TILE_SIZE,
        "grid_tiles": list(GRID_SIZE),
        "perspective": "front-facing 3/4 interior blockout",
        "zones": [
            {"id": "wall", "rect_tiles": [0, 0, 16, 2], "walkable": False},
            {"id": "reading_corner", "rect_tiles": [0, 2, 6, 5], "walkable": "mixed"},
            {"id": "center_corridor", "rect_tiles": [6, 2, 4, 4], "walkable": True},
            {"id": "block_corner", "rect_tiles": [10, 2, 6, 4], "walkable": "mixed"},
            {"id": "main_walkway", "rect_tiles": [0, 6, 16, 3], "walkable": True},
        ],
        "objects": [
            {key: value for key, value in item.items() if key not in {"label", "fill"}}
            for item in OBJECTS
        ],
        "walkability": {
            "encoding": "1=walkable, 0=blocked",
            "rows": walkability,
        },
        "actor_spawns": CHARACTERS,
        "next_art_pass": {
            "foundation": "floor, wall, corridor, and rug materials only",
            "separate_props": ["bookshelf", "book_bin", "activity_table", "toy_storage"],
            "do_not_bake": ["characters", "interactive props", "collision blockers"],
        },
        "output": str(BLOCKOUT.relative_to(ROOT)),
    }
    LAYOUT_DATA.write_text(
        json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    walkability = build_walkability()
    image = draw_blockout()
    image.save(BLOCKOUT)
    write_layout_data(walkability)

    if image.size != CANVAS_SIZE:
        raise RuntimeError(f"Expected {CANVAS_SIZE}, got {image.size}")
    if len(walkability) != 9 or any(len(row) != 16 for row in walkability):
        raise RuntimeError("Walkability grid must be 16x9")

    print(
        json.dumps(
            {
                "output": str(BLOCKOUT.relative_to(ROOT)),
                "canvas_px": list(CANVAS_SIZE),
                "grid_tiles": list(GRID_SIZE),
                "actor_count": len(CHARACTERS),
                "object_count": len(OBJECTS),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
