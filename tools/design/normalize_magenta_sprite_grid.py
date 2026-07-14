#!/usr/bin/env python3
"""Repack detected sprites into a strict equal-cell magenta grid without scaling."""

from __future__ import annotations

import argparse
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image


def remove_magenta(image: Image.Image, threshold: int = 100) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            distance = math.sqrt((red - 255) ** 2 + green**2 + (blue - 255) ** 2)
            if alpha and distance < threshold:
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def connected_components(image: Image.Image, min_area: int) -> list[dict]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited = bytearray(image.width * image.height)
    components = []

    for y in range(image.height):
        for x in range(image.width):
            index = y * image.width + x
            if visited[index] or pixels[x, y] == 0:
                continue
            visited[index] = 1
            queue = deque([(x, y)])
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                min_x = min(min_x, current_x)
                min_y = min(min_y, current_y)
                max_x = max(max_x, current_x)
                max_y = max(max_y, current_y)
                for delta_x, delta_y in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    next_x = current_x + delta_x
                    next_y = current_y + delta_y
                    if not (0 <= next_x < image.width and 0 <= next_y < image.height):
                        continue
                    next_index = next_y * image.width + next_x
                    if visited[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            if area >= min_area:
                components.append(
                    {
                        "area": area,
                        "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                        "center": ((min_x + max_x + 1) / 2, (min_y + max_y + 1) / 2),
                    }
                )
    return components


def pad_box(box: tuple[int, int, int, int], padding: int, size: tuple[int, int]) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    return (
        max(0, x0 - padding),
        max(0, y0 - padding),
        min(size[0], x1 + padding),
        min(size[1], y1 + padding),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--meta", type=Path, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--cols", type=int, required=True)
    parser.add_argument("--min-area", type=int, default=500)
    parser.add_argument("--padding", type=int, default=10)
    parser.add_argument("--cell-padding", type=int, default=32)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    cleaned = remove_magenta(source)
    expected_count = args.rows * args.cols
    components = connected_components(cleaned, args.min_area)
    if len(components) != expected_count:
        raise RuntimeError(
            f"Expected {expected_count} components, detected {len(components)}"
        )

    components.sort(key=lambda item: item["center"][1])
    ordered = []
    for row in range(args.rows):
        row_components = components[row * args.cols : (row + 1) * args.cols]
        row_components.sort(key=lambda item: item["center"][0])
        ordered.extend(row_components)

    padded_boxes = [
        pad_box(tuple(component["bbox"]), args.padding, source.size)
        for component in ordered
    ]
    max_width = max(box[2] - box[0] for box in padded_boxes)
    max_height = max(box[3] - box[1] for box in padded_boxes)
    cell_size = max(max_width, max_height) + args.cell_padding * 2
    canvas = Image.new(
        "RGBA",
        (cell_size * args.cols, cell_size * args.rows),
        (255, 0, 255, 255),
    )
    placements = []

    for index, box in enumerate(padded_boxes):
        row, col = divmod(index, args.cols)
        crop = cleaned.crop(box)
        paste_x = col * cell_size + (cell_size - crop.width) // 2
        paste_y = row * cell_size + cell_size - args.cell_padding - crop.height
        canvas.alpha_composite(crop, (paste_x, paste_y))
        placements.append(
            {
                "grid": [row, col],
                "component_area": ordered[index]["area"],
                "component_bbox": list(ordered[index]["bbox"]),
                "crop_box": list(box),
                "paste_position": [paste_x, paste_y],
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.meta.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(args.output)
    args.meta.write_text(
        json.dumps(
            {
                "source": str(args.input),
                "output": str(args.output),
                "operation": "component detection and equal-cell repack; no scaling",
                "grid": [args.rows, args.cols],
                "cell_size_px": cell_size,
                "placements": placements,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(args.output), "cell_size": cell_size}, indent=2))


if __name__ == "__main__":
    main()
