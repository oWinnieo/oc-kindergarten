#!/usr/bin/env python3
"""Build the first production reading bookshelf prop and map QA preview."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
PROP_DIR = ROOT / "assets/design/maps/classroom-corner/props/reading-bookshelf/v1"
ART_DIR = ROOT / "assets/design/maps/classroom-corner/art/v1"
LAYOUT_PATH = (
    ROOT / "assets/design/maps/classroom-corner/blockout/classroom-corner-layout.json"
)

RAW = PROP_DIR / "reading-bookshelf-raw.png"
CLEAN = PROP_DIR / "reading-bookshelf-clean.png"
PROP = PROP_DIR / "reading-bookshelf-96x44.png"
PROP_PREVIEW = PROP_DIR / "reading-bookshelf-preview-8x.png"
QA_PREVIEW = ART_DIR / "classroom-corner-bookshelf-qa-preview-512x288.png"
META = PROP_DIR / "reading-bookshelf-meta.json"

RUNTIME_SIZE = (96, 44)
MAP_TOP_LEFT = (24, 40)
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
        raise RuntimeError("Clean bookshelf has no visible component")
    source_box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    subject = clean.crop(source_box)
    subject = resize_rgba_premultiplied(subject, RUNTIME_SIZE)

    pixels = np.asarray(subject).copy()
    rgb = pixels[:, :, :3]
    alpha = pixels[:, :, 3]
    magenta_edge = (
        (rgb[:, :, 0] > 105)
        & (rgb[:, :, 2] > 90)
        & (rgb[:, :, 1] < 115)
        & (rgb[:, :, 0] > rgb[:, :, 1] * 1.25)
        & (rgb[:, :, 2] > rgb[:, :, 1] * 1.15)
    )
    alpha[(alpha < 72) | magenta_edge] = 0
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
    visible_magenta = (
        visible
        & (final_pixels[:, :, 0] > 105)
        & (final_pixels[:, :, 2] > 90)
        & (final_pixels[:, :, 1] < 115)
    )
    return subject, {
        "source_alpha_box": list(source_box),
        "visible_pixels": int(visible.sum()),
        "opaque_pixels": int((final_pixels[:, :, 3] == 255).sum()),
        "semi_transparent_pixels": int(
            ((final_pixels[:, :, 3] > 0) & (final_pixels[:, :, 3] < 255)).sum()
        ),
        "visible_magenta_pixels": int(visible_magenta.sum()),
        "visible_color_count": int(
            len(np.unique(final_pixels[:, :, :3][visible], axis=0))
        ),
    }


def compose_qa(prop: Image.Image, layout: dict) -> None:
    preview = Image.open(ART_DIR / "classroom-corner-foundation-512x288.png").convert(
        "RGBA"
    )
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
        "prop_id": "reading-bookshelf-v1",
        "status": "approved_visual",
        "classification": ["wide_or_long_object", "collision_bearing_object"],
        "asset_strategy": "one_by_one",
        "view": "mostly front-facing 3/4 interior prop",
        "raw": str(RAW.relative_to(ROOT)),
        "prompt": str((PROP_DIR / "reading-bookshelf-raw.prompt.txt").relative_to(ROOT)),
        "chroma_clean": str(CLEAN.relative_to(ROOT)),
        "transparent_prop": str(PROP.relative_to(ROOT)),
        "preview": str(PROP_PREVIEW.relative_to(ROOT)),
        "map_qa_preview": str(QA_PREVIEW.relative_to(ROOT)),
        "runtime_size_px": list(RUNTIME_SIZE),
        "map_placement": {
            "top_left_px": list(MAP_TOP_LEFT),
            "anchor": "center_bottom",
            "anchor_px": [MAP_TOP_LEFT[0] + RUNTIME_SIZE[0] // 2, MAP_TOP_LEFT[1] + RUNTIME_SIZE[1]],
            "sort_y": MAP_TOP_LEFT[1] + RUNTIME_SIZE[1],
            "render_layer": "wall_props",
        },
        "collision": {
            "type": "rect",
            "x": MAP_TOP_LEFT[0],
            "y": MAP_TOP_LEFT[1] + RUNTIME_SIZE[1] - 8,
            "w": RUNTIME_SIZE[0],
            "h": 8,
        },
        "processing": {
            "runtime_palette_colors": PALETTE_COLORS,
            "alpha_remove_below": 72,
            "alpha_snap_opaque_at": 220,
            "magenta_edge_cleanup": True,
        },
        "qc": qc,
    }
    META.write_text(json.dumps(meta, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    if prop.size != RUNTIME_SIZE:
        raise RuntimeError(f"Expected {RUNTIME_SIZE}, got {prop.size}")
    if qc["visible_magenta_pixels"]:
        raise RuntimeError("Visible magenta fringe remains in the runtime prop")
    if Image.open(QA_PREVIEW).size != (512, 288):
        raise RuntimeError("QA preview size mismatch")

    print(json.dumps({"prop": str(PROP.relative_to(ROOT)), "qa": qc}, indent=2))


if __name__ == "__main__":
    main()
