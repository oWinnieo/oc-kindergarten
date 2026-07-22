#!/usr/bin/env python3
"""Build review boards from the final Meadow runtime strips."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
COLORWAY_ROOT = ROOT / "assets/design/sprites/characters/v2/colorways/v1/meadow"
REVIEW_ROOT = COLORWAY_ROOT / "review"
CHARACTERS = {
    "boy": ("ai-agent-child-boy", "boy-child"),
    "girl": ("ai-agent-child-girl", "girl-child"),
    "genderless": ("ai-agent-child-genderless", "genderless-child"),
}
ACTIONS = ("researching", "writing", "executing", "syncing", "error")


def main() -> None:
    REVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    for character, (directory, prefix) in CHARACTERS.items():
        root = COLORWAY_ROOT / directory
        strips = [root / "idle" / f"{prefix}-idle-meadow-v1-strip-48x64.png"]
        strips.extend(
            root / "actions/v1" / action / f"{prefix}-{action}-meadow-v1-strip-48x64.png"
            for action in ACTIONS
        )
        board = Image.new("RGBA", (192, 64 * len(strips)), (0, 0, 0, 0))
        for row, path in enumerate(strips):
            board.alpha_composite(Image.open(path).convert("RGBA"), (0, row * 64))
        board.resize((768, 64 * len(strips) * 4), Image.Resampling.NEAREST).save(
            REVIEW_ROOT / f"{character}-idle-and-actions-review-4x.png"
        )
    print(REVIEW_ROOT.relative_to(ROOT))


if __name__ == "__main__":
    main()
