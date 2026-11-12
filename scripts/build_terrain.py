"""Build the terrain height grid from USGS 3DEP data.
Run: .venv/bin/python scripts/build_terrain.py

Inputs (data/raw, never edited):
  usgs_3dep_1m/*.tif            USGS 1 m lidar DEM tiles, NAD83 / UTM 12N (EPSG:26912), NAVD88 heights
  usgs_3dep_1m_clips/*.tif      box-sized clips of further 1 m lidar tiles, read at their 4 m overview
  usgs_3dep_service/*.tif       USGS 3DEP "best available" service export at 5 m, used ONLY where 1 m lidar is missing
Outputs (data/processed):
  terrain_10m_u16.bin           1200 x 1200 grid, uint16 little-endian, value = elevation in decimetres, row 0 = north
  terrain_source_u8.bin         1200 x 1200, 1 = 1 m lidar, 2 = gap fill from the 3DEP service
  terrain.json                  metadata
"""
import json, pathlib, datetime
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling

from config import ROOT, W, E, S, N, CELL
NX, NY = (E - W) // CELL, (N - S) // CELL
# Newest lidar collection first; later files only fill cells still empty.
PRIORITY = ["AZ_USFSR3_D23", "AZ_Eastern_D24", "AZ_NorthCentral_B23", "CA_AZ_FEMA_R9_Lidar_2017_D18"]

def read_box(path):
    with rasterio.open(path) as d:
        assert d.crs.to_epsg() == 26912, (path, d.crs)
        win = from_bounds(W, S, E, N, d.transform)
        a = d.read(1, window=win, out_shape=(NY, NX), boundless=True, fill_value=d.nodata,
                   resampling=Resampling.average, masked=True)
        return np.ma.filled(a.astype("float32"), np.nan)

height = np.full((NY, NX), np.nan, "float32")
source = np.zeros((NY, NX), "uint8")
used = []
for proj in PRIORITY:
    files = sorted((ROOT / "data/raw/usgs_3dep_1m").glob(f"*{proj}.tif")) + \
            sorted((ROOT / "data/raw/usgs_3dep_1m_clips").glob(f"*{proj}_boxclip_4m.tif"))
    for f in files:
        a = read_box(f)
        a[(a < -100) | (a > 5000)] = np.nan
        take = np.isnan(height) & ~np.isnan(a)
        height[take] = a[take]; source[take] = 1
        if take.any(): used.append({"file": f.name, "cells_used": int(take.sum())})

fill_path = ROOT / "data/raw/usgs_3dep_service/3dep_best_available_5m_box_v2.tif"
fill = read_box(fill_path)
both = (source == 1) & ~np.isnan(fill)
diff = height[both] - fill[both]
print(f"lidar vs service where both exist: mean diff {diff.mean():+.2f} m, 95% within {np.percentile(np.abs(diff),95):.2f} m")
take = np.isnan(height) & ~np.isnan(fill)
height[take] = fill[take]; source[take] = 2
assert not np.isnan(height).any(), "terrain still has holes"

out = ROOT / "data/processed"; out.mkdir(parents=True, exist_ok=True)
np.round(height * 10).astype("<u2").tofile(out / "terrain_10m_u16.bin")
source.tofile(out / "terrain_source_u8.bin")
meta = {
    "layer": "terrain",
    "grid": {"nx": NX, "ny": NY, "cell_m": CELL, "west": W, "east": E, "south": S, "north": N,
             "note": "values are cell averages; cell centres are offset 5 m from the box edge; row 0 is the north edge"},
    "encoding": "uint16 little-endian, elevation in decimetres above sea level",
    "elevation_min_m": float(height.min()), "elevation_max_m": float(height.max()),
    "crs_display": "UTM Zone 12N, WGS84 (EPSG:32612)",
    "datum_source_horizontal": "NAD83 (EPSG:26912)",
    "datum_source_vertical": "NAVD88 (orthometric height, metres)",
    "datum_note": "NAD83 coordinates are used unchanged as WGS84. The two differ by roughly 1-2 m here, less than the 10 m grid cell. No datum shift applied.",
    "source": "USGS 3D Elevation Program (3DEP)",
    "source_detail": used + [{"file": fill_path.name, "cells_used": int((source == 2).sum()),
                              "note": "USGS 3DEP ImageServer best-available export, 5 m request; coarser than lidar"}],
    "lidar_1m_fraction": float((source == 1).mean()),
    "gap_fill_fraction": float((source == 2).mean()),
    "retrieved": "2026-11-12",
    "licence": "US Government work, public domain",
    "verified": False, "accuracy": "exact (measured data, resampled to 10 m)",
    "processed": datetime.date.today().isoformat(),
}
(out / "terrain.json").write_text(json.dumps(meta, indent=2))
print(json.dumps({k: meta[k] for k in ["elevation_min_m", "elevation_max_m", "lidar_1m_fraction", "gap_fill_fraction"]}))
for u in meta["source_detail"]: print(" ", u["file"], u["cells_used"])
