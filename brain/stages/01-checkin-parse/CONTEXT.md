# Stage 01: Check-in parse

Turn one spoken or typed check-in answer into check-in fields (story C3).

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Prompt | `references/prompt.md` | Full file | The fields, their allowed values and one worked example |
| Crew member | (request) | The check-in answer as text | The words to extract from |

## Process

1. Code sends the prompt and the answer text to the model.
2. The model returns every field as JSON, with null for anything that was not said.
3. Code runs the audit checks below.
4. If a field is missing or impossible, code writes the follow-up question. The model does not.

## Audit

Code runs these checks. The model's output cannot skip them.

| Check | Pass Condition |
|-------|---------------|
| Shape | Valid JSON with exactly the six fields, after at most one retry |
| Times | `sleep_time` and `wake_time` are 24-hour `HH:MM` |
| Ratings | `mood`, `workload` and `teamwork` are whole numbers from 1 to 5 |
| Missing values | A field the model returned as empty is asked for again, never filled in by code |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Check-in fields | Returned to the app | JSON: the accepted fields, what was unclear, what was impossible, and a follow-up question when needed |

Nothing is written to this folder. Check-in data belongs to the app.
