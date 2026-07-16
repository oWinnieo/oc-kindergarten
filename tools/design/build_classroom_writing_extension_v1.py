#!/usr/bin/env python3
"""Build the candidate writing-state extension without mutating runtime v1."""

from __future__ import annotations

import hashlib
import json
from collections import deque
from copy import deepcopy
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
MAP_DIR = ROOT / "assets/design/maps/classroom-corner"
SPRITE_DIR = ROOT / "assets/design/sprites/characters/v2"
BASE_RUNTIME = MAP_DIR / "runtime/v1/classroom-corner-runtime-v1.json"
LAYOUT = MAP_DIR / "blockout/classroom-corner-layout.json"
FOUNDATION = MAP_DIR / "art/v1/classroom-corner-foundation-512x288.png"
WRITING_PROP = MAP_DIR / "props/writing-table/v1/writing-table-96x56.png"
WRITING_PROP_META = MAP_DIR / "props/writing-table/v1/writing-table-meta.json"
APPROVAL_LOCK = (
    SPRITE_DIR / "approved/v2-wheelbase-animation-baseline-lock-v1.json"
)
OUTPUT_DIR = MAP_DIR / "extensions/writing/v1"
MANIFEST = OUTPUT_DIR / "classroom-corner-writing-extension-v1.json"
PREVIEW = OUTPUT_DIR / "classroom-corner-writing-preview-512x288.png"
COLLISION_QA = OUTPUT_DIR / "classroom-corner-writing-collision-qa-1024x576.png"
ACTION_QA = OUTPUT_DIR / "classroom-corner-writing-actions-qa.gif"

CHARACTERS = {
    "boy": {
        "directory": "ai-agent-child-boy",
        "prefix": "boy-child",
        "target_tile": (7, 5),
        "target_anchor": (224, 168),
        "footprint": (30, 6),
        "accepted_visible_height": 55,
    },
    "girl": {
        "directory": "ai-agent-child-girl",
        "prefix": "girl-child",
        "target_tile": (8, 5),
        "target_anchor": (256, 168),
        "footprint": (26, 6),
        "accepted_visible_height": 51,
    },
    "genderless": {
        "directory": "ai-agent-child-genderless",
        "prefix": "genderless-child",
        "target_tile": (9, 5),
        "target_anchor": (288, 168),
        "footprint": (30, 6),
        "accepted_visible_height": 58,
    },
}
START_TILES = {"boy": (3, 7), "girl": (8, 7), "genderless": (13, 7)}
BLOCKED_TILE_OVERRIDES = ((7, 3), (8, 3), (9, 3))
FRAME_SIZE = (48, 64)
ANCHOR_OFFSET = (24, 64)
VISIBLE_BOTTOM_Y_EXCLUSIVE = 62
FRAME_DURATION_MS = 200


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


def writing_frame_path(role: str, phase: int) -> Path:
    character = CHARACTERS[role]
    return (
        SPRITE_DIR
        / character["directory"]
        / "actions/v1/writing/frames"
        / f"{character['prefix']}-writing-wheelbase-v2-{phase}-48x64.png"
    )


def writing_meta_path(role: str) -> Path:
    character = CHARACTERS[role]
    return (
        SPRITE_DIR
        / character["directory"]
        / "actions/v1/writing"
        / f"{character['prefix']}-writing-4frame-wheelbase-v2-meta.json"
    )


def validate_writing_actions() -> dict[str, Any]:
    results = {}
    for role, character in CHARACTERS.items():
        metadata_path = writing_meta_path(role)
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("status") != "visual_approval_candidate":
            raise RuntimeError(f"Unexpected writing status: {relative(metadata_path)}")
        if not metadata.get("qc", {}).get("technical_qc_passed"):
            raise RuntimeError(f"Writing technical QC failed: {relative(metadata_path)}")
        if not metadata.get("qc", {}).get("rear_occlusion", {}).get("passed"):
            raise RuntimeError(f"Writing rear occlusion failed: {relative(metadata_path)}")

        frame_results = []
        for phase in range(1, 5):
            path = writing_frame_path(role, phase)
            image = Image.open(path).convert("RGBA")
            bbox = image.getchannel("A").getbbox()
            if bbox is None:
                raise RuntimeError(f"Transparent writing frame: {relative(path)}")
            visible_height = bbox[3] - bbox[1]
            passed = (
                image.size == FRAME_SIZE
                and bbox[3] == VISIBLE_BOTTOM_Y_EXCLUSIVE
                and visible_height == character["accepted_visible_height"]
            )
            if not passed:
                raise RuntimeError(f"Writing frame contract failed: {relative(path)}")
            frame_results.append(
                {
                    "frame": phase,
                    "path": relative(path),
                    "bbox": list(bbox),
                    "visible_height_px": visible_height,
                    "passed": True,
                }
            )
        results[role] = {
            "metadata": relative(metadata_path),
            "status": metadata["status"],
            "rear_occlusion": metadata["qc"]["rear_occlusion"],
            "frames": frame_results,
            "passed": True,
        }
    return {"characters": results, "passed": True}


def extension_walkability() -> list[list[int]]:
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    rows = deepcopy(layout["walkability"]["rows"])
    for x, y in BLOCKED_TILE_OVERRIDES:
        rows[y][x] = 0
    return rows


def find_path(
    rows: list[list[int]], start: tuple[int, int], goal: tuple[int, int]
) -> list[tuple[int, int]]:
    if rows[start[1]][start[0]] != 1 or rows[goal[1]][goal[0]] != 1:
        return []
    previous: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    frontier = deque([start])
    while frontier:
        current = frontier.popleft()
        if current == goal:
            break
        for dx, dy in (
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (-1, 1),
            (1, -1),
            (-1, -1),
        ):
            neighbor = (current[0] + dx, current[1] + dy)
            x, y = neighbor
            if not (0 <= y < len(rows) and 0 <= x < len(rows[0])):
                continue
            if rows[y][x] != 1 or neighbor in previous:
                continue
            if dx and dy:
                if rows[current[1]][current[0] + dx] != 1:
                    continue
                if rows[current[1] + dy][current[0]] != 1:
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


def actor_footprint(
    anchor: tuple[int, int], size: tuple[int, int]
) -> tuple[int, int, int, int]:
    return (
        anchor[0] - size[0] // 2,
        anchor[1] - size[1],
        anchor[0] - size[0] // 2 + size[0],
        anchor[1],
    )


def rects_overlap(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> bool:
    return not (
        first[2] <= second[0]
        or second[2] <= first[0]
        or first[3] <= second[1]
        or second[3] <= first[1]
    )


def validate_routes_and_collisions(rows: list[list[int]], prop_meta: dict) -> dict[str, Any]:
    collision = prop_meta["collision"]
    prop_rect = (
        collision["x"],
        collision["y"],
        collision["x"] + collision["w"],
        collision["y"] + collision["h"],
    )
    results = {}
    for role, character in CHARACTERS.items():
        path = find_path(rows, START_TILES[role], character["target_tile"])
        footprint = actor_footprint(character["target_anchor"], character["footprint"])
        overlap = rects_overlap(footprint, prop_rect)
        if not path or overlap:
            raise RuntimeError(f"Writing target validation failed for {role}")
        results[role] = {
            "start_tile": list(START_TILES[role]),
            "target_tile": list(character["target_tile"]),
            "target_anchor_px": list(character["target_anchor"]),
            "path_tiles": [list(tile) for tile in path],
            "tile_steps": len(path) - 1,
            "target_footprint_px": list(footprint),
            "writing_table_collision_overlap": overlap,
            "passed": True,
        }
    return {"characters": results, "passed": True}


def load_base_props(base_runtime: dict) -> list[dict[str, Any]]:
    props = []
    for index, item in enumerate(base_runtime["objects"]):
        props.append(
            {
                "id": item["id"],
                "image": Image.open(ROOT / item["asset"]).convert("RGBA"),
                "position": tuple(item["position_px"]),
                "sort_y": int(item["sort_y"]),
                "stable_order": 10 + index * 10,
            }
        )
    return props


def compose_scene(base_runtime: dict, prop_meta: dict, phase: int) -> Image.Image:
    scene = Image.open(FOUNDATION).convert("RGBA")
    renderables = load_base_props(base_runtime)
    renderables.append(
        {
            "id": "writing-table",
            "image": Image.open(WRITING_PROP).convert("RGBA"),
            "position": tuple(prop_meta["map_placement"]["top_left_px"]),
            "sort_y": int(prop_meta["map_placement"]["sort_y"]),
            "stable_order": 50,
        }
    )
    for index, (role, character) in enumerate(CHARACTERS.items()):
        anchor = character["target_anchor"]
        renderables.append(
            {
                "id": f"{role}-writing",
                "image": Image.open(writing_frame_path(role, phase)).convert("RGBA"),
                "position": (
                    anchor[0] - ANCHOR_OFFSET[0],
                    anchor[1] - ANCHOR_OFFSET[1],
                ),
                "sort_y": anchor[1],
                "stable_order": 100 + index,
            }
        )
    for item in sorted(
        renderables, key=lambda value: (value["sort_y"], value["stable_order"])
    ):
        scene.alpha_composite(item["image"], item["position"])
    return scene


def build_qa(base_runtime: dict, prop_meta: dict) -> None:
    frames = [compose_scene(base_runtime, prop_meta, phase) for phase in range(1, 5)]
    frames[0].convert("RGB").save(PREVIEW)
    rgb_frames = [frame.convert("RGB") for frame in frames]
    rgb_frames[0].save(
        ACTION_QA,
        format="GIF",
        save_all=True,
        append_images=rgb_frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        optimize=False,
    )

    collision_preview = frames[0].copy()
    overlay = Image.new("RGBA", collision_preview.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x in range(0, collision_preview.width + 1, 32):
        draw.line((x, 0, x, collision_preview.height), fill=(70, 130, 160, 62))
    for y in range(0, collision_preview.height + 1, 32):
        draw.line((0, y, collision_preview.width, y), fill=(70, 130, 160, 62))
    collision = prop_meta["collision"]
    draw.rectangle(
        (
            collision["x"],
            collision["y"],
            collision["x"] + collision["w"] - 1,
            collision["y"] + collision["h"] - 1,
        ),
        fill=(244, 66, 66, 108),
        outline=(156, 20, 20, 235),
    )
    for character in CHARACTERS.values():
        draw.rectangle(
            actor_footprint(character["target_anchor"], character["footprint"]),
            fill=(48, 220, 120, 115),
            outline=(10, 120, 68, 240),
        )
    collision_preview.alpha_composite(overlay)
    collision_preview.convert("RGB").resize(
        (1024, 576), Image.Resampling.NEAREST
    ).save(COLLISION_QA)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    base_runtime = json.loads(BASE_RUNTIME.read_text(encoding="utf-8"))
    if base_runtime.get("status") != "approved_runtime_baseline":
        raise RuntimeError("Writing extension requires approved runtime v1")
    prop_meta = json.loads(WRITING_PROP_META.read_text(encoding="utf-8"))
    if prop_meta.get("status") != "visual_approval_candidate":
        raise RuntimeError("Writing table must remain a visual candidate")
    if not prop_meta.get("qc", {}).get("technical_qc_passed"):
        raise RuntimeError("Writing table technical QC failed")

    rows = extension_walkability()
    baseline_validation = validate_approved_lock()
    action_validation = validate_writing_actions()
    route_validation = validate_routes_and_collisions(rows, prop_meta)
    build_qa(base_runtime, prop_meta)

    manifest = {
        "extension_id": "classroom-corner-writing-extension-v1",
        "status": "visual_approval_candidate",
        "base_runtime_manifest": relative(BASE_RUNTIME),
        "map_mode": "tile_mode",
        "visual_model": "layered_tilemap",
        "runtime_object_model": ["separate_props", "y_sorted_props"],
        "collision_model": ["precise_shapes", "tile_collision"],
        "canvas_px": [512, 288],
        "tile_size_px": 32,
        "candidate_object": {
            "id": "writing-table",
            "asset": relative(WRITING_PROP),
            "metadata": relative(WRITING_PROP_META),
            "position_px": prop_meta["map_placement"]["top_left_px"],
            "sort_y": prop_meta["map_placement"]["sort_y"],
            "collision": prop_meta["collision"],
        },
        "walkability": {
            "base": relative(LAYOUT),
            "overrides": [
                {"tile": list(tile), "walkable": False}
                for tile in BLOCKED_TILE_OVERRIDES
            ],
            "rows": rows,
        },
        "state": {
            "id": "writing",
            "location": "写画桌",
            "semantic": "draw_on_activity_table",
            "orientation": "up_back",
            "frames": 4,
            "frame_duration_ms": FRAME_DURATION_MS,
            "target_tile_by_character": {
                role: list(character["target_tile"])
                for role, character in CHARACTERS.items()
            },
            "target_anchor_px_by_character": {
                role: list(character["target_anchor"])
                for role, character in CHARACTERS.items()
            },
        },
        "validation": {
            "approved_baseline": baseline_validation,
            "writing_actions": action_validation,
            "routes_and_collisions": route_validation,
            "passed": True,
        },
        "qa": {
            "preview": relative(PREVIEW),
            "collision_preview": relative(COLLISION_QA),
            "action_preview": relative(ACTION_QA),
        },
    }
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    for path, size in (
        (PREVIEW, (512, 288)),
        (COLLISION_QA, (1024, 576)),
        (ACTION_QA, (512, 288)),
    ):
        if Image.open(path).size != size:
            raise RuntimeError(f"Unexpected writing QA size: {relative(path)}")
    print(
        json.dumps(
            {
                "manifest": relative(MANIFEST),
                "candidate_object": "writing-table",
                "targets": {
                    role: list(character["target_tile"])
                    for role, character in CHARACTERS.items()
                },
                "baseline_hash_mismatches": 0,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
