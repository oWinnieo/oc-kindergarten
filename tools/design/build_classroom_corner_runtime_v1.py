#!/usr/bin/env python3
"""Build classroom runtime metadata plus depth-sort and collision QA previews."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
MAP_DIR = ROOT / "assets/design/maps/classroom-corner"
ART_DIR = MAP_DIR / "art/v1"
RUNTIME_DIR = MAP_DIR / "runtime/v1"
LAYOUT_PATH = MAP_DIR / "blockout/classroom-corner-layout.json"
FOUNDATION = ART_DIR / "classroom-corner-foundation-512x288.png"

RUNTIME_MANIFEST = RUNTIME_DIR / "classroom-corner-runtime-v1.json"
RUNTIME_PREVIEW = RUNTIME_DIR / "classroom-corner-runtime-preview-512x288.png"
DEPTH_QA = RUNTIME_DIR / "classroom-corner-depth-sort-qa-2048x576.png"
COLLISION_QA = RUNTIME_DIR / "classroom-corner-collision-qa-1024x576.png"

GENDERLESS_SOURCE = (
    ROOT
    / "assets/design/sprites/characters/ai-agent-child-genderless/idle/frames"
    / "idle-planted-antenna-v7-wide38-1.png"
)

PROP_DEFINITIONS = (
    {
        "id": "reading-bookshelf",
        "meta": MAP_DIR / "props/reading-bookshelf/v1/reading-bookshelf-meta.json",
        "asset": MAP_DIR / "props/reading-bookshelf/v1/reading-bookshelf-96x44.png",
        "stable_order": 10,
    },
    {
        "id": "reading-book-bin",
        "meta": MAP_DIR / "props/reading-book-bin/v1/reading-book-bin-meta.json",
        "asset": MAP_DIR / "props/reading-book-bin/v1/reading-book-bin-48x40.png",
        "stable_order": 20,
    },
    {
        "id": "block-table",
        "meta": MAP_DIR / "props/block-table/v2/meta.json",
        "asset": MAP_DIR / "props/block-table/v2/block-table-96x56-left-to-right.png",
        "stable_order": 30,
    },
    {
        "id": "toy-bin",
        "meta": MAP_DIR / "props/toy-bin/v2/meta.json",
        "asset": MAP_DIR / "props/toy-bin/v2/toy-bin-40x48-left-to-right.png",
        "stable_order": 40,
    },
)

ACTOR_VISUAL_SIZE = (48, 64)
ACTOR_ANCHOR_OFFSET = (24, 64)
ACTOR_FOOTPRINT_SIZE = (14, 6)


def load_props() -> list[dict]:
    props = []
    for definition in PROP_DEFINITIONS:
        meta = json.loads(definition["meta"].read_text(encoding="utf-8"))
        if meta["status"] != "approved_visual":
            raise RuntimeError(f"Active prop is not approved: {definition['id']}")
        props.append(
            {
                "id": definition["id"],
                "asset_path": definition["asset"],
                "source_meta_path": definition["meta"],
                "image": Image.open(definition["asset"]).convert("RGBA"),
                "position": tuple(meta["map_placement"]["top_left_px"]),
                "size": tuple(meta["runtime_size_px"]),
                "anchor": tuple(meta["map_placement"]["anchor_px"]),
                "sort_y": int(meta["map_placement"]["sort_y"]),
                "render_layer": meta["map_placement"]["render_layer"],
                "collision": meta["collision"],
                "perspective": meta.get("perspective"),
                "stable_order": definition["stable_order"],
            }
        )
    return props


def actor_renderable(
    actor_id: str,
    source: Path,
    top_left: tuple[int, int],
    stable_order: int,
) -> dict:
    image = Image.open(source).convert("RGBA")
    if image.size != ACTOR_VISUAL_SIZE:
        raise RuntimeError(f"Unexpected actor size for {source}: {image.size}")
    anchor = (
        top_left[0] + ACTOR_ANCHOR_OFFSET[0],
        top_left[1] + ACTOR_ANCHOR_OFFSET[1],
    )
    return {
        "id": actor_id,
        "kind": "actor",
        "image": image,
        "position": top_left,
        "anchor": anchor,
        "sort_y": anchor[1],
        "stable_order": stable_order,
    }


def compose_scene(props: list[dict], actors: list[dict]) -> Image.Image:
    scene = Image.open(FOUNDATION).convert("RGBA")
    renderables = [
        {
            "id": prop["id"],
            "kind": "prop",
            "image": prop["image"],
            "position": prop["position"],
            "sort_y": prop["sort_y"],
            "stable_order": prop["stable_order"],
        }
        for prop in props
    ]
    renderables.extend(actors)
    renderables.sort(key=lambda item: (item["sort_y"], item["stable_order"]))
    for renderable in renderables:
        scene.alpha_composite(renderable["image"], renderable["position"])
    return scene


def layout_actors(layout: dict) -> list[dict]:
    actors = []
    for index, spawn in enumerate(layout["actor_spawns"]):
        actors.append(
            actor_renderable(
                spawn["id"],
                ROOT / spawn["source"],
                tuple(spawn["frame_top_left_px"]),
                100 + index,
            )
        )
    return actors


def build_depth_qa(props: list[dict]) -> dict:
    behind = actor_renderable(
        "genderless-behind-block-table",
        GENDERLESS_SOURCE,
        (376, 32),
        100,
    )
    in_front = actor_renderable(
        "genderless-in-front-of-block-table",
        GENDERLESS_SOURCE,
        (376, 80),
        100,
    )
    left_panel = compose_scene(props, [behind]).convert("RGB")
    right_panel = compose_scene(props, [in_front]).convert("RGB")
    comparison = Image.new("RGB", (1024, 288), (0, 0, 0))
    comparison.paste(left_panel, (0, 0))
    comparison.paste(right_panel, (512, 0))
    comparison.resize((2048, 576), Image.Resampling.NEAREST).save(DEPTH_QA)
    return {
        "behind": {
            "frame_top_left_px": list(behind["position"]),
            "foot_anchor_px": list(behind["anchor"]),
            "sort_y": behind["sort_y"],
            "expected_relation": "behind block-table because 96 < 112",
        },
        "in_front": {
            "frame_top_left_px": list(in_front["position"]),
            "foot_anchor_px": list(in_front["anchor"]),
            "sort_y": in_front["sort_y"],
            "expected_relation": "in front of block-table because 144 > 112",
        },
    }


def actor_footprint(anchor: tuple[int, int]) -> tuple[int, int, int, int]:
    width, height = ACTOR_FOOTPRINT_SIZE
    return (
        anchor[0] - width // 2,
        anchor[1] - height,
        anchor[0] - width // 2 + width,
        anchor[1],
    )


def build_collision_qa(
    props: list[dict], actors: list[dict], runtime_scene: Image.Image
) -> None:
    debug = runtime_scene.copy()
    overlay = Image.new("RGBA", debug.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    for x in range(0, debug.width + 1, 32):
        draw.line((x, 0, x, debug.height), fill=(70, 130, 160, 62), width=1)
    for y in range(0, debug.height + 1, 32):
        draw.line((0, y, debug.width, y), fill=(70, 130, 160, 62), width=1)

    for prop in props:
        collision = prop["collision"]
        box = (
            collision["x"],
            collision["y"],
            collision["x"] + collision["w"] - 1,
            collision["y"] + collision["h"] - 1,
        )
        draw.rectangle(box, fill=(244, 66, 66, 108), outline=(156, 20, 20, 235), width=1)
        draw.line(
            (
                prop["position"][0],
                prop["sort_y"],
                prop["position"][0] + prop["size"][0] - 1,
                prop["sort_y"],
            ),
            fill=(0, 232, 255, 235),
            width=1,
        )
        anchor_x, anchor_y = prop["anchor"]
        draw.rectangle(
            (anchor_x - 1, anchor_y - 1, anchor_x + 1, anchor_y + 1),
            fill=(255, 232, 64, 255),
        )

    for actor in actors:
        draw.rectangle(
            actor_footprint(actor["anchor"]),
            fill=(48, 220, 120, 115),
            outline=(10, 120, 68, 240),
            width=1,
        )

    debug.alpha_composite(overlay)
    debug.convert("RGB").resize((1024, 576), Image.Resampling.NEAREST).save(
        COLLISION_QA
    )


def serialize_prop(prop: dict) -> dict:
    return {
        "id": prop["id"],
        "asset": str(prop["asset_path"].relative_to(ROOT)),
        "source_meta": str(prop["source_meta_path"].relative_to(ROOT)),
        "position_px": list(prop["position"]),
        "size_px": list(prop["size"]),
        "anchor_px": list(prop["anchor"]),
        "sort_y": prop["sort_y"],
        "stable_order": prop["stable_order"],
        "render_layer": prop["render_layer"],
        "collision": prop["collision"],
        "perspective": prop["perspective"],
    }


def main() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    layout = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
    props = load_props()
    actors = layout_actors(layout)

    runtime_scene = compose_scene(props, actors)
    runtime_scene.convert("RGB").save(RUNTIME_PREVIEW)
    depth_tests = build_depth_qa(props)
    build_collision_qa(props, actors, runtime_scene)

    manifest = {
        "scene_id": "classroom-corner-runtime-v1",
        "status": "approved_runtime_baseline",
        "map_mode": "tile_mode",
        "visual_model": "layered_tilemap",
        "runtime_object_model": [
            "separate_props",
            "y_sorted_props",
            "interactive_scene_objects",
        ],
        "collision_model": ["precise_shapes", "tile_collision"],
        "engine_target": "project-native",
        "canvas_px": [512, 288],
        "tile_size_px": 32,
        "grid_tiles": [16, 9],
        "foundation": str(FOUNDATION.relative_to(ROOT)),
        "rendering": {
            "sort_axis": "y",
            "sort_key": "bottom_center_anchor_y",
            "order": "ascending; larger sort_y renders later and appears in front",
            "stable_tie_breaker": "stable_order",
            "transparent_assets_required": True,
        },
        "actor_contract": {
            "visual_size_px": list(ACTOR_VISUAL_SIZE),
            "anchor": "feet_bottom_center",
            "anchor_offset_px": list(ACTOR_ANCHOR_OFFSET),
            "collision_footprint_px": list(ACTOR_FOOTPRINT_SIZE),
        },
        "objects": [serialize_prop(prop) for prop in props],
        "actor_spawns": layout["actor_spawns"],
        "depth_sort_tests": depth_tests,
        "qa": {
            "runtime_preview": str(RUNTIME_PREVIEW.relative_to(ROOT)),
            "depth_sort_preview": str(DEPTH_QA.relative_to(ROOT)),
            "collision_preview": str(COLLISION_QA.relative_to(ROOT)),
            "collision_colors": {
                "furniture_collision": "red",
                "prop_sort_y": "cyan",
                "prop_anchor": "yellow",
                "actor_footprint": "green",
            },
        },
    }
    RUNTIME_MANIFEST.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )

    for expected, size in (
        (RUNTIME_PREVIEW, (512, 288)),
        (DEPTH_QA, (2048, 576)),
        (COLLISION_QA, (1024, 576)),
    ):
        if Image.open(expected).size != size:
            raise RuntimeError(f"Unexpected QA size for {expected}")
    print(json.dumps({"manifest": str(RUNTIME_MANIFEST.relative_to(ROOT)), "props": len(props)}, indent=2))


if __name__ == "__main__":
    main()
