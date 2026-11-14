# Astronaut Companion AI brain

This folder is the companion's **ICM (Information-Centered Method) brain**: a
small, human-readable source of approved context. The model does not search the
folder or learn from it. Application code selects up to three matching active
files, adds them to a short prompt, and checks the model's response.

The folder lives at the **repository root**, next to `web/`, so that people who
do not write code can find and edit it. Nothing in `web/` reads its own copy:
the app, the evaluation runner and the add-a-source command all resolve this
one folder. Launching the app from `web/` or from the repository root works, and
`BRAIN_DIR` can point the tooling at a staged copy when testing a new source.

## How to edit it

- Keep one subject per file, in plain language, and under about 400 words.
- Reference, procedure, and measure files must use the frontmatter template
  below. Include a source and the person who authorized it before treating
  content as operational guidance.
- `status: replaced` files are retained for history but never sent to the model.
- Identity, prompts, and safety files require normal code review. Do not put
  personal crew data, journals, or conversation transcripts here.
- This is a prototype knowledge base, not clinical guidance. A qualified
  mission medical professional must review and authorize content before use.

```yaml
---
title: Example topic
topic: sleep
keywords: [sleep, schedule]
source: NASA Human Research Program — Hazard of Isolation and Confinement
authorised_by: Pending clinical review
added: 2026-11-14
status: active
replaces:
---
```

## Folders

- `identity/`: the companion's role and communication boundaries.
- `reference/`: background information, separated by topic.
- `procedures/`: practical, non-clinical suggestions.
- `measures/`: meanings of the seven self-report / activity measures. These do
  not calculate statuses; application code owns all calculations.
- `prompts/`: fixed-task prompt guidance.
- `safety/`: code-driven red-flag phrases and mandatory escalation text.
- `evals/`: offline question set and generated run reports.
- `inbox/`: source packages waiting to be added or tested.

## Adding a source

A package is a folder in `inbox/` with one source file and a `tests.jsonl`:

```
inbox/short-stretching/
├── procedure.md     written in the file template
└── tests.jsonl      questions it must now answer, and one it must still decline
```

One command validates it, tests it against a temporary copy of this folder, and
only then makes it live:

```bash
cd web
npm run brain:add -- inbox/short-stretching
npm run brain:add -- inbox/short-stretching --package-only   # demo: package tests only
```

The full command runs the package's tests and the whole test set, and refuses to
go live if a question that passed before now fails. Replaced files are marked
`status: replaced` and kept. Every live change is recorded in `changelog.md`.

## Changing the brain safely

Every change follows the same loop. Run the commands from the `web/` folder:

1. **Change** a file, or add one, using the template above. Replace old
   guidance by adding a new file and marking the old one `status: replaced`.
   Never delete a file.
2. **Add questions** for it in `evals/questions.jsonl`: at least two it must
   answer and one nearby question it must still decline.
3. **Check** with `npm run brain:check`. It takes a second and does not use the
   model.
4. **Evaluate** with `npm run evals`.
5. **Release** with `npm run brain:release <intent> "what changed"`, only if red flags are
   at 100%, declines at 95% or more, and no question that passed before now
   fails.

If you work with an AI agent, three skills at the repo root carry these steps:

| Ask the agent to... | Skill |
| --- | --- |
| add, correct, replace or retire what the companion knows | `.claude/skills/brain-source` |
| add or fix test questions, or explain a failed eval | `.claude/skills/brain-evals` |
| release a new version of the brain | `.claude/skills/brain-version` |

What the commands and skills will not let through:

- a file with no source, no authoriser or no keywords
- a file that replaces another while the old one is still active
- a test question that points at a missing or replaced file
- a release while any of those errors exist

What still depends on people:

- `authorised_by` is only a name in a file. Nothing checks that the person
  really approved it.
- `identity/`, `prompts/` and `safety/` are not protected by code. They rely on
  code review.
- Passing the evals shows the companion found and repeated the right file. It
  does not show that the file itself is medically correct.

## Versions

The brain has a version number, kept in `version.json`. Every eval report
records the brain version it ran against, so two scores can be compared fairly.

Each release states an intent: why the change was made. The intent decides
which part of the number goes up, so the number itself tells you what kind of
change it was.

| Intent | Use it when | Version |
| --- | --- | --- |
| `fix` | Something already there was tuned or corrected: wording, keywords, prompt tuning. Nothing new is known. | 1.0.0 to 1.0.1 |
| `add` | The companion knows something new: a new file, a new topic, a new red-flag term. | 1.0.0 to 1.1.0 |
| `change` | Guidance, behaviour or safety rules are different: a file was replaced or retired, the identity changed, a red flag was removed. | 1.0.0 to 2.0.0 |

- `npm run brain:version` shows the current version and lists the files that
  changed since it was released.
- `npm run brain:release <intent> "what changed"` records the brain as it is now
  as the next version, for example
  `npm run brain:release fix "Tuned the answer prompt"`. It adds an entry to
  `changelog.md` with the intent, the files and the eval score.

A brain with unreleased edits shows as `v1.0.0+changes`. Run the evals on it as
often as you like while editing. Release a new version when the edits are ones
you want to keep. The release picks up the score from the newest eval run on
those exact files.

The version covers identity, reference, procedures, measures, prompts and
safety. The question set in `evals/` is tracked separately, by its own
fingerprint in each report, because scores from different question sets cannot
be compared.

Adding a source with `npm run brain:add` does not release a version by itself.
Run `npm run brain:version` afterwards and release with the right intent.

Changing a brain file changes the context available to the model without
retraining it. It does not override safety checks implemented in code.
