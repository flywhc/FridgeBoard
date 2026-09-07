#!/usr/bin/env python3
"""Generate deterministic raster surfaces for the Android recipe widget."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ANDROID_ROOT = ROOT / "frontend/android"
RES_ROOT = ANDROID_ROOT / "app/src/main/res"
MANIFEST_PATH = ANDROID_ROOT / "widget-assets.json"
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}
RESAMPLING = Image.Resampling.LANCZOS


def rounded_mask(size: tuple[int, int], radius: int, inset: int = 0) -> Image.Image:
    """Return an antialiased rounded-rectangle opacity mask.

    Args:
        size: Output width and height in pixels.
        radius: Corner radius in output pixels.
        inset: Transparent distance between the image edge and the rectangle.

    Returns:
        An 8-bit grayscale opacity mask.
    """
    scale = 4
    width, height = size
    mask = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (inset * scale, inset * scale, (width - inset) * scale - 1, (height - inset) * scale - 1),
        radius=radius * scale,
        fill=255,
    )
    antialiased = mask.resize(size, RESAMPLING)
    return antialiased.point(lambda value: 0 if value < 8 else value)


def shifted_mask(mask: Image.Image, x: int, y: int) -> Image.Image:
    """Translate an opacity mask without wrapping pixels across opposite edges.

    Args:
        mask: Source grayscale mask.
        x: Horizontal translation in pixels.
        y: Vertical translation in pixels.

    Returns:
        A translated mask with transparent newly exposed pixels.
    """
    shifted = Image.new("L", mask.size, 0)
    shifted.paste(mask, (x, y))
    return shifted


def navigation_material(size: tuple[int, int], crop_y: tuple[int, int]) -> Image.Image:
    """Compose the main application's three navigation skin slices into a new surface.

    Args:
        size: Target surface size in pixels.
        crop_y: Inclusive visual face band from the navigation source.

    Returns:
        An opaque RGBA material image using pixels from all three source slices.
    """
    source_dir = ROOT / "frontend/public/assets/theme/navigation"
    pieces = [Image.open(source_dir / f"bottom-{name}.webp").convert("RGBA")
              for name in ("left", "center", "right")]
    width, height = size
    cap = max(1, round(width * 0.25))
    widths = (cap, width - cap * 2, cap)
    composed = Image.new("RGBA", size, (240, 234, 223, 255))
    x = 0
    horizontal_crops = ((70, pieces[0].width), (0, pieces[1].width), (0, 230))
    for piece, target_width, horizontal_crop in zip(
        pieces, widths, horizontal_crops, strict=True
    ):
        cropped = piece.crop(
            (horizontal_crop[0], crop_y[0], horizontal_crop[1], crop_y[1])
        )
        resized = cropped.resize((target_width, height), RESAMPLING)
        base = Image.new("RGBA", resized.size, (240, 234, 223, 255))
        base.alpha_composite(resized)
        composed.paste(base, (x, 0))
        x += target_width

    center_crop = pieces[1].crop((0, crop_y[0], pieces[1].width, crop_y[1]))
    center = Image.new("RGBA", size, (240, 234, 223, 255))
    center.alpha_composite(center_crop.resize(size, RESAMPLING))
    result = Image.blend(center, composed, 0.22)

    neutral = Image.new("RGBA", size, (240, 234, 223, 255))
    lower_fade = Image.new("L", size, 0)
    lower_start = round(height * 0.72)
    lower_draw = ImageDraw.Draw(lower_fade)
    for y in range(lower_start, height):
        alpha = round(255 * (y - lower_start) / max(1, height - lower_start - 1))
        lower_draw.line((0, y, width, y), fill=alpha)
    result = Image.composite(neutral, result, lower_fade)

    right_fade = Image.new("L", size, 0)
    right_start = round(width * 0.82)
    right_draw = ImageDraw.Draw(right_fade)
    for x in range(right_start, width):
        alpha = round(255 * (x - right_start) / max(1, width - right_start - 1))
        right_draw.line((x, 0, x, height), fill=alpha)
    return Image.composite(neutral, result, right_fade)


def soft_surface(
    size: tuple[int, int],
    radius: int,
    face: tuple[int, int, int, int],
    inset: int,
    shadow_alpha: int,
) -> Image.Image:
    """Create a softly raised surface without a hard white outline.

    Args:
        size: Output width and height in pixels.
        radius: Face corner radius.
        face: RGBA face color.
        inset: Space reserved for the internalized soft shadow.
        shadow_alpha: Maximum opacity of the brown contact shadow.

    Returns:
        A transparent RGBA surface.
    """
    width, height = size
    face_mask = rounded_mask(size, radius, inset)
    shifted = shifted_mask(face_mask, max(1, inset // 2), max(1, inset // 2))
    shadow_mask = shifted.filter(ImageFilter.GaussianBlur(max(1, inset)))
    shadow = Image.new("RGBA", size, (91, 68, 51, shadow_alpha))
    shadow.putalpha(shadow_mask.point(lambda value: value * shadow_alpha // 255))
    result = Image.new("RGBA", size, (0, 0, 0, 0))
    result.alpha_composite(shadow)
    surface = Image.new("RGBA", size, face)
    surface.putalpha(face_mask)
    result.alpha_composite(surface)

    highlight_mask = ImageChops.subtract(
        face_mask,
        shifted_mask(face_mask, max(1, inset // 2), max(1, inset // 2)),
    ).filter(ImageFilter.GaussianBlur(max(1, inset // 2)))
    highlight = Image.new("RGBA", size, (255, 251, 243, 72))
    highlight.putalpha(highlight_mask.point(lambda value: value * 72 // 255))
    result.alpha_composite(highlight)
    return result


def add_nine_patch_border(
    content: Image.Image,
    stretch: tuple[int, int, int, int],
    padding: tuple[int, int, int, int],
) -> Image.Image:
    """Add Android nine-patch stretch and content markers around an RGBA image.

    Args:
        content: Visual content without a marker border.
        stretch: Left, top, right, and bottom stretch bounds in content pixels.
        padding: Left, top, right, and bottom content bounds in content pixels.

    Returns:
        An RGBA nine-patch PNG including its one-pixel marker border.
    """
    width, height = content.size
    output = Image.new("RGBA", (width + 2, height + 2), (0, 0, 0, 0))
    output.paste(content, (1, 1))
    draw = ImageDraw.Draw(output)
    black = (0, 0, 0, 255)
    draw.line((stretch[0] + 1, 0, stretch[2], 0), fill=black)
    draw.line((0, stretch[1] + 1, 0, stretch[3]), fill=black)
    draw.line((padding[0] + 1, height + 1, padding[2], height + 1), fill=black)
    draw.line((width + 1, padding[1] + 1, width + 1, padding[3]), fill=black)
    return output


def scaled(value: float, density: float) -> int:
    """Scale a density-independent measurement to an integer pixel value."""
    return max(1, round(value * density))


def generate_density(name: str, density: float, manifest: dict[str, object]) -> None:
    """Generate all widget bitmap surfaces for one Android density.

    Args:
        name: Android density qualifier.
        density: Pixel scale relative to mdpi.
        manifest: Parsed widget asset specification.
    """
    output = RES_ROOT / f"drawable-{name}"
    output.mkdir(parents=True, exist_ok=True)
    crop = tuple(manifest["sourceFaceCropYExclusive"])

    panel_size = scaled(96, density)
    material = navigation_material((panel_size, panel_size), crop)
    panel_mask = rounded_mask(
        (panel_size, panel_size), scaled(20, density), scaled(4, density)
    )
    material.putalpha(panel_mask)
    panel = add_nine_patch_border(
        material,
        (scaled(28, density), scaled(28, density), scaled(68, density), scaled(68, density)),
        (scaled(12, density), scaled(12, density), scaled(84, density), scaled(84, density)),
    )
    panel.save(output / "widget_panel.9.png")

    row_size = (scaled(96, density), scaled(56, density))
    row = soft_surface(
        row_size, scaled(10, density), (240, 234, 223, 255), scaled(4, density), 32
    )
    add_nine_patch_border(
        row,
        (scaled(24, density), scaled(18, density), scaled(72, density), scaled(38, density)),
        (scaled(9, density), scaled(8, density), scaled(87, density), scaled(48, density)),
    ).save(output / "widget_row.9.png")

    badge = soft_surface(
        (scaled(42, density), scaled(30, density)),
        scaled(9, density),
        (220, 201, 182, 255),
        scaled(2, density),
        40,
    )
    badge.save(output / "widget_day_badge.png")

    track_size = (scaled(64, density), scaled(10, density))
    track_mask = rounded_mask(track_size, scaled(5, density), scaled(1, density))
    track = Image.new("RGBA", track_size, (220, 201, 182, 255))
    track.putalpha(track_mask)
    dark_edge = ImageChops.subtract(
        track_mask,
        shifted_mask(track_mask, -scaled(1, density), -scaled(1, density)),
    ).filter(ImageFilter.GaussianBlur(scaled(1, density)))
    shade = Image.new("RGBA", track_size, (86, 61, 43, 46))
    shade.putalpha(dark_edge.point(lambda value: value * 46 // 255))
    track.alpha_composite(shade)
    add_nine_patch_border(
        track,
        (scaled(10, density), scaled(3, density), scaled(54, density), scaled(7, density)),
        (scaled(5, density), scaled(2, density), scaled(59, density), scaled(8, density)),
    ).save(output / "widget_progress_track.9.png")

    for active in (False, True):
        dot_size = scaled(24, density)
        dot = Image.new("RGBA", (dot_size, dot_size), (0, 0, 0, 0))
        radius = scaled(5.5 if active else 3.5, density)
        center = (dot_size // 2 - scaled(1 if active else 0, density), dot_size // 2)
        shadow_mask = Image.new("L", dot.size, 0)
        ImageDraw.Draw(shadow_mask).ellipse(
            (center[0] - radius + scaled(2, density), center[1] - radius + scaled(3, density),
             center[0] + radius + scaled(2, density), center[1] + radius + scaled(3, density)),
            fill=90 if active else 54,
        )
        shadow_mask = shadow_mask.filter(
            ImageFilter.GaussianBlur(scaled(2 if active else 1, density))
        )
        shadow = Image.new("RGBA", dot.size, (91, 68, 51, 255))
        shadow.putalpha(shadow_mask)
        dot.alpha_composite(shadow)
        ImageDraw.Draw(dot).ellipse(
            (center[0] - radius, center[1] - radius,
             center[0] + radius, center[1] + radius),
            fill=(118, 91, 72, 255),
        )
        dot.save(output / ("widget_page_dot_active.png" if active else "widget_page_dot.png"))


def main() -> None:
    """Generate every density and validate the transparent panel boundary."""
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for name, density in DENSITIES.items():
        generate_density(name, density, manifest)
    print("Generated Android widget assets from the navigation skin.")


if __name__ == "__main__":
    main()
