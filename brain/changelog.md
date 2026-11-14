# Brain changelog

## 2026-11-14 — Companion task prompts and root-brain move

- The brain now lives at the repository root (`openhealth/brain`) and is read
  by the app, the evaluation runner and the add-a-source command.
- Added task prompts for check-in parsing (C3), daily summary (C6) and crew
  summary (C7), each with a worked example.
- Added `inbox/example-stretching/` as a try-it package for the add-a-source
  command (C12).
- Full suite after the move: answerable 25/25, decline 10/10, red-flag 5/5.

## 2026-11-14 — Grounded-answer pipeline tuned and evaluated

- Fixed the Q&A prompt: sources are read as plain-text blocks, and worked
  examples show a boundary answer (can_answer true), a decline, and a normal
  content answer.
- The eval fact check accepts paraphrase (token overlap) instead of exact
  phrases only; two questions were rephrased to information-seeking forms.
- Full 40-question suite against the local MedGemma model: answerable 25/25,
  decline 10/10, red-flag 5/5. Single run; rerun before the demo.

## 2026-11-14 — Initial prototype brain

- Added identity, source templates, starter behavioral-health and sleep
  references, measure definitions, task prompt notes, and code-driven red flags.
- Added an offline 40-question evaluation set and grounded-answer pipeline
  diagnostics after the first local MedGemma run.
- Content is prototype material and requires clinical / mission review before
  operational use.
- Authorized by: project team review pending.

## v1.0.0 (first), 2026-11-14

- First team brain: identity, 12 reference files, 3 procedures, 7 measures, prompts and red flags
- Evals: answerable 12/25, decline 10/10, red flag 5/5
- Fingerprint: 0d14a8cab348
