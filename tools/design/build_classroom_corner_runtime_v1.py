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
MATCH_SUMMARY_QA = RUNTIME_DIR / "classroom-corner-v2-match-summary-2048x1152.png"
MOVEMENT_QA = RUNTIME_DIR / "classroom-corner-v2-movement-8dir-qa.gif"
STATE_ACTION_QA = RUNTIME_DIR / "classroom-corner-v2-state-actions-qa.gif"

ACTOR_SOURCES = {
    "boy": ROOT
    / "assets/design/sprites/characters/v2/ai-agent-child-boy/idle/frames"
    / "boy-child-idle-wheelbase-v2-1-48x64.png",
    "girl": ROOT
    / "assets/design/sprites/characters/v2/ai-agent-child-girl/idle/frames"
    / "girl-child-idle-wheelbase-v2-1-48x64.png",
    "genderless": ROOT
    / "assets/design/sprites/characters/v2/ai-agent-child-genderless/idle/frames"
    / "genderless-child-idle-wheelbase-v2-1-48x64.png",
}

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
ACTOR_VISIBLE_BASELINE_Y = 62
ACTOR_DECORATION_EXCLUDED_CORE_HEIGHT = 50
ACTOR_ACCEPTED_IDLE_VISIBLE_HEIGHTS = {
    "boy": 55,
    "girl": 51,
    "genderless": 58,
}
ACTOR_FOOTPRINT_SIZES = {
    "boy": (30, 6),
    "girl": (26, 6),
    "genderless": (30, 6),
}
SOCIAL_GROUND_OCCUPANCY = (14, 8)
ACTIVITY_SPOT_OFFSETS = ((-8, -4), (8, -4), (-8, 4), (8, 4))
ACTIVITY_REGIONS = {
    "idle": (1, 14, 7, 8),
    "writing": (7, 9, 5, 5),
    "researching": (2, 5, 4, 6),
    "executing": (10, 14, 5, 5),
    "syncing": (9, 13, 6, 6),
    "error": (4, 8, 6, 6),
}
ACTIVITY_ARRIVAL_OFFSET_Y = {
    "idle": 0,
    "writing": -40,
    "researching": 0,
    "executing": -40,
    "syncing": 8,
    "error": 8,
}
TILE_SIZE = 32
TILE_ANCHOR_Y_OFFSET = 8
RIGHT_FURNITURE_BLOCKED_TILES = tuple((x, 3) for x in range(11, 16))
RIGHT_FURNITURE_RELEASED_TILES = tuple((x, 4) for x in range(11, 15))
EXECUTING_TARGET_TILES = {
    "boy": (10, 5),
    "girl": (12, 5),
    "genderless": (14, 5),
}
EXECUTING_VISUAL_OFFSET_Y = -40
MOVEMENT_PREFIXES = {
    "boy": ("ai-agent-child-boy", "boy-child"),
    "girl": ("ai-agent-child-girl", "girl-child"),
    "genderless": ("ai-agent-child-genderless", "genderless-child"),
}
MOVEMENT_DIRECTIONS = (
    "down",
    "left",
    "right",
    "up",
    "down_left",
    "down_right",
    "up_left",
    "up_right",
)
STATE_ACTIONS = {
    "researching": {
        "duration_ms": 220,
        "anchor_px_by_character": {
            "boy": (96, 168),
            "girl": (128, 168),
            "genderless": (160, 168),
        },
    },
    "executing": {
        "duration_ms": 180,
        "anchor_px_by_character": {
            "boy": (320, 128),
            "girl": (384, 128),
            "genderless": (448, 128),
        },
    },
}


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
    character: str,
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
        "character": character,
        "kind": "actor",
        "image": image,
        "position": top_left,
        "anchor": anchor,
        "sort_y": anchor[1],
        "stable_order": stable_order,
        "collision_footprint": ACTOR_FOOTPRINT_SIZES[character],
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
                spawn["character"],
                ROOT / spawn["source"],
                tuple(spawn["frame_top_left_px"]),
                100 + index,
            )
        )
    return actors


def build_depth_qa(props: list[dict]) -> dict:
    behind = actor_renderable(
        "genderless-behind-block-table",
        "genderless",
        ACTOR_SOURCES["genderless"],
        (376, 32),
        100,
    )
    in_front = actor_renderable(
        "genderless-in-front-of-block-table",
        "genderless",
        ACTOR_SOURCES["genderless"],
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
            "wheel_anchor_px": list(behind["anchor"]),
            "sort_y": behind["sort_y"],
            "expected_relation": "behind block-table because 96 < 112",
        },
        "in_front": {
            "frame_top_left_px": list(in_front["position"]),
            "wheel_anchor_px": list(in_front["anchor"]),
            "sort_y": in_front["sort_y"],
            "expected_relation": "in front of block-table because 144 > 112",
        },
    }


def actor_footprint(
    anchor: tuple[int, int], footprint_size: tuple[int, int]
) -> tuple[int, int, int, int]:
    width, height = footprint_size
    return (
        anchor[0] - width // 2,
        anchor[1] - height,
        anchor[0] - width // 2 + width,
        anchor[1],
    )


def rects_overlap(
    first: tuple[int, int, int, int], second: tuple[int, int, int, int]
) -> bool:
    return not (
        first[2] <= second[0]
        or second[2] <= first[0]
        or first[3] <= second[1]
        or second[3] <= first[1]
    )


def rects_touch_or_overlap(
    first: tuple[int, int, int, int], second: tuple[int, int, int, int]
) -> bool:
    return not (
        first[2] < second[0]
        or second[2] < first[0]
        or first[3] < second[1]
        or second[3] < first[1]
    )


def shortest_tile_route(
    rows: list[list[int]], start: tuple[int, int], goal: tuple[int, int]
) -> list[tuple[int, int]]:
    if rows[start[1]][start[0]] != 1 or rows[goal[1]][goal[0]] != 1:
        return []
    frontier = [start]
    previous: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    while frontier:
        current = frontier.pop(0)
        if current == goal:
            break
        for delta_x, delta_y in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            neighbor = (current[0] + delta_x, current[1] + delta_y)
            if not (0 <= neighbor[0] < len(rows[0]) and 0 <= neighbor[1] < len(rows)):
                continue
            if rows[neighbor[1]][neighbor[0]] != 1 or neighbor in previous:
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
    path.reverse()
    return path


def tile_anchor(tile: tuple[int, int]) -> tuple[int, int]:
    return (tile[0] * TILE_SIZE, tile[1] * TILE_SIZE + TILE_ANCHOR_Y_OFFSET)


def point_to_tile(point: tuple[int, int], rows: list[list[int]]) -> tuple[int, int]:
    x = max(0, min(len(rows[0]) - 1, int(point[0] / TILE_SIZE + 0.5)))
    y = max(
        0,
        min(
            len(rows) - 1,
            int((point[1] - TILE_ANCHOR_Y_OFFSET) / TILE_SIZE + 0.5),
        ),
    )
    return (x, y)


def serialize_activity_regions(layout: dict) -> dict:
    rows = layout["walkability"]["rows"]
    regions = {}
    for state, (min_column, max_column, min_row, max_row) in ACTIVITY_REGIONS.items():
        walkable_tiles = sum(
            rows[row][column] == 1
            for row in range(min_row, max_row + 1)
            for column in range(min_column, max_column + 1)
        )
        regions[state] = {
            "bounds_inclusive_tiles": [min_column, min_row, max_column, max_row],
            "arrival_offset_y_px": ACTIVITY_ARRIVAL_OFFSET_Y[state],
            "walkable_tiles": walkable_tiles,
            "standing_capacity": walkable_tiles * len(ACTIVITY_SPOT_OFFSETS),
        }
    return regions


def validate_right_furniture_collision(layout: dict, props: list[dict]) -> dict:
    rows = layout["walkability"]["rows"]
    right_props = {
        prop["id"]: prop
        for prop in props
        if prop["id"] in {"block-table", "toy-bin"}
    }
    if set(right_props) != {"block-table", "toy-bin"}:
        raise RuntimeError("Right-side furniture collision props are incomplete")

    prop_rects = {
        prop_id: (
            prop["collision"]["x"],
            prop["collision"]["y"],
            prop["collision"]["x"] + prop["collision"]["w"],
            prop["collision"]["y"] + prop["collision"]["h"],
        )
        for prop_id, prop in right_props.items()
    }

    def footprint_overlaps(tile: tuple[int, int], character: str) -> list[str]:
        footprint = actor_footprint(tile_anchor(tile), ACTOR_FOOTPRINT_SIZES[character])
        return [
            prop_id
            for prop_id, collision in prop_rects.items()
            if rects_touch_or_overlap(footprint, collision)
        ]

    blocked_results = []
    for tile in RIGHT_FURNITURE_BLOCKED_TILES:
        overlaps = {
            character: footprint_overlaps(tile, character)
            for character in ACTOR_FOOTPRINT_SIZES
        }
        blocked_results.append(
            {
                "tile": list(tile),
                "walkable": rows[tile[1]][tile[0]] == 1,
                "footprint_overlaps_by_character": overlaps,
                "passed": rows[tile[1]][tile[0]] == 0
                and all(overlaps.values()),
            }
        )

    released_results = []
    for tile in RIGHT_FURNITURE_RELEASED_TILES:
        overlaps = {
            character: footprint_overlaps(tile, character)
            for character in ACTOR_FOOTPRINT_SIZES
        }
        released_results.append(
            {
                "tile": list(tile),
                "walkable": rows[tile[1]][tile[0]] == 1,
                "footprint_overlaps_by_character": overlaps,
                "passed": rows[tile[1]][tile[0]] == 1
                and all(not value for value in overlaps.values()),
            }
        )

    action_results = []
    for character, target_tile in EXECUTING_TARGET_TILES.items():
        safe_anchor = tile_anchor(target_tile)
        action_anchor = (safe_anchor[0], safe_anchor[1] + EXECUTING_VISUAL_OFFSET_Y)
        computed_departure_tile = point_to_tile(action_anchor, rows)
        footprint = actor_footprint(action_anchor, ACTOR_FOOTPRINT_SIZES[character])
        overlaps = [
            prop_id
            for prop_id, collision in prop_rects.items()
            if rects_overlap(footprint, collision)
        ]
        in_front = all(action_anchor[1] > prop["sort_y"] for prop in right_props.values())
        action_results.append(
            {
                "character": character,
                "arrival_target_tile": list(target_tile),
                "visual_anchor_px": list(action_anchor),
                "visual_offset_y_px": EXECUTING_VISUAL_OFFSET_Y,
                "computed_departure_tile": list(computed_departure_tile),
                "computed_departure_tile_walkable": (
                    rows[computed_departure_tile[1]][computed_departure_tile[0]] == 1
                ),
                "footprint_px": list(footprint),
                "precise_collision_overlaps": overlaps,
                "y_sort_in_front_of_right_furniture": in_front,
                "passed": not overlaps
                and in_front
                and computed_departure_tile[1] == 4
                and rows[computed_departure_tile[1]][computed_departure_tile[0]] == 1,
            }
        )

    route_goals = {
        "boy": ((3, 5), (7, 5), (10, 6), (3, 7)),
        "girl": ((4, 5), (8, 5), (11, 6), (8, 7)),
        "genderless": ((5, 5), (9, 5), (12, 6), (13, 7)),
    }
    route_results = []
    for character, target_tile in EXECUTING_TARGET_TILES.items():
        safe_anchor = tile_anchor(target_tile)
        action_anchor = (safe_anchor[0], safe_anchor[1] + EXECUTING_VISUAL_OFFSET_Y)
        start = point_to_tile(action_anchor, rows)
        for goal in route_goals[character]:
            path = shortest_tile_route(rows, start, goal)
            overlap_tiles = []
            for tile in path:
                footprint = actor_footprint(
                    tile_anchor(tile), ACTOR_FOOTPRINT_SIZES[character]
                )
                if any(
                    rects_touch_or_overlap(footprint, rect)
                    for rect in prop_rects.values()
                ):
                    overlap_tiles.append(list(tile))
            route_results.append(
                {
                    "character": character,
                    "start_tile": list(start),
                    "goal_tile": list(goal),
                    "path_tiles": [list(tile) for tile in path],
                    "precise_collision_overlap_tiles": overlap_tiles,
                    "passed": bool(path) and not overlap_tiles,
                }
            )

    passed = (
        all(result["passed"] for result in blocked_results)
        and all(result["passed"] for result in released_results)
        and all(result["passed"] for result in action_results)
        and all(result["passed"] for result in route_results)
    )
    return {
        "model": "precise furniture base collision projected through actor footprints with zero-clearance contact to tile_collision",
        "blocked_row_3": blocked_results,
        "released_row_4": released_results,
        "executing_visual_offset": action_results,
        "departure_routes": route_results,
        "passed": passed,
    }


def validate_v2_matching(layout: dict, props: list[dict], actors: list[dict]) -> dict:
    actor_results = []
    prop_rects = {
        prop["id"]: (
            prop["collision"]["x"],
            prop["collision"]["y"],
            prop["collision"]["x"] + prop["collision"]["w"],
            prop["collision"]["y"] + prop["collision"]["h"],
        )
        for prop in props
    }
    for actor in actors:
        bbox = actor["image"].getchannel("A").getbbox()
        if bbox is None:
            raise RuntimeError(f"Actor is fully transparent: {actor['id']}")
        footprint = actor_footprint(actor["anchor"], actor["collision_footprint"])
        overlaps = [
            prop_id
            for prop_id, collision in prop_rects.items()
            if rects_overlap(footprint, collision)
        ]
        actor_results.append(
            {
                "id": actor["id"],
                "character": actor["character"],
                "frame_size_px": list(actor["image"].size),
                "visible_bbox": list(bbox),
                "wheel_bottom_y_exclusive": bbox[3],
                "anchor_gap_px": ACTOR_ANCHOR_OFFSET[1] - bbox[3],
                "collision_footprint_px": list(actor["collision_footprint"]),
                "fits_single_32px_tile_width": actor["collision_footprint"][0] <= 32,
                "spawn_collision_overlaps": overlaps,
                "passed": (
                    actor["image"].size == ACTOR_VISUAL_SIZE
                    and bbox[3] == ACTOR_VISIBLE_BASELINE_Y
                    and actor["collision_footprint"][0] <= 32
                    and not overlaps
                ),
            }
        )

    walkability = layout["walkability"]["rows"]
    route_specs = {
        "reading_to_center": ((3, 7), (8, 7)),
        "center_to_block": ((8, 7), (13, 7)),
        "center_to_reading_approach": ((8, 7), (5, 4)),
        "center_to_block_approach": ((8, 7), (10, 5)),
    }
    route_results = []
    for route_id, (start, goal) in route_specs.items():
        path = shortest_tile_route(walkability, start, goal)
        route_results.append(
            {
                "id": route_id,
                "start_tile": list(start),
                "goal_tile": list(goal),
                "reachable": bool(path),
                "tile_steps": max(0, len(path) - 1),
                "path_tiles": [list(tile) for tile in path],
            }
        )

    right_collision_validation = validate_right_furniture_collision(layout, props)

    return {
        "revision": "v2-wheelbase",
        "layers": {
            "visual_scale": all(result["frame_size_px"] == [48, 64] for result in actor_results),
            "bottom_anchor": all(result["wheel_bottom_y_exclusive"] == 62 for result in actor_results),
            "collision_clearance": all(not result["spawn_collision_overlaps"] for result in actor_results),
            "tile_fit": all(result["fits_single_32px_tile_width"] for result in actor_results),
            "critical_routes": all(result["reachable"] for result in route_results),
            "right_furniture_collision_normalization": right_collision_validation[
                "passed"
            ],
            "depth_sort": True,
        },
        "actors": actor_results,
        "routes": route_results,
        "right_furniture_collision_normalization": right_collision_validation,
        "passed": all(result["passed"] for result in actor_results)
        and all(result["reachable"] for result in route_results)
        and right_collision_validation["passed"],
    }


def build_collision_qa(
    layout: dict, props: list[dict], actors: list[dict], runtime_scene: Image.Image
) -> None:
    debug = runtime_scene.copy()
    overlay = Image.new("RGBA", debug.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    for x in range(0, debug.width + 1, 32):
        draw.line((x, 0, x, debug.height), fill=(70, 130, 160, 62), width=1)
    for y in range(0, debug.height + 1, 32):
        draw.line((0, y, debug.width, y), fill=(70, 130, 160, 62), width=1)

    rows = layout["walkability"]["rows"]
    normalized_tiles = (
        RIGHT_FURNITURE_BLOCKED_TILES + RIGHT_FURNITURE_RELEASED_TILES
    )
    for column, row in normalized_tiles:
        walkable = rows[row][column] == 1
        draw.rectangle(
            (
                column * TILE_SIZE,
                row * TILE_SIZE,
                (column + 1) * TILE_SIZE - 1,
                (row + 1) * TILE_SIZE - 1,
            ),
            fill=(48, 220, 120, 48) if walkable else (244, 66, 66, 48),
            outline=(10, 120, 68, 210) if walkable else (156, 20, 20, 210),
            width=1,
        )

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
            actor_footprint(actor["anchor"], actor["collision_footprint"]),
            fill=(48, 220, 120, 115),
            outline=(10, 120, 68, 240),
            width=1,
        )

    debug.alpha_composite(overlay)
    debug.convert("RGB").resize((1024, 576), Image.Resampling.NEAREST).save(
        COLLISION_QA
    )


def build_match_summary(runtime_scene: Image.Image) -> None:
    summary = Image.new("RGB", (2048, 1152), (18, 24, 30))
    summary.paste(
        runtime_scene.convert("RGB").resize((1024, 576), Image.Resampling.NEAREST),
        (0, 0),
    )
    summary.paste(Image.open(COLLISION_QA).convert("RGB"), (1024, 0))
    summary.paste(Image.open(DEPTH_QA).convert("RGB"), (0, 576))
    summary.save(MATCH_SUMMARY_QA)


def movement_frame_path(character: str, direction: str, phase: int) -> Path:
    directory, prefix = MOVEMENT_PREFIXES[character]
    return (
        ROOT
        / "assets/design/sprites/characters/v2"
        / directory
        / "moving/v1/frames"
        / direction
        / f"{prefix}-move-{direction}-wheelbase-v2-{phase}-48x64.png"
    )


def movement_meta_path(character: str) -> Path:
    directory, prefix = MOVEMENT_PREFIXES[character]
    return (
        ROOT
        / "assets/design/sprites/characters/v2"
        / directory
        / "moving/v1"
        / f"{prefix}-move-8dir-4frame-wheelbase-v2-meta.json"
    )


def build_movement_qa(props: list[dict], layout: dict) -> dict:
    preview_frames = []
    checked_assets = []
    for direction in MOVEMENT_DIRECTIONS:
        for phase in range(1, 5):
            actors = []
            for index, spawn in enumerate(layout["actor_spawns"]):
                source = movement_frame_path(spawn["character"], direction, phase)
                actor = actor_renderable(
                    spawn["id"],
                    spawn["character"],
                    source,
                    tuple(spawn["frame_top_left_px"]),
                    100 + index,
                )
                bbox = actor["image"].getchannel("A").getbbox()
                if bbox is None or bbox[3] != ACTOR_VISIBLE_BASELINE_Y:
                    raise RuntimeError(f"Movement anchor mismatch: {source}")
                actors.append(actor)
                checked_assets.append(str(source.relative_to(ROOT)))
            preview_frames.append(compose_scene(props, actors).convert("RGB"))

    preview_frames[0].save(
        MOVEMENT_QA,
        format="GIF",
        save_all=True,
        append_images=preview_frames[1:],
        duration=125,
        loop=0,
        disposal=2,
        optimize=False,
    )
    return {
        "directions": list(MOVEMENT_DIRECTIONS),
        "frames_per_direction": 4,
        "checked_frame_references": len(checked_assets),
        "all_frame_sizes_px": list(ACTOR_VISUAL_SIZE),
        "all_wheel_bottom_y_exclusive": ACTOR_VISIBLE_BASELINE_Y,
        "passed": len(checked_assets) == 3 * 8 * 4,
    }


def state_action_frame_path(character: str, action: str, phase: int) -> Path:
    directory, prefix = MOVEMENT_PREFIXES[character]
    return (
        ROOT
        / "assets/design/sprites/characters/v2"
        / directory
        / "actions/v1"
        / action
        / "frames"
        / f"{prefix}-{action}-wheelbase-v2-{phase}-48x64.png"
    )


def state_action_meta_path(character: str, action: str) -> Path:
    directory, prefix = MOVEMENT_PREFIXES[character]
    return (
        ROOT
        / "assets/design/sprites/characters/v2"
        / directory
        / "actions/v1"
        / action
        / f"{prefix}-{action}-4frame-wheelbase-v2-meta.json"
    )


def visible_height(source: Path) -> int:
    bbox = Image.open(source).convert("RGBA").getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError(f"Transparent actor frame: {source}")
    return bbox[3] - bbox[1]


def validate_body_size_lock() -> dict:
    character_results = {}
    for character in ("boy", "girl", "genderless"):
        expected_visible_height = ACTOR_ACCEPTED_IDLE_VISIBLE_HEIGHTS[character]
        idle_height = visible_height(ACTOR_SOURCES[character])
        moving_down_heights = [
            visible_height(movement_frame_path(character, "down", phase))
            for phase in range(1, 5)
        ]
        researching_heights = [
            visible_height(state_action_frame_path(character, "researching", phase))
            for phase in range(1, 5)
        ]

        movement_meta = json.loads(
            movement_meta_path(character).read_text(encoding="utf-8")
        )
        action_meta = {
            action: json.loads(
                state_action_meta_path(character, action).read_text(encoding="utf-8")
            )
            for action in STATE_ACTIONS
        }
        locks = [
            movement_meta["body_size_lock"],
            action_meta["researching"]["body_size_lock"],
            action_meta["executing"]["body_size_lock"],
        ]
        scale_multipliers = [float(lock["processor_scale_multiplier"]) for lock in locks]
        passed = (
            idle_height == expected_visible_height
            and moving_down_heights == [expected_visible_height] * 4
            and researching_heights == [expected_visible_height] * 4
            and all(
                int(lock["decoration_excluded_core_height_px"])
                == ACTOR_DECORATION_EXCLUDED_CORE_HEIGHT
                for lock in locks
            )
            and max(scale_multipliers) - min(scale_multipliers) < 1e-9
            and bool(
                movement_meta["body_size_lock"][
                    "canonical_down_matches_idle_exactly"
                ]
            )
            and bool(
                action_meta["researching"]["body_size_lock"][
                    "canonical_researching_matches_idle_exactly"
                ]
            )
            and bool(
                action_meta["executing"]["body_size_lock"][
                    "executing_uses_same_idle_calibration_multiplier"
                ]
            )
        )
        if not passed:
            raise RuntimeError(
                f"{character}: idle/moving/actions body-size lock validation failed"
            )
        character_results[character] = {
            "excluded_accessory": locks[0]["excluded_accessory"],
            "decoration_excluded_core_height_px": ACTOR_DECORATION_EXCLUDED_CORE_HEIGHT,
            "accepted_idle_visible_height_px": expected_visible_height,
            "idle_visible_height_px": idle_height,
            "moving_down_visible_heights_px": moving_down_heights,
            "researching_visible_heights_px": researching_heights,
            "shared_processor_scale_multiplier": scale_multipliers[0],
            "passed": True,
        }
    return {
        "policy": "cap/flower/antenna excluded; accepted idle body scale reused",
        "characters": character_results,
        "passed": all(result["passed"] for result in character_results.values()),
    }


def build_state_action_qa(props: list[dict]) -> dict:
    preview_frames = []
    frame_durations = []
    checked_assets = []
    action_results = {}
    for action, action_config in STATE_ACTIONS.items():
        action_assets = []
        for phase in range(1, 5):
            actors = []
            for index, character in enumerate(("boy", "girl", "genderless")):
                anchor = action_config["anchor_px_by_character"][character]
                source = state_action_frame_path(character, action, phase)
                actor = actor_renderable(
                    f"{character}-{action}-qa",
                    character,
                    source,
                    (
                        anchor[0] - ACTOR_ANCHOR_OFFSET[0],
                        anchor[1] - ACTOR_ANCHOR_OFFSET[1],
                    ),
                    100 + index,
                )
                bbox = actor["image"].getchannel("A").getbbox()
                if bbox is None or bbox[3] != ACTOR_VISIBLE_BASELINE_Y:
                    raise RuntimeError(f"State action anchor mismatch: {source}")
                actors.append(actor)
                relative_source = str(source.relative_to(ROOT))
                checked_assets.append(relative_source)
                action_assets.append(relative_source)
            preview_frames.append(compose_scene(props, actors).convert("RGB"))
            frame_durations.append(action_config["duration_ms"])
        action_results[action] = {
            "frames": 4,
            "frame_duration_ms": action_config["duration_ms"],
            "anchor_px_by_character": {
                character: list(anchor)
                for character, anchor in action_config[
                    "anchor_px_by_character"
                ].items()
            },
            "checked_frame_references": action_assets,
            "passed": len(action_assets) == 3 * 4,
        }

    preview_frames[0].save(
        STATE_ACTION_QA,
        format="GIF",
        save_all=True,
        append_images=preview_frames[1:],
        duration=frame_durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    genderless_executing_meta = json.loads(
        state_action_meta_path("genderless", "executing").read_text(encoding="utf-8")
    )
    rear_occlusion = genderless_executing_meta["qc"].get("rear_occlusion")
    if not rear_occlusion or not rear_occlusion.get("passed"):
        raise RuntimeError("Genderless executing rear-occlusion QC failed")
    return {
        "actions": action_results,
        "checked_frame_references": len(checked_assets),
        "all_frame_sizes_px": list(ACTOR_VISUAL_SIZE),
        "all_wheel_bottom_y_exclusive": ACTOR_VISIBLE_BASELINE_Y,
        "genderless_executing_rear_occlusion": rear_occlusion,
        "passed": len(checked_assets) == 3 * 2 * 4
        and all(result["passed"] for result in action_results.values())
        and bool(rear_occlusion["passed"]),
    }


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
    build_collision_qa(layout, props, actors, runtime_scene)
    matching_validation = validate_v2_matching(layout, props, actors)
    movement_validation = build_movement_qa(props, layout)
    state_action_validation = build_state_action_qa(props)
    body_size_validation = validate_body_size_lock()
    matching_validation["layers"]["movement_animation"] = movement_validation["passed"]
    matching_validation["layers"]["state_actions"] = state_action_validation["passed"]
    matching_validation["layers"]["body_size_lock"] = body_size_validation["passed"]
    matching_validation["movement"] = movement_validation
    matching_validation["state_actions"] = state_action_validation
    matching_validation["body_size_lock"] = body_size_validation
    matching_validation["passed"] = (
        matching_validation["passed"]
        and movement_validation["passed"]
        and state_action_validation["passed"]
        and body_size_validation["passed"]
    )
    if not matching_validation["passed"]:
        raise RuntimeError("V2 classroom matching validation failed")
    build_match_summary(runtime_scene)

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
            "revision": "v2-wheelbase",
            "visual_size_px": list(ACTOR_VISUAL_SIZE),
            "visible_wheel_bottom_y_exclusive": ACTOR_VISIBLE_BASELINE_Y,
            "decoration_excluded_core_height_px": ACTOR_DECORATION_EXCLUDED_CORE_HEIGHT,
            "excluded_accessory_by_character": {
                character: result["excluded_accessory"]
                for character, result in body_size_validation["characters"].items()
            },
            "accepted_idle_visible_height_px_by_character": dict(
                ACTOR_ACCEPTED_IDLE_VISIBLE_HEIGHTS
            ),
            "anchor": "wheel_bottom_center",
            "anchor_offset_px": list(ACTOR_ANCHOR_OFFSET),
            "collision_footprint_px_by_character": {
                character: list(size)
                for character, size in ACTOR_FOOTPRINT_SIZES.items()
            },
        },
        "activity_placement": {
            "revision": "dynamic-region-v1",
            "character_independent": True,
            "navigation_grid_px": TILE_SIZE,
            "social_ground_occupancy_px": list(SOCIAL_GROUND_OCCUPANCY),
            "spot_offsets_from_tile_anchor_px": [
                list(offset) for offset in ACTIVITY_SPOT_OFFSETS
            ],
            "spots_per_walkable_tile": len(ACTIVITY_SPOT_OFFSETS),
            "full_region_policy": "wait_queue",
            "regions": serialize_activity_regions(layout),
        },
        "objects": [serialize_prop(prop) for prop in props],
        "actor_spawns": layout["actor_spawns"],
        "depth_sort_tests": depth_tests,
        "matching_validation": matching_validation,
        "qa": {
            "runtime_preview": str(RUNTIME_PREVIEW.relative_to(ROOT)),
            "depth_sort_preview": str(DEPTH_QA.relative_to(ROOT)),
            "collision_preview": str(COLLISION_QA.relative_to(ROOT)),
            "match_summary_preview": str(MATCH_SUMMARY_QA.relative_to(ROOT)),
            "movement_preview": str(MOVEMENT_QA.relative_to(ROOT)),
            "state_action_preview": str(STATE_ACTION_QA.relative_to(ROOT)),
            "collision_colors": {
                "furniture_collision": "red",
                "normalized_blocked_tile": "red outline",
                "normalized_released_tile": "green outline",
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
        (MATCH_SUMMARY_QA, (2048, 1152)),
        (MOVEMENT_QA, (512, 288)),
        (STATE_ACTION_QA, (512, 288)),
    ):
        if Image.open(expected).size != size:
            raise RuntimeError(f"Unexpected QA size for {expected}")
    print(json.dumps({"manifest": str(RUNTIME_MANIFEST.relative_to(ROOT)), "props": len(props)}, indent=2))


if __name__ == "__main__":
    main()
