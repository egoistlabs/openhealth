# Stage 02: Daily summary

Say today's flags and their suggested actions in two or three sentences (story C6).

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Prompt | `references/prompt.md` | Full file | The rules for the summary and one worked example |
| App | (request) | Today's flags: measure, change and suggested action for each | Code works these out from the check-in. The model only puts them into words |

## Process

1. Code works out today's flags and their actions from the check-in. This happens in the app, before this stage.
2. Code sends the prompt and the flags to the model.
3. The model returns a short summary as JSON.
4. Code runs the audit checks below.
5. If a check fails, or the model does not reply, code uses a fixed sentence built from the first flag and its action.

## Audit

Code runs these checks. The model's output cannot skip them.

| Check | Pass Condition |
|-------|---------------|
| Length | Two or three sentences |
| No invented numbers | Every number in the summary appears in the supplied flags |
| Ends on the action | The last sentence names a suggested action from the supplied flags |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Daily summary | Returned to the app | JSON: the summary text, whether it passed the checks, and whether the fixed sentence was used |

Nothing is written to this folder. Flags belong to the app.
