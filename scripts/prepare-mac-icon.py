#!/usr/bin/env python3
"""Prepare a full-bleed master PNG for macOS Dock / .icns.

macOS app icons (ChatGPT, Claude, Grok, …) use transparent corners with a
continuous rounded-rect (squircle-like) silhouette. A fully opaque square
looks larger and “wrong” next to them.

Content scale < 1 must NOT leave transparent padding around the art — that
renders as a white frame with a floating black rectangle. Instead, fill the
inset ring with the icon’s background color so the tile stays solid dark.

Usage:
  prepare-mac-icon.py INPUT.png OUTPUT.png [--scale 1.0] [--size 1024]
"""

from __future__ import annotations

import argparse
import sys

from PIL import Image, ImageDraw, ImageFilter


def continuous_corner_radius(size: int) -> float:
    """Approximate macOS / iOS app-icon continuous corner radius.

    Apple’s template uses ~22.37% of the side length for the continuous
    corner on a 1024 canvas (~229 px).
    """
    return size * 0.2237


def make_squircle_mask(size: int, radius: float | None = None) -> Image.Image:
    """L-alpha mask: white inside rounded rect, black outside."""
    r = continuous_corner_radius(size) if radius is None else radius
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    # Pillow rounded_rectangle is a good practical match for Dock icons.
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=255)
    # Slight blur → softer AA edge (matches system icons better at small sizes)
    if size >= 128:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=max(0.4, size / 1024.0)))
        # Re-threshold gently so interior stays fully opaque
        mask = mask.point(lambda p: 255 if p > 240 else (0 if p < 16 else p))
    return mask


def sample_background(im: Image.Image) -> tuple[int, int, int, int]:
    """Pick a solid fill for the scale-inset ring (not transparent).

    Prefer near-edge samples that are fully opaque and dark-ish (typical
    app-icon plate). Falls back to average of four corners.
    """
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    # Sample just inside the edge so we skip any anti-aliased corner fringe
    inset = max(2, min(w, h) // 32)
    candidates = [
        px[inset, inset],
        px[w - 1 - inset, inset],
        px[inset, h - 1 - inset],
        px[w - 1 - inset, h - 1 - inset],
        px[w // 2, inset],
        px[w // 2, h - 1 - inset],
        px[inset, h // 2],
        px[w - 1 - inset, h // 2],
    ]
    opaque = [c for c in candidates if c[3] >= 240]
    if not opaque:
        opaque = list(candidates)
    # Median-ish: average RGB of opaque samples, full alpha
    r = sum(c[0] for c in opaque) // len(opaque)
    g = sum(c[1] for c in opaque) // len(opaque)
    b = sum(c[2] for c in opaque) // len(opaque)
    return (r, g, b, 255)


def prepare(
    src: Image.Image,
    size: int = 1024,
    content_scale: float = 1.0,
) -> Image.Image:
    """Fit artwork into the macOS icon window; optional optical inset."""
    im = src.convert("RGBA")

    # Normalize to square canvas first
    if im.size != (size, size):
        im = im.resize((size, size), Image.Resampling.LANCZOS)

    # Optional inset so the glyph weight matches other Dock icons.
    # Fill the ring with the icon plate color — never leave transparent
    # padding (that becomes a white halo / black-rect-on-white look).
    scale = max(0.5, min(1.0, float(content_scale)))
    if scale < 1.0:
        bg = sample_background(im)
        inner = max(1, int(round(size * scale)))
        art = im.resize((inner, inner), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (size, size), bg)
        off = (size - inner) // 2
        canvas.paste(art, (off, off), art)
        im = canvas

    # Multiply artwork alpha by macOS silhouette so square masters get
    # transparent corners (same presentation as Claude/ChatGPT/Grok apps).
    mask = make_squircle_mask(size)
    r, g, b, a = im.split()
    # mask is L; multiply alphas (both 0–255)
    a_mul = Image.composite(a, Image.new("L", (size, size), 0), mask)
    # Also zero RGB outside mask so no fringe on dark docks
    zero = Image.new("L", (size, size), 0)
    r = Image.composite(r, zero, mask)
    g = Image.composite(g, zero, mask)
    b = Image.composite(b, zero, mask)
    return Image.merge("RGBA", (r, g, b, a_mul))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--size", type=int, default=1024)
    p.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help=(
            "Content scale 0.5–1.0 (default 1.0 full-bleed inside mask). "
            "Dock install default is 0.82; inset ring uses icon background color."
        ),
    )
    args = p.parse_args(argv)

    src = Image.open(args.input)
    out = prepare(src, size=args.size, content_scale=args.scale)
    out.save(args.output, format="PNG")

    # Sanity: corners must be transparent
    px = out.load()
    w, h = out.size
    corners = [px[0, 0][3], px[w - 1, 0][3], px[0, h - 1][3], px[w - 1, h - 1][3]]
    if any(a > 8 for a in corners):
        print(f"warn: corners not transparent: {corners}", file=sys.stderr)
        return 1
    # Center should stay dark plate, not empty/white
    cx, cy = w // 2, h // 2
    center = px[cx // 2, cy // 2]  # mid of upper-left quadrant (plate, not red apple)
    print(
        f"prepared {args.output} ({w}x{h}) scale={args.scale} "
        f"corners_a={corners} plate_sample={center}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
