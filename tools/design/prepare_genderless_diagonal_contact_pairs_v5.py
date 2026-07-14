#!/usr/bin/env python3
"""Assemble selected diagonal contact poses into a strict 4x2 source grid."""

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
RAW_DIR = RUN_DIR / "raw"
OUTPUT = RAW_DIR / "genderless-child-diagonal-contact-pairs-4x2-normalized.png"
META = RAW_DIR / "diagonal-contact-source-assembly-meta.json"

ROWS = 4
COLS = 2
SOURCE_GRID = (2, 2)
MAGENTA_THRESHOLD = 100
SOURCE_PADDING = 16
CELL_PADDING = 40
SOURCE_SCALES = {
    "down-left-far-leg-forward-red-marker-v5-2x2-magenta.png": 0.93,
}

# Rows are down-left, down-right, up-left, up-right. Columns are anatomical
# left foot forward and anatomical right foot forward. The character design is
# left/right symmetric, so the right-facing sources are strict horizontal
# mirrors with the anatomical foot labels swapped. Temporary marker colors in
# generated review sources are normalized back to the project palette here.
SELECTIONS = (
    (
        "down-left-pair-2x2-magenta.png",
        (0, 0),
        False,
        False,
        "down_left",
        "left",
    ),
    (
        "down-left-far-leg-forward-red-marker-v5-2x2-magenta.png",
        (0, 0),
        False,
        "yellow",
        "down_left",
        "right",
    ),
    (
        "down-left-far-leg-forward-red-marker-v5-2x2-magenta.png",
        (0, 0),
        True,
        "yellow",
        "down_right",
        "left",
    ),
    (
        "down-left-pair-2x2-magenta.png",
        (0, 0),
        True,
        False,
        "down_right",
        "right",
    ),
    ("up-left-pair-2x2-magenta.png", (0, 0), False, False, "up_left", "left"),
    ("up-left-pair-2x2-magenta.png", (0, 1), False, False, "up_left", "right"),
    ("up-left-pair-2x2-magenta.png", (0, 1), True, False, "up_right", "left"),
    ("up-left-pair-2x2-magenta.png", (0, 0), True, False, "up_right", "right"),
)


def magenta_distance(pixels: np.ndarray) -> np.ndarray:
    red = pixels[:, :, 0].astype(np.int32)
    green = pixels[:, :, 1].astype(np.int32)
    blue = pixels[:, :, 2].astype(np.int32)
    return np.sqrt((red - 255) ** 2 + green**2 + (blue - 255) ** 2)


def extract_cell(
    path: Path,
    grid: tuple[int, int],
    mirror: bool,
    red_marker_target: str | bool,
) -> tuple[Image.Image, dict]:
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
    marker_pixels = np.zeros(crop_pixels.shape[:2], dtype=bool)
    if red_marker_target:
        red = crop_pixels[:, :, 0].astype(np.int32)
        green = crop_pixels[:, :, 1].astype(np.int32)
        blue = crop_pixels[:, :, 2].astype(np.int32)
        marker_pixels = (
            (crop_pixels[:, :, 3] > 0)
            & (red > 90)
            & (red * 100 > green * 135)
            & (red * 100 > blue * 125)
            & (green < 150)
        )
        if red_marker_target == "yellow":
            crop_pixels[marker_pixels, 0] = 253
            crop_pixels[marker_pixels, 1] = 200
            crop_pixels[marker_pixels, 2] = 0
        else:
            crop_pixels[marker_pixels, 0] = np.minimum(blue[marker_pixels], 60)
            crop_pixels[marker_pixels, 1] = np.maximum(
                green[marker_pixels], red[marker_pixels] * 36 // 100
            )
            crop_pixels[marker_pixels, 2] = np.maximum(
                blue[marker_pixels], red[marker_pixels]
            )
    crop = Image.fromarray(crop_pixels, mode="RGBA")
    if mirror:
        crop = crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    source_scale = SOURCE_SCALES.get(path.name, 1.0)
    if source_scale != 1.0:
        crop = crop.resize(
            (
                max(1, round(crop.width * source_scale)),
                max(1, round(crop.height * source_scale)),
            ),
            Image.Resampling.NEAREST,
        )

    return crop, {
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
        "mirrored_horizontally": mirror,
        "source_scale": source_scale,
        "red_marker_target": red_marker_target or None,
        "normalized_marker_pixels": int(marker_pixels.sum()),
    }


def main() -> None:
    extracted = []
    records = []
    for filename, grid, mirror, red_marker_target, direction, forward_foot in SELECTIONS:
        crop, record = extract_cell(
            RAW_DIR / filename, grid, mirror, red_marker_target
        )
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
                "operation": (
                    "selection, temporary marker palette normalization, horizontal "
                    "direction mirroring, and equal-cell repack; no pose redraw"
                ),
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
