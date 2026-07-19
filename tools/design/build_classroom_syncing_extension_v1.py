#!/usr/bin/env python3
"""Build the candidate syncing mail-station map extension and scene QA."""

from __future__ import annotations

import hashlib
import json
from collections import deque
from copy import deepcopy
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
MAP_DIR = ROOT / "assets/design/maps/classroom-corner"
SPRITE_DIR = ROOT / "assets/design/sprites/characters/v2"
FOUNDATION = MAP_DIR / "art/v1/classroom-corner-foundation-512x288.png"
LAYOUT = MAP_DIR / "blockout/classroom-corner-layout.json"
BASE_RUNTIME = MAP_DIR / "runtime/v1/classroom-corner-runtime-v1.json"
WRITING_META = MAP_DIR / "props/writing-table/v1/writing-table-meta.json"
WRITING_PROP = MAP_DIR / "props/writing-table/v1/writing-table-96x56.png"
APPROVAL_LOCK = SPRITE_DIR / "approved/v2-wheelbase-animation-baseline-lock-v3.json"

PROP_DIR = MAP_DIR / "props/sync-mail-station/v1"
PROP_SOURCE = PROP_DIR / "processor/clean.png"
PROP_RUNTIME = PROP_DIR / "sync-mail-station-96x48.png"
PROP_PREVIEW = PROP_DIR / "sync-mail-station-preview-8x.png"
PROP_META = PROP_DIR / "sync-mail-station-meta.json"

OUTPUT_DIR = MAP_DIR / "extensions/syncing/v1"
MANIFEST = OUTPUT_DIR / "classroom-corner-syncing-extension-v1.json"
PREVIEW = OUTPUT_DIR / "classroom-corner-syncing-preview-512x288.png"
COLLISION_QA = OUTPUT_DIR / "classroom-corner-syncing-collision-qa-1024x576.png"
ACTION_QA = OUTPUT_DIR / "classroom-corner-syncing-actions-qa.gif"

FRAME_SIZE = (48, 64)
ANCHOR_OFFSET = (24, 64)
FRAME_DURATION_MS = 200
PROP_SIZE = (96, 48)
PROP_PLACEMENT = (304, 200)
PROP_SORT_Y = 248
PROP_VISIBLE_BOTTOM_EXCLUSIVE = 47
PROP_COLLISION = {"type": "rect", "x": 312, "y": 240, "w": 80, "h": 8}
WRITING_BLOCKED_TILES = ((7, 3), (8, 3), (9, 3))
SYNCING_BLOCKED_TILES = ((10, 7), (11, 7), (12, 7))

CHARACTERS = {
    "boy": {
        "directory": "ai-agent-child-boy",
        "prefix": "boy-child",
        "target_tile": (10, 6),
        "target_anchor": (320, 208),
        "footprint": (30, 6),
        "accepted_visible_height": 55,
    },
    "girl": {
        "directory": "ai-agent-child-girl",
        "prefix": "girl-child",
        "target_tile": (11, 6),
        "target_anchor": (352, 208),
        "footprint": (26, 6),
        "accepted_visible_height": 51,
    },
    "genderless": {
        "directory": "ai-agent-child-genderless",
        "prefix": "genderless-child",
        "target_tile": (12, 6),
        "target_anchor": (384, 208),
        "footprint": (30, 6),
        "accepted_visible_height": 58,
    },
}
START_TILES = {"boy": (3, 7), "girl": (8, 7), "genderless": (13, 7)}


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_approved_lock() -> dict[str, Any]:
    lock = json.loads(APPROVAL_LOCK.read_text(encoding="utf-8"))
    mismatches = []
    for item in lock["files"]:
        path = ROOT / item["path"]
        if not path.exists() or sha256(path) != item["sha256"]:
            mismatches.append(item["path"])
    if mismatches:
        raise RuntimeError(f"Approved V2 baseline changed: {mismatches[:10]}")
    return {
        "lock": relative(APPROVAL_LOCK),
        "checked_files": len(lock["files"]),
        "hash_mismatches": mismatches,
        "passed": True,
    }


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
    np.divide(data[:, :, :3] * 255.0, out_alpha, out=out_rgb, where=out_alpha > 0)
    result = np.concatenate((np.clip(out_rgb, 0, 255), out_alpha), axis=2).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def build_prop() -> dict[str, Any]:
    source = Image.open(PROP_SOURCE).convert("RGBA")
    source_bbox = source.getchannel("A").getbbox()
    if source_bbox is None:
        raise RuntimeError("Sync mail station source is transparent")
    subject = source.crop(source_bbox)
    scale = min(90 / subject.width, 44 / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = resize_premultiplied(subject, size)
    data = np.asarray(subject).copy()
    visible = data[:, :, 3] > 0
    magenta = (
        visible
        & (data[:, :, 0] > 180)
        & (data[:, :, 2] > 180)
        & (data[:, :, 1] < 100)
    )
    data[magenta] = 0
    data[data[:, :, 3] < 24] = 0
    subject = Image.fromarray(data, mode="RGBA")
    bbox = subject.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Sync mail station cleanup removed the prop")
    subject = subject.crop(bbox)

    runtime = Image.new("RGBA", PROP_SIZE, (0, 0, 0, 0))
    position = (
        (PROP_SIZE[0] - subject.width) // 2,
        PROP_VISIBLE_BOTTOM_EXCLUSIVE - subject.height,
    )
    runtime.alpha_composite(subject, position)
    runtime.save(PROP_RUNTIME)
    preview = Image.new("RGBA", PROP_SIZE, (226, 242, 245, 255))
    preview.alpha_composite(runtime)
    preview.resize((768, 384), Image.Resampling.NEAREST).convert("RGB").save(PROP_PREVIEW)

    runtime_bbox = runtime.getchannel("A").getbbox()
    if runtime_bbox is None or runtime_bbox[3] != PROP_VISIBLE_BOTTOM_EXCLUSIVE:
        raise RuntimeError(f"Sync mail station baseline mismatch: {runtime_bbox}")
    runtime_data = np.asarray(runtime)
    runtime_visible = runtime_data[:, :, 3] > 0
    runtime_magenta = (
        runtime_visible
        & (runtime_data[:, :, 0] > 180)
        & (runtime_data[:, :, 2] > 180)
        & (runtime_data[:, :, 1] < 100)
    )
    if int(runtime_magenta.sum()) != 0:
        raise RuntimeError("Sync mail station contains visible magenta")

    metadata = {
        "prop_id": "sync-mail-station-v1",
        "status": "approved_visual",
        "approval_lock": relative(APPROVAL_LOCK),
        "visual_approved_on": "2026-07-17",
        "classification": ["wide_or_long_object", "collision_bearing_object", "interactive_scene_object"],
        "asset_strategy": "one_by_one",
        "semantic": "classroom_message_exchange_station",
        "raw": relative(PROP_DIR / "sync-mail-station-magenta-raw.png"),
        "prompt": relative(PROP_DIR / "sync-mail-station-magenta-raw.prompt.txt"),
        "processor_metadata": relative(PROP_DIR / "processor/pipeline-meta.json"),
        "transparent_prop": relative(PROP_RUNTIME),
        "preview": relative(PROP_PREVIEW),
        "runtime_size_px": list(PROP_SIZE),
        "map_placement": {
            "top_left_px": list(PROP_PLACEMENT),
            "anchor": "center_bottom",
            "anchor_px": [352, PROP_SORT_Y],
            "sort_y": PROP_SORT_Y,
            "render_layer": "floor_props",
        },
        "collision": PROP_COLLISION,
        "trigger_zone": {"type": "rect", "x": 304, "y": 184, "w": 96, "h": 56},
        "syncing_targets": {
            role: {
                "tile": list(spec["target_tile"]),
                "anchor_px": list(spec["target_anchor"]),
            }
            for role, spec in CHARACTERS.items()
        },
        "qc": {
            "source_alpha_box": list(source_bbox),
            "runtime_alpha_box": list(runtime_bbox),
            "visible_magenta_pixels": 0,
            "transparent_corners": all(
                int(runtime_data[y, x, 3]) == 0
                for x, y in ((0, 0), (95, 0), (0, 47), (95, 47))
            ),
            "technical_qc_passed": True,
        },
    }
    PROP_META.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return metadata


def syncing_frame_path(role: str, phase: int) -> Path:
    spec = CHARACTERS[role]
    return (
        SPRITE_DIR
        / spec["directory"]
        / "actions/v1/syncing/frames"
        / f"{spec['prefix']}-syncing-wheelbase-v2-{phase}-48x64.png"
    )


def syncing_meta_path(role: str) -> Path:
    spec = CHARACTERS[role]
    return (
        SPRITE_DIR
        / spec["directory"]
        / "actions/v1/syncing"
        / f"{spec['prefix']}-syncing-4frame-wheelbase-v2-meta.json"
    )


def validate_syncing_actions() -> dict[str, Any]:
    results = {}
    for role, spec in CHARACTERS.items():
        metadata_path = syncing_meta_path(role)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("status") != "approved":
            raise RuntimeError(f"Unexpected syncing status: {relative(metadata_path)}")
        if not metadata.get("qc", {}).get("technical_qc_passed"):
            raise RuntimeError(f"Syncing QC failed: {relative(metadata_path)}")
        frames = []
        for phase in range(1, 5):
            path = syncing_frame_path(role, phase)
            image = Image.open(path).convert("RGBA")
            bbox = image.getchannel("A").getbbox()
            if bbox is None:
                raise RuntimeError(f"Transparent syncing frame: {relative(path)}")
            passed = (
                image.size == FRAME_SIZE
                and bbox[3] == 62
                and bbox[3] - bbox[1] == spec["accepted_visible_height"]
            )
            if not passed:
                raise RuntimeError(f"Syncing frame contract failed: {relative(path)}")
            frames.append({"frame": phase, "path": relative(path), "bbox": list(bbox), "passed": True})
        results[role] = {
            "metadata": relative(metadata_path),
            "status": metadata["status"],
            "frames": frames,
            "passed": True,
        }
    return {"characters": results, "passed": True}


def extension_walkability() -> list[list[int]]:
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    rows = deepcopy(layout["walkability"]["rows"])
    for x, y in (*WRITING_BLOCKED_TILES, *SYNCING_BLOCKED_TILES):
        rows[y][x] = 0
    return rows


def find_path(rows: list[list[int]], start: tuple[int, int], goal: tuple[int, int]) -> list[tuple[int, int]]:
    if rows[start[1]][start[0]] != 1 or rows[goal[1]][goal[0]] != 1:
        return []
    previous: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    frontier = deque([start])
    while frontier:
        current = frontier.popleft()
        if current == goal:
            break
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
            neighbor = (current[0] + dx, current[1] + dy)
            x, y = neighbor
            if not (0 <= y < len(rows) and 0 <= x < len(rows[0])):
                continue
            if rows[y][x] != 1 or neighbor in previous:
                continue
            if dx and dy and (
                rows[current[1]][current[0] + dx] != 1
                or rows[current[1] + dy][current[0]] != 1
            ):
                continue
            previous[neighbor] = current
            frontier.append(neighbor)
    if goal not in previous:
        return []
    path = []
    cursor: tuple[int, int] | None = goal
    while cursor is not None:
        path.append(cursor)
        cursor = previous[cursor]
    return list(reversed(path))


def actor_footprint(anchor: tuple[int, int], size: tuple[int, int]) -> tuple[int, int, int, int]:
    return (anchor[0] - size[0] // 2, anchor[1] - size[1], anchor[0] - size[0] // 2 + size[0], anchor[1])


def rects_overlap(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> bool:
    return not (first[2] <= second[0] or second[2] <= first[0] or first[3] <= second[1] or second[3] <= first[1])


def validate_routes(rows: list[list[int]]) -> dict[str, Any]:
    collision = (
        PROP_COLLISION["x"],
        PROP_COLLISION["y"],
        PROP_COLLISION["x"] + PROP_COLLISION["w"],
        PROP_COLLISION["y"] + PROP_COLLISION["h"],
    )
    results = {}
    footprints = []
    for role, spec in CHARACTERS.items():
        path = find_path(rows, START_TILES[role], spec["target_tile"])
        footprint = actor_footprint(spec["target_anchor"], spec["footprint"])
        if not path or rects_overlap(footprint, collision):
            raise RuntimeError(f"Syncing target validation failed for {role}")
        if any(rects_overlap(footprint, other) for other in footprints):
            raise RuntimeError(f"Syncing target actors overlap for {role}")
        footprints.append(footprint)
        results[role] = {
            "start_tile": list(START_TILES[role]),
            "target_tile": list(spec["target_tile"]),
            "target_anchor_px": list(spec["target_anchor"]),
            "path_tiles": [list(tile) for tile in path],
            "tile_steps": len(path) - 1,
            "target_footprint_px": list(footprint),
            "station_collision_overlap": False,
            "passed": True,
        }
    return {"characters": results, "passed": True}


def load_props(base_runtime: dict, prop_meta: dict) -> list[dict[str, Any]]:
    props = []
    for index, item in enumerate(base_runtime["objects"]):
        props.append({
            "id": item["id"],
            "image": Image.open(ROOT / item["asset"]).convert("RGBA"),
            "position": tuple(item["position_px"]),
            "sort_y": int(item["sort_y"]),
            "stable_order": 10 + index * 10,
        })
    writing_meta = json.loads(WRITING_META.read_text(encoding="utf-8"))
    props.append({
        "id": "writing-table",
        "image": Image.open(WRITING_PROP).convert("RGBA"),
        "position": tuple(writing_meta["map_placement"]["top_left_px"]),
        "sort_y": int(writing_meta["map_placement"]["sort_y"]),
        "stable_order": 50,
    })
    props.append({
        "id": "sync-mail-station",
        "image": Image.open(PROP_RUNTIME).convert("RGBA"),
        "position": tuple(prop_meta["map_placement"]["top_left_px"]),
        "sort_y": int(prop_meta["map_placement"]["sort_y"]),
        "stable_order": 60,
    })
    return props


def compose_scene(base_runtime: dict, prop_meta: dict, phase: int) -> Image.Image:
    scene = Image.open(FOUNDATION).convert("RGBA")
    renderables = load_props(base_runtime, prop_meta)
    for index, (role, spec) in enumerate(CHARACTERS.items()):
        anchor = spec["target_anchor"]
        renderables.append({
            "id": f"{role}-syncing",
            "image": Image.open(syncing_frame_path(role, phase)).convert("RGBA"),
            "position": (anchor[0] - ANCHOR_OFFSET[0], anchor[1] - ANCHOR_OFFSET[1]),
            "sort_y": anchor[1],
            "stable_order": 100 + index,
        })
    for item in sorted(renderables, key=lambda value: (value["sort_y"], value["stable_order"])):
        scene.alpha_composite(item["image"], item["position"])
    return scene


def build_qa(base_runtime: dict, prop_meta: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    frames = [compose_scene(base_runtime, prop_meta, phase) for phase in range(1, 5)]
    frames[0].convert("RGB").save(PREVIEW)
    rgb = [frame.convert("RGB") for frame in frames]
    rgb[0].save(ACTION_QA, save_all=True, append_images=rgb[1:], duration=FRAME_DURATION_MS, loop=0, disposal=2, optimize=False)

    collision_preview = frames[0].copy()
    overlay = Image.new("RGBA", collision_preview.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x in range(0, 513, 32):
        draw.line((x, 0, x, 288), fill=(70, 130, 160, 62))
    for y in range(0, 289, 32):
        draw.line((0, y, 512, y), fill=(70, 130, 160, 62))
    draw.rectangle((312, 240, 391, 247), fill=(244, 66, 66, 108), outline=(156, 20, 20, 235))
    for spec in CHARACTERS.values():
        draw.rectangle(actor_footprint(spec["target_anchor"], spec["footprint"]), fill=(48, 220, 120, 115), outline=(10, 120, 68, 240))
    collision_preview.alpha_composite(overlay)
    collision_preview.convert("RGB").resize((1024, 576), Image.Resampling.NEAREST).save(COLLISION_QA)


def main() -> None:
    baseline = validate_approved_lock()
    prop_meta = build_prop()
    actions = validate_syncing_actions()
    rows = extension_walkability()
    routes = validate_routes(rows)
    base_runtime = json.loads(BASE_RUNTIME.read_text(encoding="utf-8"))
    build_qa(base_runtime, prop_meta)

    manifest = {
        "extension_id": "classroom-corner-syncing-extension-v1",
        "status": "approved",
        "approval_lock": relative(APPROVAL_LOCK),
        "approved_on": "2026-07-17",
        "base_runtime_manifest": relative(BASE_RUNTIME),
        "depends_on_extensions": ["assets/design/maps/classroom-corner/extensions/writing/v1/classroom-corner-writing-extension-v1.json"],
        "map_mode": "tile_mode",
        "visual_model": "layered_tilemap",
        "runtime_object_model": ["separate_props", "y_sorted_props", "interactive_scene_objects", "scene_hooks"],
        "collision_model": ["precise_shapes", "tile_collision", "trigger_zones"],
        "canvas_px": [512, 288],
        "tile_size_px": 32,
        "object": {
            "id": "sync-mail-station",
            "asset": relative(PROP_RUNTIME),
            "metadata": relative(PROP_META),
            "position_px": list(PROP_PLACEMENT),
            "sort_y": PROP_SORT_Y,
            "collision": PROP_COLLISION,
            "trigger_zone": prop_meta["trigger_zone"],
        },
        "walkability": {
            "base": relative(LAYOUT),
            "overrides": [
                {"tile": list(tile), "walkable": False}
                for tile in (*WRITING_BLOCKED_TILES, *SYNCING_BLOCKED_TILES)
            ],
            "rows": rows,
        },
        "state": {
            "id": "syncing",
            "location": "同步邮件站",
            "semantic": "confirm_shared_message_card",
            "orientation": "down_front",
            "frames": 4,
            "frame_duration_ms": FRAME_DURATION_MS,
            "target_tile_by_character": {role: list(spec["target_tile"]) for role, spec in CHARACTERS.items()},
            "target_anchor_px_by_character": {role: list(spec["target_anchor"]) for role, spec in CHARACTERS.items()},
        },
        "validation": {
            "approved_baseline": baseline,
            "syncing_actions": actions,
            "routes_and_collisions": routes,
            "passed": True,
        },
        "qa": {
            "preview": relative(PREVIEW),
            "collision_preview": relative(COLLISION_QA),
            "action_preview": relative(ACTION_QA),
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "manifest": relative(MANIFEST),
        "object": "sync-mail-station",
        "targets": {role: list(spec["target_tile"]) for role, spec in CHARACTERS.items()},
        "approved_baseline_hash_mismatches": 0,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
