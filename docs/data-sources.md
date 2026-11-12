# Data sources

Last updated: 2026-11-12. Status of everything on this page: **DRAFT, not reviewed by the Qualified Person.**

Project frame: WGS84 / UTM Zone 12N (EPSG:32612), metres. Elevation is metres above sea level.
Terrain box: E 518,000-530,000, N 3,649,000-3,661,000.

| Layer | Source | Date | Licence | Resolution | Source datum | Exact or approximate | Verified |
|---|---|---|---|---|---|---|---|
| Terrain (77% of box) | USGS 3DEP 1 m lidar DEM, projects AZ_USFSR3_D23, AZ_Eastern_D24, AZ_NorthCentral_B23, CA_AZ_FEMA_R9_Lidar_2017_D18 | Downloaded 2026-11-12 | US Government work, public domain | 1 m source (some tiles read at their 4 m overview), averaged to a 10 m grid | NAD83 / UTM 12N, heights NAVD88 | Exact (measured, resampled) | No |
| Terrain gap fill (23% of box, mostly east) | USGS 3DEP Elevation ImageServer, best-available export | Service dated 2026-10-27; downloaded 2026-11-12 | US Government work, public domain | Requested at 5 m; underlying data about 10 m | NAD83 / UTM 12N, heights NAVD88 | Exact but coarser | No |
| Aerial imagery | USDA NAIP, 9 scenes, via the Microsoft Planetary Computer public mirror | Flown 2025-07-12; downloaded 2026-11-12 | US Government work, public domain | 0.6 m source; textures 1.46 m (laptop), 2.9 m (phone/tablet) | NAD83 / UTM 12N | Exact (resampled) | No |
| Historical drill holes (7) | NI 43-101 Technical Report, Hot Breccia Project, B.L. Laird P.Geo., effective 2026-06-30, Table 3 (via collars.csv) | Drilled 1974-1981 | Blade Resources report | Collars to the nearest metre | WGS84 / UTM 12N | Exact as tabulated; traces ASSUMED vertical (no downhole surveys) | No. Historical, not verified by the QP |
| Surface samples, report (30 + 1) | Same report, Table 4 (Prismo, March 2024) and QP check sample HBLR-01 (Feb 2026, ALS) (via samples.csv) | March 2024; Feb 2026 | Blade Resources report | Points to the nearest metre | WGS84 / UTM 12N | Exact as tabulated | Prismo: no. HBLR-01 is the QP's own check sample |
| Surface samples, website (17) | Prismo Metals website table, https://prismometals.com/project/the-hot-breccia-property/ | 1989, 2023, undated; page read 2026-11-12 | Copyright Prismo Metals; permission NOT confirmed | Points to the nearest metre | WGS84 stated; **UTM Zone 12N assumed** | Exact as published, zone assumed | No. Historical/vendor data |
| Property boundary | **None yet. PLACEHOLDER box** 250 m outside the plotted points | Generated 2026-11-12 | n/a | n/a | WGS84 / UTM 12N | Placeholder | No |
| Report figures (Fig 2, Fig 8, Plate 2) | Extracted from the report PDF, pages 19, 33, 32 | Report effective 2026-06-30 | Blade Resources report | 1314 x 1700 px (Plate 2: 1314 x 652) | Fig 2 and Fig 8 state "WGS84 Zone 12N" | Not yet georeferenced | No |

## Files

- `data/raw/` holds inputs exactly as received (not in git). `scripts/` rebuilds everything in `data/processed/`.
- The NAIP file and the `usgs_3dep_1m_clips` files in `data/raw/` are clipped, resampled subsets of the originals.
- Each file in `data/processed/` carries its own source, date, datum, accuracy and verified fields.

## Assumptions

1. NAD83 (terrain, imagery) and WGS84 (report data) are treated as the same. They differ by roughly 1-2 m here; no shift applied.
2. Drill traces are vertical lines from the tabulated collar elevation to the tabulated depth. No downhole surveys exist.
3. Sample pins sit on the terrain model. HBLR-01's listed elevation (2474, probably feet) is ignored.
4. Sample values are text copied from the source files. Empty means not reported.
5. The website samples' UTM zone is assumed (the page states only WGS84).

## Rebuild commands

```bash
cd scripts
../.venv/bin/python fetch_terrain_clips.py
../.venv/bin/python build_terrain.py
../.venv/bin/python build_imagery.py
../.venv/bin/python build_layers.py
```
