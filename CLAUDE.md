# Hot Breccia 3D Walkthrough (Blade Resources, CSE:AZCU)

## Goal
Browser-based 3D walkthrough of the Hot Breccia copper exploration project, Arizona,
accurate to Blade's data.
Audience: investors and website visitors. Must run on laptop, iPad and phone.

## Stack
Vite + TypeScript + Three.js (React Three Fiber if needed). Python for data processing.
Deploy to Cloudflare Pages or Vercel.

## Rules for data
- Coordinates: UTM Zone 12N. Units: metres. Elevation = metres above sea level. Depth is positive down.
- Never mix datums (WGS84 vs NAD27 vs NAD83). Record the datum of every dataset.
- NEVER invent data. If something is missing, use a clearly labelled placeholder and tell me.
- Every layer carries metadata: source, date, datum, verified/unverified.
- Raw data lives in /data/raw (never edited, gitignored). Processed output goes in /data/processed.
- No AI-generated imagery.
- No uploading project data to third-party services.

## Compliance (public company, NI 43-101)
- No grade, tonnage, resource or "deposit" language. Targets are "conceptual exploration targets."
- Historical data is labelled "historical, not verified by the QP."
- Individual sample assay values may be shown exactly as published, with the historical /
  not-verified label and a note that selected samples are not representative. The QP decides
  before release.
- Show the disclaimer screen before the model opens.
- Show "DRAFT, not reviewed by the Qualified Person" in the footer.
- All text and labels are reviewed by the Qualified Person before release.

## Working style
- I am a beginner. Explain each step in plain language and tell me exactly what to run.
- Before any code on a new phase: propose a short plan and wait for my approval.
- Small steps. One feature per task. Commit to git after each working step.
- Before finishing a task, run checks and tell me what you verified.
