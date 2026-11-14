# Stage 04: Answer

Answer one question from the knowledge files, or decline.

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Safety | `../../safety/red-flags.json` | Code only | Red-flag terms and the fixed escalation message. Never sent to the model |
| Identity | `../../identity/companion.md` | Full file | Who the companion is and how it speaks |
| Prompt | `references/prompt.md` | Full file | The answering rules and three worked examples |
| Knowledge | `../../reference/` | Best-matching active files only | Background on sleep, behavioural health, exercise, nutrition and common complaints |
| Knowledge | `../../procedures/` | Best-matching active files only | Step-by-step guidance |
| Knowledge | `../../measures/` | Best-matching active files only | What each check-in measure means |
| App | (request) | The crew member's current numbers | Code works these out. The model must not recalculate them |
| Crew member | (request) | The question | What to answer |

## Process

1. Code checks the question against the red-flag terms. On a match it returns the fixed escalation message and stops. The model is not called.
2. Code searches the three knowledge folders together and keeps the best-matching active files.
3. If nothing matches well enough, code replies "I don't have that on board." and stops. The model is not called.
4. Code sends the identity, the prompt, the matching files, the numbers and the question to the model.
5. The model returns JSON: whether it can answer, the answer, and the ids of the files it used.
6. Code runs the audit checks below. If one fails, or the model says it cannot answer, the reply is the decline message.

## Audit

Code runs these checks. The model's output cannot skip them.

| Check | Pass Condition |
|-------|---------------|
| Shape | Valid JSON, after at most one retry |
| Sources are real | The answer names at least one file, and every file it names was in the request |
| No invented numbers | Every number in the answer appears in a supplied file or in the supplied numbers |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Answer | Returned to the app | JSON: the answer or the decline message, the files it used with their source, date and authoriser, and whether it was escalated |

Nothing is written to this folder. Questions and answers belong to the app.
