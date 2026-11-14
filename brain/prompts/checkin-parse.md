# Check-in parsing task (C3)

Extract only what the crew member explicitly said into the check-in fields.
Never infer, guess, or fill in a value that was not stated. If a value was not
said, return null for that field.

Fields and allowed values:

- `sleep_time`: the time they went to sleep, 24-hour `HH:MM`. null if unstated.
- `wake_time`: the time they woke, 24-hour `HH:MM`. null if unstated.
- `mood`: a whole number from 1 to 5. null if unstated.
- `workload`: a whole number from 1 to 5. null if unstated.
- `teamwork`: a whole number from 1 to 5. null if unstated.
- `shared_meal`: true or false. null if unstated.

Return only the JSON object, with every field present. Do not explain.

Example answer: "I slept around eleven and woke at seven. Mood was a four,
workload a two. We had dinner together."

```json
{"sleep_time": "23:00", "wake_time": "07:00", "mood": 4, "workload": 2, "teamwork": null, "shared_meal": true}
```
