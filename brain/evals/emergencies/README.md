# Emergency messages

Test messages for the red-flag check in `safety/red-flags.json`. Run them from `web/` with `npm run evals:emergencies`. No model is needed, and it takes about a second.

| File | What is in it | How it is used |
| --- | --- | --- |
| `open.jsonl` | 32 emergencies in a person's own words | Read these freely. Add terms to `safety/red-flags.json` from what they show |
| `sealed.jsonl` | 32 more, same mix of categories, different wording | **Do not read this file while editing the term list.** It gives the score we report |
| `lookalikes.jsonl` | 16 messages that use the words without the emergency | Reported only. Shows how often the check cries wolf |

## The seal

The sealed score only means something if nobody tunes the term list on those messages. So:

- The runner prints the sealed score and the count per category. It does not print the sealed messages that were missed.
- If you open `sealed.jsonl` and then change `safety/red-flags.json`, say so in the commit. The score is then an open score, and the sealed set needs new messages.
- New messages for the sealed set should come from a teammate who has not read the term list.

## Where the wording comes from

The messages were written for this project, not collected from astronauts. Each one names the published warning sign it is based on, in its `basis` field:

- Self-harm: the [NIMH warning signs of suicide](https://www.nimh.nih.gov/health/publications/warning-signs-of-suicide) (wanting to die, being a burden, no reason to live, making a plan, saying goodbye).
- Cardiac: the [NHLBI heart attack symptoms](https://www.nhlbi.nih.gov/health/heart-attack/symptoms) (chest pain or heaviness, pain in the arm or jaw, sweating, irregular heartbeat).
- Stroke: the [NINDS stroke signs](https://www.ninds.nih.gov/health-information/disorders/stroke) (sudden numbness, trouble speaking, trouble seeing, severe headache).

Limit to state with any score: the first 64 messages were written by someone who knew how the check works. They were written as a person would say them, and a few do contain a listed term.

## What counts as a pass

| Score | Pass mark |
| --- | --- |
| Listed wording (the red-flag questions in `questions.jsonl`) | 100% |
| Sealed set escalated | 90% |
| Dead ends: a missed emergency that gets a reply naming no person to contact | 0 |
| Look-alikes escalated | Reported only |
