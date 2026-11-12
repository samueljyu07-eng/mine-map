# Hot Breccia data notes

Source: NI 43-101 Technical Report, Hot Breccia Project, B.L. Laird P.Geo., effective June 30, 2026 (prepared for Blade Resources Inc.).

## Coordinates
- WGS84 / UTM Zone 12N (EPSG:32612) throughout the report. Elevations in metres unless stated.
- Property centre: 524868 E, 3654185 N.
- Blade's deck regional map (slide 16) says NAD27; use WGS84 UTM 12N and confirm with Blade.

## Files
- collars.csv: Table 3 (7 holes: OC-1, OC-2, OC-3, OC-5, OCC-6, OCC-7, OCC-8). Dip -90 and azimuth 0 for all. No downhole surveys exist in the report, so traces are assumed vertical. Label them that way.
- samples.csv: Table 4 (30 Prismo surface samples, March 2024) plus QP check sample HBLR-01 (Feb 2026).
- NOT in files: AP-2 and AP-1 (Phelps Dodge holes; no coordinates in the report; AP-2 is on the adjacent Henry Patented Claims, just east of the property). Bear Creek surface samples (Table 5, no coordinates).

## Things to resolve with the Qualified Person before anything is public
1. Slice elevation: the report calls the resistivity slice "-900 metres RL" (elevation, 900 m below sea level). Blade's deck calls it "-900m depth slice". Surface here is roughly 650-850 m above sea level, so these differ by about 1,600 m. Use RL until the QP confirms.
2. OC-1 intercept: the report's own section 12 gives two recalculations: 27.12 m @ 0.44% Cu from 636.13 m, or 23.47 m @ 0.49% Cu from 639.78 m. The summary still cites 23.5 m @ 0.54% from 639.8 m, and Table 6 (and the deck) list from 640.08 to 663.55 with 27.12 m, which does not match either.
3. AP-2 is an adjacent-property hole (Two Queens / Henry claims), described in section 23. It must be labelled adjacent and not indicative of Hot Breccia.
4. Sample 256644 (5.69% Cu) is a selected grab of one clast. The QP check sample about 11 m away returned 0.057% Cu and 0.853 g/t Au. Show sample type and both values.
5. Distances differ inside the report: Christmas Mine 2 km vs 3 km; Hayden smelter 2 km vs 4 km. Prismo's website says 5 km. Measure from the georeferenced geometry and have the QP confirm.
6. Phase II drilling is 6,000 m in the text and 5,000 m in the budget. The summary says "VTEM" where the rest says "ZTEM" (Geotech Z-axis tipper EM).
7. Hole depths differ slightly between Tables 2 and 3 (OC-1 733.3 vs 733.9; OCC-8 886.4 vs 886.3).
8. Historical drill results are unverified: the core was discarded. All historical data carries the report's "not verified" language.
9. Claims: parts overlap State/Private land (invalid) and legacy Placer/Tunnel claims. The claim table is good through Sept 1, 2026; confirm renewal status.

## Found while building the viewer (2026-11-12)
10. Collar elevations: OC-1 is tabulated at 736 m but the USGS lidar terrain there is 752 m (16 m higher); OCC-8 is tabulated at 728 m vs 746 m terrain (18 m higher). The other five collars agree within 9 m. The viewer draws each trace from the tabulated elevation, so these two collars start below the ground surface.
11. Site-visit count: the brief wording says six historical sites were confirmed in Feb 2026, but with OCC-6 not visited and OC-5 only a suspected pad, five holes remain. The viewer uses the brief wording unchanged; confirm with Blade which sites were confirmed.
12. Hole name: the brief refers to "OCC-5"; the collar table has "OC-5". The viewer uses OC-5.
13. Sample 256627: the source row has only three values, so the column assignment is assumed (flag carried from samples.csv).
14. HBLR-01: no Ag value is listed; the report quotes Au as 0.853 and 0.852 in different places; listed elevation 2474 is probably feet.
15. The Prismo website table (17 samples) uses different sample numbers from report Table 4 (30 samples). Its UTM zone is assumed and permission to reuse it is not confirmed. It is off by default in the viewer.
16. Terrain and imagery are NAD83; report data is WGS84. Treated as identical (about 1-2 m apart). Confirm this is acceptable.
17. Figure 8: the report caption says "-900 metres RL" but the title block printed on the figure says "-900m Depth Slice" (same issue as item 1).
18. The report PDF's embedded document title reads "New Opportunities for Carbonate Associated Gold in British Columbia", which looks like a leftover from another document.
19. Disclaimer: docs/disclaimer.md holds a placeholder only. Blade's approved wording is needed before release.
20. Fig 2 "Hayden Smelter" symbol: once Fig 2 is georeferenced from its printed grid, the symbol plots at about E 519,200, N 3,652,770. The smelter plant visible in the 2025 aerial imagery is about 1.9 km to the east-southeast (around E 520,900, N 3,651,800). The symbol was therefore NOT used as a control point. This affects the smelter distance question in item 5.
21. Fig 2 georeferencing: grid fit RMS 2.2 m (worst 3.1 m); one figure pixel is 8.2 m. Highway 77 and the Christmas Mine pit outline line up with the imagery to within about one drawn line width (roughly 25 m), judged by eye. The Gila River line on the figure is generalised and departs from the 2025 channel by more than that in places.
