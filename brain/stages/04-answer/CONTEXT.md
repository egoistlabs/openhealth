# Stage 04: Answer

Answer one question from the knowledge files or the person's own numbers, or decline.

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Safety | `../../safety/red-flags.json` | Code only | Red-flag terms and the fixed escalation message. Never sent to the model |
| Identity | `../../identity/companion.md` | Full file | Who the companion is and how it speaks |
| Prompt | `references/prompt.md` | Full file | Every answering rule and three worked examples |
| Knowledge | `../../reference/` | Best-matching active files only | Background on sleep, behavioural health, exercise, nutrition and common complaints |
| Knowledge | `../../procedures/` | Best-matching active files only | Step-by-step guidance |
| Knowledge | `../../measures/` | Best-matching active files only | What each check-in measure means |
| App | (request) | The person's numbers as finished sentences, only when the question is about them | Code does the maths and the wording. The model never sees a signed number to interpret |
| App | (request) | The tone, gentle or direct | How to phrase the answer |
| Crew member | (request) | The question and the earlier turns | What to answer |

## Process

1. Code checks the question against the red-flag terms. On a match it returns the fixed escalation message and stops. The model is not called.
2. Code searches the three knowledge folders together and keeps the best-matching active files.
3. Code decides whether the question is about the person's own numbers. If it is, the worded numbers join the sources as `app/your-numbers`, so no knowledge file has to match.
4. If there is no source at all, code replies "I don't have that on board." and stops. The model is not called.
5. Code sends the identity, the prompt, the sources, the tone and the question to the model.
6. The model returns JSON: whether it can answer, the ids of the sources it used, then the answer. Code watches the answer as it is written and stops the model the moment a whole sentence repeats or the answer passes three sentences.
7. Code runs the audit checks below and adds what only code may add: the rows for the measures that are off and the one suggested action.
8. The app shows and speaks only the checked answer. The model's draft never leaves the server.

## Audit

Code runs these checks. The model's output cannot skip them.

| Check | Pass Condition | When it fails |
|-------|---------------|---------------|
| Shape | Valid JSON in the required shape | If it was cut short (by code, the output limit or the time limit) after the sources were named, the finished sentences are kept and checked. Otherwise fallback |
| No repeated sentence | No whole sentence appears twice | The repeats are dropped |
| Length | At most 3 sentences and 70 words | Cut to the first 3 sentences. Fallback if still over 70 words |
| Sources are real | The answer names at least one source, and every source it names was in the request | Fallback |
| No invented numbers | Every number in the answer appears in a supplied source | Fallback |
| Direction matches the numbers | No measure is described with the opposite of the direction code worked out, such as "faster" for a slower reaction time | Fallback |
| Only measures that are off | An answer from the numbers names at least one measure that is off, and none that is within normal | Fallback |
| No prompt echo | No source id, label from the request or decline sentence inside an answer | Fallback |

Fallback: for a question about how the person is doing ("Anything I should watch?", "How did I sleep?"), the reply code writes from their numbers. For any other question, the decline message. The same applies when the model says it cannot answer.

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Answer | Returned to the app | JSON: the answer or the decline message, who wrote it (model or code), the sources with their origin, date and authoriser, the rows for measures that are off, the suggested action, and whether it was escalated |

Nothing is written to this folder. Questions and answers belong to the app.
