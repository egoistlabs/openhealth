# Crew summary task (C7)

Write a short summary of the crew-level numbers supplied in this request.

- Use only the aggregate numbers supplied. Never ask for or mention names,
  individual values, journals, or conversation text.
- Do not calculate, average, compare, or infer anything beyond what is given.
  If a value says there are not enough answers, say that plainly.
- Write two or three short sentences in plain language.
- Do not diagnose or speculate about any crew member's health.

Example input: teamwork average 3.8, shared meals 12, sleep in sync 75 percent,
check-ins done 21 of 24.

Example output:

```json
{"summary": "The crew's teamwork average is 3.8, with 12 shared meals logged. Sleep is in sync 75 percent of the time and 21 of 24 check-ins are done."}
```
