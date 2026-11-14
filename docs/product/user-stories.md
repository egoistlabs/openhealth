# User stories

The locked scope as user stories, split into four tracks with one owner each.

Last updated: 14 Nov 2026. Deadline: 15 Nov 2026, 11:59 PM.

## Who owns what

Each story has exactly one owner. Use this rule when a new task comes up:

| If the task is... | It belongs to | Track |
| --- | --- | --- |
| Something you can see on screen | Ivor | A. Screens |
| Something that must work with the models off | Patrick Perez | B. Core loop |
| Something that needs a model | Kurt Arciga | C. Companion |
| Content, data or proof | Paul Butad | D. Content, data and proof |

Patrick and Kurt can swap tracks. The split between B and C stays the same either way.

Stories are written from the astronaut's side unless the story names someone else (Team, Presenter, Judge).

## Agree these first

Three handoffs let everyone work at the same time:

1. **B1, the data shape, comes first.** Ivor, Kurt and Paul all build against it.
2. **D1, the simulated mission, feeds Ivor and Patrick.** Ivor needs a small sample of it now. The full file can follow.
3. **D2, the suggested actions, feeds B7.** Patrick can use placeholder text until the seven actions are written.

## A. Screens (Ivor)

Every screen is built from a sample data file and uses only the design tokens.

| ID | Story | Done when |
| --- | --- | --- |
| A1 | I answer the check-in by tapping: sleep and wake time, mood, workload, teamwork, shared meal. | All five can be answered with taps only, one question at a time. |
| A2 | I hold a button to speak an answer and see what was understood, with a "correct" link. | The listening, working, understood and failed states are designed. |
| A3 | I play the reaction game and see my result. | The target, tap feedback and result screen exist. |
| A4 | I see me vs my baseline for seven measures. | Each measure shows a status, a trend and a one-line reason. A line appears when self-rated and measured values disagree. |
| A5 | I see a flag as a card with what changed and one suggested action. | The card has a Done button and a text status label. |
| A6 | I see the crew view. | Four crew-level tiles and a summary area. No names or individual values anywhere. |
| A7 | I see and hear a companion with a 3D look. | Idle, listening, working and speaking states exist. There is a voice on/off switch, and a simple fallback if the 3D look runs over time. |
| A8 | (Presenter) I switch crew member and mission day. | A crew switcher, a day slider and a permanent "Simulated data" label exist. |

## B. Core loop (Patrick Perez)

Every story passes with all models stopped.

| ID | Story | Done when |
| --- | --- | --- |
| B1 | (Team) We share one written data shape for check-ins, statuses, flags and crew numbers. | It is agreed before anyone else builds. |
| B2 | My check-in is saved for my crew member and mission day. | Saving twice on one day replaces the first. |
| B3 | My reaction taps are timed. | The median time and the slow-tap count are stored. |
| B4 | My engagement is measured without asking me. | Words per day and check-ins missed in 7 days are counted. |
| B5 | Each measure has my own baseline. | It is computed from my first 14 check-ins. |
| B6 | Each measure gets a status of Normal, Watch or Act. | One bad day never changes a status. |
| B7 | A flag carries the suggested action for its measure. | The action text comes from D2. Tapping Done is recorded. |
| B8 | The crew numbers are computed from everyone's check-ins. | Teamwork average, shared meals, sleep in sync and check-ins done are shown. With fewer than three answers it shows "not enough answers". |
| B9 | (Presenter) The simulated mission loads and follows the crew switcher and day slider. | Every screen recalculates for the chosen person and day. |

## C. Companion (Kurt Arciga)

Everything here runs on the MacBook M4 (16 GB) with no internet.

| ID | Story | Done when |
| --- | --- | --- |
| C1 | (Team) The chat model, speech-to-text and Kokoro start with one command. | All three fit in 16 GB with the app and browser open. |
| C2 | What I say while holding the button becomes text. | It works offline. |
| C3 | My spoken or typed answer becomes numbers in the B1 shape. | Impossible values are rejected and the companion asks again. |
| C4 | The companion speaks its questions and replies. | It stops when the voice switch is off. |
| C5 | I ask why a measure is flagged and get an answer. | The answer uses only the numbers the model was given. |
| C6 | After a check-in I hear a short summary of today's flags and actions. | It is two or three sentences and ends on the action. |
| C7 | The crew view shows a summary of the crew numbers. | It reads crew-level numbers only, never journals or individuals. |
| C8 | The companion never diagnoses or invents numbers. | It passes D5. |
| C9 | If a model is off or slow, I am told and carry on by tapping. | The check-in still completes. |

## D. Content, data and proof (Paul Butad)

| ID | Story | Done when |
| --- | --- | --- |
| D1 | (Team) A simulated mission exists in the B1 shape. | It has four crew, about 90 days and one planted decline, set from the published NASA figures. |
| D2 | Each of the seven measures has one suggested action. | Each is in plain language and makes no medical claims. |
| D3 | (Judge) A test shows the planted decline is caught. | Watch status appears within 10 days of the start. |
| D4 | (Judge) A test shows healthy days stay quiet. | No Act and at most one Watch in 90 days. |
| D5 | (Judge) A test shows the model stays within its limits. | 20 of 20 prompts are handled. |
| D6 | (Judge) A test shows spoken answers are parsed correctly. | 20 sample answers are run. The pass mark is agreed with Kurt. |
| D7 | (Presenter) The demo follows one scripted story. | The day-58 story is written and timed. |
| D8 | (Team) The submission is complete. | The pitch and required materials are sent. |

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
