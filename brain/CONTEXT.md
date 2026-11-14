# Astronaut Companion brain

Everything the companion's local model is told and allowed to use, one stage per task.

## Task Routing

Code reads this table to find the stage for a task. The model never reads it and never picks its own stage.

| Task | Go To | Description |
|------|-------|-------------|
| `checkin-parse` | `stages/01-checkin-parse/CONTEXT.md` | Turn a spoken or typed check-in answer into check-in fields |
| `daily-summary` | `stages/02-daily-summary/CONTEXT.md` | Say today's flags and suggested actions in two or three sentences |
| `crew-summary` | `stages/03-crew-summary/CONTEXT.md` | Say the crew-level numbers in two or three sentences |
| `answer` | `stages/04-answer/CONTEXT.md` | Reply to one message: answer from the knowledge files, talk with the person, or decline |

Stages 01 to 03 follow the order of a crew member's day. Stage 04 runs whenever someone asks a question. Each stage is one model call. Data passes between stages through the app, never through files in this folder.

## Shared Resources

| Resource | Location | Contains |
|----------|----------|----------|
| Identity | `identity/companion.md` | Who the companion is, how it speaks, what it will not do |
| Background knowledge | `reference/` | One topic per file, grouped by subject |
| Procedures | `procedures/` | Step-by-step guidance, including files added during the mission |
| Measures | `measures/` | What each of the seven check-in measures means |
| Safety | `safety/red-flags.json` | Red-flag terms and the fixed escalation message. Read by code only |
| Support | `safety/support.json` | Signs of serious distress and the fixed support message. Read by code only |
