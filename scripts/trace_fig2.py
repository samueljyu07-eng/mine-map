"""Trace features from report Fig 2 into GeoJSON (UTM 12N), and add public reference lines.
Run: cd scripts && ../.venv/bin/python trace_fig2.py

Traced from the figure (all "approximate, traced from report Fig 2"):
  property boundary, Christmas Mine pit outline, the two hatched zones, access trail dashes, Hayden smelter symbol.
From public sources instead of the figure (preferred where available):
  Gila River (USGS NHD), State Route 77 (US Census TIGER), San Carlos Reservation boundary (US Census TIGER).
Outputs: data/processed/fig2_traced.geojson, docs/screens/fig2-trace-qa.jpg (tracing drawn back on the figure).
"""
import json, datetime
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from rasterio import features
from rasterio.transform import Affine
from shapely.geometry import shape, mapping, Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union, transform as shp_transform
from pyproj import Transformer
from config import ROOT, W, E, S, N

OUT = ROOT / "data/processed"
geo = json.loads((OUT / "fig2_georef.json").read_text())
ce, cn = geo["pixel_to_utm"]["easting"], geo["pixel_to_utm"]["northing"]
ERR = geo["georeferencing_error_m"]
# pixel centre (px, py) -> UTM; polygons from rasterio use pixel corners, hence the half-pixel shift
AFF = Affine(ce[1], ce[2], ce[0] - 0.5 * ce[1] - 0.5 * ce[2], cn[1], cn[2], cn[0] - 0.5 * cn[1] - 0.5 * cn[2])
to_utm = lambda px, py: (ce[0] + ce[1] * px + ce[2] * py, cn[0] + cn[1] * px + cn[2] * py)
Minv = np.linalg.inv(np.array([[ce[1], ce[2]], [cn[1], cn[2]]]))
to_px = lambda e, n: tuple(Minv @ np.array([e - ce[0], n - cn[0]]))
PIX = geo["pixel_size_m"]

img = Image.open(ROOT / "data/raw/figures/fig2-claims.png").convert("RGB")
im = np.asarray(img).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
H_, W_ = r.shape
inframe = np.zeros((H_, W_), bool); inframe[68:1641, 65:1247] = True
inframe[1534:, :548] = False; inframe[1395:, 942:] = False            # legend and title block
# Lettering and symbols printed on the map (figure pixels: x0, y0, x1, y1). Kept out of the line tracing.
LABELS = [(630, 835, 830, 920), (730, 380, 905, 440), (185, 1092, 360, 1124), (440, 1250, 485, 1305), (1010, 410, 1070, 505),
          (1212, 640, 1245, 925), (250, 66, 290, 175), (865, 66, 900, 175), (66, 188, 190, 218), (66, 797, 190, 825),
          (66, 1405, 190, 1433), (1165, 180, 1215, 355), (715, 1435, 835, 1515), (722, 440, 748, 468), (166, 1070, 194, 1098)]
nolabel = np.ones((H_, W_), bool)
for x0, y0, x1, y1 in LABELS: nolabel[y0:y1, x0:x1] = False

LABEL = "approximate, traced from report Fig 2"
feats = []
def add(geom, kind, name, **extra):
    feats.append({"type": "Feature", "geometry": mapping(geom),
                  "properties": {"kind": kind, "name": name, "label": LABEL, "accuracy": "approximate",
                                 "georeferencing_error_m": ERR, "source": geo["source"], **extra}})

def polygons(mask, min_area_m2=0):
    out = [shape(s) for s, v in features.shapes(mask.astype("uint8"), mask=mask, transform=AFF, connectivity=4) if v == 1]
    return [p for p in out if p.area >= min_area_m2]

# ---------- (a) property boundary and (c) pit outline ----------
# The boundary is a thick purple line; where it crosses the green hatching it prints nearly black.
purple = (r > 60) & (r < 200) & (g < 80) & (b > 40) & (r - g > 50)
cand = (purple | (im.max(2) < 125)) & inframe
# Thick lines have many candidate pixels in any 5 x 5 window; 1 px hatching and claim-grid lines do not.
thick = ndi.binary_closing(cand & (ndi.uniform_filter(cand.astype(float), size=5) > 0.42), structure=np.ones((3, 3)))
lab, n = ndi.label(thick, structure=np.ones((3, 3)))
sizes = ndi.sum(thick, lab, range(1, n + 1))
line = np.isin(lab, [i + 1 for i in range(n) if sizes[i] > 60])            # boundary pieces (drops single trail dashes)

# Other symbols cross the boundary and leave breaks of up to ~14 pixels. Bridge them along straight lines only
# (closing with thin line-shaped elements in 8 directions), which does not round off corners.
def line_element(length, angle_deg):
    k = np.zeros((length, length), bool); c = (length - 1) / 2; t = np.radians(angle_deg)
    for u in np.linspace(-c, c, 4 * length):
        k[int(round(c - u * np.sin(t))), int(round(c + u * np.cos(t)))] = True
    return k
barrier = line.copy()
for ang in np.arange(0, 180, 22.5):
    barrier |= ndi.binary_closing(line, structure=line_element(19, ang))
regions, _ = ndi.label(~barrier)
def region_at(px, py, name):
    """The area enclosed by the line around a known inside point (figure pixel)."""
    assert regions[py, px] != 0, f"{name}: seed point sits on a line"
    m = regions == regions[py, px]
    assert not m[75, 75], f"{name}: the outline is not closed (fill leaked to the map edge)"
    return ndi.binary_fill_holes(m)
prop_mask = region_at(700, 950, "property")       # just below the "Hot Breccia Property" lettering
pit_mask = region_at(700, 455, "pit")

def outline(mask, name):
    grown = ndi.binary_dilation(mask, iterations=4)                # from the inner edge of the drawn line to about its centre
    p = max(polygons(grown), key=lambda q: q.area)
    p = Polygon(p.exterior).simplify(0.75 * PIX)
    print(f"{name}: {len(p.exterior.coords)} vertices, area {p.area / 1e6:.2f} km2, centroid E {p.centroid.x:.0f} N {p.centroid.y:.0f}")
    return p
prop = outline(prop_mask, "property boundary")
pit = outline(pit_mask, "Christmas Mine pit outline")
add(prop, "property_boundary", "Hot Breccia property boundary", traced_area_km2=round(prop.area / 1e6, 2),
    note="Outline of the thick purple line on Fig 2, including the inlet on the east side. Detail of the inlet near E 526,300-526,500, "
         "N 3,653,500-3,653,700 is ambiguous at figure resolution (up to about 100 m).")
add(pit, "pit_outline", "Christmas Mine pit extent")

# ---------- (b) hatched zones ----------
med = np.dstack([ndi.median_filter(im[..., k], size=5) for k in range(3)]).astype(int)
mr, mg, mb = med[..., 0], med[..., 1], med[..., 2]
def zone(mask, kind, name):
    m = ndi.binary_closing(mask & inframe, structure=np.ones((5, 5)), iterations=2)
    m = ndi.binary_opening(m, structure=np.ones((3, 3)), iterations=2)
    m = ndi.binary_fill_holes(m)
    polys = [p.buffer(0).simplify(0.75 * PIX) for p in polygons(m, min_area_m2=15000)]
    mp = unary_union(polys)
    print(f"{name}: {len(polys)} patches, total {mp.area / 1e6:.2f} km2")
    add(mp, kind, name)
    return mp
zone((mb - mg > 5) & (mr > 200) & (mg < 205), "zone_state_private", "Claims overlapping State or Private lands")
zone((mg - mr > 8) & (mg - mb > 40), "zone_legacy_placer_tunnel", "Claims overlapping legacy Placer or Tunnel claims")

# ---------- (d) access trail: each printed dash becomes a short segment ----------
dark = thick & ~ndi.binary_dilation(line, iterations=1)                   # what is left: the printed dashes
dl, dn = ndi.label(dark, structure=np.ones((3, 3)))
segs = []
for i, sl in enumerate(ndi.find_objects(dl), start=1):
    ys, xs = np.nonzero(dl[sl] == i)
    if not (8 <= len(xs) <= 300): continue
    pts = np.column_stack([xs + sl[1].start, ys + sl[0].start]).astype(float)
    c = pts.mean(0); u, s_, vt = np.linalg.svd(pts - c, full_matrices=False)
    length = 2 * np.abs((pts - c) @ vt[0]).max(); width = 2 * np.abs((pts - c) @ vt[1]).max() + 1
    if length < 5 or length / width < 1.5: continue                 # dashes are elongated; dots and blobs are not
    a, b_ = c - vt[0] * length / 2, c + vt[0] * length / 2
    segs.append(LineString([to_utm(*a), to_utm(*b_)]))
# Keep only dashes that belong to a run (at least two other dashes within 250 m); isolated ones are stray marks.
mids = np.array([[sg.centroid.x, sg.centroid.y] for sg in segs])
near = (np.hypot(mids[:, None, 0] - mids[None, :, 0], mids[:, None, 1] - mids[None, :, 1]) < 250).sum(1) - 1
segs = [sg for sg, k in zip(segs, near) if k >= 2]
trail = unary_union(segs)
print(f"access trail: {len(segs)} dashes, {sum(s.length for s in segs) / 1000:.1f} km of dash length")
add(trail, "access_trail", "Access trail (as dashed on the figure)", note="Each printed dash is one segment; gaps between dashes are not filled in.")

# ---------- (f) Hayden smelter symbol ----------
ys, xs = np.nonzero((r + g + b < 250)[1070:1098, 166:194])
hs = to_utm(xs.mean() + 166, ys.mean() + 1070)
add(Point(hs), "hayden_smelter_symbol", "Hayden Smelter (symbol position on Fig 2)",
    note="The symbol plots about 1.9 km from the smelter plant visible in 2025 imagery. See docs/open-questions.md item 20.")
print(f"Hayden smelter symbol: E {hs[0]:.0f} N {hs[1]:.0f}")
print("powerline: not drawn on Fig 2 (it appears on Fig 8), so nothing traced")
print("San Carlos Reservation: Fig 2 has a text label only, no boundary line, so the public boundary is used")

# ---------- Public reference lines ----------
ll_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32612", always_xy=True).transform
BOX = box(W, S, E, N)
def public(file, kind, name, source, keep_fn=lambda p: True, boundary=False):
    gj = json.loads((ROOT / "data/raw/public_vectors" / file).read_text())
    geoms = [shp_transform(ll_to_utm, shape(f["geometry"])) for f in gj["features"] if keep_fn(f["properties"])]
    geom = unary_union(geoms)
    geom = (geom.boundary if boundary else geom).intersection(BOX)
    feats.append({"type": "Feature", "geometry": mapping(geom),
                  "properties": {"kind": kind, "name": name, "label": f"public source: {source}", "accuracy": "exact per source (not traced from the figure)",
                                 "source": source, "datum_source": "NAD83 geographic, converted to UTM 12N and treated as WGS84", "retrieved": "2026-11-12"}})
    return geom
river = public("nhd_flowlines.geojson", "gila_river", "Gila River", "USGS National Hydrography Dataset (NHD) flowlines")
sr77 = public("tiger_secondary_roads.geojson", "highway_77", "State Route 77", "US Census Bureau TIGER/Line roads (TIGERweb)", lambda p: p.get("NAME") == "State Rte 77")
resv = public("tiger_reservations.geojson", "san_carlos_reservation_boundary", "San Carlos Reservation boundary",
              "US Census Bureau TIGER/Line American Indian areas (TIGERweb)", boundary=True)
print(f"public lines in the box: Gila River {river.length / 1000:.1f} km, SR 77 {sr77.length / 1000:.1f} km, reservation boundary {resv.length / 1000:.1f} km")

# ---------- Independent georeferencing check: figure highway / river pixels vs the public lines ----------
def pixel_offsets(mask, geom, name):
    ys, xs = np.nonzero(mask & inframe & nolabel)
    pts = [to_utm(x, y) for x, y in zip(xs[::7], ys[::7])]
    pts = [p for p in pts if BOX.contains(Point(p))]
    d = np.array([geom.distance(Point(p)) for p in pts])
    print(f"  {name}: {len(d)} figure pixels, median {np.median(d):.0f} m, 90% within {np.percentile(d, 90):.0f} m of the public line")
    return {"median_m": round(float(np.median(d)), 1), "p90_m": round(float(np.percentile(d, 90)), 1)}
print("FIGURE vs PUBLIC SOURCE")
all_roads = unary_union([shp_transform(ll_to_utm, shape(f["geometry"])) for f in json.loads((ROOT / "data/raw/public_vectors/tiger_secondary_roads.geojson").read_text())["features"]])
chk = {"highway_vs_tiger": pixel_offsets((r > 238) & (g > 238) & (b > 238), all_roads, "figure highway vs TIGER roads"),
       "river_vs_nhd": pixel_offsets((b > 200) & (r < 130) & (b - r > 100), river, "figure river vs NHD Gila River")}

(OUT / "fig2_traced.geojson").write_text(json.dumps({
    "type": "FeatureCollection",
    "metadata": {"layer": "fig2_traced", "crs": "WGS84 / UTM Zone 12N (EPSG:32612)", "date": "report effective 2026-06-30; traced 2026-11-12",
                 "georeferencing_error_m": ERR, "independent_check": chk, "verified": False,
                 "note": "Traced features are approximate. No claim counts or ownership terms are carried.",
                 "processed": datetime.date.today().isoformat()},
    "features": feats}))

# ---------- Zone fills as a draped texture (2 x 2 tiles over the terrain box) ----------
ZSIZE = 4096
ztf = Affine((E - W) / ZSIZE, 0, W, 0, -(N - S) / ZSIZE, N)
zimg = np.zeros((ZSIZE, ZSIZE, 4), "uint8")
for kind, colour in (("zone_state_private", (255, 105, 180, 120)), ("zone_legacy_placer_tunnel", (130, 210, 90, 120))):
    gm = [f["geometry"] for f in feats if f["properties"]["kind"] == kind]
    zimg[features.rasterize(gm, out_shape=(ZSIZE, ZSIZE), transform=ztf) == 1] = colour
for row in range(2):
    for col in range(2):
        Image.fromarray(zimg[row * 2048:(row + 1) * 2048, col * 2048:(col + 1) * 2048], "RGBA").save(OUT / f"fig2_zones_r{row}c{col}.webp", "WEBP", lossless=True)

# ---------- QA picture: tracing drawn back on the figure, 2x ----------
qa = img.resize((W_ * 2, H_ * 2), Image.LANCZOS).convert("RGB"); d = ImageDraw.Draw(qa, "RGBA")
P = lambda coords: [tuple(2 * v + 1 for v in to_px(x, y)) for x, y in coords]
for f in feats:
    gm = shape(f["geometry"]); k = f["properties"]["kind"]
    col = {"property_boundary": (255, 255, 0, 255), "pit_outline": (255, 255, 0, 255), "zone_state_private": (255, 0, 0, 255),
           "zone_legacy_placer_tunnel": (0, 90, 0, 255), "access_trail": (255, 120, 0, 255), "gila_river": (0, 255, 255, 255),
           "highway_77": (255, 0, 255, 255), "san_carlos_reservation_boundary": (0, 0, 0, 255)}.get(k)
    if gm.geom_type == "Point":
        x, y = P([gm.coords[0]])[0]; d.ellipse((x - 8, y - 8, x + 8, y + 8), outline=(255, 0, 0, 255), width=3); continue
    for part in getattr(gm, "geoms", [gm]):
        if part.geom_type == "Polygon":
            d.line(P(part.exterior.coords), fill=col, width=2)
            for hole in part.interiors: d.line(P(hole.coords), fill=col, width=2)
        elif part.geom_type == "LineString":
            d.line(P(part.coords), fill=col, width=2)
qa.save(ROOT / "docs/screens/fig2-trace-qa.jpg", quality=88)
