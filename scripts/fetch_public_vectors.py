"""Download public reference lines for the terrain box: Gila River, State Route 77, San Carlos Reservation boundary.
Run: cd scripts && ../.venv/bin/python fetch_public_vectors.py
Only the box's bounding rectangle is sent to the services. Results are saved unchanged in data/raw/public_vectors.
"""
import json, requests
from config import ROOT, bbox_lonlat

bb = ",".join(f"{v:.5f}" for v in bbox_lonlat(0.01))
out = ROOT / "data/raw/public_vectors"; out.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "nhd_flowlines": ("https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query", "gnis_name = 'Gila River'"),
    "tiger_secondary_roads": ("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/6/query", "1=1"),
    "tiger_primary_roads": ("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/2/query", "1=1"),
    "tiger_reservations": ("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/AIANNHA/MapServer/2/query", "1=1"),
}
for name, (url, where) in SOURCES.items():
    r = requests.get(url, params={"where": where, "geometry": bb, "geometryType": "esriGeometryEnvelope", "inSR": 4326,
                                  "outSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "f": "geojson"}, timeout=90)
    r.raise_for_status(); gj = r.json()
    (out / f"{name}.geojson").write_text(json.dumps(gj))
    feats = gj.get("features", [])
    names = sorted({str(f["properties"].get("NAME") or f["properties"].get("gnis_name") or f["properties"].get("BASENAME")) for f in feats})
    print(f"{name}: {len(feats)} features; names: {names[:12]}")
    if feats: print("   fields:", list(feats[0]["properties"].keys())[:14])
