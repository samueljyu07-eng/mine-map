"""Round-trip check: UTM 12N (WGS84) -> lat/lon -> UTM. Run: .venv/bin/python scripts/check_samples.py"""
import csv, pathlib
from pyproj import Transformer
root = pathlib.Path(__file__).resolve().parent.parent
to_ll = Transformer.from_crs("EPSG:32612", "EPSG:4326", always_xy=True)
to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32612", always_xy=True)
rows = list(csv.DictReader(open(root / "data/raw/samples.csv")))
print(f"{len(rows)} rows")
worst = 0
for r in rows:
    e, n = float(r["easting"]), float(r["northing"])
    lon, lat = to_ll.transform(e, n)
    e2, n2 = to_utm.transform(lon, lat)
    err = max(abs(e - e2), abs(n - n2)); worst = max(worst, err)
    assert 32.9 < lat < 33.1 and -110.8 < lon < -110.6, r
    print(f"{r['sample_id']:>8}  {lat:.5f} N  {abs(lon):.5f} W  round-trip error {err*1000:.3f} mm")
print(f"worst round-trip error: {worst*1000:.3f} mm; all near 33.0 N, 110.7 W")
