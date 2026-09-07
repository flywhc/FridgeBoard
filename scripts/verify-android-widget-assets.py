#!/usr/bin/env python3
"""Verify Android widget bitmap transparency and nine-patch boundaries."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
REQUIRED_BITMAPS = (
    "widget_panel.9.png",
    "widget_row.9.png",
    "widget_progress_track.9.png",
    "widget_day_badge.png",
    "widget_page_dot.png",
    "widget_page_dot_active.png",
)


def is_outside_rounded_panel(x: int, y: int, size: int, density: float) -> bool:
    """Return whether a content pixel is safely outside the antialiased panel shape."""
    inset = round(4 * density)
    radius = round(20 * density)
    left = inset
    top = inset
    right = size - inset - 1
    bottom = size - inset - 1
    if left <= x <= right and top + radius <= y <= bottom - radius:
        return False
    if top <= y <= bottom and left + radius <= x <= right - radius:
        return False
    center_x = min(max(x, left + radius), right - radius)
    center_y = min(max(y, top + radius), bottom - radius)
    return math.hypot(x - center_x, y - center_y) > radius + 2.5


def verify_sources() -> None:
    """Verify the visual mother assets still match the reviewed source bytes."""
    manifest = json.loads(
        (ROOT / "frontend/android/widget-assets.json").read_text(encoding="utf-8")
    )
    expected = manifest["panelSourceSha256"]
    for source in manifest["panelSources"]:
        path = ROOT / source
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == expected[path.name], (path, digest, expected[path.name])


def verify_panel(path: Path, density: float) -> None:
    """Verify one panel has transparent corners and no bottom/right outer shadow.

    Args:
        path: Nine-patch panel path.
        density: Pixel scale relative to mdpi.

    Raises:
        AssertionError: If dimensions or boundary Alpha violate the asset contract.
    """
    image = Image.open(path).convert("RGBA")
    expected = round(96 * density) + 2
    assert image.size == (expected, expected), (path, image.size, expected)
    width, height = image.size
    samples = (
        (1, 1),
        (width - 2, 1),
        (1, height - 2),
        (width - 2, height - 2),
        (width // 2, height - 2),
        (width - 2, height // 2),
    )
    for point in samples:
        assert image.getpixel(point)[3] == 0, (path, point, image.getpixel(point))
    content_size = width - 2
    for y in range(content_size):
        for x in range(content_size):
            if is_outside_rounded_panel(x, y, content_size, density):
                assert image.getpixel((x + 1, y + 1))[3] == 0, (path, x, y)
    assert image.getpixel((width // 2, height // 2))[3] >= 250, path
    inner_edge = round(4 * density) + 3
    for point in ((width // 2, height - inner_edge),
                  (width - inner_edge, height // 2)):
        pixel = image.getpixel(point)
        assert pixel[3] >= 220 and sum(pixel[:3]) >= 600, (path, point, pixel)


def main() -> None:
    """Verify all generated density variants."""
    verify_sources()
    resource_root = ROOT / "frontend/android/app/src/main/res"
    for name, density in DENSITIES.items():
        density_root = resource_root / f"drawable-{name}"
        for filename in REQUIRED_BITMAPS:
            assert (density_root / filename).is_file(), density_root / filename
        verify_panel(density_root / "widget_panel.9.png", density)
    drawable = resource_root / "drawable"
    for filename in ("widget_refresh.xml", "widget_pot.xml", "widget_pot_done.xml"):
        assert (drawable / filename).is_file(), drawable / filename
    print("Android widget bitmap Alpha and boundary checks passed.")


if __name__ == "__main__":
    main()
