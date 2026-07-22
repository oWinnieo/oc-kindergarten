#!/usr/bin/env python3
"""Approve and hash-lock the complete pixel-preserving Berry V1 runtime set."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps

from build_v2_berry_runtime_v1 import (
    ACTIONS,
    BERRY_ROOT,
    CHARACTERS,
    DIRECTIONS,
    berry_movement_path,
    berry_sequence_paths,
    berry_sequence_root,
    classic_movement_path,
    classic_sequence_paths,
)
from build_v2_berry_samples_v1 import recolor_frame, relative


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
LOCK_PATH = SPRITE_ROOT / "colorways/v1/approved/berry-runtime-lock-v1.json"
CLASSIC_LOCK = SPRITE_ROOT / "approved/v2-wheelbase-animation-baseline-lock-v4.json"
FRAME_COUNT = 4


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_expected_frame(
    character: str,
    kind: str,
    source_path: Path,
    output_path: Path,
    stored_qc: dict,
    *,
    cap_yellow_crown_offset: int | None = 10,
) -> None:
    if not output_path.exists():
        raise RuntimeError(f"Missing Berry frame: {relative(output_path)}")
    expected, expected_qc = recolor_frame(
        Image.open(source_path),
        character=character,
        protect_side_props=kind == "executing",
        cap_yellow_crown_offset=cap_yellow_crown_offset,
    )
    actual = Image.open(output_path).convert("RGBA")
    if actual.size != (48, 64):
        raise RuntimeError(f"Invalid frame size: {relative(output_path)}")
    if expected.tobytes() != actual.tobytes():
        raise RuntimeError(f"Frame is not an exact palette transfer: {relative(output_path)}")
    if expected_qc != stored_qc:
        raise RuntimeError(f"Stale QC metadata: {relative(output_path)}")


def collect_runtime_files(*, require_approved: bool) -> tuple[list[Path], list[Path]]:
    assets: list[Path] = []
    metadata_paths: list[Path] = []
    accepted_statuses = {"approved"} if require_approved else {"ready_for_approval", "approved"}
    for character, (directory, prefix, _) in CHARACTERS.items():
        for kind in ("idle", *ACTIONS):
            output_root = berry_sequence_root(character, kind)
            metadata_path = output_root / f"{prefix}-{kind}-berry-v1-meta.json"
            metadata = read_json(metadata_path)
            if metadata.get("status") not in accepted_statuses:
                raise RuntimeError(f"Sequence is not ready: {relative(metadata_path)}")
            sources = classic_sequence_paths(character, kind)
            outputs = berry_sequence_paths(character, kind)
            for source, output, qc in zip(sources, outputs, metadata["qc"], strict=True):
                assert_expected_frame(character, kind, source, output, qc)
            sequence_assets = [ROOT / path for path in metadata["frames"]]
            sequence_assets.extend(
                (ROOT / metadata["runtime_strip"], ROOT / metadata["sheet_2x2"])
            )
            assets.extend(sequence_assets)
            metadata_paths.append(metadata_path)

        movement_root = BERRY_ROOT / directory / "moving/v1"
        movement_meta_path = movement_root / f"{prefix}-move-8dir-4frame-berry-v1-meta.json"
        movement_meta = read_json(movement_meta_path)
        if movement_meta.get("status") not in accepted_statuses:
            raise RuntimeError(f"Movement is not ready: {relative(movement_meta_path)}")
        for direction in DIRECTIONS:
            for index in range(1, FRAME_COUNT + 1):
                assert_expected_frame(
                    character,
                    "moving",
                    classic_movement_path(character, direction, index),
                    berry_movement_path(character, direction, index),
                    movement_meta["qc"][direction][index - 1],
                    cap_yellow_crown_offset=(
                        10
                        if direction in ("down", "down_left", "down_right")
                        else 7
                        if direction in ("left", "right")
                        else None
                    ),
                )
        movement_assets = [ROOT / path for path in movement_meta["frames"]]
        movement_assets.extend(ROOT / path for path in movement_meta["strips"])
        movement_assets.append(ROOT / movement_meta["atlas"])
        assets.extend(movement_assets)
        metadata_paths.append(movement_meta_path)

        for left, right in (("down_left", "down_right"), ("up_left", "up_right")):
            for index in range(1, FRAME_COUNT + 1):
                left_image = Image.open(berry_movement_path(character, left, index)).convert("RGBA")
                right_image = Image.open(berry_movement_path(character, right, index)).convert("RGBA")
                if left_image.tobytes() != ImageOps.mirror(right_image).tobytes():
                    raise RuntimeError(
                        f"Berry mirror contract failed: {character}/{left}/{index}"
                    )

    unique_assets = sorted(set(assets), key=relative)
    if len(unique_assets) != 231:
        raise RuntimeError(f"Expected 231 Berry deliverables, found {len(unique_assets)}")
    for path in unique_assets:
        if not path.exists():
            raise RuntimeError(f"Missing Berry deliverable: {relative(path)}")
    return unique_assets, metadata_paths


def build_lock(assets: list[Path]) -> dict:
    return {
        "lock_id": "berry-runtime-lock-v1",
        "status": "approved",
        "approved_on": "2026-07-22",
        "preset": "berry",
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
            "appearance_selection": "not exposed until application contract rollout",
            "runtime_tinting": False,
        },
        "palette_contract": {
            "clothing_and_backpack": "coral highlights, berry midtones and raspberry shadows",
            "boy_cap_crown": "berry and raspberry; yellow bill remains classic",
            "unchanged": [
                "face and eyes",
                "white shell",
                "pale-blue sleeves",
                "girl flower",
                "genderless antenna",
                "wheels",
                "waist status light",
                "task props",
            ],
        },
        "shape_contract": {
            "alpha": "byte-exact classic frame",
            "bbox": "exact classic frame",
            "non_target_pixels": "byte-exact classic frame",
            "action_semantics": "exact classic action, orientation and phase order",
            "movement_semantics": "exact classic direction and wheel phase",
        },
        "action_semantic_locks": {
            "boy_executing": "up_back place_toy_block",
            "boy_error": "down_front inspect_diagnostic_reader",
        },
        "locked_file_count": len(assets),
        "files": [{"path": relative(path), "sha256": sha256(path)} for path in assets],
    }


def approve_metadata(metadata_paths: list[Path]) -> None:
    for metadata_path in metadata_paths:
        metadata = read_json(metadata_path)
        metadata["status"] = "approved"
        metadata["approval_lock"] = relative(LOCK_PATH)
        metadata["approved_on"] = "2026-07-22"
        metadata_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    audit_path = BERRY_ROOT / "asset-audit-v1.json"
    audit = read_json(audit_path)
    audit["status"] = "approved_assets_not_exposed"
    audit["production_approved"] = {
        "runtime_sheets": 21,
        "runtime_frames": 168,
        "locked_deliverables": 231,
    }
    audit["remaining_gate"] = [
        "add berry to the application appearance contract in a separate rollout",
    ]
    audit["approval_lock"] = relative(LOCK_PATH)
    audit_path.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    assets, metadata_paths = collect_runtime_files(require_approved=args.check)
    expected = build_lock(assets)
    if args.check:
        if not LOCK_PATH.exists() or read_json(LOCK_PATH) != expected:
            raise RuntimeError(f"Approval lock is missing or stale: {relative(LOCK_PATH)}")
        print(f"Validated {expected['locked_file_count']} Berry runtime deliverables")
        return

    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOCK_PATH.write_text(
        json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    approve_metadata(metadata_paths)
    print(f"Locked {expected['locked_file_count']} Berry runtime deliverables")


if __name__ == "__main__":
    main()
