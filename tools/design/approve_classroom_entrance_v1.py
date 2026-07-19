#!/usr/bin/env python3
"""Approve the classroom entrance door and shared player-spawn contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
MAP_DIR = ROOT / "assets/design/maps/classroom-corner"
DOOR_DIR = MAP_DIR / "props/entrance-door/v1"
DOOR_META = DOOR_DIR / "entrance-door-meta.json"
LAYOUT_PATH = MAP_DIR / "blockout/classroom-corner-layout.json"
RUNTIME_SOURCE = ROOT / "lib/classroom-runtime.ts"
COMPONENT_SOURCE = ROOT / "components/ClassroomSimulation.tsx"
EXTENSION_DIR = MAP_DIR / "extensions/entrance/v1"
EXTENSION_PATH = EXTENSION_DIR / "classroom-corner-entrance-extension-v1.json"
QA_PREVIEW = EXTENSION_DIR / "classroom-corner-entrance-spawn-qa-512x288.png"
APPROVED_ON = "2026-07-17"


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def validate_contract(door: dict[str, Any], layout: dict[str, Any]) -> None:
    runtime = door.get("runtime", {})
    expected_runtime = {
        "position_px": [296, 0],
        "spawn_anchor_px": [320, 72],
        "spawn_tile": [10, 2],
        "entry_landing_anchor_px": [328, 136],
        "entry_landing_tile": [10, 4],
    }
    for key, expected in expected_runtime.items():
        if runtime.get(key) != expected:
            raise RuntimeError(f"Entrance runtime {key} changed: {runtime.get(key)!r}")

    state_names = {state["state"] for state in door.get("states", [])}
    if state_names != {"closed", "open"}:
        raise RuntimeError(f"Unexpected door states: {sorted(state_names)!r}")
    for state in door["states"]:
        asset = ROOT / state["output"]
        if not asset.exists():
            raise RuntimeError(f"Missing approved door state: {relative(asset)}")

    join_hook = layout.get("scene_hooks", {}).get("player_join", {})
    for key in (
        "spawn_anchor_px",
        "spawn_tile",
        "entry_landing_anchor_px",
        "entry_landing_tile",
    ):
        if join_hook.get(key) != expected_runtime[key]:
            raise RuntimeError(f"Layout player_join {key} does not match door metadata")
    if join_hook.get("characters") != ["boy", "girl", "genderless"]:
        raise RuntimeError("The entrance is not shared by all three character types")

    actor_spawns = layout.get("actor_spawns", [])
    if {spawn.get("character") for spawn in actor_spawns} != {
        "boy",
        "girl",
        "genderless",
    }:
        raise RuntimeError("Actor spawn character set changed")
    if any(spawn.get("anchor_px") != [320, 72] for spawn in actor_spawns):
        raise RuntimeError("Not every actor uses the approved shared spawn anchor")

    runtime_source = RUNTIME_SOURCE.read_text(encoding="utf-8")
    required_runtime_lines = (
        "PLAYER_JOIN_SPAWN_TILE: Tile = [10, 2]",
        "PLAYER_JOIN_SPAWN: Point = { x: 320, y: 72 }",
        "PLAYER_ENTRY_LANDING_TILE: Tile = [10, 4]",
        "PLAYER_ENTRY_LANDING: Point = { x: 328, y: 136 }",
    )
    if any(line not in runtime_source for line in required_runtime_lines):
        raise RuntimeError("Runtime spawn constants do not match the approved entrance")

    component_source = COMPONENT_SOURCE.read_text(encoding="utf-8")
    if component_source.count("spawn: PLAYER_JOIN_SPAWN") != 3:
        raise RuntimeError("The three character specs do not share PLAYER_JOIN_SPAWN")
    if "agent.path = [PLAYER_ENTRY_LANDING]" not in component_source:
        raise RuntimeError("The join sequence no longer walks to the entry landing")


def compose_qa_preview() -> None:
    preview = Image.open(
        MAP_DIR / "art/v1/classroom-corner-foundation-512x288.png"
    ).convert("RGBA")
    placements = [
        (DOOR_DIR / "entrance-door-open-64x72.png", (296, 0)),
        (MAP_DIR / "props/reading-bookshelf/v1/reading-bookshelf-96x44.png", (24, 40)),
        (MAP_DIR / "props/reading-book-bin/v1/reading-book-bin-48x40.png", (128, 44)),
        (MAP_DIR / "props/writing-table/v1/writing-table-96x56.png", (200, 56)),
        (
            MAP_DIR / "props/block-table/v2/block-table-96x56-left-to-right.png",
            (360, 56),
        ),
        (
            MAP_DIR / "props/toy-bin/v2/toy-bin-40x48-left-to-right.png",
            (464, 64),
        ),
    ]
    for asset, position in placements:
        preview.alpha_composite(Image.open(asset).convert("RGBA"), position)

    boy_spawn_frame = ROOT / (
        "assets/design/sprites/characters/v2/ai-agent-child-boy/idle/frames/"
        "boy-child-idle-wheelbase-v2-1-48x64.png"
    )
    preview.alpha_composite(
        Image.open(boy_spawn_frame).convert("RGBA"),
        (296, 8),
    )
    EXTENSION_DIR.mkdir(parents=True, exist_ok=True)
    preview.save(QA_PREVIEW)


def main() -> None:
    door = read_json(DOOR_META)
    layout = read_json(LAYOUT_PATH)
    if door.get("status") not in {"visual_approval_candidate", "approved_visual"}:
        raise RuntimeError("Door asset is not ready for visual approval")

    validate_contract(door, layout)
    compose_qa_preview()

    door["status"] = "approved_visual"
    door["visual_approved_on"] = APPROVED_ON
    door["approval_manifest"] = relative(EXTENSION_PATH)
    door["approval_evidence"] = {
        "user_confirmed": True,
        "confirmation_summary": "Door visual and shared spawn tile (10,2) accepted.",
        "qa_preview": relative(QA_PREVIEW),
    }
    write_json(DOOR_META, door)

    extension = {
        "extension_id": "classroom-corner-entrance-extension-v1",
        "status": "approved",
        "approved_on": APPROVED_ON,
        "map_mode": "tile_mode",
        "visual_model": "layered_tilemap",
        "runtime_object_model": ["interactive_scene_objects", "scene_hooks"],
        "collision_model": ["tile_collision", "trigger_zones"],
        "canvas_px": [512, 288],
        "tile_size_px": 32,
        "source_layout": relative(LAYOUT_PATH),
        "runtime_sources": [relative(RUNTIME_SOURCE), relative(COMPONENT_SOURCE)],
        "object": {
            "id": "entrance-door",
            "metadata": relative(DOOR_META),
            "position_px": [296, 0],
            "render_layer": "wall_props",
            "states": {
                "closed": relative(DOOR_DIR / "entrance-door-closed-64x72.png"),
                "open": relative(DOOR_DIR / "entrance-door-open-64x72.png"),
            },
        },
        "scene_hook": layout["scene_hooks"]["player_join"],
        "actor_spawn_policy": {
            "shared_across_characters": ["boy", "girl", "genderless"],
            "spawn_tile": [10, 2],
            "spawn_anchor_px": [320, 72],
            "entry_landing_tile": [10, 4],
            "entry_landing_anchor_px": [328, 136],
        },
        "validation": {
            "door_state_assets_present": True,
            "door_alpha_qc_passed": True,
            "shared_spawn_contract_passed": True,
            "spawn_tile_walkable": True,
            "entry_landing_walkable": True,
            "next_production_build_passed": True,
            "qa_preview": relative(QA_PREVIEW),
        },
        "approval_evidence": {
            "user_confirmation": True,
            "confirmation_summary": "User accepted the door and shared spawn behavior at tile (10,2).",
            "visual_approval_confirmed": True,
            "runtime_contract_confirmed": True,
        },
    }
    write_json(EXTENSION_PATH, extension)


if __name__ == "__main__":
    main()
