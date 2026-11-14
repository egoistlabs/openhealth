# User stories

The locked scope as user stories, split into four tracks with one owner each.

Last updated: 14 Nov 2026 (A6 and B4 to B8 aligned with the screens prototype). Deadline: 15 Nov 2026, 11:59 PM.

## Who owns what

Each story has exactly one owner. Use this rule when a new task comes up:

| If the task is... | It belongs to | Track |
| --- | --- | --- |
| Something you can see on screen | Ivor | A. Screens |
| Something that must work with the models off | Kurt Arciga | B. Core loop |
| Something that needs a model | Patrick Perez | C. Companion |
| Content, data or proof | Paul Butad | D. Content, data and proof |

Patrick owns the Companion track because the models run on his MacBook M4.

Stories are written from the astronaut's side unless the story names someone else (Team, Presenter, Judge).

## Agree these first

Three handoffs let everyone work at the same time:

1. **B1, the data shape, comes first.** Ivor, Patrick and Paul all build against it.
2. **D1, the simulated mission, feeds Ivor and Kurt.** Ivor needs a small sample of it now. The full file can follow.
3. **D2, the suggested actions, feeds B7.** Kurt can use placeholder text until the seven actions are written.

## A. Screens (Ivor)

Every screen is built from a sample data file and uses only the design tokens.

| ID | Story | Done when |
| --- | --- | --- |
| A1 | I answer the check-in by tapping: sleep and wake time, mood, workload, teamwork, shared meal. | All five can be answered with taps only, one question at a time. |
| A2 | I hold a button to speak an answer and see what was understood, with a "correct" link. | The listening, working, understood and failed states are designed. |
| A3 | I play the reaction game and see my result. | The target, tap feedback and result screen exist. |
| A4 | I see me vs my baseline for seven measures. | Each measure shows a status, a trend and a one-line reason. A line appears when self-rated and measured values disagree. |
| A5 | I see a flag as a card with what changed and one suggested action. | The card has a Done button and a text status label. |
| A6 | I see the crew view. | A verdict, an anonymous list of who is worth checking in on, four area tiles (Sleep, Mood, Workload, Teamwork) and a "This week" summary. No names or individual values anywhere. |
| A7 | I see and hear a companion with a 3D look. | Idle, listening, working and speaking states exist. There is a voice on/off switch, and a simple fallback if the 3D look runs over time. |
| A8 | (Presenter) I switch crew member and mission day. | A crew switcher, a day slider and a permanent "Simulated data" label exist. |
| A9 | I see where an answer came from. | Each answer shows its sources underneath. The escalation notice and the "I don't have that on board" reply are designed. |

## B. Core loop (Kurt Arciga)

Every story passes with all models stopped.

| ID | Story | Done when |
| --- | --- | --- |
| B1 | (Team) We share one written data shape for check-ins, statuses, flags and crew numbers. | It is agreed before anyone else builds. |
| B2 | My check-in is saved for my crew member and mission day. | Saving twice on one day replaces the first. |
| B3 | My reaction taps are timed. | The median time and the slow-tap count are stored. |
| B4 | My engagement is measured without asking me. | Words per day and check-ins missed in 7 days are counted. 2 missed check-ins in 7 days is Watch, 3 or more is Act. |
| B5 | Each measure has my own baseline. | It is the median of my previous 14 days, with a band for my usual day-to-day spread. It needs at least 3 values in that window, and missed days are skipped. |
| B6 | Each measure gets a status of Normal, Watch or Act. | One bad day never changes a status: Watch needs 2 days in a row outside my band, Act needs 5. |
| B7 | A flag carries the suggested action for its measure. | The action text comes from D2. Tapping Done is recorded. |
| B8 | The crew numbers are computed from the measures each person chooses to share. | Area tiles for Sleep, Mood, Workload and Teamwork, plus a weekly summary: checked in, shared meals, engagement and open flags. A measure appears once at least 2 crew share it; otherwise it shows "Not enough shared". Sharing is off until I turn it on, per measure. |
| B9 | (Presenter) The simulated mission loads and follows the crew switcher and day slider. | Every screen recalculates for the chosen person and day. |

## C. Companion (Patrick Perez)

Everything here runs on Patrick's MacBook M4 (16 GB) with no internet.

| ID | Story | Done when |
| --- | --- | --- |
| C1 | (Team) The chat model, speech-to-text and Kokoro start with one command. | All three fit in 16 GB with the app and browser open. |
| C2 | What I say while holding the button becomes text. | It works offline. |
| C3 | My spoken or typed answer becomes numbers in the B1 shape. | Impossible values are rejected and the companion asks again. |
| C4 | The companion speaks its questions and replies. | It stops when the voice switch is off. |
| C5 | I ask why a measure is flagged and get an answer. | The answer uses only the numbers and brain files the model was given. |
| C6 | After a check-in I hear a short summary of today's flags and actions. | It is two or three sentences and ends on the action. |
| C7 | The crew view shows a summary of the crew numbers. | It reads crew-level numbers only, never journals or individuals. |
| C8 | The companion never diagnoses or invents numbers. It gives reference information with its source and escalates red flags. | It passes D5. |
| C9 | If a model is off or slow, I am told and carry on by tapping. | The check-in still completes. |
| C10 | I ask any health question and get an answer with its sources. | The answer comes only from brain files, and names them. |
| C11 | When the brain cannot answer, I am told so. | It says "I don't have that on board" and does not guess. |
| C12 | (Team) A new source is added with one command. | It goes live only if its own tests and the full test set pass. |

The design for this track is in [`docs/tech-spec/architecture.md`](../tech-spec/architecture.md).

## D. Content, data and proof (Paul Butad)

| ID | Story | Done when |
| --- | --- | --- |
| D1 | (Team) A simulated mission exists in the B1 shape. | It has four crew, about 90 days and one planted decline, set from the published NASA figures. |
| D2 | Each of the seven measures has one suggested action. | Each is in plain language, names its source and does not diagnose. |
| D3 | (Judge) A test shows the planted decline is caught. | Watch status appears within 10 days of the start. |
| D4 | (Judge) A test shows healthy days stay quiet. | No Act and at most one Watch in 90 days. |
| D5 | (Judge) A test shows the companion answers from its sources, declines when it has none and escalates red flags. | About 40 questions are run and the three scores are reported. The pass marks are agreed with Patrick. |
| D6 | (Judge) A test shows spoken answers are parsed correctly. | 20 sample answers are run. The pass mark is agreed with Patrick. |
| D7 | (Presenter) The demo is open: anyone can ask the companion anything. | A few starter questions are ready, and a new source is added live. |
| D8 | (Team) The submission is complete. | The pitch and required materials are sent. |
| D9 | (Team) The brain folder holds the companion's knowledge. | It covers sleep, behavioural health, exercise, nutrition and common complaints, from public NASA material, plus the red-flag list. |

## The seven measures

| # | Measure | Where it comes from |
| --- | --- | --- |
| 1 | Sleep duration | Sleep and wake time |
| 2 | Sleep timing | Same answer as 1 |
| 3 | Reaction time | Reaction game |
| 4 | Mood | Rating, 1 to 5 |
| 5 | Workload | Rating, 1 to 5 |
| 6 | Teamwork | Rating, 1 to 5, plus shared meal |
| 7 | Engagement | Measured automatically (B4) |

## Out of scope

- Body map
- Link to Earth
- More than one device
- Personality settings

## Open point

QA / AI Evals is dated "Before Nov 16" in the ownership table, which is after the deadline. D3 and D4 need no model, so they can run as soon as B6 exists.
