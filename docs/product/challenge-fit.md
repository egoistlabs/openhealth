# Challenge fit

How Pedro answers the challenge, point by point. For the pitch and the submission write-up.

Last updated: 14 Nov 2026. The challenge text is in [`context/challenge.md`](../../context/challenge.md). Story IDs refer to [`user-stories.md`](user-stories.md). Suites refer to [`docs/tech-spec/eval-design.md`](../tech-spec/eval-design.md).

This page maps what we build to what was asked. It did not decide what we test. The tests come from what can go wrong for a crew member, and are argued in the eval design on those grounds.

## The core ask

The challenge is to build software that "gathers health indicators and enables astronauts to evaluate and act on the status of their health".

| The challenge asks | Our answer | Stories | Checked by |
| --- | --- | --- | --- |
| Gather health indicators | A daily check-in by tap or voice, a reaction game, and engagement measured without asking | A1 to A3, B2 to B4, C2, C3 | Suite 4, Suite 5 |
| Help astronauts assess their own health | Seven measures against the person's own baseline, each Normal, Watch or Act | A4, B5, B6 | Suite 1 |
| Provide guidance on treatments and health improvements | Each flag carries one suggested action. The companion answers questions from sourced files only | A5, B7, D2, C10 | Suite 6, Suite 3 |

## The questions it says are worth considering

| Question | Our answer | Checked by |
| --- | --- | --- |
| Which measurements can be performed in space? | All seven need only the laptop: two times, three ratings, a tap game and a word count. No sensor or consumable | Suite 5 |
| Why is an exam needed? How do spaceflight hazards affect these indicators? | The companion explains each measure: what it is, why it matters on a mission, how spaceflight changes it | Suite 3, Explain cases |
| When might a result warrant attention from the crew or flight surgeons? | Watch is for the person. Act names who to tell. Emergencies get a fixed message naming the medical officer | Suite 2, Suite 5 |
| What actions can prevent a critical health condition? | A change is flagged early, before the person reports it, with an action attached | Suite 1, Suite 6 |

## The optional considerations

| Consideration | Our answer |
| --- | --- |
| Different environments: spacecraft, station, rover, base | Runs on one laptop with no network and no link to Earth |
| Prompt measurements as part of the routine | The daily check-in. A missed check-in is itself counted (B4) |
| Dynamic charts over time | A trend for every measure (A4) |
| Colour coding at a glance | Normal, Watch and Act, each with a text label so it reads without colour (A5) |
| Gamification | The reaction game. No points or badges |
| Do not assume astronauts know how to assess their health | The companion explains each measure and shows its sources (A9, C10) |
| A clickable human figure | Not built. It is given as an example, and our measures are behavioural, so they do not map to body parts |

## Say this plainly in the pitch

**Which indicators.** The challenge names six: blood pressure, heart rate, blood sugar, body temperature, daily sleep hours and mood. We cover two, sleep and mood, and add five behavioural ones: sleep timing, reaction time, workload, teamwork and engagement.

**Why those.** We chose one hazard, isolation and confinement, and the "behavioral health conditions" the challenge lists among its outcomes. These are the changes a crew member is least likely to report and least able to see in themselves.

**What is weaker than it sounds.** Sleep is what the person tells us, not what a sensor records. The software only needs a bedtime and a wake time, so a wearable could supply them later with nothing else changing.

**Where the proof stands.** Two of the six test suites are built, and both fail today. The current numbers and their limits are in the eval design. All demo data is simulated, and no clinician has reviewed the content or the tests.
