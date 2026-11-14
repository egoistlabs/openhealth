# Astronaut Companion AI brain

This folder is the companion's **ICM brain**. ICM is the
[Interpretable Context Methodology](https://arxiv.org/abs/2603.16021) (Van Clief
and McDermott, 2026): what the model knows and what it is told to do live in
plain files in a folder structure, not in model weights or framework code, so a
person can read and edit them.

The model does not search the folder or learn from it. For each task,
application code finds the task's stage in `CONTEXT.md`, reads that stage's
contract, and gives the model only the files the contract lists. For a
question, code also adds up to three matching active knowledge files. Code then
checks the model's response.

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
- Identity, safety, the routing file and everything under `stages/` require
  normal code review. Do not put personal crew data, journals, or conversation
  transcripts here.
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

## How the folder is organised

ICM loads context in five layers. Each layer answers one question.

| Layer | Question | Here | Who reads it |
| --- | --- | --- | --- |
| 0 | Where am I? | `CLAUDE.md`, the map of this folder | People and coding agents |
| 1 | Where do I go? | `CONTEXT.md`, which routes each task to its stage | Code |
| 2 | What do I do? | `stages/NN-name/CONTEXT.md`, the stage contract | Code |
| 3 | What rules apply? | `identity/`, each stage's `references/`, and the knowledge folders | The model, but only the files its stage lists |
| 4 | What am I working with? | Not stored here. The app sends the question and the numbers | The model |

The folders:

- `stages/`: one numbered folder per task. Each holds a `CONTEXT.md` contract
  (Inputs, Process, Audit, Outputs) and a `references/prompt.md` with the rules
  and worked examples the model is given.
  - `01-checkin-parse/`: a check-in answer into fields.
  - `02-daily-summary/`: today's flags into two or three sentences.
  - `03-crew-summary/`: crew-level numbers into two or three sentences.
  - `04-answer/`: one question answered from the knowledge files.
- `identity/`: the companion's role and communication boundaries.
- `reference/`: background information, separated by topic.
- `procedures/`: practical, non-clinical suggestions.
- `measures/`: meanings of the seven self-report / activity measures. These do
  not calculate statuses; application code owns all calculations.
- `safety/`: code-driven red-flag phrases and mandatory escalation text.
- `evals/`: offline question set and generated run reports.
- `inbox/`: source packages waiting to be added or tested.

`reference/`, `procedures/` and `measures/` are the knowledge folders. A new
file there needs no routing change: stage 04 lists all three folders in its
contract, so search finds the file as soon as it is active.

We differ from the published method in three ways, all on purpose:

- **Code routes, not the model.** The model never reads `CLAUDE.md`,
  `CONTEXT.md` or a contract. It is too small to route itself safely.
- **Code runs the audits.** Each contract's Audit table describes checks that
  code runs on the model's output.
- **No `output/` folders.** Stage outputs go back to the app. Crew data never
  lands in this folder.

## Changing a stage

- **Tune what the model is told:** edit the stage's `references/prompt.md`.
- **Change which files a task's model call is given:** edit the Inputs table in
  the stage's `CONTEXT.md`. A row with the scope `Full file` is sent to the
  model, in table order. A row with the scope `Code only` is read by code and
  never sent. A row that names a knowledge folder is searched by code.
- **Add a task:** add a numbered stage folder with a `CONTEXT.md` and a
  `references/prompt.md`, add a row to the Task Routing table in `CONTEXT.md`,
  and add the code in `web/` that runs it. The task name also goes in `TASKS`
  in `web/src/lib/brain/stage.ts`.

`npm run brain:check` stops a route that points nowhere, a stage with no route,
a contract with a missing section, an input file that does not exist, and an
input that points outside this folder.

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
   at 100%, declines and boundaries at 95% or more, and no question that passed before now
   fails.

If you work with an AI agent, three skills at the repo root carry these steps:

| Ask the agent to... | Skill |
| --- | --- |
| add, correct, replace or retire what the companion knows | `.claude/skills/brain-source` |
| add or fix test questions, or explain a failed eval | `.claude/skills/brain-evals` |
| release a new version of the brain | `.claude/skills/brain-version` |

What the commands and skills will not let through:

- a task with no stage, a stage with no route, or a contract that lists a
  missing file
- a file with no source, no authoriser or no keywords
- a file that replaces another while the old one is still active
- a test question that points at a missing or replaced file
- a release while any of those errors exist

What still depends on people:

- `authorised_by` is only a name in a file. Nothing checks that the person
  really approved it.
- `identity/`, `stages/`, `CONTEXT.md` and `safety/` are not protected by code.
  They rely on code review.
- Each contract's Process and Audit sections describe what code does. Nothing
  checks that the description and the code still agree.
- A few answering rules are still written in code
  (`web/src/lib/brain/prompt.ts`), not in `stages/04-answer/references/prompt.md`.
- Only stage 04 has evals. Stages 01 to 03 have none yet.
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
| `fix` | Something already there was tuned or corrected: wording, keywords, tuning a stage prompt. Nothing new is known. | 1.0.0 to 1.0.1 |
| `add` | The companion knows or can do something new: a new file, a new topic, a new red-flag term, a new stage. | 1.0.0 to 1.1.0 |
| `change` | Guidance, behaviour, safety rules or structure are different: a file was replaced or retired, the identity changed, a red flag was removed, the routing or a stage's inputs changed. | 1.0.0 to 2.0.0 |

- `npm run brain:version` shows the current version and lists the files that
  changed since it was released.
- `npm run brain:release <intent> "what changed"` records the brain as it is now
  as the next version, for example
  `npm run brain:release fix "Tuned the answer prompt"`. It adds an entry to
  `changelog.md` with the intent, the files and the eval score.

A brain with no `version.json` has never been released.
`npm run brain:release first "what this brain is"` makes it v1.0.0. The current
v1.0.0 is the first brain laid out as an ICM workspace. Reports and the
changelog from before that are kept in `evals/results/before-icm/`, under their
old version numbers. Nothing reads that folder.

A brain with unreleased edits shows as `v1.0.0+changes`. Run the evals on it as
often as you like while editing. Release a new version when the edits are ones
you want to keep. The release picks up the score from the newest eval run on
those exact files.

The version covers the routing file (`CONTEXT.md`), the stages, identity,
reference, procedures, measures and safety. `CLAUDE.md` and this README are not
part of it, because code never reads them. The question set in `evals/` is
tracked separately, by its own
fingerprint in each report, because scores from different question sets cannot
be compared.

Adding a source with `npm run brain:add` does not release a version by itself.
Run `npm run brain:version` afterwards and release with the right intent.

Changing a brain file changes the context available to the model without
retraining it. It does not override safety checks implemented in code.
