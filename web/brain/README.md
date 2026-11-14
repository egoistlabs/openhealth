# Astronaut Companion AI brain

This folder is the companion's **ICM (Information-Centered Method) brain**: a
small, human-readable source of approved context. The model does not search the
folder or learn from it. Application code selects up to three matching active
files, adds them to a short prompt, and checks the model's response.

## How to edit it

- Keep one subject per file, in plain language, and under about 400 words.
- Reference, procedure, and measure files must use the frontmatter template
  below. Include a source and the person who authorized it before treating
  content as operational guidance.
- `status: replaced` files are retained for history but never sent to the model.
- Identity, prompts, and safety files require normal code review. Do not put
  personal crew data, journals, or conversation transcripts here.
- This is a prototype knowledge base, not clinical guidance. A qualified
  mission medical professional must review and authorize content before use.

```yaml
---
title: Example topic
topic: sleep
keywords: [sleep, schedule]
source: NASA Human Research Program — Hazard of Isolation and Confinement
authorised_by: Pending clinical review
added: 2026-11-14
status: active
replaces:
---
```

## Folders

- `identity/`: the companion's role and communication boundaries.
- `reference/`: background information, separated by topic.
- `procedures/`: practical, non-clinical suggestions.
- `measures/`: meanings of the seven self-report / activity measures. These do
  not calculate statuses; application code owns all calculations.
- `prompts/`: fixed-task prompt guidance.
- `safety/`: code-driven red-flag phrases and mandatory escalation text.
- `evals/`: offline question set and generated run reports.

Changing a brain file changes the context available to the model without
retraining it. It does not override safety checks implemented in code.
