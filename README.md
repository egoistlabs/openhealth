# OpenHealth

A local-LLM companion for astronauts on long missions, built for the NASA Space Apps Challenge 2026.

The spec is still being locked. Until it lands in `docs/`, this repo is the place to collect everyone's work.

## Where things go

| Folder | What belongs there |
| --- | --- |
| [`context/`](context/) | Raw material: research, notes, references, meeting notes, challenge info. Unpolished is fine. |
| [`docs/product/`](docs/product/) | What we are building and why: scope, users, features, demo script. |
| [`docs/design/`](docs/design/) | How it looks and feels: flows, wireframes, mockups, brand, copy. |
| [`docs/tech-spec/`](docs/tech-spec/) | How it is built: architecture, data model, model setup, decisions. |

Code will live at the repo root (for example `app/`) once the spec is locked.

## Adding your work

1. Put the file in the folder that fits. If unsure, use `context/`.
2. Name it in lowercase with hyphens, for example `sleep-research-notes.md`.
3. Prefer Markdown. Images, PDFs and exports are fine too. For Figma or Google Docs, add a short `.md` file with the link and a one-line summary.
4. Commit straight to `main`. Small, frequent commits are better than one big dump.

Do not commit secrets, API keys, or personal data.
