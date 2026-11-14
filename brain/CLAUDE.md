# Astronaut Companion brain

This folder holds everything the companion's small local model is told and allowed to use. It is an ICM workspace ([Interpretable Context Methodology](https://arxiv.org/abs/2603.16021)): the folder structure decides what the model reads, so a person can read it and change it.

You are here to maintain the brain. The companion's own model never reads this file.

## Folder Map

```
brain/
├── CLAUDE.md            (you are here: the map)
├── CONTEXT.md           (task routing: which stage handles which task)
├── stages/
│   ├── 01-checkin-parse/   (check-in answer into fields)
│   ├── 02-daily-summary/   (today's flags into two or three sentences)
│   ├── 03-crew-summary/    (crew-level numbers into two or three sentences)
│   └── 04-answer/          (one message answered, talked through, or declined)
├── identity/            (who the companion is)
├── reference/           (background knowledge, one topic per file)
├── procedures/          (step-by-step guidance)
├── measures/            (what the seven check-in measures mean)
├── safety/              (red-flag terms, support terms and their fixed messages)
├── evals/               (test questions and run reports)
├── inbox/               (source packages waiting to be added)
├── README.md            (how to edit, test and version the brain)
├── version.json         (written by the release command)
└── changelog.md         (one entry per version and per added source)
```

Each stage folder holds a `CONTEXT.md` (the contract: Inputs, Process, Audit, Outputs) and a `references/prompt.md` (the rules and worked examples the model is given).

## The five layers

| Layer | File | Who reads it |
|-------|------|--------------|
| 0. Where am I? | `CLAUDE.md` | People and coding agents |
| 1. Where do I go? | `CONTEXT.md` | Code. It routes each task to its stage |
| 2. What do I do? | `stages/NN-name/CONTEXT.md` | Code. The Inputs table decides which files the model is given |
| 3. What rules apply? | `identity/`, each stage's `references/`, `reference/`, `procedures/`, `measures/` | The model, but only the files its stage lists |
| 4. What am I working with? | Nothing in this folder | The app sends the question and the numbers with each request |

## Routing

| You want to | Go to |
|-------------|-------|
| Add, correct, replace or retire what the companion knows | The `brain-source` skill in `../.claude/skills/` |
| Add or fix test questions, or explain a failed eval | The `brain-evals` skill |
| Release a new version | The `brain-version` skill |
| See which stage handles a task | `CONTEXT.md` |
| Change what a task's model call is given or told | That stage's `CONTEXT.md` and `references/prompt.md`. Needs a code review |

## What to Load

| Task | Load these | Do NOT load |
|------|-----------|-------------|
| Change a knowledge file | The file, and `evals/questions.jsonl` lines that cite it | Other topics |
| Change red-flag terms | `safety/red-flags.json`, `evals/emergencies/open.jsonl` | `evals/emergencies/sealed.jsonl`. Reading it spoils the score the team reports |
| Tune a stage prompt | That stage's `CONTEXT.md` and `references/prompt.md` | Other stages |

## Rules

- A stage's Inputs table is the only way a brain file reaches the model. `Full file` means sent to the model, in the order the table lists the files. `Code only` means read by code and never sent.
- Stage contracts hold no rules or examples. Those go in the stage's `references/`.
- Never delete a knowledge file. Set `status: replaced`.
- No crew data, journals or conversations in this folder. Stages have no `output/` folders for that reason.
- Run `npm run brain:check` from `web/` after any change. `README.md` has the full loop.
