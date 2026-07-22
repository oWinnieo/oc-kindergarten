#!/usr/bin/env python3
"""Assemble approved V2 movement frames into imagegen reference grids."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SPRITE_ROOT = ROOT / "assets/design/sprites/characters/v2"
OUTPUT_ROOT = SPRITE_ROOT / "colorways/v1/meadow/movement-references"
CELL_SIZE = (192, 256)
BACKGROUND = (255, 0, 255, 255)
CHARACTERS = {
    "boy": ("ai-agent-child-boy", "boy-child"),
    "girl": ("ai-agent-child-girl", "girl-child"),
    "genderless": ("ai-agent-child-genderless", "genderless-child"),
}


def frame_path(directory: str, prefix: str, direction: str, index: int) -> Path:
    return (
        SPRITE_ROOT
        / directory
        / "moving/v1/frames"
        / direction
        / f"{prefix}-move-{direction}-wheelbase-v2-{index}-48x64.png"
    )


def build_grid(directory: str, prefix: str, directions: tuple[str, ...], output: Path) -> None:
    sheet = Image.new("RGBA", (CELL_SIZE[0] * 4, CELL_SIZE[1] * len(directions)), BACKGROUND)
    for row, direction in enumerate(directions):
        for column in range(4):
            frame = Image.open(frame_path(directory, prefix, direction, column + 1)).convert("RGBA")
            frame = frame.resize(CELL_SIZE, Image.Resampling.NEAREST)
            sheet.alpha_composite(frame, (column * CELL_SIZE[0], row * CELL_SIZE[1]))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output)


def main() -> None:
    for character, (directory, prefix) in CHARACTERS.items():
        build_grid(
            directory,
            prefix,
            ("down", "left", "right", "up"),
            OUTPUT_ROOT / f"{character}-cardinal-4x4.png",
        )
        build_grid(
            directory,
            prefix,
            ("down_right", "up_right"),
            OUTPUT_ROOT / f"{character}-diagonal-right-2x4.png",
        )
    print(OUTPUT_ROOT.relative_to(ROOT))


if __name__ == "__main__":
    main()
