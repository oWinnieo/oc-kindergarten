#!/usr/bin/env python3
"""Build the first production block activity table and map QA preview."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
PROP_DIR = ROOT / "assets/design/maps/classroom-corner/props/block-table/v1"
READING_DIR = ROOT / "assets/design/maps/classroom-corner/props"
ART_DIR = ROOT / "assets/design/maps/classroom-corner/art/v1"
LAYOUT_PATH = (
    ROOT / "assets/design/maps/classroom-corner/blockout/classroom-corner-layout.json"
)

RAW = PROP_DIR / "block-table-green-raw.png"
CLEAN = PROP_DIR / "block-table-green-clean.png"
PROP = PROP_DIR / "block-table-96x56.png"
PROP_PREVIEW = PROP_DIR / "block-table-preview-8x.png"
BOOKSHELF = READING_DIR / "reading-bookshelf/v1/reading-bookshelf-96x44.png"
BOOK_BIN = READING_DIR / "reading-book-bin/v1/reading-book-bin-48x40.png"
QA_PREVIEW = ART_DIR / "classroom-corner-block-table-qa-preview-512x288.png"
META = PROP_DIR / "block-table-meta.json"

RUNTIME_SIZE = (96, 56)
MAP_TOP_LEFT = (352, 56)
PALETTE_COLORS = 48


def resize_rgba_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).astype(np.float32)
    alpha = pixels[:, :, 3:4] / 255.0
    premultiplied = np.concatenate((pixels[:, :, :3] * alpha, pixels[:, :, 3:4]), axis=2)

    channels = []
    for channel_index in range(4):
        channel = Image.fromarray(
            np.clip(premultiplied[:, :, channel_index], 0, 255).astype(np.uint8),
            mode="L",
        )
        channels.append(
            np.asarray(channel.resize(size, Image.Resampling.LANCZOS)).astype(np.float32)
        )

    resized_alpha = channels[3]
    resized_rgb = np.stack(channels[:3], axis=2)
    nonzero = resized_alpha > 0
    resized_rgb[nonzero] = np.clip(
        resized_rgb[nonzero] * 255.0 / resized_alpha[nonzero, None], 0, 255
    )
    resized_rgb[~nonzero] = 0

    result = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    result[:, :, :3] = resized_rgb.astype(np.uint8)
    result[:, :, 3] = np.clip(resized_alpha, 0, 255).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def fit_subject(image: Image.Image, canvas_size: tuple[int, int]) -> Image.Image:
    max_width = canvas_size[0] - 2
    max_height = canvas_size[1] - 2
    scale = min(max_width / image.width, max_height / image.height)
    fitted_size = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    fitted = resize_rgba_premultiplied(image, fitted_size)
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    offset = ((canvas_size[0] - fitted.width) // 2, canvas_size[1] - fitted.height - 1)
    canvas.alpha_composite(fitted, offset)
    return canvas


def quantize_visible_rgb(image: Image.Image, colors: int) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    visible = pixels[:, :, 3] > 0
    visible_rgb = pixels[:, :, :3][visible]
    palette_source = Image.fromarray(visible_rgb.reshape(1, -1, 3), mode="RGB")
    palette = palette_source.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    quantized = image.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
    result = np.asarray(quantized.convert("RGB")).copy()
    pixels[:, :, :3] = result
    pixels[~visible, :3] = 0
    return Image.fromarray(pixels, mode="RGBA")


def build_prop() -> tuple[Image.Image, dict]:
    clean = Image.open(CLEAN).convert("RGBA")
    alpha = np.asarray(clean.getchannel("A"))
    keep = alpha >= 48
    ys, xs = np.where(keep)
    if not len(xs):
        raise RuntimeError("Clean block table has no visible component")

    source_box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    subject = fit_subject(clean.crop(source_box), RUNTIME_SIZE)

    pixels = np.asarray(subject).copy()
    rgb = pixels[:, :, :3]
    alpha = pixels[:, :, 3]
    green_edge = (
        (rgb[:, :, 1] > 100)
        & (rgb[:, :, 1] > rgb[:, :, 0] * 1.35)
        & (rgb[:, :, 1] > rgb[:, :, 2] * 1.35)
    )
    alpha[(alpha < 72) | green_edge] = 0
    alpha[alpha >= 220] = 255
    pixels[:, :, 3] = alpha
    pixels[alpha == 0, :3] = 0
    subject = quantize_visible_rgb(Image.fromarray(pixels, mode="RGBA"), PALETTE_COLORS)
    subject.save(PROP)

    preview = Image.new(
        "RGBA", (RUNTIME_SIZE[0] + 16, RUNTIME_SIZE[1] + 16), (224, 238, 240, 255)
    )
    preview.alpha_composite(subject, (8, 8))
    preview.resize(
        (preview.width * 8, preview.height * 8), Image.Resampling.NEAREST
    ).save(PROP_PREVIEW)

    final_pixels = np.asarray(subject)
    visible = final_pixels[:, :, 3] > 0
    visible_green = (
        visible
        & (final_pixels[:, :, 1] > 100)
        & (final_pixels[:, :, 1] > final_pixels[:, :, 0] * 1.35)
        & (final_pixels[:, :, 1] > final_pixels[:, :, 2] * 1.35)
    )
    return subject, {
        "source_alpha_box": list(source_box),
        "runtime_alpha_box": list(subject.getbbox() or (0, 0, 0, 0)),
        "visible_pixels": int(visible.sum()),
        "opaque_pixels": int((final_pixels[:, :, 3] == 255).sum()),
        "semi_transparent_pixels": int(
            ((final_pixels[:, :, 3] > 0) & (final_pixels[:, :, 3] < 255)).sum()
        ),
        "visible_green_pixels": int(visible_green.sum()),
        "visible_color_count": int(
            len(np.unique(final_pixels[:, :, :3][visible], axis=0))
        ),
    }


def compose_qa(prop: Image.Image, layout: dict) -> None:
    preview = Image.open(ART_DIR / "classroom-corner-foundation-512x288.png").convert(
        "RGBA"
    )
    preview.alpha_composite(Image.open(BOOKSHELF).convert("RGBA"), (24, 40))
    preview.alpha_composite(Image.open(BOOK_BIN).convert("RGBA"), (128, 44))
    preview.alpha_composite(prop, MAP_TOP_LEFT)
    for actor in layout["actor_spawns"]:
        sprite = Image.open(ROOT / actor["source"]).convert("RGBA")
        preview.alpha_composite(sprite, tuple(actor["frame_top_left_px"]))
    preview.convert("RGB").save(QA_PREVIEW)


def main() -> None:
    layout = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
    prop, qc = build_prop()
    compose_qa(prop, layout)

    meta = {
        "prop_id": "block-table-v1",
        "status": "superseded_perspective",
        "superseded_by": "block-table-v2-left-to-right",
        "classification": ["wide_or_long_object", "collision_bearing_object"],
        "asset_strategy": "one_by_one",
        "view": "mostly front-facing 3/4 interior prop",
        "raw": str(RAW.relative_to(ROOT)),
        "prompt": str(
            (PROP_DIR / "block-table-green-raw.prompt.txt").relative_to(ROOT)
        ),
        "chroma_clean": str(CLEAN.relative_to(ROOT)),
        "transparent_prop": str(PROP.relative_to(ROOT)),
        "preview": str(PROP_PREVIEW.relative_to(ROOT)),
        "map_qa_preview": str(QA_PREVIEW.relative_to(ROOT)),
        "runtime_size_px": list(RUNTIME_SIZE),
        "map_placement": {
            "top_left_px": list(MAP_TOP_LEFT),
            "anchor": "center_bottom",
            "anchor_px": [
                MAP_TOP_LEFT[0] + RUNTIME_SIZE[0] // 2,
                MAP_TOP_LEFT[1] + RUNTIME_SIZE[1],
            ],
            "sort_y": MAP_TOP_LEFT[1] + RUNTIME_SIZE[1],
            "render_layer": "floor_props",
        },
        "collision": {
            "type": "rect",
            "x": MAP_TOP_LEFT[0],
            "y": MAP_TOP_LEFT[1] + RUNTIME_SIZE[1] - 10,
            "w": RUNTIME_SIZE[0],
            "h": 10,
        },
        "depth_sort": {
            "axis": "y",
            "rule": "compare actor foot anchor with prop sort_y",
            "actor_behind_when": "actor_sort_y < 112",
            "actor_in_front_when": "actor_sort_y >= 112",
        },
        "processing": {
            "runtime_palette_colors": PALETTE_COLORS,
            "resize": "premultiplied-alpha contain, centered and bottom-aligned",
            "alpha_remove_below": 72,
            "alpha_snap_opaque_at": 220,
            "green_edge_cleanup": True,
        },
        "qc": qc,
    }
    META.write_text(json.dumps(meta, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    if prop.size != RUNTIME_SIZE:
        raise RuntimeError(f"Expected {RUNTIME_SIZE}, got {prop.size}")
    if qc["visible_green_pixels"]:
        raise RuntimeError("Visible green fringe remains in the runtime prop")
    if Image.open(QA_PREVIEW).size != (512, 288):
        raise RuntimeError("QA preview size mismatch")

    print(json.dumps({"prop": str(PROP.relative_to(ROOT)), "qa": qc}, indent=2))


if __name__ == "__main__":
    main()
