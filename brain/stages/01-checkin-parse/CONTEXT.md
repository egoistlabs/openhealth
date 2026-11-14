# Stage 01: Check-in parse

Turn one spoken or typed check-in answer into check-in fields (story C3).

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Prompt | `references/prompt.md` | Full file | The fields, their scales, how to read a conversational answer, and worked examples |
| App | (request) | The question the companion just asked, when there is one | Says which field a short or vague answer is about |
| App | (request) | The crew member's usual value for that question, when the answer refers to it | Lets "same as usual" or "a bit worse than normal" become a value |
| Crew member | (request) | The check-in answer as text | The words to read |

## Process

1. Code sends the prompt, the question asked, the usual value and the answer text to the model.
2. The model returns JSON. With a question open it says whether the question was answered and works out that question's field from a conversational answer. Without one it returns every field. Anything the answer says nothing about is null.
3. Code runs the audit checks below.
4. If a field is missing or impossible, code writes the follow-up question. The model does not.
5. The app reads the value back and saves it only when the crew member confirms it.

## Audit

Code runs these checks. The model's output cannot skip them.

| Check | Pass Condition |
|-------|---------------|
| Shape | Valid JSON with exactly the six fields, or with a question open `answered` and that question's fields, after at most one retry |
| Not answered | When the model says the question was not answered, no value is kept |
| Times | `sleep_time` and `wake_time` are 24-hour `HH:MM` |
| Ratings | `mood`, `workload` and `teamwork` are whole numbers from 1 to 5 |
| Missing values | A field the model returned as empty is asked for again, never filled in by code |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Check-in fields | Returned to the app | JSON: the accepted fields, what was unclear, what was impossible, and a follow-up question when needed |

Nothing is written to this folder. Check-in data belongs to the app.
