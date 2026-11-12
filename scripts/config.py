"""Shared settings for the data scripts. Coordinates are UTM Zone 12N, metres."""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
# Terrain box. Enlarged on 2026-11-12 so the Hayden smelter and the Fig 8 survey grid sit on terrain.
W, E, S, N = 518000, 530000, 3649000, 3661000
CELL = 10          # terrain grid cell, metres
TEX = 8192         # imagery mosaic size in pixels (2 x 2 tiles of 4096)

def bbox_lonlat(pad=0.002):
    from pyproj import Transformer
    t = Transformer.from_crs("EPSG:32612", "EPSG:4326", always_xy=True)
    xs, ys = zip(*[t.transform(x, y) for x in (W, E) for y in (S, N)])
    return [min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad]
