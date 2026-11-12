"""Build the samples layer and the claims layer for the viewer.
Run: .venv/bin/python scripts/build_layers.py

samples: data/raw/samples.csv -> data/processed/samples.json (adds terrain elevation for each pin)
claims:  data/raw/claims.geojson if it exists, otherwise a clearly labelled PLACEHOLDER box around the samples.
"""
import csv, json, pathlib, datetime
import numpy as np
from pyproj import Transformer

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data/processed"
t = json.loads((OUT / "terrain.json").read_text()); g = t["grid"]
H = np.fromfile(OUT / "terrain_10m_u16.bin", "<u2").reshape(g["ny"], g["nx"]) / 10.0
SRC = np.fromfile(OUT / "terrain_source_u8.bin", "u1").reshape(g["ny"], g["nx"])

def elevation(e, n):
    """Bilinear lookup. Cell centres sit half a cell in from the box edge."""
    fx = (e - g["west"]) / g["cell_m"] - 0.5; fy = (g["north"] - n) / g["cell_m"] - 0.5
    x0 = int(np.clip(np.floor(fx), 0, g["nx"] - 2)); y0 = int(np.clip(np.floor(fy), 0, g["ny"] - 2))
    tx = float(np.clip(fx - x0, 0, 1)); ty = float(np.clip(fy - y0, 0, 1))
    top = H[y0, x0] * (1 - tx) + H[y0, x0 + 1] * tx; bot = H[y0 + 1, x0] * (1 - tx) + H[y0 + 1, x0 + 1] * tx
    return float(top * (1 - ty) + bot * ty), int(SRC[int(round(fy)), int(round(fx))])

def num(s): return float(s) if s.strip() else None

rows = list(csv.DictReader(open(ROOT / "data/raw/samples.csv")))
assert len(rows) == 17
samples = []
print(f"{'sample':>8} {'easting':>8} {'northing':>9} {'elev m':>7}  terrain source   margin to box edge")
for r in rows:
    e, n = float(r["easting"]), float(r["northing"])
    inside = g["west"] < e < g["east"] and g["south"] < n < g["north"]
    assert inside, f"sample {r['sample_id']} is outside the terrain"
    z, src = elevation(e, n)
    margin = min(e - g["west"], g["east"] - e, n - g["south"], g["north"] - n)
    print(f"{r['sample_id']:>8} {e:8.0f} {n:9.0f} {z:7.1f}  {'1 m lidar' if src == 1 else 'gap fill (coarser)':<16} {margin:6.0f} m")
    samples.append({"id": r["sample_id"], "type": r["type"], "sampler": r["sampler"], "width_m": r["width_m"] or None,
                    "easting": e, "northing": n, "cu_pct": num(r["cu_pct"]), "au_gpt": num(r["au_gpt"]),
                    "terrain_elevation_m": round(z, 1), "terrain_source": "1 m lidar" if src == 1 else "gap fill"})
print("all 17 samples are inside the terrain")
today = datetime.date.today().isoformat()
(OUT / "samples.json").write_text(json.dumps({
    "layer": "samples",
    "source": "Prismo Metals website, table 'Highlight assays for samples from Hot Breccia'",
    "source_url": "https://prismometals.com/project/the-hot-breccia-property/",
    "retrieved": "2026-11-12",
    "datum": "WGS84 (as stated by source)",
    "crs_assumed": "UTM Zone 12N (EPSG:32612). ASSUMPTION: the source states the datum only, not the UTM zone.",
    "status": "historical/vendor data, not verified by QP", "verified": False,
    "notes": ["cu_pct null = published as a dash (not reported), not zero",
              "terrain_elevation_m is read from the terrain model, it is not part of the source table"],
    "processed": today, "samples": samples}, indent=2))

raw_claims = ROOT / "data/raw/claims.geojson"
if raw_claims.exists():
    gj = json.loads(raw_claims.read_text())
    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32612", always_xy=True)
    def conv(c):
        if isinstance(c[0], (int, float)):
            return list(to_utm.transform(c[0], c[1])) if abs(c[0]) <= 180 and abs(c[1]) <= 90 else c[:2]
        return [conv(x) for x in c]
    for f in gj["features"]: f["geometry"]["coordinates"] = conv(f["geometry"]["coordinates"])
    gj["metadata"] = {"layer": "claims", "placeholder": False, "source": "data/raw/claims.geojson", "datum": "CONFIRM: lon/lat assumed WGS84",
                      "verified": False, "processed": today}
    print("claims: loaded data/raw/claims.geojson")
else:
    pad = 250
    es = [s["easting"] for s in samples]; ns = [s["northing"] for s in samples]
    w, e, s_, n = min(es) - pad, max(es) + pad, min(ns) - pad, max(ns) + pad
    gj = {"type": "FeatureCollection",
          "metadata": {"layer": "claims", "placeholder": True,
                       "source": "NONE. Placeholder box drawn 250 m outside the sample points. NOT the claim boundary.",
                       "datum": "WGS84 / UTM Zone 12N", "verified": False, "processed": today},
          "features": [{"type": "Feature", "properties": {"name": "PLACEHOLDER - not the claim boundary"},
                        "geometry": {"type": "Polygon", "coordinates": [[[w, s_], [e, s_], [e, n], [w, n], [w, s_]]]}}]}
    print(f"claims: data/raw/claims.geojson not found -> PLACEHOLDER box E {w:.0f}-{e:.0f}, N {s_:.0f}-{n:.0f}")
(OUT / "claims.json").write_text(json.dumps(gj, indent=2))
