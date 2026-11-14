# Stage 03: Crew summary

Say the crew-level numbers in two or three sentences (story C7).

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Prompt | `references/prompt.md` | Full file | The rules for the summary and one worked example |
| App | (request) | Crew-level numbers only | Code works these out. The model only puts them into words |

## Process

1. Code works out the crew-level numbers. This happens in the app, before this stage.
2. Code refuses the request if it holds anything about one person: a name, a journal, a note or a conversation. The model is not called.
3. Code sends the prompt and the numbers to the model.
4. The model returns a short summary as JSON.
5. Code runs the audit checks below.
6. If a check fails, or the model does not reply, code uses a fixed sentence that lists the numbers.

## Audit

Code runs these checks. The model's output cannot skip them.

| Check | Pass Condition |
|-------|---------------|
| Crew level only | The request holds no individual or free-text fields. Checked before the model is called |
| Length | Two or three sentences |
| No invented numbers | Every number in the summary appears in the supplied numbers |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Crew summary | Returned to the app | JSON: the summary text, whether it passed the checks, and whether the fixed sentence was used |

Nothing is written to this folder. Crew numbers belong to the app.
