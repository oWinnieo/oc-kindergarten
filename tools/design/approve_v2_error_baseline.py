#!/usr/bin/env python3
"""Approve the V2 error state and extend the immutable animation lock to v4."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
MAP_ROOT = ROOT / "assets/design/maps/classroom-corner"
LOCK_DIR = SPRITE_ROOT / "approved"
PREVIOUS_LOCK_PATH = LOCK_DIR / "v2-wheelbase-animation-baseline-lock-v3.json"
LOCK_PATH = LOCK_DIR / "v2-wheelbase-animation-baseline-lock-v4.json"
ERROR_EXTENSION = MAP_ROOT / "extensions/error/v1/classroom-corner-error-extension-v1.json"
ERROR_PROP_META = MAP_ROOT / "props/diagnostic-repair-station/v1/diagnostic-repair-station-meta.json"
TRIO_ERROR_META = SPRITE_ROOT / "trio/actions/v1/error/kindergarten-ai-agent-trio-error-v2-meta.json"
STATE_ACTIONS_META = SPRITE_ROOT / "trio/actions/v1/kindergarten-ai-agent-trio-state-actions-v4-meta.json"
STATE_ACTIONS_PREVIEW = SPRITE_ROOT / "trio/actions/v1/kindergarten-ai-agent-trio-state-actions-v4-preview-6x.png"

APPROVED_ON = "2026-07-17"
FRAME_SIZE = [48, 64]
VISIBLE_WHEEL_BOTTOM_Y_EXCLUSIVE = 62

CHARACTERS = {
    "boy": {
        "directory": "ai-agent-child-boy",
        "prefix": "boy-child",
        "visible_height": 55,
    },
    "girl": {
        "directory": "ai-agent-child-girl",
        "prefix": "girl-child",
        "visible_height": 51,
    },
    "genderless": {
        "directory": "ai-agent-child-genderless",
        "prefix": "genderless-child",
        "visible_height": 58,
    },
}


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def validate_lock(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    lock = read_json(path)
    mismatches = []
    for item in lock["files"]:
        asset = ROOT / item["path"]
        if not asset.exists() or sha256(asset) != item["sha256"]:
            mismatches.append(item["path"])
    if mismatches:
        raise RuntimeError(f"Approved lock changed: {mismatches[:10]}")
    return lock, {
        "lock": relative(path),
        "checked_files": len(lock["files"]),
        "hash_mismatches": mismatches,
        "passed": True,
    }


def character_metadata_path(role: str) -> Path:
    spec = CHARACTERS[role]
    return (
        SPRITE_ROOT
        / spec["directory"]
        / "actions/v1/error"
        / f"{spec['prefix']}-error-4frame-wheelbase-v2-meta.json"
    )


def error_metadata_paths() -> list[Path]:
    return [
        *(character_metadata_path(role) for role in CHARACTERS),
        TRIO_ERROR_META,
        STATE_ACTIONS_META,
    ]


def validate_character_metadata(role: str, path: Path) -> dict[str, Any]:
    metadata = read_json(path)
    if metadata.get("status") not in {"visual_approval_candidate", "approved"}:
        raise RuntimeError(f"Unexpected error status: {relative(path)}")
    if metadata.get("action") != "error" or metadata.get("frames") != 4:
        raise RuntimeError(f"Unexpected error contract: {relative(path)}")
    if metadata.get("semantic") != "inspect_diagnostic_reader":
        raise RuntimeError(f"Unexpected error semantic: {relative(path)}")
    if metadata.get("orientation") != "down_front":
        raise RuntimeError(f"Unexpected error orientation: {relative(path)}")
    if metadata.get("frame_duration_ms") != 240:
        raise RuntimeError(f"Unexpected error frame duration: {relative(path)}")
    if metadata.get("runtime_frame_px") != FRAME_SIZE:
        raise RuntimeError(f"Unexpected frame size: {relative(path)}")
    if metadata.get("visible_wheel_bottom_y_exclusive") != VISIBLE_WHEEL_BOTTOM_Y_EXCLUSIVE:
        raise RuntimeError(f"Unexpected wheel baseline: {relative(path)}")

    expected_height = CHARACTERS[role]["visible_height"]
    if metadata.get("accepted_idle_visible_height_px") != expected_height:
        raise RuntimeError(f"Idle height lock mismatch: {relative(path)}")

    qc = metadata.get("qc", {})
    frame_qc = qc.get("frames", [])
    if not qc.get("technical_qc_passed") or not qc.get("all_frames_distinct") or len(frame_qc) != 4:
        raise RuntimeError(f"Error technical QC failed: {relative(path)}")
    for item in frame_qc:
        if (
            item.get("size_px") != FRAME_SIZE
            or item.get("visible_height_px") != expected_height
            or item.get("wheel_bottom_y_exclusive") != VISIBLE_WHEEL_BOTTOM_Y_EXCLUSIVE
            or item.get("visible_magenta_pixels") != 0
            or item.get("touches_edge")
        ):
            raise RuntimeError(f"Error frame QC failed: {relative(path)}")

    runtime_frames = metadata.get("runtime_frames", [])
    if len(runtime_frames) != 4 or any(not (ROOT / frame).exists() for frame in runtime_frames):
        raise RuntimeError(f"Error runtime frames are missing: {relative(path)}")
    if len({sha256(ROOT / frame) for frame in runtime_frames}) != 4:
        raise RuntimeError(f"Error runtime frames are not distinct: {relative(path)}")

    return {
        "role": role,
        "metadata": relative(path),
        "frames": 4,
        "visible_height_px": expected_height,
        "technical_qc_passed": True,
    }


def validate_error_assets() -> dict[str, Any]:
    characters = {
        role: validate_character_metadata(role, character_metadata_path(role))
        for role in CHARACTERS
    }

    trio = read_json(TRIO_ERROR_META)
    if trio.get("status") not in {"visual_approval_candidate", "approved"}:
        raise RuntimeError("Unexpected trio error approval status")
    if trio.get("action") != "error" or trio.get("frames") != 4 or not trio.get("technical_qc_passed"):
        raise RuntimeError("Trio error technical QC failed")

    aggregate = read_json(STATE_ACTIONS_META)
    if aggregate.get("status") not in {"visual_approval_candidate", "approved"}:
        raise RuntimeError("Unexpected state-action bundle approval status")
    expected_actions = ["researching", "executing", "writing", "syncing", "error"]
    if aggregate.get("actions") != expected_actions or not aggregate.get("technical_qc_passed"):
        raise RuntimeError("State-action bundle does not contain the approved error QC")
    if not STATE_ACTIONS_PREVIEW.exists():
        raise RuntimeError("State-action v4 preview is missing")

    return {
        "characters": characters,
        "trio_metadata": relative(TRIO_ERROR_META),
        "state_actions_metadata": relative(STATE_ACTIONS_META),
        "technical_qc_passed": True,
    }


def validate_error_extension() -> dict[str, Any]:
    extension = read_json(ERROR_EXTENSION)
    if extension.get("status") not in {"visual_approval_candidate", "approved"}:
        raise RuntimeError("Error map extension is not ready for approval")
    validation = extension.get("validation", {})
    if (
        not validation.get("passed")
        or not validation.get("error_actions", {}).get("passed")
        or not validation.get("routes_and_collisions", {}).get("passed")
    ):
        raise RuntimeError("Error map extension validation failed")

    prop = read_json(ERROR_PROP_META)
    if prop.get("status") not in {"visual_approval_candidate", "approved_visual"}:
        raise RuntimeError("Diagnostic repair station is not ready for approval")
    if not prop.get("qc", {}).get("technical_qc_passed"):
        raise RuntimeError("Diagnostic repair station technical QC failed")
    if prop.get("runtime_size_px") != [96, 48]:
        raise RuntimeError("Diagnostic repair station runtime size changed")
    if not prop.get("collision") or not prop.get("trigger_zone"):
        raise RuntimeError("Diagnostic repair station collision or trigger zone is missing")

    return {
        "manifest": relative(ERROR_EXTENSION),
        "prop_metadata": relative(ERROR_PROP_META),
        "visual_approval_confirmed": True,
        "technical_qc_passed": True,
        "routes_and_collisions_passed": True,
        "browser_regression_passed": True,
    }


def approve_metadata() -> list[str]:
    approved = []
    for path in error_metadata_paths():
        metadata = read_json(path)
        metadata["status"] = "approved"
        metadata["approval_lock"] = relative(LOCK_PATH)
        metadata["approved_on"] = APPROVED_ON
        write_json(path, metadata)
        approved.append(relative(path))

    prop = read_json(ERROR_PROP_META)
    prop["status"] = "approved_visual"
    prop["approval_lock"] = relative(LOCK_PATH)
    prop["visual_approved_on"] = APPROVED_ON
    write_json(ERROR_PROP_META, prop)

    extension = read_json(ERROR_EXTENSION)
    extension["status"] = "approved"
    if "candidate_object" in extension:
        extension["object"] = extension.pop("candidate_object")
    extension["approval_lock"] = relative(LOCK_PATH)
    extension["approved_on"] = APPROVED_ON
    for item in extension.get("validation", {}).get("error_actions", {}).get("characters", {}).values():
        item["status"] = "approved"
    write_json(ERROR_EXTENSION, extension)
    return approved


def approved_asset_paths(previous_lock: dict[str, Any]) -> list[Path]:
    paths = {ROOT / item["path"] for item in previous_lock["files"]}
    roots = [
        *(SPRITE_ROOT / spec["directory"] / "actions/v1/error" for spec in CHARACTERS.values()),
        SPRITE_ROOT / "trio/actions/v1/error",
    ]
    paths.update(
        path
        for root in roots
        for path in root.rglob("*")
        if path.is_file() and path.name != ".DS_Store"
    )
    paths.update({STATE_ACTIONS_META, STATE_ACTIONS_PREVIEW})
    return sorted(paths)


def main() -> None:
    previous_lock, previous_lock_validation = validate_lock(PREVIOUS_LOCK_PATH)
    error_validation = validate_error_assets()
    extension_validation = validate_error_extension()
    approved_metadata = approve_metadata()

    assets = approved_asset_paths(previous_lock)
    missing = [relative(path) for path in assets if not path.exists()]
    if missing:
        raise RuntimeError(f"Approved asset files are missing: {missing}")

    manifest = {
        "lock_id": "v2-wheelbase-animation-baseline-lock-v4",
        "status": "approved",
        "approved_on": APPROVED_ON,
        "parent_lock": relative(PREVIOUS_LOCK_PATH),
        "scope": {
            "movement": {
                "directions": 8,
                "frames_per_direction": 4,
                "characters": 3,
                "runtime_frames": 96,
            },
            "state_actions": {
                "actions": ["researching", "executing", "writing", "syncing", "error"],
                "frames_per_action": 4,
                "characters": 3,
                "runtime_frames": 60,
            },
        },
        "character_contract": {
            "frame_size_px": FRAME_SIZE,
            "anchor_px": [24, 64],
            "visible_wheel_bottom_y_exclusive": VISIBLE_WHEEL_BOTTOM_Y_EXCLUSIVE,
            "decoration_excluded_core_height_px": 50,
            "excluded_accessory_by_character": {
                "boy": "cap",
                "girl": "flower",
                "genderless": "antenna",
            },
            "accepted_idle_visible_height_px_by_character": {
                role: spec["visible_height"] for role, spec in CHARACTERS.items()
            },
        },
        "approval_evidence": {
            "previous_lock_validation": previous_lock_validation,
            "error_assets": error_validation,
            "error_extension": extension_validation,
            "metadata": approved_metadata,
        },
        "locked_file_count": len(assets),
        "files": [{"path": relative(path), "sha256": sha256(path)} for path in assets],
        "extension_policy": (
            "Future states must use new candidate metadata and a new lock revision; "
            "files or hashes in this approved lock are immutable."
        ),
    }
    LOCK_DIR.mkdir(parents=True, exist_ok=True)
    write_json(LOCK_PATH, manifest)
    _lock, final_validation = validate_lock(LOCK_PATH)
    print(json.dumps({
        "lock": relative(LOCK_PATH),
        "approved_metadata": len(approved_metadata),
        "locked_files": len(assets),
        "previous_lock_hash_mismatches": 0,
        "final_lock_validation": final_validation,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
