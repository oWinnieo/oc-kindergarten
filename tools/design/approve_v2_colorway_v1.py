#!/usr/bin/env python3
"""Approve and hash-lock the Meadow V1 runtime sprite deliverables."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
COLORWAY_ROOT = SPRITE_ROOT / "colorways/v1/meadow"
LOCK_PATH = SPRITE_ROOT / "colorways/v1/approved/meadow-runtime-lock-v1.json"
CLASSIC_LOCK = SPRITE_ROOT / "approved/v2-wheelbase-animation-baseline-lock-v4.json"
CHARACTERS = {
    "boy": ("ai-agent-child-boy", "boy-child"),
    "girl": ("ai-agent-child-girl", "girl-child"),
    "genderless": ("ai-agent-child-genderless", "genderless-child"),
}
ACTIONS = ("researching", "writing", "executing", "syncing", "error")
DIRECTIONS = (
    "down",
    "left",
    "right",
    "up",
    "down_left",
    "down_right",
    "up_left",
    "up_right",
)


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def assert_frame(path: Path) -> None:
    if not path.exists():
        raise RuntimeError(f"Missing runtime frame: {relative(path)}")
    if Image.open(path).convert("RGBA").size != (48, 64):
        raise RuntimeError(f"Invalid frame size: {relative(path)}")


def assert_qc(character: str, action: str, qc: dict) -> None:
    if not qc.get("anchor_matches_reference"):
        raise RuntimeError(f"Anchor mismatch: {character}/{action}: {qc}")
    if qc.get("visible_magenta_pixels") or qc.get("chroma_fringe_pixels"):
        raise RuntimeError(f"Chroma contamination: {character}/{action}: {qc}")
    if qc.get("touches_edge") or int(qc.get("meadow_pixels", 0)) < 12:
        raise RuntimeError(f"Frame contract failed: {character}/{action}: {qc}")
    if character == "boy" and int(qc.get("purple_palette_pixels", 0)) < 6:
        raise RuntimeError(f"Purple cap missing: {character}/{action}: {qc}")
    if character == "boy" and action in ("executing", "error"):
        if float(qc.get("reference_alpha_iou", 0)) < 0.95:
            raise RuntimeError(f"Classic silhouette drift: {character}/{action}: {qc}")


def collect_runtime_files() -> tuple[list[Path], list[Path]]:
    assets: list[Path] = []
    metadata_paths: list[Path] = []
    for character, (directory, prefix) in CHARACTERS.items():
        character_root = COLORWAY_ROOT / directory
        idle_root = character_root / "idle"
        idle_meta_path = idle_root / f"{prefix}-idle-meadow-v1-meta.json"
        idle_meta = read_json(idle_meta_path)
        if idle_meta.get("status") != "approved":
            raise RuntimeError(f"Idle is not approved: {relative(idle_meta_path)}")
        for qc in idle_meta["qc"]:
            assert_qc(character, "idle", qc)
        idle_files = [Path(path) for path in idle_meta["frames"]]
        idle_files.extend((Path(idle_meta["runtime_strip"]), Path(idle_meta["sheet_2x2"])))
        assets.extend(ROOT / path for path in idle_files)
        metadata_paths.append(idle_meta_path)

        for action in ACTIONS:
            action_root = character_root / "actions/v1" / action
            action_meta_path = action_root / f"{prefix}-{action}-meadow-v1-meta.json"
            action_meta = read_json(action_meta_path)
            if action_meta.get("status") != "approved":
                raise RuntimeError(f"Action is not approved: {relative(action_meta_path)}")
            for qc in action_meta["qc"]:
                assert_qc(character, action, qc)
            action_files = [Path(path) for path in action_meta["frames"]]
            action_files.extend(
                (Path(action_meta["runtime_strip"]), Path(action_meta["sheet_2x2"]))
            )
            assets.extend(ROOT / path for path in action_files)
            metadata_paths.append(action_meta_path)

        movement_root = character_root / "moving/v1"
        movement_meta_path = movement_root / f"{prefix}-move-8dir-4frame-meadow-v1-meta.json"
        movement_meta = read_json(movement_meta_path)
        if movement_meta.get("status") != "approved":
            raise RuntimeError(f"Movement is not approved: {relative(movement_meta_path)}")
        for direction in DIRECTIONS:
            for qc in movement_meta["qc"][direction]:
                assert_qc(character, f"moving/{direction}", qc)
        movement_files = [Path(path) for path in movement_meta["frames"]]
        movement_files.extend(Path(path) for path in movement_meta["strips"])
        movement_files.append(Path(movement_meta["atlas"]))
        assets.extend(ROOT / path for path in movement_files)
        metadata_paths.append(movement_meta_path)

        for left, right in (("down_left", "down_right"), ("up_left", "up_right")):
            for index in range(1, 5):
                left_path = (
                    movement_root
                    / "frames"
                    / left
                    / f"{prefix}-move-{left}-meadow-v1-{index}-48x64.png"
                )
                right_path = (
                    movement_root
                    / "frames"
                    / right
                    / f"{prefix}-move-{right}-meadow-v1-{index}-48x64.png"
                )
                left_image = Image.open(left_path).convert("RGBA")
                right_image = Image.open(right_path).convert("RGBA")
                if left_image.tobytes() != ImageOps.mirror(right_image).tobytes():
                    raise RuntimeError(f"Mirror contract failed: {relative(left_path)}")

    unique_assets = sorted(set(assets), key=relative)
    if len(unique_assets) != 231:
        raise RuntimeError(f"Expected 231 locked deliverables, found {len(unique_assets)}")
    for path in unique_assets:
        if not path.exists():
            raise RuntimeError(f"Missing runtime deliverable: {relative(path)}")
        if path.name.endswith("-48x64.png") and "/frames/" in relative(path):
            assert_frame(path)
    return unique_assets, metadata_paths


def build_lock(assets: list[Path]) -> dict:
    return {
        "lock_id": "meadow-runtime-lock-v1",
        "status": "approved",
        "approved_on": "2026-07-22",
        "preset": "meadow",
        "classic_baseline_lock": relative(CLASSIC_LOCK),
        "scope": {
            "characters": 3,
            "runtime_sheet_count": 21,
            "idle_frames": 12,
            "movement_frames": 96,
            "state_action_frames": 60,
            "runtime_frames": 168,
            "movement_direction_strips": 24,
            "movement_atlases": 3,
            "idle_and_action_strips": 18,
            "idle_and_action_2x2_sheets": 18,
        },
        "character_contract": {
            "frame_size_px": [48, 64],
            "anchor_px": [24, 64],
            "appearance_selection": "appearancePreset + characterVariant",
            "runtime_tinting": False,
        },
        "palette_contract": {
            "clothing_and_backpack": "mint, teal and emerald",
            "boy_cap": "grape shadow, violet body, periwinkle highlight, lavender brim",
            "berry_status": "paused; palette-board candidate only",
        },
        "action_semantic_locks": {
            "boy_executing": {
                "orientation": "up_back",
                "semantic": "place_toy_block",
                "minimum_reference_alpha_iou": 0.95,
            },
            "boy_error": {
                "orientation": "down_front",
                "semantic": "inspect_diagnostic_reader",
                "minimum_reference_alpha_iou": 0.95,
            },
        },
        "locked_file_count": len(assets),
        "files": [{"path": relative(path), "sha256": sha256(path)} for path in assets],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    assets, metadata_paths = collect_runtime_files()
    expected = build_lock(assets)
    if args.check:
        if not LOCK_PATH.exists() or read_json(LOCK_PATH) != expected:
            raise RuntimeError(f"Approval lock is missing or stale: {relative(LOCK_PATH)}")
        print(f"Validated {expected['locked_file_count']} Meadow runtime deliverables")
        return

    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOCK_PATH.write_text(
        json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for metadata_path in metadata_paths:
        metadata = read_json(metadata_path)
        metadata["approval_lock"] = relative(LOCK_PATH)
        metadata["approved_on"] = expected["approved_on"]
        metadata_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(f"Locked {expected['locked_file_count']} Meadow runtime deliverables")


if __name__ == "__main__":
    main()
