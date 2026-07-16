#!/usr/bin/env python3
"""Approve and hash-lock the accepted V2 movement/state-action baseline."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
RUNTIME_MANIFEST = (
    ROOT
    / "assets/design/maps/classroom-corner/runtime/v1/classroom-corner-runtime-v1.json"
)
LOCK_DIR = SPRITE_ROOT / "approved"
LOCK_PATH = LOCK_DIR / "v2-wheelbase-animation-baseline-lock-v1.json"

CHARACTERS = {
    "boy": ("ai-agent-child-boy", "boy-child"),
    "girl": ("ai-agent-child-girl", "girl-child"),
    "genderless": ("ai-agent-child-genderless", "genderless-child"),
}
APPROVED_ACTIONS = ("researching", "executing")


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def metadata_paths() -> list[Path]:
    paths: list[Path] = []
    for directory, prefix in CHARACTERS.values():
        paths.append(
            SPRITE_ROOT
            / directory
            / "moving/v1"
            / f"{prefix}-move-8dir-4frame-wheelbase-v2-meta.json"
        )
        for action in APPROVED_ACTIONS:
            paths.append(
                SPRITE_ROOT
                / directory
                / "actions/v1"
                / action
                / f"{prefix}-{action}-4frame-wheelbase-v2-meta.json"
            )
    paths.extend(
        [
            SPRITE_ROOT
            / "trio/moving/v1/kindergarten-ai-agent-trio-move-8dir-v2-meta.json",
            SPRITE_ROOT
            / "trio/actions/v1/researching/kindergarten-ai-agent-trio-researching-v2-meta.json",
            SPRITE_ROOT
            / "trio/actions/v1/executing/kindergarten-ai-agent-trio-executing-v2-meta.json",
            SPRITE_ROOT
            / "trio/actions/v1/kindergarten-ai-agent-trio-state-actions-v1-meta.json",
        ]
    )
    return paths


def verify_technical_qc(path: Path, metadata: dict) -> None:
    qc = metadata.get("qc", {})
    if qc.get("technical_qc_passed") is False or qc.get("passed") is False:
        raise RuntimeError(f"Technical QC failed: {relative(path)}")
    if metadata.get("technical_qc_passed") is False:
        raise RuntimeError(f"Technical QC failed: {relative(path)}")


def approve_metadata() -> list[str]:
    approved: list[str] = []
    for path in metadata_paths():
        metadata = json.loads(path.read_text(encoding="utf-8"))
        if metadata.get("status") not in {"visual_approval_candidate", "approved"}:
            raise RuntimeError(
                f"Unexpected approval status {metadata.get('status')!r}: {relative(path)}"
            )
        verify_technical_qc(path, metadata)
        metadata["status"] = "approved"
        path.write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        approved.append(relative(path))
    return approved


def approved_asset_paths() -> list[Path]:
    roots: list[Path] = []
    for directory, _prefix in CHARACTERS.values():
        roots.append(SPRITE_ROOT / directory / "moving/v1")
        roots.extend(
            SPRITE_ROOT / directory / "actions/v1" / action
            for action in APPROVED_ACTIONS
        )
    roots.extend(
        [
            SPRITE_ROOT / "trio/moving/v1",
            SPRITE_ROOT / "trio/actions/v1/researching",
            SPRITE_ROOT / "trio/actions/v1/executing",
        ]
    )
    paths = {
        path
        for root in roots
        for path in root.rglob("*")
        if path.is_file() and path.name != ".DS_Store"
    }
    paths.update(
        {
            SPRITE_ROOT
            / "trio/actions/v1/kindergarten-ai-agent-trio-state-actions-v1-meta.json",
            SPRITE_ROOT
            / "trio/actions/v1/kindergarten-ai-agent-trio-state-actions-v1-preview-6x.png",
            SPRITE_ROOT
            / "trio/actions/v1/kindergarten-ai-agent-trio-state-actions-body-size-guide-8x.png",
        }
    )
    return sorted(paths)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    runtime = json.loads(RUNTIME_MANIFEST.read_text(encoding="utf-8"))
    matching = runtime.get("matching_validation", {})
    if runtime.get("status") != "approved_runtime_baseline" or not matching.get(
        "passed"
    ):
        raise RuntimeError("Classroom runtime baseline has not passed validation")
    rear_occlusion = (
        matching.get("state_actions", {})
        .get("genderless_executing_rear_occlusion", {})
    )
    if not rear_occlusion.get("passed"):
        raise RuntimeError("Genderless executing rear-occlusion validation is missing")

    approved_metadata = approve_metadata()
    assets = approved_asset_paths()
    missing = [relative(path) for path in assets if not path.exists()]
    if missing:
        raise RuntimeError(f"Approved asset files are missing: {missing}")

    LOCK_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "lock_id": "v2-wheelbase-animation-baseline-lock-v1",
        "status": "approved",
        "approved_on": "2026-07-16",
        "scope": {
            "movement": {
                "directions": 8,
                "frames_per_direction": 4,
                "characters": 3,
                "runtime_frames": 96,
            },
            "state_actions": {
                "actions": list(APPROVED_ACTIONS),
                "frames_per_action": 4,
                "characters": 3,
                "runtime_frames": 24,
            },
        },
        "character_contract": {
            "frame_size_px": [48, 64],
            "anchor_px": [24, 64],
            "visible_wheel_bottom_y_exclusive": 62,
            "decoration_excluded_core_height_px": 50,
            "excluded_accessory_by_character": {
                "boy": "cap",
                "girl": "flower",
                "genderless": "antenna",
            },
            "accepted_idle_visible_height_px_by_character": {
                "boy": 55,
                "girl": 51,
                "genderless": 58,
            },
        },
        "approval_evidence": {
            "runtime_manifest": relative(RUNTIME_MANIFEST),
            "runtime_matching_validation_passed": True,
            "genderless_executing_rear_occlusion_passed": True,
            "metadata": approved_metadata,
        },
        "locked_file_count": len(assets),
        "files": [
            {"path": relative(path), "sha256": sha256(path)} for path in assets
        ],
        "extension_policy": (
            "New states such as writing must use new candidate metadata and must not "
            "modify files or hashes in this approved lock."
        ),
    }
    LOCK_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "lock": relative(LOCK_PATH),
                "approved_metadata": len(approved_metadata),
                "locked_files": len(assets),
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
