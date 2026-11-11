# Hot Breccia 3D Walkthrough (Blade Resources, CSE:AZCU)

## Goal
Browser-based 3D walkthrough of the Hot Breccia project, accurate to Blade's data.
Audience: investors and website visitors. Must run on laptop, iPad and phone.

## Stack
Vite + TypeScript + Three.js (React Three Fiber if needed). Python for data processing.
Deploy to Cloudflare Pages or Vercel.

## Rules for data
- Coordinates: UTM Zone 12N (confirm datum per dataset; WGS84 vs NAD27 must never be mixed).
- Units: metres. Elevation = metres above sea level. Depth is positive down.
- NEVER invent data. If something is missing, use a clearly marked placeholder and tell me.
- Every layer carries metadata: source, date, datum, verified/unverified.
- Raw data lives in /data/raw (never edit). Processed files go in /data/processed.

## Compliance (public company, NI 43-101)
- No grade, tonnage, resource or "deposit" language. Targets are "conceptual exploration targets."
- Historical data is labelled "historical, not verified by the QP."
- Show the disclaimer screen before the model opens.
- All text and labels are reviewed by the Qualified Person before release.

## Working style
- I am a beginner. Explain each step in plain language and tell me what to run.
- Small steps. One feature per task. Commit to git after each working step.
- Before finishing a task, run checks and tell me what you verified.
