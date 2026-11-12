"""Fetch only the parts of extra USGS 1 m lidar tiles that fall inside the terrain box.
Run: .venv/bin/python scripts/fetch_terrain_clips.py

The tiles are cloud-optimised GeoTIFFs, so we can read just the window we need at the tile's
built-in 4 m overview instead of downloading several GB. Clips are saved in data/raw/usgs_3dep_1m_clips.
"""
import sys
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from config import ROOT, W, E, S, N

BASE = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects"
TILES = [f"{p}/TIFF/USGS_1M_12_{t}_{p}.tif"
         for t in ("x51y365", "x51y366", "x51y367", "x52y367")
         for p in ("AZ_USFSR3_D23", "AZ_Eastern_D24", "AZ_NorthCentral_B23", "CA_AZ_FEMA_R9_Lidar_2017_D18")]
out_dir = ROOT / "data/raw/usgs_3dep_1m_clips"; out_dir.mkdir(parents=True, exist_ok=True)
for rel in TILES:
    out = out_dir / (rel.split("/")[-1].replace(".tif", "_boxclip_4m.tif"))
    if out.exists(): continue
    try:
        src = rasterio.open(f"{BASE}/{rel}")
    except Exception:
        print("not published:", rel.split("/")[-1]); continue
    with src:
        b = src.bounds
        w, e, s, n = max(W, b.left), min(E, b.right), max(S, b.bottom), min(N, b.top)
        if w >= e or s >= n: print("outside box:", out.name); continue
        win = from_bounds(w, s, e, n, src.transform)
        shape = (max(1, round(win.height / 4)), max(1, round(win.width / 4)))
        a = src.read(1, window=win, out_shape=shape, resampling=Resampling.average)
        valid = float((a != src.nodata).mean())
        if valid == 0: print("no data in box:", out.name); continue
        tf = rasterio.transform.from_bounds(w, s, e, n, shape[1], shape[0])
        with rasterio.open(out, "w", driver="GTiff", width=shape[1], height=shape[0], count=1, dtype="float32",
                           crs=src.crs, transform=tf, nodata=src.nodata, compress="deflate") as dst:
            dst.write(a, 1)
        print(f"saved {out.name}: {shape[1]}x{shape[0]} px, {valid*100:.0f}% valid")
