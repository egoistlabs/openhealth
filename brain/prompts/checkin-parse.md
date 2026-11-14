# Check-in parsing task (C3)

This task is not yet wired to an endpoint. When implemented, extract only
explicitly stated answers into the approved B1 fields. Never infer a value.
Return a typed parse result with missing or ambiguous fields marked for
clarification. Validate allowed ranges and times in code, not in the model.
