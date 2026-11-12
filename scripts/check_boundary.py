"""Check which drill collars and samples fall inside the property boundary traced from report Fig 2.
Run: cd scripts && ../.venv/bin/python check_boundary.py
The boundary is approximate, so a point closer to the line than the georeferencing error is reported as "on the line".
"""
import json
from shapely.geometry import shape, Point
from config import ROOT

OUT = ROOT / "data/processed"
gj = json.loads((OUT / "fig2_traced.geojson").read_text())
prop = next(shape(f["geometry"]) for f in gj["features"] if f["properties"]["kind"] == "property_boundary")
zones = {f["properties"]["name"]: shape(f["geometry"]) for f in gj["features"] if f["properties"]["kind"].startswith("zone_")}
tol = max(25.0, 3 * gj["metadata"]["georeferencing_error_m"])     # line width on the figure plus georeferencing error
print(f"Traced property area: {prop.area / 1e6:.2f} km2 (report states 1,420 hectares = 14.20 km2). Tolerance near the line: {tol:.0f} m\n")

def check(title, items, key):
    print(title)
    out = []
    for it in items:
        p = Point(it["easting"], it["northing"]); d = prop.exterior.distance(p); inside = prop.contains(p)
        state = "on the line (within tolerance)" if d <= tol else ("inside" if inside else "OUTSIDE")
        z = [n for n, g in zones.items() if g.contains(p)]
        print(f"  {it[key]:>8}  {state:<30} {d:6.0f} m from boundary" + (f"   in zone: {'; '.join(z)}" if z else ""))
        if state != "inside": out.append((it[key], state, round(d)))
    return out

c = check("COLLARS", json.loads((OUT / "collars.json").read_text())["collars"], "id")
r = check("\nREPORT SAMPLES", json.loads((OUT / "samples_report.json").read_text())["samples"], "id")
w = check("\nWEBSITE SAMPLES", json.loads((OUT / "samples_website.json").read_text())["samples"], "id")
print("\nNOT CLEARLY INSIDE THE TRACED BOUNDARY")
for name, lst in (("collars", c), ("report samples", r), ("website samples", w)):
    print(f"  {name}: " + (", ".join(f"{i} ({s.split(' (')[0]}, {d} m)" for i, s, d in lst) or "none"))
