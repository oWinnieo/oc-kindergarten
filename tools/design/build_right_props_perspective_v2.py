#!/usr/bin/env python3
"""Build left-to-right perspective revisions for the classroom's right-side props."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
PROPS_DIR = ROOT / "assets/design/maps/classroom-corner/props"
ART_DIR = ROOT / "assets/design/maps/classroom-corner/art/v1"
LAYOUT_PATH = (
    ROOT / "assets/design/maps/classroom-corner/blockout/classroom-corner-layout.json"
)

BOOKSHELF = PROPS_DIR / "reading-bookshelf/v1/reading-bookshelf-96x44.png"
BOOK_BIN = PROPS_DIR / "reading-book-bin/v1/reading-book-bin-48x40.png"
QA_PREVIEW = (
    ART_DIR / "classroom-corner-right-props-perspective-v2-qa-preview-512x288.png"
)
PAIR_PREVIEW = ART_DIR / "classroom-corner-right-props-perspective-v2-preview-6x.png"


@dataclass(frozen=True)
class PropSpec:
    prop_id: str
    directory: Path
    raw_name: str
    clean_name: str
    prompt_name: str
    output_name: str
    preview_name: str
    runtime_size: tuple[int, int]
    map_top_left: tuple[int, int]
    collision_height: int
    palette_colors: int
    classification: str


SPECS = (
    PropSpec(
        prop_id="block-table-v2-left-to-right",
        directory=PROPS_DIR / "block-table/v2",
        raw_name="block-table-left-to-right-green-raw.png",
        clean_name="block-table-left-to-right-green-clean.png",
        prompt_name="block-table-left-to-right-green-raw.prompt.txt",
        output_name="block-table-96x56-left-to-right.png",
        preview_name="block-table-left-to-right-preview-8x.png",
        runtime_size=(96, 56),
        map_top_left=(352, 56),
        collision_height=10,
        palette_colors=48,
        classification="wide_or_long_object",
    ),
    PropSpec(
        prop_id="toy-bin-v2-left-to-right",
        directory=PROPS_DIR / "toy-bin/v2",
        raw_name="toy-bin-left-to-right-green-raw.png",
        clean_name="toy-bin-left-to-right-green-clean.png",
        prompt_name="toy-bin-left-to-right-green-raw.prompt.txt",
        output_name="toy-bin-40x48-left-to-right.png",
        preview_name="toy-bin-left-to-right-preview-8x.png",
        runtime_size=(40, 48),
        map_top_left=(456, 64),
        collision_height=8,
        palette_colors=40,
        classification="compact_prop",
    ),
)


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


def build_prop(spec: PropSpec) -> tuple[Image.Image, dict]:
    clean = Image.open(spec.directory / spec.clean_name).convert("RGBA")
    alpha = np.asarray(clean.getchannel("A"))
    ys, xs = np.where(alpha >= 48)
    if not len(xs):
        raise RuntimeError(f"Clean source has no visible component: {spec.clean_name}")

    source_box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    subject = fit_subject(clean.crop(source_box), spec.runtime_size)

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
    subject = quantize_visible_rgb(
        Image.fromarray(pixels, mode="RGBA"), spec.palette_colors
    )
    subject.save(spec.directory / spec.output_name)

    preview = Image.new(
        "RGBA",
        (spec.runtime_size[0] + 16, spec.runtime_size[1] + 16),
        (224, 238, 240, 255),
    )
    preview.alpha_composite(subject, (8, 8))
    preview.resize(
        (preview.width * 8, preview.height * 8), Image.Resampling.NEAREST
    ).save(spec.directory / spec.preview_name)

    final_pixels = np.asarray(subject)
    visible = final_pixels[:, :, 3] > 0
    visible_green = (
        visible
        & (final_pixels[:, :, 1] > 100)
        & (final_pixels[:, :, 1] > final_pixels[:, :, 0] * 1.35)
        & (final_pixels[:, :, 1] > final_pixels[:, :, 2] * 1.35)
    )
    qc = {
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

    sort_y = spec.map_top_left[1] + spec.runtime_size[1]
    meta = {
        "prop_id": spec.prop_id,
        "status": "approved_visual",
        "supersedes": spec.prop_id.split("-v2", 1)[0] + "-v1",
        "classification": [spec.classification, "collision_bearing_object"],
        "asset_strategy": "one_by_one",
        "view": "subtle 3/4, camera left looking right",
        "perspective": {
            "camera_position": "slightly_left_of_object",
            "look_direction": "left_to_right",
            "visible_side": "left",
            "far_side": "right",
            "yaw_degrees_target": "8-12",
        },
        "raw": str((spec.directory / spec.raw_name).relative_to(ROOT)),
        "prompt": str((spec.directory / spec.prompt_name).relative_to(ROOT)),
        "chroma_clean": str((spec.directory / spec.clean_name).relative_to(ROOT)),
        "transparent_prop": str(
            (spec.directory / spec.output_name).relative_to(ROOT)
        ),
        "preview": str((spec.directory / spec.preview_name).relative_to(ROOT)),
        "map_qa_preview": str(QA_PREVIEW.relative_to(ROOT)),
        "runtime_size_px": list(spec.runtime_size),
        "map_placement": {
            "top_left_px": list(spec.map_top_left),
            "anchor": "center_bottom",
            "anchor_px": [
                spec.map_top_left[0] + spec.runtime_size[0] // 2,
                sort_y,
            ],
            "sort_y": sort_y,
            "render_layer": "floor_props",
        },
        "collision": {
            "type": "rect",
            "x": spec.map_top_left[0],
            "y": sort_y - spec.collision_height,
            "w": spec.runtime_size[0],
            "h": spec.collision_height,
        },
        "processing": {
            "runtime_palette_colors": spec.palette_colors,
            "resize": "premultiplied-alpha contain, centered and bottom-aligned",
            "alpha_remove_below": 72,
            "alpha_snap_opaque_at": 220,
            "green_edge_cleanup": True,
        },
        "qc": qc,
    }
    (spec.directory / "meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )

    if subject.size != spec.runtime_size:
        raise RuntimeError(f"Unexpected runtime size for {spec.prop_id}")
    if qc["visible_green_pixels"]:
        raise RuntimeError(f"Visible green fringe remains in {spec.prop_id}")
    return subject, qc


def compose_pair_preview(props: dict[str, Image.Image]) -> None:
    preview = Image.new("RGBA", (160, 72), (224, 238, 240, 255))
    preview.alpha_composite(props["block-table-v2-left-to-right"], (8, 8))
    preview.alpha_composite(props["toy-bin-v2-left-to-right"], (112, 16))
    preview.resize((960, 432), Image.Resampling.NEAREST).save(PAIR_PREVIEW)


def compose_map_qa(props: dict[str, Image.Image], layout: dict) -> None:
    preview = Image.open(ART_DIR / "classroom-corner-foundation-512x288.png").convert(
        "RGBA"
    )
    preview.alpha_composite(Image.open(BOOKSHELF).convert("RGBA"), (24, 40))
    preview.alpha_composite(Image.open(BOOK_BIN).convert("RGBA"), (128, 44))
    for spec in SPECS:
        preview.alpha_composite(props[spec.prop_id], spec.map_top_left)
    for actor in layout["actor_spawns"]:
        sprite = Image.open(ROOT / actor["source"]).convert("RGBA")
        preview.alpha_composite(sprite, tuple(actor["frame_top_left_px"]))
    preview.convert("RGB").save(QA_PREVIEW)


def main() -> None:
    layout = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
    props = {}
    qc = {}
    for spec in SPECS:
        props[spec.prop_id], qc[spec.prop_id] = build_prop(spec)
    compose_pair_preview(props)
    compose_map_qa(props, layout)

    if Image.open(QA_PREVIEW).size != (512, 288):
        raise RuntimeError("Map QA preview size mismatch")
    if Image.open(PAIR_PREVIEW).size != (960, 432):
        raise RuntimeError("Pair preview size mismatch")
    print(json.dumps(qc, indent=2))


if __name__ == "__main__":
    main()
