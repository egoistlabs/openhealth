---
name: brain-source
description: Add, update, replace or retire a knowledge file in the companion's brain (brain/). Use when someone gives new guidance, a new or corrected procedure, a document to add, or asks to remove or correct what the companion knows about a topic.
---

# Brain source

The companion only knows what is in `brain/`. This skill changes that knowledge safely: every change gets a named source, a named person who authorised it, and test questions, and it only becomes a version after the evals pass.

Run every command from `web/`. The brain is the `brain/` folder at the repo root, so file paths below start from the repo root. This project uses `npm run`.

The brain is an ICM workspace ([Interpretable Context Methodology](https://arxiv.org/abs/2603.16021)). Read `brain/CLAUDE.md` first. It is the map: it shows the layers, and it says what to load for each kind of change and what to leave unread.

## Before you write anything

Get these from the person. Do not guess or fill them in yourself.

- **The content**, in their words or their document.
- **Source**: the document, message or instruction it comes from.
- **Authorised by**: the person or role who approved it. If nobody has yet, write `Pending clinical review` and tell the person the file is unreviewed.

If the content tells a crew member what medicine to take, how much, or what condition they have, stop and say so. The companion does not diagnose or prescribe. Such content needs a named medical authoriser, not `Pending clinical review`.

## What you may change

| Folder | Rule |
| --- | --- |
| `reference/`, `procedures/`, `measures/` | This skill covers these. They are the knowledge folders (layer 3). |
| `safety/red-flags.json` | You may add a term or a category when asked. Never remove or loosen one. Every addition needs a red-flag question (see the brain-evals skill). |
| `identity/`, `stages/`, `CONTEXT.md` | Do not change these here. They decide what every model call is given and told, and need a code review. Say so and stop. |
| `CLAUDE.md`, `README.md` | Keep them true. If your change makes a line in them wrong, fix that line. |

A new knowledge file needs no routing change. The contract in `brain/stages/04-answer/CONTEXT.md` lists all three knowledge folders, so search finds the file once it is active. Do not add a row for a single file.

## When the request is not a knowledge file

| The person wants | What it really is | What to do |
| --- | --- | --- |
| The companion to answer in a different tone, length or format | A stage prompt: `stages/NN-name/references/prompt.md` | Say it needs a code review. Do not edit it here. |
| A task's model call to be given a different file | A stage contract: the Inputs table in `stages/NN-name/CONTEXT.md` | Say it needs a code review. Do not edit it here. |
| The companion to do a new kind of task | A new stage: a numbered folder, a row in `CONTEXT.md`, and code in `web/` | Say it needs code. `brain/README.md` has the steps under "Changing a stage". |

## Steps

1. **Look for an existing file on the topic.** Search `brain/reference`, `procedures` and `measures` for the topic and its keywords. Then pick one:
   - **New topic:** create a new file.
   - **Small correction** (a typo, a clearer sentence, same meaning): edit the file in place.
   - **The guidance changed:** create a new file and replace the old one (step 3). Do not overwrite the old guidance, because the history must stay readable.

2. **Write the file.** Put it in the folder that fits, named in lowercase with hyphens. Use this header exactly:

   ```markdown
   ---
   title: Short plain title
   topic: sleep
   keywords: [words, a crew member, would actually type]
   source: Where this came from
   authorised_by: Name or role
   added: YYYY-MM-DD
   status: active
   replaces:
   ---
   ```

   - One subject per file, under 400 words. Split a longer source into several files.
   - Short plain sentences. The model repeats this text almost word for word.
   - Keywords decide whether search finds the file. Include the everyday words, not only the technical ones.
   - Keep the person's facts and numbers exactly. Do not add facts of your own.

3. **Replacing a file.** In the new file set `replaces:` to the old file's path from the brain folder, for example `reference/sleep/old-file.md`. In the old file change `status: active` to `status: replaced`. Never delete the old file.

4. **Retiring a file with no replacement.** Change its `status` to `replaced`. Remove or rewrite the eval questions that cite it (brain-evals skill).

5. **Add test questions** with the brain-evals skill: at least two questions the new file must answer, and one nearby question it must still decline.

6. **Check.** Run `npm run brain:check`. It checks the structure (routes and stage contracts) as well as the knowledge files. Fix every error. Read the warnings to the person.

7. **Evaluate and release** with the brain-version skill. The change is not live as a version until that passes. The intent follows from step 1: a small correction is a `fix`, a new topic is an `add`, and changed or retired guidance is a `change`.

## Rules

- Never delete a brain file. Mark it replaced.
- Never copy personal crew data, journals or chat transcripts into the brain.
- If the evals show the new file made an older question fail, do not rewrite the older question. Usually the new file's keywords are too broad, so narrow them and run again.
