#!/usr/bin/env python3
"""Normalize generated classroom art and compose the character QA preview."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ART_DIR = ROOT / "assets/design/maps/classroom-corner/art/v1"
LAYOUT_PATH = (
    ROOT / "assets/design/maps/classroom-corner/blockout/classroom-corner-layout.json"
)

FOUNDATION_RAW = ART_DIR / "classroom-corner-foundation-selected-raw.png"
DRESSED_RAW = ART_DIR / "classroom-corner-dressed-reference-raw.png"
FOUNDATION = ART_DIR / "classroom-corner-foundation-512x288.png"
DRESSED = ART_DIR / "classroom-corner-dressed-reference-512x288.png"
CHARACTER_PREVIEW = ART_DIR / "classroom-corner-character-preview-512x288.png"
META = ART_DIR / "classroom-corner-art-v1.json"

TARGET_SIZE = (512, 288)
PALETTE_COLORS = 96


def normalize_generated_map(source: Path, output: Path) -> Image.Image:
    image = Image.open(source).convert("RGB")
    source_width, source_height = image.size
    target_ratio = TARGET_SIZE[0] / TARGET_SIZE[1]
    crop_height = round(source_width / target_ratio)
    if crop_height > source_height:
        crop_width = round(source_height * target_ratio)
        left = (source_width - crop_width) // 2
        crop = image.crop((left, 0, left + crop_width, source_height))
    else:
        top = (source_height - crop_height) // 2
        crop = image.crop((0, top, source_width, top + crop_height))

    resized = crop.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
    normalized = resized.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    normalized.save(output)
    return normalized


def compose_characters(base: Image.Image, layout: dict) -> Image.Image:
    preview = base.convert("RGBA")
    for actor in layout["actor_spawns"]:
        sprite = Image.open(ROOT / actor["source"]).convert("RGBA")
        if sprite.size != (48, 64):
            raise ValueError(f"Unexpected sprite size for {actor['source']}: {sprite.size}")
        preview.alpha_composite(sprite, tuple(actor["frame_top_left_px"]))
    preview.convert("RGB").save(CHARACTER_PREVIEW)
    return preview


def main() -> None:
    layout = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
    foundation = normalize_generated_map(FOUNDATION_RAW, FOUNDATION)
    dressed = normalize_generated_map(DRESSED_RAW, DRESSED)
    compose_characters(dressed, layout)

    meta = {
        "map_id": "classroom-corner-art-v1",
        "status": "dressed_reference_for_visual_approval",
        "map_mode": "tile_mode",
        "visual_model": "layered_tilemap",
        "runtime_object_model": ["separate_props", "interactive_scene_objects"],
        "collision_model": ["tile_collision", "trigger_zones"],
        "engine_target": "project-native",
        "canvas_px": list(TARGET_SIZE),
        "tile_size_px": 32,
        "grid_tiles": [16, 9],
        "normalization": {
            "crop": "center crop to 16:9",
            "resize": "Lanczos",
            "palette_colors": PALETTE_COLORS,
            "dither": False,
        },
        "foundation": str(FOUNDATION.relative_to(ROOT)),
        "foundation_raw": str(FOUNDATION_RAW.relative_to(ROOT)),
        "foundation_prompt": str(
            (ART_DIR / "classroom-corner-foundation-selected-raw.prompt.txt").relative_to(ROOT)
        ),
        "dressed_reference": str(DRESSED.relative_to(ROOT)),
        "dressed_reference_raw": str(DRESSED_RAW.relative_to(ROOT)),
        "dressed_reference_prompt": str(
            (ART_DIR / "classroom-corner-dressed-reference-raw.prompt.txt").relative_to(ROOT)
        ),
        "character_preview": str(CHARACTER_PREVIEW.relative_to(ROOT)),
        "actor_sources": [actor["source"] for actor in layout["actor_spawns"]],
        "prop_candidates": [
            {"id": "reading-bookshelf", "asset_strategy": "one_by_one"},
            {"id": "reading-book-bin", "asset_strategy": "compact_prop"},
            {"id": "block-table", "asset_strategy": "one_by_one"},
            {"id": "toy-bin", "asset_strategy": "compact_prop"},
        ],
        "runtime_warning": "The dressed reference contains baked planning props and is not the runtime base. Generate separate transparent prop assets after visual approval.",
    }
    META.write_text(json.dumps(meta, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    for path in (FOUNDATION, DRESSED, CHARACTER_PREVIEW):
        if Image.open(path).size != TARGET_SIZE:
            raise RuntimeError(f"Unexpected output size: {path}")

    print(
        json.dumps(
            {
                "foundation": str(FOUNDATION.relative_to(ROOT)),
                "dressed_reference": str(DRESSED.relative_to(ROOT)),
                "character_preview": str(CHARACTER_PREVIEW.relative_to(ROOT)),
                "canvas_px": list(TARGET_SIZE),
                "actors": len(layout["actor_spawns"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
