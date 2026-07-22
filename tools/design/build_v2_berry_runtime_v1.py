#!/usr/bin/env python3
"""Build the complete pixel-preserving Berry V1 runtime sprite candidate."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from build_v2_berry_samples_v1 import (
    BERRY_ROOT,
    FRAME_COUNT,
    FRAME_SIZE,
    PALETTE_REFERENCE,
    assemble_sheet,
    assemble_strip,
    recolor_frame,
    relative,
    save_gif,
    sha256,
)


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
ACTIONS = ("researching", "writing", "executing", "syncing", "error")
ACTION_DURATIONS = {
    "idle": 220,
    "researching": 220,
    "writing": 200,
    "executing": 180,
    "syncing": 200,
    "error": 240,
}
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
CHARACTERS = {
    "boy": ("ai-agent-child-boy", "boy-child", "colorway-4.png"),
    "girl": ("ai-agent-child-girl", "girl-child", "colorway-5.png"),
    "genderless": (
        "ai-agent-child-genderless",
        "genderless-child",
        "colorway-6.png",
    ),
}


def classic_sequence_paths(character: str, kind: str) -> list[Path]:
    directory, prefix, _ = CHARACTERS[character]
    root = SPRITE_ROOT / directory
    if kind == "idle":
        return [
            root / "idle/frames" / f"{prefix}-idle-wheelbase-v2-{index}-48x64.png"
            for index in range(1, FRAME_COUNT + 1)
        ]
    return [
        root
        / "actions/v1"
        / kind
        / "frames"
        / f"{prefix}-{kind}-wheelbase-v2-{index}-48x64.png"
        for index in range(1, FRAME_COUNT + 1)
    ]


def berry_sequence_paths(character: str, kind: str) -> list[Path]:
    directory, prefix, _ = CHARACTERS[character]
    root = BERRY_ROOT / directory
    output_dir = root / "idle" if kind == "idle" else root / "actions/v1" / kind
    return [
        output_dir / "frames" / f"{prefix}-{kind}-berry-v1-{index}-48x64.png"
        for index in range(1, FRAME_COUNT + 1)
    ]


def berry_sequence_root(character: str, kind: str) -> Path:
    directory, _, _ = CHARACTERS[character]
    root = BERRY_ROOT / directory
    return root / "idle" if kind == "idle" else root / "actions/v1" / kind


def build_sequence(character: str, kind: str) -> tuple[Image.Image, list[Path]]:
    _, prefix, palette_name = CHARACTERS[character]
    sources = classic_sequence_paths(character, kind)
    outputs = berry_sequence_paths(character, kind)
    missing = [path for path in sources if not path.exists()]
    if missing:
        raise RuntimeError(f"Missing classic sources: {[relative(path) for path in missing]}")
    output_dir = berry_sequence_root(character, kind)
    (output_dir / "frames").mkdir(parents=True, exist_ok=True)
    (output_dir / "previews").mkdir(parents=True, exist_ok=True)

    frames: list[Image.Image] = []
    qcs: list[dict] = []
    for source_path, output_path in zip(sources, outputs, strict=True):
        frame, qc = recolor_frame(
            Image.open(source_path),
            character=character,
            protect_side_props=kind == "executing",
        )
        frame.save(output_path)
        frames.append(frame)
        qcs.append(qc)

    strip = assemble_strip(frames)
    sheet = assemble_sheet(frames)
    strip_path = output_dir / f"{prefix}-{kind}-berry-v1-strip-48x64.png"
    sheet_path = output_dir / f"{prefix}-{kind}-berry-v1-2x2-48x64.png"
    preview_path = output_dir / "previews" / f"{prefix}-{kind}-berry-v1-preview-6x.png"
    gif_path = output_dir / "previews" / f"{prefix}-{kind}-berry-v1-preview-6x.gif"
    strip.save(strip_path)
    sheet.save(sheet_path)
    strip.resize((strip.width * 6, strip.height * 6), Image.Resampling.NEAREST).save(
        preview_path
    )
    save_gif(frames, gif_path, ACTION_DURATIONS[kind])

    metadata = {
        "asset": f"{character}_{kind}_berry",
        "revision": "v2-colorway-berry-v1",
        "status": "ready_for_approval",
        "frame_size_px": list(FRAME_SIZE),
        "frame_count": FRAME_COUNT,
        "anchor_px": [24, 64],
        "frame_duration_ms": ACTION_DURATIONS[kind],
        "source_kind": "pixel_preserving_palette_transfer_from_approved_classic",
        "palette_reference": relative(PALETTE_REFERENCE.with_name(palette_name)),
        "semantic_policy": "exact classic action, orientation, props and phase order",
        "reference_frames": [relative(path) for path in sources],
        "frames": [relative(path) for path in outputs],
        "runtime_strip": relative(strip_path),
        "sheet_2x2": relative(sheet_path),
        "qc": qcs,
        "sha256": {
            relative(path): sha256(path)
            for path in [*outputs, strip_path, sheet_path]
        },
    }
    metadata_path = output_dir / f"{prefix}-{kind}-berry-v1-meta.json"
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return strip, [*outputs, strip_path, sheet_path]


def classic_movement_path(character: str, direction: str, index: int) -> Path:
    directory, prefix, _ = CHARACTERS[character]
    return (
        SPRITE_ROOT
        / directory
        / "moving/v1/frames"
        / direction
        / f"{prefix}-move-{direction}-wheelbase-v2-{index}-48x64.png"
    )


def berry_movement_path(character: str, direction: str, index: int) -> Path:
    directory, prefix, _ = CHARACTERS[character]
    return (
        BERRY_ROOT
        / directory
        / "moving/v1/frames"
        / direction
        / f"{prefix}-move-{direction}-berry-v1-{index}-48x64.png"
    )


def build_movement(character: str) -> tuple[Image.Image, list[Path]]:
    directory, prefix, palette_name = CHARACTERS[character]
    output_root = BERRY_ROOT / directory / "moving/v1"
    (output_root / "strips").mkdir(parents=True, exist_ok=True)
    (output_root / "previews").mkdir(parents=True, exist_ok=True)
    frames: dict[str, list[Image.Image]] = {direction: [] for direction in DIRECTIONS}
    qcs: dict[str, list[dict]] = {direction: [] for direction in DIRECTIONS}
    frame_paths: list[Path] = []
    strip_paths: list[Path] = []

    for direction in DIRECTIONS:
        direction_dir = output_root / "frames" / direction
        direction_dir.mkdir(parents=True, exist_ok=True)
        for index in range(1, FRAME_COUNT + 1):
            source_path = classic_movement_path(character, direction, index)
            output_path = berry_movement_path(character, direction, index)
            if not source_path.exists():
                raise RuntimeError(f"Missing classic movement source: {relative(source_path)}")
            frame, qc = recolor_frame(
                Image.open(source_path),
                character=character,
                protect_side_props=False,
                cap_yellow_crown_offset=(
                    10
                    if direction in ("down", "down_left", "down_right")
                    else 7
                    if direction in ("left", "right")
                    else None
                ),
            )
            frame.save(output_path)
            frames[direction].append(frame)
            qcs[direction].append(qc)
            frame_paths.append(output_path)

    atlas = Image.new(
        "RGBA", (FRAME_SIZE[0] * FRAME_COUNT, FRAME_SIZE[1] * len(DIRECTIONS)), (0, 0, 0, 0)
    )
    for row, direction in enumerate(DIRECTIONS):
        strip = assemble_strip(frames[direction])
        strip_path = output_root / "strips" / f"{prefix}-move-{direction}-berry-v1-strip-48x64.png"
        strip.save(strip_path)
        strip_paths.append(strip_path)
        atlas.alpha_composite(strip, (0, row * FRAME_SIZE[1]))
        save_gif(
            frames[direction],
            output_root / "previews" / f"{prefix}-move-{direction}-berry-v1-preview-6x.gif",
            125,
        )

    atlas_path = output_root / f"{prefix}-move-8dir-4frame-berry-v1-48x64.png"
    movement_review = output_root / "previews" / f"{prefix}-move-8dir-4frame-berry-v1-preview-4x.png"
    atlas.save(atlas_path)
    atlas.resize((atlas.width * 4, atlas.height * 4), Image.Resampling.NEAREST).save(
        movement_review
    )
    metadata = {
        "asset": f"{character}_movement_berry",
        "revision": "v2-colorway-berry-v1",
        "status": "ready_for_approval",
        "frame_size_px": list(FRAME_SIZE),
        "frame_duration_ms": 125,
        "anchor_px": [24, 64],
        "direction_order": list(DIRECTIONS),
        "phase_count": FRAME_COUNT,
        "source_kind": "pixel_preserving_palette_transfer_from_approved_classic",
        "palette_reference": relative(PALETTE_REFERENCE.with_name(palette_name)),
        "semantic_policy": "exact classic direction, wheel phase, silhouette and anchor",
        "frames": [relative(path) for path in frame_paths],
        "strips": [relative(path) for path in strip_paths],
        "atlas": relative(atlas_path),
        "qc": qcs,
        "sha256": {
            relative(path): sha256(path)
            for path in [*frame_paths, *strip_paths, atlas_path]
        },
    }
    metadata_path = output_root / f"{prefix}-move-8dir-4frame-berry-v1-meta.json"
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return atlas, [*frame_paths, *strip_paths, atlas_path]


def build_character_review(character: str, strips: list[Image.Image]) -> Path:
    board = Image.new(
        "RGBA", (FRAME_SIZE[0] * FRAME_COUNT, FRAME_SIZE[1] * len(strips)), (0, 0, 0, 0)
    )
    for row, strip in enumerate(strips):
        board.alpha_composite(strip, (0, row * FRAME_SIZE[1]))
    review_root = BERRY_ROOT / "review"
    review_root.mkdir(parents=True, exist_ok=True)
    review_path = review_root / f"{character}-idle-and-actions-review-4x.png"
    board.resize((board.width * 4, board.height * 4), Image.Resampling.NEAREST).save(
        review_path
    )
    return review_path


def write_audit(runtime_files: list[Path], review_paths: list[Path]) -> None:
    audit = {
        "audit_id": "berry-runtime-gap-v1",
        "status": "full_assets_ready_for_approval",
        "runtime_contract_status": "not_exposed",
        "palette_references": {
            character: relative(PALETTE_REFERENCE.with_name(palette_name))
            for character, (_, _, palette_name) in CHARACTERS.items()
        },
        "production_target": {
            "characters": 3,
            "runtime_sheets": 21,
            "runtime_frames": 168,
            "locked_deliverables": 231,
        },
        "production_approved": {
            "runtime_sheets": 0,
            "runtime_frames": 0,
            "locked_deliverables": 0,
        },
        "generated_candidate": {
            "runtime_sheets": 21,
            "runtime_frames": 168,
            "deliverables": len(runtime_files),
            "reviews": [relative(path) for path in review_paths],
        },
        "quality_contract": {
            "alpha": "exact classic bytes",
            "bbox_and_anchor": "exact classic match",
            "non_target_pixels": "unchanged",
            "action_and_direction": "exact classic semantics and phase order",
            "runtime_tinting": False,
        },
        "remaining_gate": [
            "build and check the 231-file Berry approval lock",
            "review all three idle/action boards and three movement atlases",
            "only then add berry to the application appearance contract",
        ],
    }
    (BERRY_ROOT / "asset-audit-v1.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    all_runtime_files: list[Path] = []
    review_paths: list[Path] = []
    for character in CHARACTERS:
        strips: list[Image.Image] = []
        idle_strip, idle_files = build_sequence(character, "idle")
        strips.append(idle_strip)
        all_runtime_files.extend(idle_files)
        for action in ACTIONS:
            action_strip, action_files = build_sequence(character, action)
            strips.append(action_strip)
            all_runtime_files.extend(action_files)
        movement_atlas, movement_files = build_movement(character)
        all_runtime_files.extend(movement_files)
        review_paths.append(build_character_review(character, strips))
        movement_review_path = BERRY_ROOT / "review" / f"{character}-movement-review-4x.png"
        movement_atlas.resize(
            (movement_atlas.width * 4, movement_atlas.height * 4), Image.Resampling.NEAREST
        ).save(movement_review_path)
        review_paths.append(movement_review_path)

    unique_runtime_files = sorted(set(all_runtime_files), key=relative)
    if len(unique_runtime_files) != 231:
        raise RuntimeError(f"Expected 231 Berry deliverables, found {len(unique_runtime_files)}")
    write_audit(unique_runtime_files, review_paths)
    print(f"Built {len(unique_runtime_files)} Berry runtime candidate deliverables")
    for path in review_paths:
        print(relative(path))


if __name__ == "__main__":
    main()
