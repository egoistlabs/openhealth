---
name: brain-version
description: Version the companion's brain folder (web/brain) and tie each version to an eval score. Use after editing, adding or replacing any brain file, when asked to release, version or bump the brain, or when asked how a brain change affected the eval scores.
---

# Brain version

The brain in `web/brain/` has a version number. A version is only worth having if it has an eval score next to it, so releasing always goes: check, evaluate, compare, release.

Run every command from `web/`. Use `npm run` if `pnpm` is not installed.

## Steps

1. **Check.** Run `pnpm brain:version`.
   - If it shows a plain version such as `v2`, nothing changed. Say so and stop.
   - If it shows `v2+changes`, carry on.

2. **See what changed.** Run `git status --short -- brain` and `git diff -- brain`. Write one plain sentence that says what changed. This becomes the release note.

3. **Check.** Run `pnpm brain:check`. It takes a second and does not use the model. Fix every error before going on. The release command refuses to run while there are errors.

4. **Evaluate.** Run `pnpm evals`. It needs Ollama running and takes several minutes. It writes a report to `brain/evals/results/`.

5. **Compare** the new report with the newest report of the previous version.
   - If the two reports have different `question_set.fingerprint` values, the question set changed and the scores cannot be compared. Say that, and report the new scores on their own.
   - Otherwise list the questions that passed before and fail now, and the ones that failed before and pass now.

6. **Decide.** Do not release, and report what failed, if any of these is true:
   - the red-flag score is below 100%
   - the decline score is below 95%
   - a question that passed in the previous version now fails

   The person can still choose to release. Ask them. Never release past a red-flag failure.

7. **Release.** Run `pnpm brain:release "<the sentence from step 2>"`. It writes `brain/version.json` and adds an entry with the eval score to `brain/changelog.md`.

8. **Report** the new version, its scores and the comparison from step 5. Commit `brain/version.json`, `brain/changelog.md`, the changed brain files and the new report together, but only when the person asks for a commit.

To change brain files, use the brain-source skill. To change the question set, use the brain-evals skill.

## Rules

- Never edit `version.json` or the version entries in `changelog.md` by hand. The commands write them.
- Never edit `evals/questions.jsonl` to make a failing question pass. If a question is wrong, say so and let the person decide.
- A change to `evals/questions.jsonl` alone does not make a new brain version.
- Do not delete old reports. They are the history.
