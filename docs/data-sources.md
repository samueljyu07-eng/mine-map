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
| Property boundary | Traced from report Figure 2 (Claim Map), thick purple outline | Report effective 2026-06-30; traced 2026-11-12 | Blade Resources report | Figure pixel 8.2 m | WGS84 / UTM 12N (as printed on the figure) | **Approximate, traced from report Fig 2.** Georeferencing error about 8 m (grid fit RMS 2.2 m); inlet detail uncertain to about 100 m | No |
| Claim overlap zones (State or Private lands; legacy Placer or Tunnel claims) | Traced from report Figure 2, hatched areas | as above | Blade Resources report | Figure pixel 8.2 m | WGS84 / UTM 12N | Approximate, traced from report Fig 2 | No |
| Christmas Mine pit extent, access trail, Hayden smelter symbol | Traced from report Figure 2 | as above | Blade Resources report | Figure pixel 8.2 m | WGS84 / UTM 12N | Approximate, traced from report Fig 2. Trail is the printed dashes only. Smelter symbol position is doubtful (open question 20) | No |
| Gila River | USGS National Hydrography Dataset (NHD) flowlines, hydro.nationalmap.gov | Downloaded 2026-11-12 | US Government work, public domain | Large-scale (1:24,000 class) | NAD83 geographic | Exact per source (not traced) | No |
| State Route 77 | US Census Bureau TIGER/Line roads (TIGERweb) | Downloaded 2026-11-12 | US Government work, public domain | TIGER accuracy (typically within about 10 m) | NAD83 geographic | Exact per source (not traced) | No |
| San Carlos Reservation boundary | US Census Bureau TIGER/Line American Indian areas (TIGERweb) | Downloaded 2026-11-12 | US Government work, public domain | TIGER accuracy; a statistical boundary, not a legal survey | NAD83 geographic | Exact per source (Fig 2 shows a text label only, no line) | No |
| ZTEM survey footprint | Traced from report Figure 8: extent of the coloured grid visible on the figure | Survey July 2023 (Geotech); report effective 2026-06-30; traced 2026-11-12 | Blade Resources report | Figure pixel 5.7 m | WGS84 / UTM 12N (as printed) | **Approximate, traced from report Fig 8.** Georeferencing error about 23 m. Cut off by the map frame in the north | No |
| Select ZTEM flight lines L1150-L1250 | Traced from report Figure 8 ("select lines shown in report Fig 8") | as above | Blade Resources report | Figure pixel 5.7 m | WGS84 / UTM 12N | Approximate, traced from report Fig 8 (about 23 m) | No |
| Plate 2 photo and viewpoint | Report Plate 2 (page 32), photo by the report author | Photo date not stated | Blade Resources report | 1171 x 652 px | n/a | **Approximate viewpoint.** Position estimated from the terrain (scripts/estimate_plate2.py); equally good spots within about 130 m; adjustable in the viewer | No |
| History timeline | Event wording supplied by the project owner; report sections looked up in the report text | Report effective 2026-06-30 | Blade Resources report | n/a | n/a | Text only | No. Historical information, not verified by the QP |
| Report figures (Fig 2, Fig 8, Plate 2) | Extracted from the report PDF, pages 19, 33, 32 | Report effective 2026-06-30 | Blade Resources report | 1314 x 1700 px (Plate 2: 1314 x 652) | Fig 2 and Fig 8 state "WGS84 Zone 12N" | Fig 2 and Fig 8 georeferenced (below) | No |

## Fig 2 georeferencing

- Control points: the six crossings of the printed UTM grid lines. Residuals 1.6 to 3.1 m, RMS 2.2 m. One figure pixel is 8.2 m.
- Independent check against public lines: the figure's highway sits a median 19 m (90% within 38 m) from the TIGER road line; the figure's river a median 19 m (90% within 51 m) from the NHD line.
- The powerline is not drawn on Fig 2, so it is not traced.

## Fig 8 georeferencing

- Fig 8 has only one easting grid line, so the control points are the two printed grid crossings plus the seven "Historical Drill Sites" symbols (coordinates from report Table 3).
- Residuals: grid crossings 6 and 14 m; OC-1 4 m, OC-2 6 m, OC-5 9 m, OCC-8 14 m, OCC-7 26 m, OC-3 39 m, OCC-6 43 m. RMS 23 m. One figure pixel is 5.7 m.
- Independent check: the figure's highway sits a median 30 m (90% within 47 m) from the TIGER State Route 77 line.
- The resistivity colours are not exported to the viewer. docs/screens/fig8-trace-qa.jpg is an internal check picture (greyscale).
- Footprint: 38.6 km2 of coloured grid is visible on the figure. The report states 52 km2. They disagree: the figure is a window on the survey (the grid runs off the top of the map frame at about N 3,660,350, and part is hidden by the legend and title block).

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
../.venv/bin/python georef_fig2.py
../.venv/bin/python fetch_public_vectors.py
../.venv/bin/python trace_fig2.py
../.venv/bin/python check_boundary.py
../.venv/bin/python georef_fig8.py
../.venv/bin/python estimate_plate2.py
```

`data/processed/timeline.json` is written by hand (ten events). `data/processed/plate2.json` is updated by `estimate_plate2.py`.
