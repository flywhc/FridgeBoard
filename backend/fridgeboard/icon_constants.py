"""Shared limits and allowlists for icon assets and providers."""

from __future__ import annotations

ONLINE_HOSTS = {
    "api.iconify.design": "iconify",
    "icon-sets.iconify.design": "iconify",
    "www.thiings.co": "thiings",
    "thiings.co": "thiings",
    "lftz25oez4aqbxpq.public.blob.vercel-storage.com": "thiings",
}
MAX_ICON_BYTES = 10 * 1024 * 1024
MAX_ICON_PIXELS = 16_000_000
SVG_HUSH_BINARY = "svg-hush"
SVG_HUSH_TIMEOUT_SECONDS = 10
SVG_NAMESPACE = "http://www.w3.org/2000/svg"
SVG_MAX_BYTES = 64_000
SVG_MAX_ICONIFY_BYTES = 256_000
SVG_MAX_NODES = 256
SVG_MAX_ICONIFY_NODES = 512
