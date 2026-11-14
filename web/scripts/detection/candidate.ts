// The rule under test.
//
// Today this is a stand-in: the status rule as the build brief words it. When
// the core loop (track B, stories B5 and B6) exists, replace the body of
// `candidate.evaluate` with a call into it, so the eval scores the real code.
// Keep the return shape: one Normal/Watch/Act level per measure per day.

import { ownBaseline, RULE_AS_WRITTEN, type Monitor } from "./monitors.ts";

export const candidate: Monitor = ownBaseline(
  "Pedro (rule as written)",
  "Seven measures against the person's own baseline. Stand-in for the core loop",
  RULE_AS_WRITTEN,
);
