#!/usr/bin/env python3
"""Normalize the image-generated writing table and compose its map QA preview."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
MAP_DIR = ROOT / "assets/design/maps/classroom-corner"
PROP_DIR = MAP_DIR / "props/writing-table/v1"
SOURCE = PROP_DIR / "writing-table-magenta-clean.png"
RUNTIME_PROP = PROP_DIR / "writing-table-96x56.png"
PREVIEW = PROP_DIR / "writing-table-preview-8x.png"
META = PROP_DIR / "writing-table-meta.json"
MAP_QA = MAP_DIR / "art/v1/classroom-corner-writing-table-qa-preview-512x288.png"
BASE_PREVIEW = MAP_DIR / "runtime/v1/classroom-corner-runtime-preview-512x288.png"

RUNTIME_SIZE = (96, 56)
CONTENT_MAX = (94, 48)
VISIBLE_BOTTOM_EXCLUSIVE = 55
PLACEMENT = (208, 56)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.convert("RGBA").getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Writing table source is fully transparent")
    return bbox


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32)
    alpha = rgba[:, :, 3:4] / 255.0
    premultiplied = np.concatenate((rgba[:, :, :3] * alpha, rgba[:, :, 3:4]), axis=2)
    channels = [
        Image.fromarray(np.clip(premultiplied[:, :, index], 0, 255).astype(np.uint8))
        .resize(size, Image.Resampling.LANCZOS)
        for index in range(4)
    ]
    data = np.stack([np.asarray(channel, dtype=np.float32) for channel in channels], axis=2)
    out_alpha = data[:, :, 3:4]
    out_rgb = np.zeros_like(data[:, :, :3])
    np.divide(
        data[:, :, :3] * 255.0,
        out_alpha,
        out=out_rgb,
        where=out_alpha > 0,
    )
    result = np.concatenate((np.clip(out_rgb, 0, 255), out_alpha), axis=2).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def quantize_rgba(image: Image.Image, colors: int) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    rgb = rgba.convert("RGB").quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    result = Image.merge("RGBA", (*rgb.split(), alpha))
    data = np.asarray(result).copy()
    data[data[:, :, 3] < 24, 3] = 0
    data[data[:, :, 3] > 224, 3] = 255
    data[data[:, :, 3] == 0, :3] = 0
    return Image.fromarray(data, mode="RGBA")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    source_bbox = alpha_bbox(source)
    subject = source.crop(source_bbox)
    scale = min(CONTENT_MAX[0] / subject.width, CONTENT_MAX[1] / subject.height)
    resized_size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = quantize_rgba(resize_premultiplied(subject, resized_size), 48)

    runtime = Image.new("RGBA", RUNTIME_SIZE, (0, 0, 0, 0))
    position = (
        (RUNTIME_SIZE[0] - subject.width) // 2,
        VISIBLE_BOTTOM_EXCLUSIVE - subject.height,
    )
    runtime.alpha_composite(subject, position)
    runtime.save(RUNTIME_PROP)

    preview = Image.new("RGBA", RUNTIME_SIZE, (226, 242, 245, 255))
    preview.alpha_composite(runtime)
    preview.resize(
        (RUNTIME_SIZE[0] * 8, RUNTIME_SIZE[1] * 8), Image.Resampling.NEAREST
    ).convert("RGB").save(PREVIEW)

    map_qa = Image.open(BASE_PREVIEW).convert("RGBA")
    map_qa.alpha_composite(runtime, PLACEMENT)
    map_qa.convert("RGB").save(MAP_QA)

    runtime_bbox = alpha_bbox(runtime)
    data = np.asarray(runtime)
    visible = data[:, :, 3] > 0
    magenta = (
        visible
        & (data[:, :, 0] > 180)
        & (data[:, :, 2] > 180)
        & (data[:, :, 1] < 100)
    )
    qc = {
        "source_alpha_box": list(source_bbox),
        "runtime_alpha_box": list(runtime_bbox),
        "visible_pixels": int(visible.sum()),
        "opaque_pixels": int((data[:, :, 3] == 255).sum()),
        "semi_transparent_pixels": int(
            ((data[:, :, 3] > 0) & (data[:, :, 3] < 255)).sum()
        ),
        "visible_magenta_pixels": int(magenta.sum()),
        "transparent_corners": all(
            int(data[y, x, 3]) == 0
            for x, y in ((0, 0), (95, 0), (0, 55), (95, 55))
        ),
    }
    if runtime_bbox[0] <= 0 or runtime_bbox[2] >= RUNTIME_SIZE[0]:
        raise RuntimeError(f"Writing table touches a horizontal edge: {runtime_bbox}")
    if runtime_bbox[3] != VISIBLE_BOTTOM_EXCLUSIVE:
        raise RuntimeError(f"Writing table baseline mismatch: {runtime_bbox}")
    if qc["visible_magenta_pixels"] or not qc["transparent_corners"]:
        raise RuntimeError(f"Writing table transparency QC failed: {qc}")

    metadata = {
        "prop_id": "writing-table-v1",
        "status": "approved_visual",
        "classification": ["wide_or_long_object", "collision_bearing_object"],
        "asset_strategy": "one_by_one",
        "view": "mostly front-facing top-down RPG classroom prop",
        "perspective": {
            "camera_position": "centered_slightly_above_object",
            "look_direction": "front_to_back",
            "visible_face": "shallow_top_and_front_apron",
        },
        "raw": str((PROP_DIR / "writing-table-magenta-raw.png").relative_to(ROOT)),
        "prompt": str(
            (PROP_DIR / "writing-table-magenta-raw.prompt.txt").relative_to(ROOT)
        ),
        "chroma_clean": str(SOURCE.relative_to(ROOT)),
        "transparent_prop": str(RUNTIME_PROP.relative_to(ROOT)),
        "preview": str(PREVIEW.relative_to(ROOT)),
        "map_qa_preview": str(MAP_QA.relative_to(ROOT)),
        "runtime_size_px": list(RUNTIME_SIZE),
        "map_placement": {
            "top_left_px": list(PLACEMENT),
            "anchor": "center_bottom",
            "anchor_px": [256, 112],
            "sort_y": 112,
            "render_layer": "floor_props",
        },
        "collision": {"type": "rect", "x": 208, "y": 102, "w": 96, "h": 10},
        "writing_visual_offset_y_px": -40,
        "departure_tile_source": "pointToTile(current_visual_anchor)",
        "writing_targets": {
            "boy": {"tile": [7, 5], "anchor_px": [224, 128], "departure_tile": [7, 4]},
            "girl": {"tile": [8, 5], "anchor_px": [256, 128], "departure_tile": [8, 4]},
            "genderless": {"tile": [9, 5], "anchor_px": [288, 128], "departure_tile": [9, 4]},
        },
        "processing": {
            "visual_asset_source": "built_in_image_gen",
            "runtime_palette_colors": 48,
            "resize": "premultiplied-alpha contain, centered and bottom-aligned",
            "alpha_remove_below": 24,
            "alpha_snap_opaque_at": 224,
            "chroma_key": "#FF00FF",
        },
        "qc": {**qc, "technical_qc_passed": True},
    }
    META.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "prop": str(RUNTIME_PROP.relative_to(ROOT)),
                "metadata": str(META.relative_to(ROOT)),
                "map_qa": str(MAP_QA.relative_to(ROOT)),
                "runtime_bbox": list(runtime_bbox),
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
