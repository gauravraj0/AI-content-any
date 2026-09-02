"""Procedural image generation.

The product spec calls for image-generation APIs (DALL-E / SDXL / Imagen).
Those need billable keys, so this service ships a deterministic SVG renderer
with the exact same request/response contract: `generate(prompt, style, ratio)`
returns `{id, url, w, h, prompt, style}` and writes the asset to
``media/images/``. Swap the body of :func:`generate` for a provider call and
nothing else in the app changes (see ``llm.py`` for the same pattern on text).
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

from . import nlp
from .db import DATA_DIR
from .nlp import band, dice

# generated assets live next to the store so STUDIO_DATA_DIR moves the whole runtime
MEDIA_DIR = DATA_DIR / "media" / "images"

PALETTES = {
    "aurora": ["#0b0d1a", "#4c1d95", "#7c3aed", "#22d3ee", "#a7f3d0"],
    "noir": ["#07070a", "#1c1c22", "#5b5b66", "#e8e3d9", "#c9a227"],
    "editorial": ["#f7f4ef", "#111318", "#d9c7a7", "#2f4858", "#bc4b51"],
    "neon": ["#080114", "#ff2e97", "#7c4dff", "#00e5ff", "#faffec"],
    "pastel": ["#fdf6f0", "#ffd5c2", "#c6def1", "#b8e0d2", "#f9e0bb"],
    "terracotta": ["#1d1210", "#c65f3f", "#e6a174", "#f2dcc4", "#3f5e54"],
}
STYLES = list(PALETTES)

RATIOS = {"1:1": (1080, 1080), "4:5": (1080, 1350), "16:9": (1600, 900), "9:16": (1080, 1920), "3:2": (1200, 800)}


def _svg_font(size: int, weight: int = 800) -> str:
    return f'font-family="Sora, Inter, Helvetica, Arial, sans-serif" font-size="{size}" font-weight="{weight}"'


def _wrap(text: str, per_line: int) -> list[str]:
    words, lines, cur = (text or "").split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > per_line:
            if cur:
                lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines[:4]


def generate(prompt: str, style: str = "aurora", ratio: str = "1:1",
             title: str | None = None, seed: str | None = None) -> dict:
    style = style if style in PALETTES else "aurora"
    w, h = RATIOS.get(ratio, RATIOS["1:1"])
    pal = PALETTES[style]
    seed = seed or uuid.uuid4().hex
    topic = nlp.fix_acronyms(nlp.title_case(nlp.topic_of(prompt or title or "", "Untitled")))
    headline = title or topic
    kw = [t["phrase"] for t in nlp.ngrams(prompt or "", (1, 2), 3)]
    light = style in ("editorial", "pastel")
    ink = "#111318" if light else "#f7f8ff"
    sub = "#5b5b66" if light else "rgba(247,248,255,.66)"

    # ---- background: mesh of blurred radial blobs, deterministic from the seed
    blobs = []
    for i in range(6):
        s = f"{seed}|blob{i}"
        cx, cy = int(dice(s, "x") * w), int(dice(s, "y") * h)
        r = int((0.28 + dice(s, "r") * 0.42) * min(w, h))
        color = pal[1 + band(s, 0, len(pal) - 2)]
        op = round(0.32 + dice(s, "o") * 0.4, 2)
        blobs.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}" opacity="{op}"/>')
    grid_step = max(60, min(w, h) // band(seed + "grid", 8, 16))
    grid = "".join(f'<line x1="{x}" y1="0" x2="{x}" y2="{h}"/>' for x in range(0, w, grid_step))
    grid += "".join(f'<line x1="0" y1="{y}" x2="{w}" y2="{y}"/>' for y in range(0, h, grid_step))

    # ---- style-specific geometry
    deco: list[str] = []
    if style == "aurora":
        deco.append(f'<path d="M0 {int(h*.72)} C {int(w*.3)} {int(h*.55)}, {int(w*.7)} {int(h*.95)}, {w} {int(h*.7)}" '
                    f'fill="none" stroke="{pal[3]}" stroke-width="{max(3, w // 220)}" opacity=".85"/>')
        deco.append(f'<path d="M0 {int(h*.80)} C {int(w*.35)} {int(h*.62)}, {int(w*.65)} {int(h*1.0)}, {w} {int(h*.78)}" '
                    f'fill="none" stroke="{pal[2]}" stroke-width="{max(2, w // 300)}" opacity=".5"/>')
    elif style == "noir":
        for i in range(4):
            y = int(h * (0.18 + i * 0.16))
            deco.append(f'<rect x="0" y="{y}" width="{w}" height="{max(2, h // 400)}" fill="{pal[4]}" opacity="{0.65 - i * 0.13:.2f}"/>')
    elif style == "editorial":
        deco.append(f'<circle cx="{int(w*.78)}" cy="{int(h*.26)}" r="{int(min(w,h)*.20)}" fill="{pal[3]}"/>')
        deco.append(f'<rect x="{int(w*.08)}" y="{int(h*.55)}" width="{int(w*.42)}" height="{max(3, h//180)}" fill="{pal[4]}"/>')
    elif style == "neon":
        for i in range(3):
            x = int(w * (0.12 + i * 0.3))
            deco.append(f'<rect x="{x}" y="{int(h*.1)}" width="{max(4, w//160)}" height="{int(h*.8)}" fill="{pal[1+i]}" opacity=".7" transform="rotate({-14 + i*13} {x} {int(h/2)})"/>')
    elif style == "pastel":
        deco.append(f'<rect x="{int(w*.08)}" y="{int(h*.60)}" width="{int(w*.84)}" height="{int(h*.26)}" rx="{int(w*.03)}" fill="#ffffff" opacity=".72"/>')
    elif style == "terracotta":
        deco.append(f'<path d="M{int(w*.1)} {h} Q {int(w*.5)} {int(h*.5)} {int(w*.95)} {h} Z" fill="{pal[2]}" opacity=".8"/>')
        deco.append(f'<circle cx="{int(w*.24)}" cy="{int(h*.3)}" r="{int(min(w,h)*.11)}" fill="{pal[1]}" opacity=".9"/>')

    # ---- typography block
    head_size = int(min(w, h) * (0.085 if w >= h else 0.075))
    lines = _wrap(headline.upper(), 16 if w > 900 else 13)
    ty = int(h * 0.42) if w >= h else int(h * 0.36)
    pad = int(w * 0.08)
    tspans = "".join(
        f'<tspan x="{pad}" y="{ty + i * int(head_size * 1.12)}">{l[:24]}</tspan>' for i, l in enumerate(lines)
    )
    kicker = (f"{style.upper()} · {ratio}" + ("" if not kw else " · " + kw[0]))[:60]
    footer = (", ".join(kw[:3]) if kw else "Nebula Studio")[:70]
    tag_y = ty + len(lines) * int(head_size * 1.12) + int(head_size * 0.55)

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{headline}">
<defs>
<radialGradient id="bg" cx="30%" cy="20%" r="90%">
  <stop offset="0%" stop-color="{pal[0]}"/><stop offset="100%" stop-color="{pal[1]}"/>
</radialGradient>
<filter id="soft"><feGaussianBlur stdDeviation="{max(40, min(w,h)//12)}"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
<feColorMatrix type="saturate" values="0"/></filter>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
  <stop offset="45%" stop-color="{'rgba(255,255,255,0)' if light else 'rgba(6,6,14,0)'}"/>
  <stop offset="100%" stop-color="{'rgba(255,255,255,.55)' if light else 'rgba(6,6,14,.72)'}"/>
</linearGradient>
<clipPath id="clip"><rect width="{w}" height="{h}" rx="{int(min(w,h)*.03)}"/></clipPath>
</defs>
<g clip-path="url(#clip)">
<rect width="{w}" height="{h}" fill="url(#bg)"/>
<g filter="url(#soft)">{"".join(blobs)}</g>
<g stroke="{'rgba(17,19,24,.10)' if light else 'rgba(255,255,255,.07)'}" stroke-width="1">{grid}</g>
{"".join(deco)}
<rect width="{w}" height="{h}" fill="url(#fade)"/>
<rect width="{w}" height="{h}" filter="url(#grain)" opacity="{'.16' if light else '.10'}"/>
<text x="{pad}" y="{int(h*.20)}" fill="{sub}" {_svg_font(max(13, int(head_size*.26)), 600)} letter-spacing="4">{kicker}</text>
<text fill="{ink}" {_svg_font(head_size, 800)} letter-spacing="-1">{tspans}</text>
<line x1="{pad}" y1="{tag_y - int(head_size*.62)}" x2="{pad + int(w*.14)}" y2="{tag_y - int(head_size*.62)}" stroke="{pal[3]}" stroke-width="{max(3, w//300)}"/>
<text x="{pad}" y="{tag_y}" fill="{sub}" {_svg_font(max(12, int(head_size*.24)), 500)}>{footer}</text>
<text x="{w - pad}" y="{int(h*.94)}" text-anchor="end" fill="{sub}" {_svg_font(max(11, int(head_size*.2)), 500)}>NEBULA STUDIO</text>
</g></svg>'''
    svg = re.sub(r"\n{2,}", "\n", svg)

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    asset_id = "img_" + uuid.uuid4().hex[:10]
    MEDIA_DIR.joinpath(f"{asset_id}.svg").write_text(svg)
    return {"id": asset_id, "url": f"/media/images/{asset_id}.svg", "width": w, "height": h,
            "ratio": ratio, "style": style, "prompt": prompt, "palette": pal,
            "bytes": len(svg.encode()), "alt": headline}
