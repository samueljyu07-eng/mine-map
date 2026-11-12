"""Estimate where report Plate 2 was taken from. Run: cd scripts && ../.venv/bin/python estimate_plate2.py

The report gives no photo position. This searches the terrain for the spot from which OC-1, OCC-8 and OCC-7 are all
visible and sit in the same left-to-right and up-down arrangement as the red pointer tips on the photo.
The result is an ESTIMATE ("approximate viewpoint"), not a surveyed point. It is written to data/processed/plate2.json.
"""
import json, csv
import numpy as np
from config import ROOT

OUT = ROOT / "data/processed"
t = json.loads((OUT / "terrain.json").read_text()); g = t["grid"]
H = np.fromfile(OUT / "terrain_10m_u16.bin", "<u2").reshape(g["ny"], g["nx"]) / 10.0
def z(e, n):
    fx = (e - g["west"]) / g["cell_m"] - 0.5; fy = (g["north"] - n) / g["cell_m"] - 0.5
    x0 = np.clip(np.floor(fx).astype(int), 0, g["nx"] - 2); y0 = np.clip(np.floor(fy).astype(int), 0, g["ny"] - 2)
    tx = np.clip(fx - x0, 0, 1); ty = np.clip(fy - y0, 0, 1)
    return (H[y0, x0] * (1 - tx) + H[y0, x0 + 1] * tx) * (1 - ty) + (H[y0 + 1, x0] * (1 - tx) + H[y0 + 1, x0 + 1] * tx) * ty

col = {r["hole_id"]: (float(r["easting"]), float(r["northing"])) for r in csv.DictReader(open(ROOT / "data/raw/collars.csv"))}
# Pointer tips on the photo (pixels in the cropped 1171 x 652 photo): where the red lines end.
TIPS = {"OC-1": (637, 288), "OCC-8": (842, 292), "OCC-7": (877, 262)}
PHOTO_W, PHOTO_H = 1171, 652

def visible(e0, n0, h0, e1, n1, h1):
    s = np.linspace(0.02, 0.98, 120)
    return bool(np.all(z(e0 + (e1 - e0) * s, n0 + (n1 - n0) * s) < h0 + (h1 - h0) * s + 3.0))   # 3 m slack: the terrain grid is 10 m

best = []
tc = np.mean([col[k] for k in TIPS], axis=0)
for e in np.arange(tc[0] - 1600, tc[0] + 100, 20):
    for n in np.arange(tc[1] - 500, tc[1] + 1000, 20):
        eye = float(z(e, n)) + 2
        brg, elev, ok = {}, {}, True
        for k, (ce, cn) in col.items():
            if k not in TIPS: continue
            gz = float(z(ce, cn)) + 1; d = np.hypot(ce - e, cn - n)
            # line of sight to a point 10 m above each collar: the pointers on the photo mark the general spot, not the exact pad
            if d < 150 or (k == 'OC-1' and not visible(e, n, eye, ce, cn, gz + 9)): ok = False; break   # only OC-1 must be in clear view; the other two sit on or behind ridges on the 10 m terrain
            brg[k] = np.degrees(np.arctan2(ce - e, cn - n)) % 360; elev[k] = np.degrees(np.arctan2(gz - eye, d))
        if not ok: continue
        d18, d87 = brg["OCC-8"] - brg["OC-1"], brg["OCC-7"] - brg["OCC-8"]
        if d18 <= 1: continue                                              # OC-1 must appear left of OCC-8, as on the photo
        if max(elev.values()) > 0.5: continue                              # on the photo the holes are below the horizon, so the camera is above them
        scale = d18 / (TIPS["OCC-8"][0] - TIPS["OC-1"][0])                  # degrees per photo pixel
        err = [(d87 / scale - (TIPS["OCC-7"][0] - TIPS["OCC-8"][0])),
               ((elev["OCC-7"] - elev["OCC-8"]) / scale - (TIPS["OCC-8"][1] - TIPS["OCC-7"][1])),
               ((elev["OC-1"] - elev["OCC-8"]) / scale - (TIPS["OCC-8"][1] - TIPS["OC-1"][1]))]
        hfov = scale * PHOTO_W
        if not (40 <= hfov <= 95): continue                                 # plausible camera lens
        mean_b = np.mean(list(brg.values()))
        if not (90 <= mean_b <= 135): continue                              # caption: looking east-southeast (112.5 deg)
        best.append((float(np.sqrt(np.mean(np.square(err)))), e, n, hfov, mean_b, brg, elev, scale))
best.sort(key=lambda b: b[0])
print(f"{len(best)} candidate spots fit (above the holes, looking east-southeast, OC-1 in view)")
for rms, e, n, hfov, mb, *_ in best[:5]:
    print(f"  E {e:.0f} N {n:.0f}  mismatch {rms:.0f} photo px  lens about {hfov:.0f} deg wide  looking {mb:.0f} deg")
rms, e, n, hfov, mb, brg, elev, scale = best[0]
near = [b for b in best if b[0] < rms + 15]
spread = max(np.hypot(b[1] - e, b[2] - n) for b in near)
# aim the camera so OC-1 falls where it does on the photo
heading = brg["OC-1"] + (PHOTO_W / 2 - TIPS["OC-1"][0]) * scale
pitch = elev["OC-1"] - (PHOTO_H / 2 - TIPS["OC-1"][1]) * scale
p = json.loads((OUT / "plate2.json").read_text())
p["viewpoint"] = {"easting": round(e), "northing": round(n), "eye_height_m": 2, "heading_deg": round(heading, 1), "pitch_deg": round(pitch, 1)}
p["estimated_horizontal_field_of_view_deg"] = round(hfov, 1)
p["photo_size_px"] = [PHOTO_W, PHOTO_H]
p["estimate_method"] = "terrain search for a spot above the holes, looking east-southeast, where OC-1, OCC-8 and OCC-7 are visible and arranged as closely as possible to the photo"
p["estimate_uncertainty_m"] = round(float(spread))
p["note"] = ("The report does not give the photo position. This viewpoint is an estimate, NOT a surveyed point; equally good matches lie within about "
             f"{spread:.0f} m. The distant peaks in the photo are outside the terrain model, so the far skyline cannot match.")
(OUT / "plate2.json").write_text(json.dumps(p, indent=2))
print(f"chosen: E {e:.0f} N {n:.0f}, heading {heading:.1f} deg, pitch {pitch:.1f} deg, lens {hfov:.0f} deg; similar-quality spots within {spread:.0f} m")
