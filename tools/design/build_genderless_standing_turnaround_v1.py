#!/usr/bin/env python3
"""Build a local four-view standing turnaround from approved character pixels."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
CHAR_DIR = ROOT / "assets/design/sprites/characters/ai-agent-child-genderless"
OUTPUT_DIR = CHAR_DIR / "turnaround/v1"
FRAMES_DIR = OUTPUT_DIR / "frames"
PREVIEWS_DIR = OUTPUT_DIR / "previews"

FRAME_SIZE = (48, 64)
ORDER = ("front", "back", "left", "right")
SOURCES = {
    "front": CHAR_DIR / "walking/v3/frames/down/walk-down-2.png",
    "back": CHAR_DIR / "walking/v3/frames/up/walk-up-2.png",
    "left": CHAR_DIR / "walking/v3/frames/left/walk-left-2.png",
    "right": CHAR_DIR / "walking/v3/frames/right/walk-right-2.png",
}

SHEET = OUTPUT_DIR / "genderless-child-standing-turnaround-4view-48x64.png"
PREVIEW = PREVIEWS_DIR / "genderless-child-standing-turnaround-4view-preview-6x.png"
META = OUTPUT_DIR / "genderless-child-standing-turnaround-4view-meta.json"


def frame_qc(frame: Image.Image) -> dict:
    pixels = np.asarray(frame.convert("RGBA"))
    visible = pixels[:, :, 3] > 0
    magenta = (
        visible
        & (pixels[:, :, 0] > 180)
        & (pixels[:, :, 2] > 180)
        & (pixels[:, :, 1] < 100)
    )
    bbox = frame.getbbox() or (0, 0, 0, 0)
    return {
        "size_px": list(frame.size),
        "bbox": list(bbox),
        "visible_magenta_pixels": int(magenta.sum()),
        "touches_edge": (
            bbox[0] <= 0
            or bbox[1] <= 0
            or bbox[2] >= FRAME_SIZE[0]
            or bbox[3] >= FRAME_SIZE[1]
        ),
    }


def main() -> None:
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

    frames: dict[str, Image.Image] = {}
    qc: dict[str, dict] = {}
    for direction in ORDER:
        frame = Image.open(SOURCES[direction]).convert("RGBA")
        if frame.size != FRAME_SIZE:
            raise RuntimeError(f"{direction} frame is {frame.size}, expected {FRAME_SIZE}")
        frames[direction] = frame
        qc[direction] = frame_qc(frame)
        frame.save(FRAMES_DIR / f"genderless-child-standing-{direction}-48x64.png")

    if any(item["visible_magenta_pixels"] for item in qc.values()):
        raise RuntimeError("Visible magenta remains in a turnaround frame")
    if any(item["touches_edge"] for item in qc.values()):
        raise RuntimeError("A turnaround frame touches its 48x64 boundary")

    sheet = Image.new("RGBA", (FRAME_SIZE[0] * len(ORDER), FRAME_SIZE[1]), (0, 0, 0, 0))
    for index, direction in enumerate(ORDER):
        sheet.alpha_composite(frames[direction], (index * FRAME_SIZE[0], 0))
    sheet.save(SHEET)

    cell_size = (64, 80)
    preview = Image.new(
        "RGBA",
        (cell_size[0] * len(ORDER), cell_size[1]),
        (224, 238, 240, 255),
    )
    for index, direction in enumerate(ORDER):
        preview.alpha_composite(frames[direction], (index * cell_size[0] + 8, 8))
    preview.resize(
        (preview.width * 6, preview.height * 6), Image.Resampling.NEAREST
    ).save(PREVIEW)

    metadata = {
        "character_id": "ai-agent-child-genderless",
        "asset": "standing_turnaround",
        "revision": "v1",
        "status": "visual_approval_candidate",
        "reference_concept": (
            "assets/design/concepts/kindergarten-ai-agent-trio/"
            "kindergarten-ai-agent-trio-concept-v2-terminal.png"
        ),
        "frame_size_px": list(FRAME_SIZE),
        "order": list(ORDER),
        "sources": {
            direction: str(path.relative_to(ROOT)) for direction, path in SOURCES.items()
        },
        "frames": {
            direction: str(
                (
                    FRAMES_DIR
                    / f"genderless-child-standing-{direction}-48x64.png"
                ).relative_to(ROOT)
            )
            for direction in ORDER
        },
        "sheet": str(SHEET.relative_to(ROOT)),
        "preview": str(PREVIEW.relative_to(ROOT)),
        "qc": qc,
    }
    META.write_text(
        json.dumps(metadata, ensure_ascii=True, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "sheet": str(SHEET.relative_to(ROOT)),
                "preview": str(PREVIEW.relative_to(ROOT)),
                "frames": len(ORDER),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
