# Hot Breccia 3D Walkthrough (Blade Resources, CSE:AZCU)

## Goal
Browser-based 3D walkthrough of the Hot Breccia copper exploration project, Arizona.
Audience: investors and website visitors. Must run on laptop, iPad and phone.

## Stack
Vite + TypeScript + Three.js. Python for data processing.

## Rules for data
- Coordinates: WGS84 / UTM Zone 12N (EPSG:32612) throughout, as in the NI 43-101 report.
  Units metres. Elevation = metres above sea level; depth positive down.
- NEVER invent data. Missing = clearly labelled placeholder, and tell me.
- Anything traced from an image is labelled "approximate, traced from report Fig X" and carries
  its measured georeferencing error.
- Every layer carries metadata: source, date, datum, verified/unverified, approximate/exact.
- Raw data in /data/raw (never edited, gitignored). Processed output in /data/processed.
- Read /data/raw/data-notes.md first. Open issues live in /docs/open-questions.md.
- No AI-generated imagery. No uploading project data to third-party services.

## Compliance (public company, NI 43-101)
- No grade, tonnage, resource or "deposit" language. No grade colouring, volumes or shells.
- Targets are "conceptual exploration targets".
- Historical data is labelled "historical, not verified by the QP".
- Blade has not conducted any exploration: present historical and third-party data only.
- Drill holes: no intercepts or grades. Traces are "assumed vertical, no downhole surveys exist".
- Samples are coloured by sample type, never by grade. Individual sample values may be shown on
  click exactly as published, with sample type and source next to them.
- Show a disclaimer screen before the model opens. Its text lives in /docs/disclaimer.md, which
  holds a placeholder for Blade's approved wording. Do NOT write disclaimer wording yourself.
- Show "DRAFT, not reviewed by the Qualified Person" in the footer.
- Do not show claim counts or ownership terms.

## Working style
- I am a beginner. Explain each step in plain language and tell me exactly what to run.
- Before any code on a new phase: propose a short plan and wait for my approval.
- Small steps; commit to git after each working step.
- Before finishing any task, run checks and report what you verified.
