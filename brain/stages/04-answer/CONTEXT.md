# Stage 04: Answer

Reply to one message: answer it from the knowledge files or the person's own numbers, talk with the person, or decline.

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Safety | `../../safety/red-flags.json` | Code only | Red-flag terms and the fixed escalation message. Never sent to the model |
| Safety | `../../safety/boundaries.json` | Code only | Requests declined before the model is called: role-play, rule overrides, a crewmate's words or ratings. Never sent to the model |
| Safety | `../../safety/support.json` | Code only | Signs of serious distress, and the fixed support message used when a reply to one names no person. Never sent to the model |
| Identity | `../../identity/companion.md` | Full file | Who the companion is and how it speaks |
| Prompt | `references/prompt.md` | Full file | The three kinds of reply, every rule and five worked examples |
| Knowledge | `../../reference/` | Best-matching active files only | Background on sleep, behavioural health, exercise, nutrition and common complaints |
| Knowledge | `../../procedures/` | Best-matching active files only | Step-by-step guidance |
| Knowledge | `../../measures/` | Best-matching active files only | What each check-in measure means |
| App | (request) | The person's numbers as finished sentences, only when the question is about them | Code does the maths and the wording. The model never sees a signed number to interpret |
| App | (request) | The tone, gentle or direct | How to phrase the answer |
| Crew member | (request) | The message and the earlier turns | What to reply to |

## Process

1. Code checks the message against the red-flag terms. On a match it returns the fixed escalation message and stops. The model is not called.
2. Code checks the message against the boundary patterns. On a match it returns the decline message and stops. The model is not called: a small model asked to "pretend you are my wife" may simply do it.
3. Code checks the message against the support terms. A match does not stop the turn, but the reply must then name a person to talk to.
4. Code searches the three knowledge folders together and keeps the best-matching active files.
5. Code decides whether the question is about the person's own numbers. If it is, the worded numbers join the sources as `app/your-numbers`, so no knowledge file has to match.
6. Code sends the identity, the prompt, the sources (possibly none), the tone and the message to the model. Finding no source does not stop the turn: search decides what the companion can inform about, not whether it may talk.
7. The model returns JSON: the kind of reply (`answer`, `conversation` or `decline`), the ids of the sources it used, then the reply. Code watches the reply as it is written and stops the model the moment a whole sentence repeats or the reply passes three sentences.
8. Code settles the kind: an `answer` that cites no source carries nothing a source backs, so it is checked as `conversation`. Code then runs the audit checks for that kind, below, and adds what only code may add: the rows for the measures that are off and the one suggested action.
9. The app shows and speaks only the checked reply. The model's draft never leaves the server.

## Audit

Code runs these checks. The model's output cannot skip them. The model picks the kind, but a kind only changes which checks apply, and a conversation reply is held to stricter ones than an answer: calling a reply conversation cannot carry a fact past code.

| Check | Applies to | Pass Condition | When it fails |
|-------|-----------|---------------|---------------|
| Shape | All | Valid JSON in the required shape | If it was cut short (by code, the output limit or the time limit) after the sources were named, the finished sentences are kept and checked. Otherwise fallback |
| No repeated sentence | All | No whole sentence appears twice | The repeats are dropped |
| Length | All | At most 3 sentences and 70 words | Cut to the leading sentences that fit both limits. Fallback only if the first sentence alone is over 70 words |
| No prompt echo | All | No source id, label from the request or decline sentence inside a reply | Fallback |
| No claims about others | All | Nothing about what another person said, felt, thought or rated | Fallback |
| Stays in role | All | Never claims to be a clinician, a commander, a relative, a human, or anyone but Pedro | Fallback |
| Names a person when needed | All | When the message matched a support term, the reply names a crewmate, support team or medical officer | Fallback |
| Sources are real | Answer | The answer names at least one source, and every source it names was in the request | Fallback |
| No invented numbers | Answer | Every number in the answer appears in a supplied source | Fallback |
| Direction matches the numbers | Answer | No measure is described with the opposite of the direction code worked out, such as "faster" for a slower reaction time | Fallback |
| Only measures that are off | Answer | An answer from the numbers names at least one measure that is off, and none that is within normal | Fallback |
| Cites no source | Conversation | `sources_used` is empty. Information belongs in an answer | Fallback |
| No numbers | Conversation | No digits and no number words | Fallback |
| No clinical content | Conversation | No diagnosis, prescription, dose, medicine or condition words | Fallback |

Fallback, in order: when the message matched a support term, the fixed support message. For a question about how the person is doing ("Anything I should watch?", "How did I sleep?"), the reply code writes from their numbers. For anything else, the decline message. The same applies when the model declines.

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Reply | Returned to the app | JSON: the reply, its kind (answer, conversation, support, decline or escalation), who wrote it (model or code), the sources with their origin, date and authoriser, the rows for measures that are off, the suggested action, and whether it was escalated |

Nothing is written to this folder. Questions and answers belong to the app.
