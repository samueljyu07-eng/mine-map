"""Build the point layers for the viewer and print the Phase 1 checks.
Run: .venv/bin/python scripts/build_layers.py

collars:          data/raw/collars.csv                  -> data/processed/collars.json
report samples:   data/raw/samples.csv                  -> data/processed/samples_report.json
website samples:  data/raw/prismo_website/samples.csv   -> data/processed/samples_website.json
Sample values are kept as text, exactly as written in the source files.
"""
import csv, json, datetime
import numpy as np
from pyproj import Transformer
from config import ROOT

OUT = ROOT / "data/processed"
REPORT = "NI 43-101 Technical Report, Hot Breccia Project, B.L. Laird P.Geo., effective 2026-06-30"
t = json.loads((OUT / "terrain.json").read_text()); g = t["grid"]
H = np.fromfile(OUT / "terrain_10m_u16.bin", "<u2").reshape(g["ny"], g["nx"]) / 10.0
SRC = np.fromfile(OUT / "terrain_source_u8.bin", "u1").reshape(g["ny"], g["nx"])
today = datetime.date.today().isoformat()

def inside(e, n): return g["west"] < e < g["east"] and g["south"] < n < g["north"]

def elevation(e, n):
    """Bilinear lookup. Cell centres sit half a cell in from the box edge."""
    fx = (e - g["west"]) / g["cell_m"] - 0.5; fy = (g["north"] - n) / g["cell_m"] - 0.5
    x0 = int(np.clip(np.floor(fx), 0, g["nx"] - 2)); y0 = int(np.clip(np.floor(fy), 0, g["ny"] - 2))
    tx = float(np.clip(fx - x0, 0, 1)); ty = float(np.clip(fy - y0, 0, 1))
    top = H[y0, x0] * (1 - tx) + H[y0, x0 + 1] * tx; bot = H[y0 + 1, x0] * (1 - tx) + H[y0 + 1, x0 + 1] * tx
    src = int(SRC[int(np.clip(round(fy), 0, g["ny"] - 1)), int(np.clip(round(fx), 0, g["nx"] - 1))])
    return round(float(top * (1 - ty) + bot * ty), 1), ("1 m lidar" if src == 1 else "gap fill (coarser)")

def rows(path): return list(csv.DictReader(open(path)))
problems = []

# ---------------- Collars ----------------
STATUS = {
    "OCC-6": ("not_visited", "not visited by QP in Feb 2026"),
    "OC-5": ("suspected_pad", "only a suspected drill pad found"),
}
DEFAULT = ("unitemized", "the report states six historical sites were confirmed in the QP's Feb 2026 visit but does not itemize which; confirm with Blade")
collars = []
print("COLLARS  (stated elevation vs terrain; flag if more than 15 m apart)")
print(f"{'hole':>6} {'easting':>8} {'northing':>9} {'stated':>7} {'terrain':>8} {'diff':>6}  terrain source")
for r in rows(ROOT / "data/raw/collars.csv"):
    e, n = float(r["easting"]), float(r["northing"])
    assert inside(e, n), f"collar {r['hole_id']} is outside the terrain"
    z, src = elevation(e, n); stated = float(r["elevation_m"]); diff = stated - z
    flag = "  <-- FLAG: over 15 m" if abs(diff) > 15 else ""
    if flag: problems.append(f"collar {r['hole_id']}: stated elevation {stated:.0f} m vs terrain {z:.1f} m ({diff:+.1f} m)")
    print(f"{r['hole_id']:>6} {e:8.0f} {n:9.0f} {stated:7.0f} {z:8.1f} {diff:+6.1f}  {src}{flag}")
    state, text = STATUS.get(r["hole_id"], DEFAULT)
    collars.append({"id": r["hole_id"], "easting": e, "northing": n, "elevation_m": stated, "depth_m": float(r["depth_m"]),
                    "dip_deg": float(r["dip_deg"]), "azimuth_deg": float(r["azimuth_deg"]),
                    "year": r["year"] or None, "logged_to_m": float(r["logged_to_m"]), "notes": r["notes"],
                    "terrain_elevation_m": z, "elevation_diff_m": round(diff, 1),
                    "verification_state": state, "verification_text": text})
(OUT / "collars.json").write_text(json.dumps({
    "layer": "collars", "source": f"{REPORT}, Table 3", "date": "holes drilled 1974-1981; report effective 2026-06-30",
    "datum": "WGS84 / UTM Zone 12N (EPSG:32612)", "accuracy": "exact as tabulated in the report (collar positions themselves are historical)",
    "status": "historical, not verified by the QP", "verified": False,
    "trace_note": "assumed vertical, no downhole surveys exist",
    "notes": ["No intercepts or grades are carried in this layer.", "terrain_elevation_m comes from the terrain model, not the report."],
    "processed": today, "collars": collars}, indent=2))

# ---------------- Report samples ----------------
def sample_rows(path, kind_fn, extra):
    out = []
    for r in rows(path):
        e, n = float(r["easting"]), float(r["northing"])
        assert inside(e, n), f"sample {r['sample_id']} is outside the terrain"
        z, src = elevation(e, n)
        print(f"{r['sample_id']:>8} {e:8.0f} {n:9.0f} {z:8.1f}  {src}")
        d = {"id": r["sample_id"], "type": r["type"], "easting": e, "northing": n,
             "width_m": r.get("width_m") or None, "cu_pct": r.get("cu_pct") or None, "au_gpt": r.get("au_gpt") or None,
             "terrain_elevation_m": z, "terrain_source": src}
        d.update(extra(r)); d["kind"] = kind_fn(r)
        out.append(d)
    return out

print("\nREPORT SAMPLES  (placed on the terrain)")
print(f"{'sample':>8} {'easting':>8} {'northing':>9} {'terrain':>8}  terrain source")
rep = sample_rows(ROOT / "data/raw/samples.csv",
                  lambda r: "qp_check" if r["sample_id"] == "HBLR-01" else "prismo",
                  lambda r: {"source": r["source"], "ag_gpt": r["ag_gpt"] or None, "flag": r["flag"] or None,
                             "status": "QP check sample (Feb 2026, ALS)" if r["sample_id"] == "HBLR-01"
                                       else "historical/vendor data, not verified by the QP"})
assert len(rep) == 31
(OUT / "samples_report.json").write_text(json.dumps({
    "layer": "samples_report", "source": f"{REPORT}, Table 4 (30 Prismo samples, March 2024) and QP check sample HBLR-01 (Feb 2026)",
    "date": "March 2024 (Prismo); February 2026 (HBLR-01)", "datum": "WGS84 / UTM Zone 12N (EPSG:32612)",
    "accuracy": "exact as tabulated in the report", "verified": False,
    "notes": ["Values are text, exactly as in the source file. Empty = not reported.",
              "HBLR-01: the report's listed elevation (2474, probably feet) is ignored; the pin sits on the terrain.",
              "Pins are coloured by sample type, never by value."],
    "processed": today, "samples": rep}, indent=2))

print("\nWEBSITE SAMPLES  (placed on the terrain)")
web = sample_rows(ROOT / "data/raw/prismo_website/samples.csv", lambda r: "website",
                  lambda r: {"source": "Prismo Metals website", "sampler": r["sampler"],
                             "status": "historical/vendor data, not verified by the QP"})
assert len(web) == 17
(OUT / "samples_website.json").write_text(json.dumps({
    "layer": "samples_website", "source": "Prismo Metals website, table 'Highlight assays for samples from Hot Breccia'",
    "source_url": "https://prismometals.com/project/the-hot-breccia-property/", "date": "page read 2026-11-12",
    "datum": "WGS84 as stated by source; UTM Zone 12N ASSUMED", "accuracy": "exact as published, zone assumed", "verified": False,
    "notes": ["Empty cu_pct = published as a dash (not reported), not zero."], "processed": today, "samples": web}, indent=2))
for old in ("samples.json",):
    if (OUT / old).exists(): (OUT / old).unlink()

# ---------------- UTM round trip ----------------
to_ll = Transformer.from_crs("EPSG:32612", "EPSG:4326", always_xy=True)
to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32612", always_xy=True)
c = collars[0]; lon, lat = to_ll.transform(c["easting"], c["northing"]); e2, n2 = to_utm.transform(lon, lat)
print(f"\nUTM ROUND TRIP  {c['id']}: E {c['easting']:.0f} N {c['northing']:.0f} -> {lat:.5f} N, {abs(lon):.5f} W -> E {e2:.3f} N {n2:.3f}")
print(f"  distance from 33.03 N, 110.75 W: {np.hypot((lat-33.03)*110900, (lon+110.75)*93400)/1000:.1f} km")

print(f"\nAll {len(collars)} collars, {len(rep)} report samples and {len(web)} website samples are inside the terrain.")
print("FLAGS:", *(problems or ["none"]), sep="\n  ")
