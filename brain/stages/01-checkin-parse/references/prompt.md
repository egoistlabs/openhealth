# Check-in parsing task (C3)

Turn what the crew member said into check-in fields. People answer in
conversation, not in numbers, so work out what they mean.

Fields and allowed values:

- `sleep_time`: the time they fell asleep, 24-hour `HH:MM`.
- `wake_time`: the time they woke, 24-hour `HH:MM`.
- `mood`: 1 very low, 2 low, 3 okay, 4 good, 5 great.
- `workload`: how heavy the day was, counting work and stress. 1 very light,
  2 light, 3 moderate, 4 heavy, 5 overwhelming.
- `teamwork`: how well the crew worked together. 1 poorly, 2 some friction,
  3 okay, 4 well, 5 very well.
- `shared_meal`: true if they ate with anyone today, false if they ate alone or
  not at all.

The message may start with `QUESTION ASKED`, and sometimes `THEIR USUAL`.

- With a question, return only `answered` and that question's field. First
  decide `answered`: true if what they said replies to the question in any way,
  false if they asked something back, said they do not know, or spoke about
  something else. When true, choose the best value for the field from what they
  said, even when they gave no number or time. When false, the field is null.
- Without a question, return all six fields and fill each one they spoke about.

Reading the answer:

- A number on its own answers the question asked.
- Words map to the scale above: "pretty good" is 4, "fine" or "not bad" is 3,
  "rough" is 2. Mixed feelings land in the middle: "tired but okay" is mood 3.
- Two values ("three or four"): take the one they lean towards, or the first.
- "Same as usual" or "normal" is the value in `THEIR USUAL`. "A bit better than
  usual" is one step above it, "worse than usual" one step below. With no usual
  given, "normal" is 3 for a rating and null for a time. Use `THEIR USUAL` only
  for the part they called usual; take every other time or number from their
  words.
- Times: "midnight" is 00:00, "half six" is 06:30, "quarter to seven" is 06:45.
  Falling asleep is in the evening or night ("eleven" is 23:00, "one" is 01:00)
  and waking is in the morning. With one time and a length ("slept seven
  hours, up at six"), work out the other time. "Usual time" is the time in
  `THEIR USUAL`.
- Any meal with another person is true: "had lunch with Kira", "we all ate
  together". "Ate at my desk", "skipped dinner", "on my own" is false.

Return null for a field when what they said tells you nothing about it. Never
invent a value from nothing.

Return only the JSON object. Do not explain.

Examples:

QUESTION ASKED: How's your mood today, 1 to 5?
CHECK-IN ANSWER:
honestly pretty good, a bit tired though

```json
{"answered": true, "mood": 4}
```

QUESTION ASKED: How heavy was today, 1 to 5? Count both workload and stress.
THEIR USUAL: day load 3
CHECK-IN ANSWER:
bit more than normal, the EVA prep ran long

```json
{"answered": true, "workload": 4}
```

QUESTION ASKED: When did you fall asleep, and when did you wake up?
THEIR USUAL: asleep 23:30, woke 06:45
CHECK-IN ANSWER:
went down about midnight I think, up at the usual time

```json
{"answered": true, "sleep_time": "00:00", "wake_time": "06:45"}
```

QUESTION ASKED: When did you fall asleep, and when did you wake up?
CHECK-IN ANSWER:
crashed at one twenty, slept about six hours

```json
{"answered": true, "sleep_time": "01:20", "wake_time": "07:20"}
```

QUESTION ASKED: How well did the crew work together, 1 to 5?
CHECK-IN ANSWER:
what do you mean by that?

```json
{"answered": false, "teamwork": null}
```

QUESTION ASKED: Did you eat with anyone today?
CHECK-IN ANSWER:
nah, grabbed something at my desk

```json
{"answered": true, "shared_meal": false}
```

CHECK-IN ANSWER:
I slept around eleven and woke at seven. Mood was a four, workload a two. We had dinner together.

```json
{"sleep_time": "23:00", "wake_time": "07:00", "mood": 4, "workload": 2, "teamwork": null, "shared_meal": true}
```
