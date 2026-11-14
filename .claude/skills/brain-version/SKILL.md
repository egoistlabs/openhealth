---
name: brain-version
description: Version the companion's brain folder (brain/ at the repo root) and tie each version to an eval score. Use after editing, adding or replacing any brain file, when asked to release, version or bump the brain, or when asked how a brain change affected the eval scores.
---

# Brain version

The brain in `brain/` has a version number. Each version records an intent (why it was made) and an eval score, so anyone reading the changelog can see what kind of change it was and whether it helped. Releasing always goes: check, evaluate, compare, release.

Run every command from `web/`. The brain is the `brain/` folder at the repo root, so file paths below start from the repo root. This project uses `npm run`.

The brain is an ICM workspace ([Interpretable Context Methodology](https://arxiv.org/abs/2603.16021)), and `brain/CLAUDE.md` is its map. The version covers everything that decides what the model is given: the routing file `CONTEXT.md`, the stage contracts and prompts in `stages/`, `identity/`, the knowledge folders `reference/`, `procedures/` and `measures/`, and `safety/`. It does not cover `CLAUDE.md`, `README.md`, `evals/` or `inbox/`.

## Steps

1. **Check.** Run `npm run brain:version`.
   - If it shows a plain version such as `v1.2.0`, nothing changed. Say so and stop.
   - If it shows `v1.2.0+changes`, it also lists the files that changed. Carry on.
   - If it says the brain has never been released, carry on, skip the intent in step 2, and in step 7 run `npm run brain:release first "<what this brain is>"`. That makes v1.0.0.

2. **See what changed and why.** Run `git diff -- ../brain` on the listed files. Then:
   - Write one plain sentence that says what changed. This becomes the release note.
   - Pick the intent from the table below. If two fit, use the larger one. If you cannot tell why the change was made, ask the person.

   | Intent | Use it when | Version |
   | --- | --- | --- |
   | `fix` | Something already there was tuned or corrected: wording, keywords, tuning a stage prompt (`stages/NN-name/references/prompt.md`). The companion knows nothing new. | 1.0.0 to 1.0.1 |
   | `add` | The companion knows or can do something new: a new file, a new topic, a new red-flag term, a new stage. | 1.0.0 to 1.1.0 |
   | `change` | Guidance, behaviour, safety rules or structure are different: a file was replaced or retired, the identity changed, a red flag was removed, the routing in `CONTEXT.md` changed, or a stage's Inputs table now gives the model different files. | 1.0.0 to 2.0.0 |

   A moved or renamed file shows as one removed and one added. That is a `change`.

3. **Check.** Run `npm run brain:check`. It takes a second and does not use the model. It checks the routes and stage contracts, the knowledge files and the question set. Fix every error before going on. The release command refuses to run while there are errors.

4. **Evaluate.** Run `npm run evals`. It needs Ollama running and takes several minutes. It writes a report to `brain/evals/results/`. The evals test stage 04 (answering) only. If the change touched stage 01, 02 or 03, say that no eval covers it and that someone should try that task in the app.

5. **Compare** the new report with the newest report of the previous version.
   - If the two reports have different `question_set.fingerprint` values, the question set changed and the scores cannot be compared. Say that, and report the new scores on their own.
   - Otherwise list the questions that passed before and fail now, and the ones that failed before and pass now.

6. **Decide.** Do not release, and report what failed, if any of these is true:
   - the red-flag score is below 100%
   - the decline score is below 95%
   - a question that passed in the previous version now fails

   The person can still choose to release. Ask them. Never release past a red-flag failure.

7. **Release.** Run `npm run brain:release <intent> "<the sentence from step 2>"`, for example `npm run brain:release fix "Tuned the answer prompt to keep answers short"`. It writes `brain/version.json` and adds an entry to `brain/changelog.md` with the intent, the files that changed and the eval score. It refuses a `fix` that adds a knowledge file or a file under `stages/`.

8. **Report** the new version, its scores and the comparison from step 5. Commit `brain/version.json`, `brain/changelog.md`, the changed brain files and the new report together, but only when the person asks for a commit.

To change brain files, use the brain-source skill. To change the question set, use the brain-evals skill.

## Rules

- Never edit `version.json` or the version entries in `changelog.md` by hand. The commands write them.
- Never edit `evals/questions.jsonl` to make a failing question pass. If a question is wrong, say so and let the person decide.
- A change to `evals/questions.jsonl` alone does not make a new brain version.
- Do not delete old reports. They are the history. `brain/evals/results/before-icm/` holds the reports and changelog from before the ICM restructure, under their old version numbers. Leave it alone and do not compare against it.
