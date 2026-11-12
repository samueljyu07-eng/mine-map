"""Georeference report Fig 2 (claim map) from the UTM grid lines printed on it.
Run: cd scripts && ../.venv/bin/python georef_fig2.py

Method: find the dotted grid lines (520,000 and 525,000 mE; 3,650,000, 3,655,000 and 3,660,000 mN) to
sub-pixel precision, use their six crossings as control points, and fit an affine transform
(pixel -> UTM) by least squares. Residuals are printed for every control point.
Outputs: data/processed/fig2_georef.json, fig2_overlay_* (whole figure) and fig2_lines_* (main lines only) check overlays for the viewer,
         docs/screens/fig2-georef-check.jpg (figure linework over the NAIP imagery).
"""
import json, datetime
import numpy as np
from PIL import Image
from config import ROOT, W, E, S, N

FIG = ROOT / "data/raw/figures/fig2-claims.png"
img = Image.open(FIG).convert("RGB")
im = np.asarray(img).astype(float)
BG = np.array([255.0, 216.0, 175.0])           # the map's plain background colour
dark = (BG.sum() - im.sum(2)).clip(0)

def line_pos(profile, guess, half=12):
    """Sub-pixel centre of the darkest thin line near `guess`."""
    lo = guess - half; seg = profile[lo:guess + half]
    i = int(np.argmax(seg)); a = max(0, i - 3); w = (seg[a:i + 4] - np.median(seg)).clip(0)
    return lo + float((np.arange(a, a + len(w)) * w).sum() / w.sum())

# Bands of rows/columns where the map background is plain, so only the grid line is dark.
V_BANDS = [(215, 390), (520, 600)]
H_BANDS = {3660000: [(300, 520), (600, 860)], 3655000: [(300, 520), (190, 250)], 3650000: [(600, 860), (640, 700)]}
xs = {e: float(np.mean([line_pos(dark[r0:r1].mean(0), g) for r0, r1 in V_BANDS])) for e, g in ((520000, 274), (525000, 882))}
ys = {n: float(np.mean([line_pos(dark[:, c0:c1].mean(1), g) for c0, c1 in H_BANDS[n]])) for n, g in ((3660000, 205), (3655000, 812), (3650000, 1420))}
print("grid line pixel positions:", {k: round(v, 2) for k, v in xs.items()}, {k: round(v, 2) for k, v in ys.items()})

gcps = [(xs[e], ys[n], e, n) for e in xs for n in ys]
A = np.array([[1, px, py] for px, py, _, _ in gcps])
ce, *_ = np.linalg.lstsq(A, np.array([g[2] for g in gcps], float), rcond=None)
cn, *_ = np.linalg.lstsq(A, np.array([g[3] for g in gcps], float), rcond=None)
to_utm = lambda px, py: (ce[0] + ce[1] * px + ce[2] * py, cn[0] + cn[1] * px + cn[2] * py)
print(f"scale: {np.hypot(ce[1], cn[1]):.3f} m per pixel across, {np.hypot(ce[2], cn[2]):.3f} m per pixel down; "
      f"rotation {np.degrees(np.arctan2(cn[1], ce[1])):+.3f} deg")
print("\nCONTROL POINT RESIDUALS (grid crossings)")
res = []
for px, py, e, n in gcps:
    fe, fn = to_utm(px, py); d = float(np.hypot(fe - e, fn - n))
    res.append({"pixel": [round(px, 2), round(py, 2)], "easting": e, "northing": n, "residual_m": round(d, 2)})
    print(f"  E {e:,}  N {n:,}  at pixel ({px:7.2f}, {py:7.2f})  residual {d:5.2f} m")
rms = float(np.sqrt(np.mean([r["residual_m"] ** 2 for r in res])))
pixel_m = float(np.hypot(ce[1], cn[1]))
print(f"  RMS {rms:.2f} m, worst {max(r['residual_m'] for r in res):.2f} m. One figure pixel = {pixel_m:.1f} m, "
      f"so nothing traced from this figure can be better than about +/- {pixel_m:.0f} m.")

# ---- Warp the figure onto the terrain (inverse map: output pixel -> figure pixel) ----
from PIL import ImageFilter, ImageDraw
M = np.array([[ce[1], ce[2]], [cn[1], cn[2]]]); Minv = np.linalg.inv(M)
def to_pixel(e, n): return Minv @ np.array([e - ce[0], n - cn[0]])

def frame_only(alpha):
    alpha = alpha.copy()
    alpha[:66] = 0; alpha[1643:] = 0; alpha[:, :63] = 0; alpha[:, 1249:] = 0   # outside the map frame
    alpha[1536:, :546] = 0; alpha[1397:, 944:] = 0                               # legend and title block
    return alpha

# Full figure: everything that is not plain background.
full = np.dstack([im, frame_only(np.where(np.abs(im - BG).sum(2) > 70, 255, 0))]).astype("uint8")

# Lines only: keep the thick line features and recolour them so they stand out on the imagery.
# Thin hatching and the thin claim grid are removed with a 3 x 3 "opening" (erode, then grow back).
def opened(mask):
    m = Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    return np.asarray(m) > 0
r_, g_, b_ = im[..., 0], im[..., 1], im[..., 2]
LINE_CLASSES = [  # name, mask, display colour
    ("highway (white road casing; also white label outlines)", (r_ > 238) & (g_ > 238) & (b_ > 238), (255, 225, 77)),
    ("dark lines: access trail, inner outlines, labels", opened(im.sum(2) < 150), (255, 138, 0)),
    ("Gila River", (b_ > 200) & (r_ < 130) & (b_ - r_ > 100), (41, 182, 255)),
    ("property boundary and Christmas Mine pit outline", opened((r_ > 60) & (b_ > 40) & (g_ < 60) & (r_ - g_ > 50)), (255, 61, 242)),
]
lines = np.zeros(im.shape[:2] + (4,), "uint8")
for _, mask, colour in LINE_CLASSES:
    lines[mask] = (*colour, 255)
lines[..., 3] = frame_only(lines[..., 3])

def warp(rgba, w, e, s, n, width, height):
    rx, ry = (e - w) / width, (n - s) / height
    p0 = to_pixel(w + rx / 2, n - ry / 2); dx = Minv @ np.array([rx, 0]); dy = Minv @ np.array([0, -ry])
    return Image.fromarray(rgba, "RGBA").transform((width, height), Image.AFFINE,
                                                   (dx[0], dy[0], p0[0], dx[1], dy[1], p0[1]), resample=Image.BILINEAR)

SIZE = 4096
out = ROOT / "data/processed"
for name, rgba in (("overlay", full), ("lines", lines)):
    warped = warp(rgba, W, E, S, N, SIZE, SIZE)
    for row in range(2):
        for col in range(2):
            warped.crop((col * 2048, row * 2048, (col + 1) * 2048, (row + 1) * 2048)).save(
                out / f"fig2_{name}_r{row}c{col}.webp", "WEBP", quality=80, method=6)

corners = [to_utm(63, 66), to_utm(1249, 66), to_utm(1249, 1643), to_utm(63, 1643)]
meta = {
    "layer": "fig2_georeference", "source": "NI 43-101 Technical Report (effective 2026-06-30), Figure 2: Claim Map, page 19",
    "datum": "WGS84 / UTM Zone 12N (as printed on the figure)", "accuracy": "approximate",
    "method": "affine fit to the six crossings of the UTM grid lines printed on the figure",
    "pixel_to_utm": {"easting": [float(v) for v in ce], "northing": [float(v) for v in cn], "form": "value = c0 + c1*px + c2*py"},
    "control_points": res, "rms_m": round(rms, 2), "pixel_size_m": round(pixel_m, 2),
    "georeferencing_error_m": round(max(rms, pixel_m), 1),
    "map_frame_utm": [[round(a), round(b)] for a, b in corners],
    "verified": False, "processed": datetime.date.today().isoformat(),
}
(out / "fig2_georef.json").write_text(json.dumps(meta, indent=2))
print("map frame covers E %d-%d, N %d-%d" % (corners[0][0], corners[1][0], corners[2][1], corners[0][1]))

# ---- Check pictures: figure lines over the 2025 NAIP imagery ----
import rasterio
from rasterio.windows import from_bounds as win_from_bounds
naip = rasterio.open(sorted((ROOT / "data/raw/naip").glob("*_box_v2_*.tif"))[-1])
def check_panel(title, w, e, s, n, px=900):
    rgb = naip.read(window=win_from_bounds(w, s, e, n, naip.transform), out_shape=(3, px, px))
    base = Image.fromarray(np.moveaxis(rgb, 0, -1)).convert("RGB")
    ov = warp(lines, w, e, s, n, px, px)
    left = base.copy(); right = base.copy(); right.paste(ov, (0, 0), ov)
    sheet = Image.new("RGB", (px * 2 + 12, px + 44), (18, 22, 27))
    sheet.paste(left, (0, 44)); sheet.paste(right, (px + 12, 44))
    d = ImageDraw.Draw(sheet)
    d.text((8, 6), f"{title}   |   left: 2025 aerial imagery only   |   right: same view with Fig 2 lines", fill=(255, 255, 255), font_size=18)
    d.text((8, 26), f"E {w:,}-{e:,}   N {s:,}-{n:,}   ({(e - w) / 1000:.1f} km across)   magenta = boundary/pit, blue = river, yellow = highway, orange = trail and other dark lines",
           fill=(190, 198, 206), font_size=13)
    return sheet
PANELS = [("1 Christmas Mine pit", 522300, 525100, 3656400, 3659200), ("2 Highway 77 and Gila River at the property", 524300, 526300, 3653300, 3655300),
          ("3 Highway 77 through Winkelman", 519800, 522200, 3648900, 3651300), ("4 Access trail, south-east", 525500, 528000, 3649500, 3652000)]
(ROOT / "docs/screens").mkdir(exist_ok=True)
for title, w, e, s, n in PANELS:
    check_panel(title, w, e, s, n).save(ROOT / f"docs/screens/fig2-check-{title[0]}.jpg", quality=88)
whole = warp(lines, W, E, S, N, 2048, 2048)
base = Image.fromarray(np.moveaxis(naip.read(out_shape=(3, 2048, 2048)), 0, -1)).convert("RGB")
base.paste(whole, (0, 0), whole)
base.save(ROOT / "docs/screens/fig2-georef-check.jpg", quality=85)
