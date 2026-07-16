#!/usr/bin/env python3
"""Normalize generated syncing sheets into the locked 48x64 V2 runtime contract."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
APPROVED_LOCK = (
    SPRITE_ROOT / "approved/v2-wheelbase-animation-baseline-lock-v2.json"
)
FRAME_SIZE = (48, 64)
VISIBLE_BOTTOM_Y_EXCLUSIVE = 62
FRAME_DURATION_MS = 200
PHASES = ("sync_ready", "card_read", "confirm_tap", "sync_settle")

CHARACTERS = {
    "boy": {
        "directory": "ai-agent-child-boy",
        "prefix": "boy-child",
        "visible_height": 55,
        "excluded_accessory": "cap",
    },
    "girl": {
        "directory": "ai-agent-child-girl",
        "prefix": "girl-child",
        "visible_height": 51,
        "excluded_accessory": "flower",
    },
    "genderless": {
        "directory": "ai-agent-child-genderless",
        "prefix": "genderless-child",
        "visible_height": 58,
        "excluded_accessory": "antenna",
    },
}


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_approved_lock() -> dict:
    lock = json.loads(APPROVED_LOCK.read_text(encoding="utf-8"))
    mismatches = []
    for item in lock["files"]:
        path = ROOT / item["path"]
        if not path.exists() or sha256(path) != item["sha256"]:
            mismatches.append(item["path"])
    if mismatches:
        raise RuntimeError(f"Approved V2 baseline changed: {mismatches[:10]}")
    return {
        "lock": relative(APPROVED_LOCK),
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
    np.divide(
        data[:, :, :3] * 255.0,
        out_alpha,
        out=out_rgb,
        where=out_alpha > 0,
    )
    result = np.concatenate((np.clip(out_rgb, 0, 255), out_alpha), axis=2).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def normalize_frame(source: Path, visible_height: int) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError(f"Transparent source frame: {relative(source)}")
    subject = image.crop(bbox)
    width = max(1, round(subject.width * visible_height / subject.height))
    if width > 46:
        width = 46
    subject = resize_premultiplied(subject, (width, visible_height))
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
    cleaned_bbox = subject.getchannel("A").getbbox()
    if cleaned_bbox is None:
        raise RuntimeError(f"Chroma cleanup removed source frame: {relative(source)}")
    subject = subject.crop(cleaned_bbox)
    if subject.height != visible_height:
        repaired_width = max(1, round(subject.width * visible_height / subject.height))
        subject = subject.resize(
            (min(46, repaired_width), visible_height),
            Image.Resampling.NEAREST,
        )

    canvas = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    x = (FRAME_SIZE[0] - subject.width) // 2
    y = VISIBLE_BOTTOM_Y_EXCLUSIVE - subject.height
    canvas.alpha_composite(subject, (x, y))

    output_bbox = canvas.getchannel("A").getbbox()
    if output_bbox is None:
        raise RuntimeError(f"Normalized frame is transparent: {relative(source)}")
    if output_bbox[3] != VISIBLE_BOTTOM_Y_EXCLUSIVE:
        raise RuntimeError(f"Wheel baseline mismatch: {relative(source)} {output_bbox}")
    if output_bbox[3] - output_bbox[1] != visible_height:
        raise RuntimeError(f"Visible height mismatch: {relative(source)} {output_bbox}")
    if output_bbox[0] <= 0 or output_bbox[2] >= FRAME_SIZE[0]:
        raise RuntimeError(f"Frame touches horizontal safety edge: {relative(source)}")
    return canvas


def frame_qc(image: Image.Image) -> dict:
    data = np.asarray(image)
    visible = data[:, :, 3] > 0
    bbox = image.getchannel("A").getbbox()
    assert bbox is not None
    magenta = (
        visible
        & (data[:, :, 0] > 180)
        & (data[:, :, 2] > 180)
        & (data[:, :, 1] < 100)
    )
    return {
        "size_px": list(image.size),
        "bbox": list(bbox),
        "visible_width_px": bbox[2] - bbox[0],
        "visible_height_px": bbox[3] - bbox[1],
        "wheel_bottom_y_exclusive": bbox[3],
        "visible_magenta_pixels": int(magenta.sum()),
        "touches_edge": bool(
            bbox[0] <= 0
            or bbox[1] <= 0
            or bbox[2] >= FRAME_SIZE[0]
            or bbox[3] >= FRAME_SIZE[1]
        ),
    }


def save_gif(frames: list[Image.Image], path: Path, scale: int = 1) -> None:
    output = frames
    if scale != 1:
        output = [
            frame.resize(
                (frame.width * scale, frame.height * scale),
                Image.Resampling.NEAREST,
            )
            for frame in frames
        ]
    output[0].save(
        path,
        format="GIF",
        save_all=True,
        append_images=output[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )


def build_character(role: str, spec: dict) -> tuple[list[Image.Image], dict]:
    action_dir = SPRITE_ROOT / spec["directory"] / "actions/v1/syncing"
    processor_dir = action_dir / "processor"
    frames_dir = action_dir / "frames"
    previews_dir = action_dir / "previews"
    frames_dir.mkdir(parents=True, exist_ok=True)
    previews_dir.mkdir(parents=True, exist_ok=True)

    frames = []
    output_paths = []
    for index in range(1, 5):
        source = processor_dir / f"syncing-{index}.png"
        frame = normalize_frame(source, spec["visible_height"])
        output = (
            frames_dir
            / f"{spec['prefix']}-syncing-wheelbase-v2-{index}-48x64.png"
        )
        frame.save(output)
        frames.append(frame)
        output_paths.append(output)

    strip = Image.new("RGBA", (FRAME_SIZE[0] * 4, FRAME_SIZE[1]), (0, 0, 0, 0))
    sheet = Image.new("RGBA", (FRAME_SIZE[0] * 2, FRAME_SIZE[1] * 2), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE[0], 0))
        sheet.alpha_composite(
            frame,
            ((index % 2) * FRAME_SIZE[0], (index // 2) * FRAME_SIZE[1]),
        )

    strip_path = action_dir / f"{spec['prefix']}-syncing-4frame-wheelbase-v2-strip-48x64.png"
    sheet_path = action_dir / f"{spec['prefix']}-syncing-4frame-wheelbase-v2-2x2-48x64.png"
    gif_path = previews_dir / f"{spec['prefix']}-syncing-wheelbase-v2-48x64.gif"
    preview_gif = previews_dir / f"{spec['prefix']}-syncing-wheelbase-v2-preview-6x.gif"
    preview_png = previews_dir / f"{spec['prefix']}-syncing-wheelbase-v2-preview-6x.png"
    strip.save(strip_path)
    sheet.save(sheet_path)
    save_gif(frames, gif_path)
    save_gif(frames, preview_gif, scale=6)
    frames[0].resize((288, 384), Image.Resampling.NEAREST).save(preview_png)

    arrays = [np.asarray(frame) for frame in frames]
    adjacent_changes = [
        int(np.any(arrays[index] != arrays[(index + 1) % 4], axis=2).sum())
        for index in range(4)
    ]
    qcs = [frame_qc(frame) for frame in frames]
    if any(item["visible_magenta_pixels"] or item["touches_edge"] for item in qcs):
        raise RuntimeError(f"Syncing frame QC failed for {role}: {qcs}")
    if len({sha256(path) for path in output_paths}) != 4:
        raise RuntimeError(f"Syncing frames are not distinct for {role}")

    source_prompt = (
        action_dir
        / "source"
        / f"{spec['prefix']}-syncing-wheelbase-v2-magenta-raw.prompt.txt"
    )
    metadata_path = action_dir / f"{spec['prefix']}-syncing-4frame-wheelbase-v2-meta.json"
    metadata = {
        "asset": f"{role}_child_syncing",
        "revision": "v2-wheelbase-syncing-v1",
        "status": "visual_approval_candidate",
        "action": "syncing",
        "semantic": "confirm_shared_message_card",
        "orientation": "down_front",
        "frames": 4,
        "frame_duration_ms": FRAME_DURATION_MS,
        "frame_phases": list(PHASES),
        "runtime_frame_px": list(FRAME_SIZE),
        "anchor_px": [24, 64],
        "visible_wheel_bottom_y_exclusive": VISIBLE_BOTTOM_Y_EXCLUSIVE,
        "accepted_idle_visible_height_px": spec["visible_height"],
        "decoration_excluded_core_height_px": 50,
        "excluded_accessory": spec["excluded_accessory"],
        "source_raw": relative(
            action_dir
            / "source"
            / f"{spec['prefix']}-syncing-wheelbase-v2-magenta-raw.png"
        ),
        "source_prompt": relative(source_prompt),
        "processor_metadata": relative(processor_dir / "pipeline-meta.json"),
        "runtime_frames": [relative(path) for path in output_paths],
        "strip": relative(strip_path),
        "sheet_2x2": relative(sheet_path),
        "preview_gif": relative(preview_gif),
        "qc": {
            "frames": qcs,
            "adjacent_changed_pixels_including_wrap": adjacent_changes,
            "all_frames_distinct": True,
            "approved_baseline_unchanged": True,
            "technical_qc_passed": True,
        },
    }
    metadata_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return frames, metadata


def build_trio(character_frames: dict[str, list[Image.Image]]) -> None:
    trio_dir = SPRITE_ROOT / "trio/actions/v1/syncing"
    previews = trio_dir / "previews"
    previews.mkdir(parents=True, exist_ok=True)
    trio_frames = []
    for phase in range(4):
        frame = Image.new("RGBA", (48 * 3, 64), (0, 0, 0, 0))
        for index, role in enumerate(CHARACTERS):
            frame.alpha_composite(character_frames[role][phase], (index * 48, 0))
        trio_frames.append(frame)
    preview_png = previews / "kindergarten-ai-agent-trio-syncing-v2-preview-6x.png"
    preview_gif = previews / "kindergarten-ai-agent-trio-syncing-v2-preview-6x.gif"
    trio_frames[0].resize((864, 384), Image.Resampling.NEAREST).save(preview_png)
    save_gif(trio_frames, preview_gif, scale=6)

    metadata = {
        "asset": "kindergarten_ai_agent_trio_syncing",
        "revision": "v2-wheelbase-syncing-v1",
        "status": "visual_approval_candidate",
        "action": "syncing",
        "characters": list(CHARACTERS),
        "frames": 4,
        "frame_duration_ms": FRAME_DURATION_MS,
        "preview_gif": relative(preview_gif),
        "character_metadata": {
            role: relative(
                SPRITE_ROOT
                / spec["directory"]
                / "actions/v1/syncing"
                / f"{spec['prefix']}-syncing-4frame-wheelbase-v2-meta.json"
            )
            for role, spec in CHARACTERS.items()
        },
        "technical_qc_passed": True,
    }
    (trio_dir / "kindergarten-ai-agent-trio-syncing-v2-meta.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def build_state_action_preview(character_frames: dict[str, list[Image.Image]]) -> None:
    action_root = SPRITE_ROOT / "trio/actions/v1"
    actions = ("researching", "executing", "writing", "syncing")
    prefixes = {role: spec["prefix"] for role, spec in CHARACTERS.items()}
    rows = []
    for action in actions:
        row = []
        for role, spec in CHARACTERS.items():
            if action == "syncing":
                row.append(character_frames[role][0])
            else:
                row.append(
                    Image.open(
                        SPRITE_ROOT
                        / spec["directory"]
                        / "actions/v1"
                        / action
                        / "frames"
                        / f"{prefixes[role]}-{action}-wheelbase-v2-1-48x64.png"
                    ).convert("RGBA")
                )
        rows.append(row)

    preview = Image.new("RGBA", (48 * 3, 64 * 4), (0, 0, 0, 0))
    for row_index, row in enumerate(rows):
        for column, frame in enumerate(row):
            preview.alpha_composite(frame, (column * 48, row_index * 64))
    preview_path = action_root / "kindergarten-ai-agent-trio-state-actions-v3-preview-6x.png"
    preview.resize((864, 1536), Image.Resampling.NEAREST).save(preview_path)

    metadata = {
        "asset": "kindergarten_ai_agent_trio_state_actions",
        "revision": "v2-wheelbase-state-actions-v3",
        "status": "visual_approval_candidate",
        "actions": list(actions),
        "characters": list(CHARACTERS),
        "runtime_frame_px": list(FRAME_SIZE),
        "anchor_px": [24, 64],
        "visible_wheel_bottom_y_exclusive": VISIBLE_BOTTOM_Y_EXCLUSIVE,
        "decoration_excluded_core_height_px": 50,
        "preview": relative(preview_path),
        "approved_baseline": relative(APPROVED_LOCK),
        "approved_baseline_unchanged": True,
        "technical_qc_passed": True,
    }
    (action_root / "kindergarten-ai-agent-trio-state-actions-v3-meta.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    baseline_validation = validate_approved_lock()
    character_frames = {}
    for role, spec in CHARACTERS.items():
        frames, _metadata = build_character(role, spec)
        character_frames[role] = frames
    build_trio(character_frames)
    build_state_action_preview(character_frames)
    print(
        json.dumps(
            {
                "status": "visual_approval_candidate",
                "characters": list(CHARACTERS),
                "runtime_frames": 12,
                "approved_baseline": baseline_validation,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
