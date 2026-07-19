#!/usr/bin/env python3
"""Slice and normalize the generated two-state classroom entrance door asset."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "assets/design/maps/classroom-corner/props/entrance-door/v1"
SOURCE = ASSET_DIR / "entrance-door-two-state-clean.png"
CANVAS_SIZE = (64, 72)
CONTENT_MAX_SIZE = (60, 68)


def normalize_state(source: Image.Image, name: str) -> dict[str, object]:
    alpha_bbox = source.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise RuntimeError(f"Door state {name} has no opaque pixels")

    left, top, right, bottom = alpha_bbox
    padding = 16
    crop_box = (
        max(0, left - padding),
        max(0, top - padding),
        min(source.width, right + padding),
        min(source.height, bottom + padding),
    )
    cropped = source.crop(crop_box)
    scale = min(
        CONTENT_MAX_SIZE[0] / cropped.width,
        CONTENT_MAX_SIZE[1] / cropped.height,
    )
    resized_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(resized_size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    paste_at = (
        (CANVAS_SIZE[0] - resized.width) // 2,
        CANVAS_SIZE[1] - resized.height,
    )
    output.alpha_composite(resized, paste_at)

    output_path = ASSET_DIR / f"entrance-door-{name}-64x72.png"
    output.save(output_path)
    return {
        "state": name,
        "source_alpha_bbox": list(alpha_bbox),
        "crop_box": list(crop_box),
        "output": str(output_path.relative_to(ROOT)),
        "canvas_px": list(CANVAS_SIZE),
        "paste_at_px": list(paste_at),
        "opaque_bbox": list(output.getchannel("A").getbbox() or (0, 0, 0, 0)),
    }


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    split_x = image.width // 2
    closed = image.crop((0, 0, split_x, image.height))
    opened = image.crop((split_x, 0, image.width, image.height))
    states = [
        normalize_state(closed, "closed"),
        normalize_state(opened, "open"),
    ]

    metadata = {
        "prop_id": "classroom-entrance-door-v1",
        "status": "visual_approval_candidate",
        "asset_strategy": "one_by_one_two_state_source",
        "source": str(SOURCE.relative_to(ROOT)),
        "prompt": str(
            (ASSET_DIR / "entrance-door-two-state-magenta-raw.prompt.txt").relative_to(ROOT)
        ),
        "raw": str(
            (ASSET_DIR / "entrance-door-two-state-magenta-raw.png").relative_to(ROOT)
        ),
        "split_x_px": split_x,
        "states": states,
        "runtime": {
            "position_px": [296, 0],
            "spawn_anchor_px": [320, 72],
            "spawn_tile": [10, 2],
            "entry_landing_anchor_px": [328, 136],
            "entry_landing_tile": [10, 4],
            "render_layer": "wall_props",
            "collision": False,
            "join_sequence": [
                "opening",
                "open",
                "player_spawns_inside_door",
                "player_walks_to_entry_landing",
                "closing",
                "closed",
            ],
        },
    }
    (ASSET_DIR / "entrance-door-meta.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
