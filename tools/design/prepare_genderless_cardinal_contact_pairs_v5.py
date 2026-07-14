#!/usr/bin/env python3
"""Assemble selected generated contact poses into a strict 4x2 source grid."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RUN_DIR = (
    ROOT
    / "assets/design/sprites/characters/ai-agent-child-genderless"
    / "walking/v5/cardinal-contact-pairs"
)
RAW_DIR = RUN_DIR / "raw"
OUTPUT = RAW_DIR / "genderless-child-cardinal-contact-pairs-4x2-normalized.png"
META = RAW_DIR / "cardinal-contact-source-assembly-meta.json"

ROWS = 4
COLS = 2
SOURCE_GRID = (2, 2)
MAGENTA_THRESHOLD = 100
SOURCE_PADDING = 16
CELL_PADDING = 40

# Output order: front, back, left, right. Column 0 is anatomical left foot
# forward; column 1 is anatomical right foot forward.
SELECTIONS = (
    ("front-pair-2x2-magenta.png", (0, 0), "front", "left"),
    ("front-pair-2x2-magenta.png", (0, 1), "front", "right"),
    ("back-pair-2x2-magenta.png", (0, 0), "back", "left"),
    ("back-pair-2x2-magenta.png", (0, 1), "back", "right"),
    ("left-left-foot-forward-2x2-magenta.png", (0, 0), "left", "left"),
    ("left-right-foot-forward-2x2-magenta.png", (0, 0), "left", "right"),
    ("right-left-foot-forward-2x2-magenta.png", (0, 0), "right", "left"),
    ("right-right-foot-forward-2x2-magenta.png", (0, 0), "right", "right"),
)


def magenta_distance(pixels: np.ndarray) -> np.ndarray:
    red = pixels[:, :, 0].astype(np.int32)
    green = pixels[:, :, 1].astype(np.int32)
    blue = pixels[:, :, 2].astype(np.int32)
    return np.sqrt((red - 255) ** 2 + green**2 + (blue - 255) ** 2)


def extract_cell(path: Path, grid: tuple[int, int]) -> tuple[Image.Image, dict]:
    source = Image.open(path).convert("RGB")
    cell_width = source.width // SOURCE_GRID[1]
    cell_height = source.height // SOURCE_GRID[0]
    row, col = grid
    cell_box = (
        col * cell_width,
        row * cell_height,
        (col + 1) * cell_width,
        (row + 1) * cell_height,
    )
    cell = source.crop(cell_box)
    pixels = np.asarray(cell)
    visible = magenta_distance(pixels) >= MAGENTA_THRESHOLD
    ys, xs = np.nonzero(visible)
    if not len(xs):
        raise RuntimeError(f"No sprite detected in {path.name} cell {grid}")

    bbox = (
        max(0, int(xs.min()) - SOURCE_PADDING),
        max(0, int(ys.min()) - SOURCE_PADDING),
        min(cell.width, int(xs.max()) + 1 + SOURCE_PADDING),
        min(cell.height, int(ys.max()) + 1 + SOURCE_PADDING),
    )
    crop = cell.crop(bbox).convert("RGBA")
    crop_pixels = np.asarray(crop).copy()
    background = magenta_distance(crop_pixels[:, :, :3]) < MAGENTA_THRESHOLD
    crop_pixels[background, 3] = 0
    crop_pixels[crop_pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(crop_pixels, mode="RGBA"), {
        "source_size": [source.width, source.height],
        "source_cell": list(grid),
        "source_cell_box": list(cell_box),
        "detected_bbox_in_cell": [
            int(xs.min()),
            int(ys.min()),
            int(xs.max()) + 1,
            int(ys.max()) + 1,
        ],
        "crop_box_in_cell": list(bbox),
    }


def main() -> None:
    extracted = []
    records = []
    for filename, grid, direction, forward_foot in SELECTIONS:
        crop, record = extract_cell(RAW_DIR / filename, grid)
        extracted.append(crop)
        records.append(
            {
                "source": str((RAW_DIR / filename).relative_to(ROOT)),
                "direction": direction,
                "forward_foot": forward_foot,
                **record,
            }
        )

    max_width = max(image.width for image in extracted)
    max_height = max(image.height for image in extracted)
    cell_size = max(max_width, max_height) + CELL_PADDING * 2
    canvas = Image.new(
        "RGBA",
        (cell_size * COLS, cell_size * ROWS),
        (255, 0, 255, 255),
    )

    for index, image in enumerate(extracted):
        row, col = divmod(index, COLS)
        paste_x = col * cell_size + (cell_size - image.width) // 2
        paste_y = row * cell_size + cell_size - CELL_PADDING - image.height
        canvas.alpha_composite(image, (paste_x, paste_y))
        records[index]["output_grid"] = [row, col]
        records[index]["paste_position"] = [paste_x, paste_y]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUTPUT)
    META.write_text(
        json.dumps(
            {
                "output": str(OUTPUT.relative_to(ROOT)),
                "operation": "selection and equal-cell repack; no pose redraw",
                "grid": [ROWS, COLS],
                "cell_size_px": cell_size,
                "baseline_padding_px": CELL_PADDING,
                "frames": records,
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
                "output": str(OUTPUT.relative_to(ROOT)),
                "grid": [ROWS, COLS],
                "cell_size": cell_size,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
