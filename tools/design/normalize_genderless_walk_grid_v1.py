#!/usr/bin/env python3
"""Repack the accepted walking poses into a strict equal-cell 4x4 source grid."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
WALK_DIR = (
    ROOT
    / "assets/design/sprites/characters/ai-agent-child-genderless/walking/v1"
)
SOURCE = WALK_DIR / "raw/genderless-child-walk-4x4-magenta-safe-margin.png"
OUTPUT = WALK_DIR / "raw/genderless-child-walk-4x4-magenta-normalized.png"
META = WALK_DIR / "raw/genderless-child-walk-grid-normalization-meta.json"

CELL_SIZE = 313
ROWS = 4
COLS = 4
TARGET_BASELINE_Y = 289
SOURCE_PADDING = 10

# Detected full-character bounds in row-major order. These preserve the generated
# poses while correcting the generator's non-uniform row centers.
SOURCE_BOXES = (
    (138, 87, 268, 302),
    (421, 87, 548, 301),
    (708, 91, 835, 302),
    (989, 90, 1115, 301),
    (155, 354, 262, 562),
    (424, 354, 531, 562),
    (716, 355, 824, 561),
    (997, 354, 1104, 562),
    (145, 624, 255, 832),
    (420, 625, 529, 832),
    (712, 625, 821, 830),
    (992, 625, 1100, 832),
    (143, 913, 265, 1126),
    (422, 913, 541, 1126),
    (712, 914, 833, 1126),
    (990, 914, 1110, 1126),
)


def padded_box(box: tuple[int, int, int, int], size: tuple[int, int]) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    return (
        max(0, x0 - SOURCE_PADDING),
        max(0, y0 - SOURCE_PADDING),
        min(size[0], x1 + SOURCE_PADDING),
        min(size[1], y1 + SOURCE_PADDING),
    )


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    canvas = Image.new(
        "RGB", (CELL_SIZE * COLS, CELL_SIZE * ROWS), (255, 0, 255)
    )
    placements = []

    for index, source_box in enumerate(SOURCE_BOXES):
        row, col = divmod(index, COLS)
        crop_box = padded_box(source_box, source.size)
        crop = source.crop(crop_box)
        paste_x = col * CELL_SIZE + (CELL_SIZE - crop.width) // 2
        paste_y = row * CELL_SIZE + TARGET_BASELINE_Y - crop.height
        cell_left = col * CELL_SIZE
        cell_top = row * CELL_SIZE
        margins = {
            "left": paste_x - cell_left,
            "top": paste_y - cell_top,
            "right": cell_left + CELL_SIZE - (paste_x + crop.width),
            "bottom": cell_top + CELL_SIZE - (paste_y + crop.height),
        }
        if min(margins.values()) < 12:
            raise RuntimeError(f"Unsafe normalized margin at {(row, col)}: {margins}")
        canvas.paste(crop, (paste_x, paste_y))
        placements.append(
            {
                "grid": [row, col],
                "source_box": list(source_box),
                "crop_box": list(crop_box),
                "paste_position": [paste_x, paste_y],
                "margins_px": margins,
            }
        )

    canvas.save(OUTPUT)
    META.write_text(
        json.dumps(
            {
                "source": str(SOURCE.relative_to(ROOT)),
                "output": str(OUTPUT.relative_to(ROOT)),
                "operation": "layout-only equal-cell repack; no pose redraw or scaling",
                "grid": [ROWS, COLS],
                "cell_size_px": CELL_SIZE,
                "target_baseline_y_in_cell": TARGET_BASELINE_Y,
                "placements": placements,
            },
            indent=2,
            ensure_ascii=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(OUTPUT.relative_to(ROOT)), "frames": len(placements)}, indent=2))


if __name__ == "__main__":
    main()
