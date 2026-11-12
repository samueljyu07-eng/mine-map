"""Download the newest NAIP aerial imagery for the project box and cut it into web textures.
Run: .venv/bin/python scripts/build_imagery.py

Source: USDA NAIP, read from the public Microsoft Planetary Computer mirror (cloud-optimised GeoTIFFs).
Only the pixels inside the project box are downloaded, resampled to the texture resolution (about 1.5 m). Nothing is uploaded.
Raw copy:   data/raw/naip/naip_<date>_box_1p1m.tif   (clipped + resampled subset of the originals)
Processed:  data/processed/imagery_r{row}c{col}_{2048|4096}.webp + imagery.json
"""
import json, pathlib, sys, datetime
import numpy as np, requests, rasterio
from rasterio.transform import from_bounds as tf_from_bounds
from rasterio.warp import reproject, Resampling
from PIL import Image

from config import ROOT, W, E, S, N, TEX as SIZE, bbox_lonlat
BBOX_LL = bbox_lonlat()
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SIGN = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"

raw_dir = ROOT / "data/raw/naip"; raw_dir.mkdir(parents=True, exist_ok=True)
items = requests.post(STAC, json={"collections": ["naip"], "bbox": BBOX_LL, "limit": 200}, timeout=60).json()["features"]
latest_year = max(i["properties"]["datetime"][:4] for i in items)
items = [i for i in items if i["properties"]["datetime"][:4] == latest_year]
dates = sorted({i["properties"]["datetime"][:10] for i in items})
print("newest NAIP year:", latest_year, "dates:", dates, "scenes:", len(items))
raw_path = raw_dir / f"naip_{dates[-1]}_box_v2_{(E - W) / SIZE:.2f}m.tif"

if not raw_path.exists():
    dst = np.zeros((3, SIZE, SIZE), "uint8")
    filled = np.zeros((SIZE, SIZE), bool)
    transform = tf_from_bounds(W, S, E, N, SIZE, SIZE)
    for it in items:
        href = requests.get(SIGN, params={"href": it["assets"]["image"]["href"]}, timeout=60).json()["href"]
        with rasterio.open(href) as src:
            assert src.crs.to_epsg() == 26912, src.crs
            tmp = np.zeros((3, SIZE, SIZE), "uint8"); mask = np.zeros((SIZE, SIZE), "uint8")
            reproject(rasterio.band(src, [1, 2, 3]), tmp, dst_transform=transform, dst_crs="EPSG:26912",
                      resampling=Resampling.average)
            reproject(np.ones((src.height // 64, src.width // 64), "uint8"), mask,
                      src_transform=src.transform * src.transform.scale(64, 64), src_crs=src.crs,
                      dst_transform=transform, dst_crs="EPSG:26912", resampling=Resampling.nearest)
            take = (mask == 1) & ~filled
            dst[:, take] = tmp[:, take]; filled |= take
            print(" ", it["id"], f"res {src.res[0]:.2f} m, used {take.mean()*100:.1f}% of box")
    print(f"box covered: {filled.mean()*100:.2f}%")
    assert filled.mean() > 0.999, "imagery does not cover the whole box"
    with rasterio.open(raw_path, "w", driver="GTiff", width=SIZE, height=SIZE, count=3, dtype="uint8",
                       crs="EPSG:26912", transform=transform, compress="deflate", tiled=True) as out:
        out.write(dst)
else:
    with rasterio.open(raw_path) as src: dst = src.read()

out = ROOT / "data/processed"
img = Image.fromarray(np.moveaxis(dst, 0, -1))
total = 0
for r in range(2):
    for c in range(2):
        q = img.crop((c * 4096, r * 4096, (c + 1) * 4096, (r + 1) * 4096))
        for size, quality in ((4096, 72), (2048, 78)):
            p = out / f"imagery_r{r}c{c}_{size}.webp"
            (q if size == 4096 else q.resize((2048, 2048), Image.LANCZOS)).save(p, "WEBP", quality=quality, method=6)
            total += p.stat().st_size; print(" ", p.name, f"{p.stat().st_size/1e6:.2f} MB")
print(f"imagery total {total/1e6:.2f} MB")
meta = {
    "layer": "imagery",
    "source": "USDA National Agriculture Imagery Program (NAIP)",
    "accessed_via": "Microsoft Planetary Computer public NAIP mirror",
    "scenes": sorted(i["id"] for i in items),
    "acquisition_dates": dates, "acquisition_year": int(latest_year),
    "native_resolution_m": 0.6, "texture_resolution_m": {"4096": (E - W) / SIZE, "2048": (E - W) / (SIZE / 2)},
    "tiles": "2 x 2, row 0 = north, col 0 = west",
    "bounds": {"west": W, "east": E, "south": S, "north": N},
    "datum_source_horizontal": "NAD83 (EPSG:26912)",
    "datum_note": "NAD83 coordinates are used unchanged as WGS84 (about 1-2 m difference, close to one texture pixel). No datum shift applied.",
    "retrieved": "2026-11-12", "licence": "US Government work, public domain",
    "verified": False, "accuracy": "exact (orthorectified imagery, resampled)", "processed": datetime.date.today().isoformat(),
}
(out / "imagery.json").write_text(json.dumps(meta, indent=2))
