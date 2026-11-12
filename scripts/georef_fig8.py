"""Georeference report Fig 8 and trace ONLY the survey footprint and the labelled flight lines.
Run: cd scripts && ../.venv/bin/python georef_fig8.py

The resistivity colours are NOT exported or displayed. They are used here only to find where the coloured grid ends.
Control points: the two printed grid crossings (525,000 mE with 3,655,000 and 3,660,000 mN) plus the seven
"Historical Drill Sites" symbols, whose coordinates are known from report Table 3 (collars.csv).
Fit: similarity transform (one scale, one rotation, one shift).
Outputs: data/processed/fig8_georef.json, fig8_traced.geojson, docs/screens/fig8-trace-qa.jpg (greyscale figure + tracing).
"""
import json, csv, datetime
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from rasterio import features
from rasterio.transform import Affine
from shapely.geometry import shape, mapping, Polygon, LineString, Point
from shapely.ops import unary_union, transform as shp_transform
from pyproj import Transformer
from config import ROOT

OUT = ROOT / "data/processed"
SRC = "NI 43-101 Technical Report (effective 2026-06-30), Figure 8: Resistivity Depth Slice with Permitted Drill Sites, page 33"
img = Image.open(ROOT / "data/raw/figures/fig8-resistivity.png").convert("RGB")
im = np.asarray(img).astype(float); H_, W_ = im.shape[:2]
lum = im.sum(2) / 3
thin_v = (ndi.median_filter(lum, size=(1, 9)) - lum) > 35       # thin dark vertical features (grid line, flight lines)
thin_h = (ndi.median_filter(lum, size=(9, 1)) - lum) > 35

def centre(profile, guess, half=8):
    seg = profile[guess - half:guess + half + 1].astype(float); w = (seg - np.median(seg)).clip(0)
    return guess - half + float((np.arange(len(seg)) * w).sum() / w.sum())
x525 = centre(thin_v[100:1600].sum(0), 671)
y3660 = centre(thin_h[:, 250:1120].sum(1), 128)
y3655 = centre(thin_h[:, 250:1120].sum(1), 996)
scale0 = 5000 / (y3655 - y3660)
print(f"grid lines: 525,000 mE at x = {x525:.2f}; 3,660,000 mN at y = {y3660:.2f}; 3,655,000 mN at y = {y3655:.2f}; first-guess scale {scale0:.3f} m per pixel")

# ---- Flight lines (11 labelled lines, L1150 in the west to L1250 in the east) ----
def columns(r0, r1, thr):
    prof = thin_v[r0:r1].sum(0); out = []; x = 740
    while x < 1140:
        if prof[x] > thr:
            j = x
            while prof[j] > thr: j += 1
            seg = prof[x:j]; out.append(float((np.arange(x, j) * seg).sum() / seg.sum())); x = j
        else: x += 1
    return out
top, bottom = columns(100, 400, 200), columns(1300, 1600, 200)
assert len(top) == 11 and len(bottom) == 11, (len(top), len(bottom))
flight_cols = [(t + b) / 2 for t, b in zip(top, bottom)]
is_line = np.zeros(W_, bool)
for c in flight_cols: is_line[int(c) - 3:int(c) + 5] = True

# ---- Drill-site symbols: dark ring pixels near where each collar should be ----
dark = (lum < 70) & ~is_line[None, :]
green = (im[..., 1] > 190) & (im[..., 0] < 90) & (im[..., 2] < 100)
gcps = [("grid 525,000 E / 3,660,000 N", x525, y3660, 525000.0, 3660000.0), ("grid 525,000 E / 3,655,000 N", x525, y3655, 525000.0, 3655000.0)]
for r in csv.DictReader(open(ROOT / "data/raw/collars.csv")):
    e, n = float(r["easting"]), float(r["northing"])
    cx, cy = x525 + (e - 525000) / scale0, y3655 + (3655000 - n) / scale0
    used = "green fill"
    for mask in (green, dark):                                    # prefer the symbol's green fill; fall back to its dark ring
        px, py = cx, cy
        for _ in range(3):                                        # recentre on the symbol
            yy, xx = np.mgrid[int(py) - 13:int(py) + 14, int(px) - 13:int(px) + 14]
            m = mask[yy, xx] & (np.hypot(xx - px, yy - py) < 11)
            if m.sum() < 25: break
            px, py = float(xx[m].mean()), float(yy[m].mean())
        if m.sum() >= 25: break
        used = "dark ring (symbol partly covered)"
    if m.sum() >= 25: gcps.append((f"drill site symbol {r['hole_id']} ({used})", px, py, e, n))
    else: print(f"  no symbol found for {r['hole_id']} (not used as a control point)")

# ---- Similarity fit: E = a*px + b*py + c ; N = b*px - a*py + d ----
A, y = [], []
for _, px, py, e, n in gcps:
    A += [[px, py, 1, 0], [-py, px, 0, 1]]; y += [e, n]
a, b, c, d = np.linalg.lstsq(np.array(A), np.array(y), rcond=None)[0]
to_utm = lambda px, py: (a * px + b * py + c, b * px - a * py + d)
PIX = float(np.hypot(a, b))
print(f"fit: {PIX:.3f} m per pixel, rotation {np.degrees(np.arctan2(b, a)):+.3f} deg\n\nCONTROL POINT RESIDUALS")
res = []
for name, px, py, e, n in gcps:
    fe, fn = to_utm(px, py); dist = float(np.hypot(fe - e, fn - n))
    res.append({"name": name, "pixel": [round(px, 1), round(py, 1)], "easting": e, "northing": n, "residual_m": round(dist, 1)})
    print(f"  {name:<58} residual {dist:5.1f} m")
rms = float(np.sqrt(np.mean([r["residual_m"] ** 2 for r in res])))
ERR = round(max(rms, PIX), 1)
print(f"  RMS {rms:.1f} m, worst {max(r['residual_m'] for r in res):.1f} m; one figure pixel = {PIX:.1f} m")
AFF = Affine(a, b, c - 0.5 * a - 0.5 * b, b, -a, d - 0.5 * b + 0.5 * a)

# ---- Independent check: the figure's highway (white casing) against the public TIGER road line ----
ll_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32612", always_xy=True).transform
roads = unary_union([shp_transform(ll_to_utm, shape(f["geometry"]))
                     for f in json.loads((ROOT / "data/raw/public_vectors/tiger_secondary_roads.geojson").read_text())["features"]
                     if f["properties"].get("NAME") == "State Rte 77"])
white = (im.min(2) > 225); white[:, :370] = False; white[:540, :330] = False; white[:340, 330:760] = False   # skip legend, title block, blank area
for x0, y0, x1, y1 in ((740, 845, 1025, 905), (735, 1205, 1015, 1305), (405, 390, 625, 465), (1125, 100, 1250, 330), (1125, 980, 1250, 1010)):
    white[y0:y1, x0:x1] = False                                # lettering with white fill
lab, n_ = ndi.label(white); sizes = ndi.sum(white, lab, range(1, n_ + 1))
road_px = np.isin(lab, [i + 1 for i in range(n_) if 150 < sizes[i] < 30000])
ys, xs = np.nonzero(road_px)
dd = np.array([roads.distance(Point(to_utm(x, y_))) for x, y_ in zip(xs[::5], ys[::5])])
dd = dd[dd < 400]                                               # ignore white pixels that are not the highway (trail casing etc.)
chk = {"median_m": round(float(np.median(dd)), 1), "p90_m": round(float(np.percentile(dd, 90)), 1)} if len(dd) > 50 else None
print(f"independent check: figure highway vs TIGER State Route 77: {chk} ({len(dd)} pixels)")

# ---- Footprint: where the coloured grid is visible ----
sat = (im.max(2) - im.min(2)) > 60
frame = np.zeros((H_, W_), bool); frame[67:1669, 63:1248] = True
frame[66:368, 62:184] = False; frame[368:535, 62:322] = False; frame[1396:, 62:367] = False     # legend boxes and title block
grid = ndi.binary_fill_holes(ndi.binary_closing(sat & frame, structure=np.ones((5, 5)))) & frame
grid = ndi.binary_opening(grid, structure=np.ones((11, 11)))      # drop thin coloured lines (property outline, river) that stick out past the grid
lab, n_ = ndi.label(grid); sizes = ndi.sum(grid, lab, range(1, n_ + 1)); grid = lab == (np.argmax(sizes) + 1)
polys = [shape(s) for s, v in features.shapes(grid.astype("uint8"), mask=grid, transform=AFF) if v == 1]
foot = Polygon(max(polys, key=lambda p: p.area).exterior).simplify(1.5 * PIX)
hull = foot.convex_hull
top_n = to_utm(0, 67)[1]
print(f"\nFOOTPRINT (coloured grid visible in Fig 8): {foot.area / 1e6:.1f} km2; its convex hull: {hull.area / 1e6:.1f} km2")
print(f"  The colours run to the top of the map frame (N {top_n:,.0f}), so the grid is cut off by the frame there.")
print(f"  Report text: 52 km2 survey area, 312 line-km at 200 m spacing.")

# ---- Flight lines ----
names = [f"L{n}" for n in range(1150, 1260, 10)]
rows = np.nonzero(thin_v[:, int(flight_cols[5]) - 2:int(flight_cols[5]) + 4].any(1))[0]
r_top, r_bot = int(rows.min()), int(rows.max())
lines = []
for name, xt, xb in zip(names, top, bottom):
    slope = (xb - xt) / (1450 - 250)                             # x drift per row, measured between the two sample bands
    p0, p1 = to_utm(xt + slope * (r_top - 250), r_top), to_utm(xt + slope * (r_bot - 250), r_bot)
    lines.append((name, LineString([p0, p1])))
spacing = np.diff([l.centroid.x for _, l in lines])
print(f"\nFLIGHT LINES: {len(lines)} lines {names[0]}-{names[-1]}, E {lines[0][1].centroid.x:,.0f} to {lines[-1][1].centroid.x:,.0f}, "
      f"mean spacing {spacing.mean():.0f} m (min {spacing.min():.0f}, max {spacing.max():.0f}), length shown {lines[0][1].length / 1000:.1f} km each")

label = "approximate, traced from report Fig 8"
feats = [{"type": "Feature", "geometry": mapping(foot),
          "properties": {"kind": "ztem_footprint", "name": "Approximate ZTEM survey footprint (extent of the grid shown in report Fig 8)", "label": label,
                         "accuracy": "approximate", "georeferencing_error_m": ERR, "source": SRC, "area_km2": round(foot.area / 1e6, 1),
                         "note": "Extent of the coloured grid visible on the figure. Cut off by the map frame in the north; partly hidden by the legend and title block."}}]
for name, ln in lines:
    feats.append({"type": "Feature", "geometry": mapping(ln),
                  "properties": {"kind": "ztem_flight_line", "name": name, "label": f"select lines shown in report Fig 8; {label}", "accuracy": "approximate",
                                 "georeferencing_error_m": ERR, "source": SRC}})
today = datetime.date.today().isoformat()
(OUT / "fig8_traced.geojson").write_text(json.dumps({"type": "FeatureCollection", "metadata": {
    "layer": "fig8_traced", "crs": "WGS84 / UTM Zone 12N (EPSG:32612)", "date": "survey July 2023 (Geotech); report effective 2026-06-30; traced " + today,
    "georeferencing_error_m": ERR, "footprint_area_km2": round(foot.area / 1e6, 1), "footprint_hull_km2": round(hull.area / 1e6, 1),
    "report_stated_area_km2": 52, "verified": False, "note": "Resistivity colours are deliberately not included.", "processed": today}, "features": feats}))
(OUT / "fig8_georef.json").write_text(json.dumps({
    "layer": "fig8_georeference", "source": SRC, "datum": "WGS84 / UTM Zone 12N (as printed on the figure)", "accuracy": "approximate",
    "method": "similarity fit to 2 printed grid crossings and the historical drill site symbols (coordinates from report Table 3)",
    "pixel_to_utm": {"a": float(a), "b": float(b), "c": float(c), "d": float(d), "form": "E = a*px + b*py + c ; N = b*px - a*py + d"},
    "control_points": res, "rms_m": round(rms, 1), "pixel_size_m": round(PIX, 2), "georeferencing_error_m": ERR,
    "independent_check_highway_vs_tiger": chk, "verified": False, "processed": today}, indent=2))

# ---- QA picture: greyscale figure (no resistivity colours) with the tracing ----
Minv = np.linalg.inv(np.array([[a, b], [b, -a]]))
P = lambda coords: [tuple(2 * v + 1 for v in (Minv @ np.array([x - c, y_ - d]))) for x, y_ in coords]
qa = img.convert("L").convert("RGB").resize((W_ * 2, H_ * 2), Image.LANCZOS); dr = ImageDraw.Draw(qa)
dr.line(P(foot.exterior.coords), fill=(255, 0, 0), width=4)
for name, ln in lines: dr.line(P(ln.coords), fill=(0, 200, 255), width=2)
for r in res:
    x, y_ = 2 * r["pixel"][0] + 1, 2 * r["pixel"][1] + 1; dr.ellipse((x - 14, y_ - 14, x + 14, y_ + 14), outline=(255, 220, 0), width=3)
qa.save(ROOT / "docs/screens/fig8-trace-qa.jpg", quality=85)
