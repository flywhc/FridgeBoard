#!/usr/bin/env python3
"""Build a review-only widget frame from the active navigation shell image."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend/public/assets/theme/navigation-shell-bottom-v5-slice.webp"
OUTPUT = ROOT / "artifacts/widget-frame-step1.png"
PREVIEW = ROOT / "artifacts/widget-frame-step1-checkerboard.png"

# This rectangle contains the shell itself. The right and bottom portions also
# contain directional shadow, so the clean top-left material is mirrored below.
SHELL_BOUNDS = (30, 26, 1835, 339)
CORNER_RADIUS = 145


def antialiased_rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    """Return a high-resolution rounded mask reduced with antialiasing."""
    scale = 4
    mask = Image.new("L", (size[0] * scale, size[1] * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, size[0] * scale - 1, size[1] * scale - 1),
        radius=radius * scale,
        fill=255,
    )
    return mask.resize(size, Image.Resampling.LANCZOS)


def checkerboard(size: tuple[int, int], cell: int = 24) -> Image.Image:
    """Return a neutral checkerboard used only to preview transparent pixels."""
    image = Image.new("RGBA", size, (225, 225, 225, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(194, 194, 194, 255))
    return image


def remove_directional_shadow(frame: Image.Image) -> Image.Image:
    """Replace the shadowed right/bottom sides with mirrored source pixels."""
    width, height = frame.size
    left_width = (width + 1) // 2
    left = frame.crop((0, 0, left_width, height))
    horizontal = Image.new("RGBA", frame.size)
    horizontal.paste(left, (0, 0))
    horizontal.paste(
        left.transpose(Image.Transpose.FLIP_LEFT_RIGHT).crop((width % 2, 0, left_width, height)),
        (left_width, 0),
    )

    top_height = (height + 1) // 2
    top = horizontal.crop((0, 0, width, top_height))
    result = Image.new("RGBA", frame.size)
    result.paste(top, (0, 0))
    result.paste(
        top.transpose(Image.Transpose.FLIP_TOP_BOTTOM).crop((0, height % 2, width, top_height)),
        (0, top_height),
    )
    return result


def main() -> None:
    """Write the transparent frame and its checkerboard review image."""
    source = Image.open(SOURCE).convert("RGBA")
    frame = remove_directional_shadow(source.crop(SHELL_BOUNDS))
    frame.putalpha(antialiased_rounded_mask(frame.size, CORNER_RADIUS))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame.save(OUTPUT)

    margin = 48
    review = checkerboard((frame.width + margin * 2, frame.height + margin * 2))
    review.alpha_composite(frame, (margin, margin))
    review.save(PREVIEW)


if __name__ == "__main__":
    main()
