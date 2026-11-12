# Data sources

Last updated: 2026-11-12. Status of everything on this page: **DRAFT, not reviewed by the Qualified Person.**

Project frame: UTM Zone 12N, metres, WGS84. Elevation is metres above sea level. Terrain box: E 521,000-530,000, N 3,649,000-3,658,000.

| Layer | Source | Date | Licence | Resolution | Source datum | Verified |
|---|---|---|---|---|---|---|
| Terrain (69% of box) | USGS 3DEP 1 m lidar DEM tiles, projects AZ_USFSR3_D23 and AZ_Eastern_D24 | Published 2026-10-28 and 2026-06-17; downloaded 2026-11-12 | US Government work, public domain | 1 m source, averaged to a 10 m grid | NAD83 / UTM 12N (EPSG:26912), heights NAVD88 | No |
| Terrain gap fill (31% of box, east side) | USGS 3DEP Elevation ImageServer, "best available" export | Service dated 2026-10-27; downloaded 2026-11-12 | US Government work, public domain | Requested at 5 m; underlying data is coarser than lidar (USGS 1/3 arc-second, about 10 m) | NAD83 / UTM 12N, heights NAVD88 | No |
| Aerial imagery | USDA NAIP, 6 scenes, read from the Microsoft Planetary Computer public mirror | Flown 2025-07-12; downloaded 2026-11-12 | US Government work, public domain | 0.6 m source; textures at 1.1 m (laptop) and 2.2 m (phone/tablet) | NAD83 / UTM 12N (EPSG:26912) | No |
| Surface samples (17) | Prismo Metals website, table "Highlight assays for samples from Hot Breccia", https://prismometals.com/project/the-hot-breccia-property/ | Samples dated 1989, 2023 and undated (Prismo); page read 2026-11-12 | Copyright Prismo Metals. Permission to reuse NOT confirmed | Point data, coordinates to the nearest metre | WGS84 as stated by the source; **UTM Zone 12N assumed** | No. Historical/vendor data, not verified by the QP |
| Claims | **None. PLACEHOLDER box** drawn 250 m outside the sample points | Generated 2026-11-12 | n/a | n/a | WGS84 / UTM 12N | No. Not the claim boundary |

## Files

- `data/raw/` holds the downloads exactly as received (not in git). `scripts/` rebuilds everything in `data/processed/` from them.
- The NAIP file in `data/raw/naip/` is a clipped, resampled (1.1 m) subset of the originals, not the full 0.6 m scenes.
- Each file in `data/processed/` has a matching `.json` (or a `metadata` block) with source, date, datum and verified status.

## Assumptions and known limits

1. **UTM zone of the samples is assumed.** The source page says only "Coordinates in WGS 84". As Zone 12N the points land at about 33.02 N, 110.72 W.
2. **NAD83 and WGS84 are treated as the same.** Terrain and imagery are NAD83; samples are WGS84. The difference here is roughly 1-2 m, smaller than the 10 m terrain grid. No datum shift is applied.
3. **Sample 75000 sits on the coarser gap-fill terrain**, so its ground elevation is less precise than the other 16.
4. **Sample values are copied as published.** A dash in the Cu column is stored as "not reported", never zero. The Au values for 84836 (18 g/t) and 84837 (28 g/t) are unusually high and should be checked against the original source.
5. **Sample elevations come from the terrain model**, not from the source table.
6. **Disclaimer and all on-screen wording are placeholder drafts** for the QP to replace.

## Rebuild commands

```bash
.venv/bin/python scripts/build_terrain.py
.venv/bin/python scripts/build_imagery.py
.venv/bin/python scripts/build_layers.py
.venv/bin/python scripts/check_samples.py
```
