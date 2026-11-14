import type { MeasureKey } from "./data";

/* Plain-language background for each measure, shown in the measure modal ("About this measure").
   General guidance only: the app always judges you against your own baseline, not these figures.
   Add the other measures here as they are written. */
export type MeasureInfo = {
  /** one-line answer to "why does this matter up here?" */
  why: string;
  /** reference points, shown as a small table */
  standard: Array<[string, string]>;
  /** what tends to push it off */
  affects: string[];
  /** how this app gets the number */
  how: string;
};

export const MEASURE_INFO: Partial<Record<MeasureKey, MeasureInfo>> = {
  sleep: {
    why:
      "Sleep is when the body and brain recover. Short sleep slows reaction time, dulls attention and memory, and lowers mood and patience with others. On a mission, where tasks are complex and mistakes are costly, those effects matter more than at home. Sleep loss also adds up: three short nights feel like one long, bad day.",
    standard: [
      ["Adults, general guidance", "7 to 9 hours a night"],
      ["Scheduled sleep period on the ISS", "about 8.5 hours"],
      ["Typical astronaut sleep in space", "often about 6 hours"],
      ["When this app raises Watch", "2+ nights outside your own normal"],
    ],
    affects: [
      "Light: no natural sunrise or sunset to set the body clock",
      "Noise from fans and equipment, and a cramped, shared sleep space",
      "Shifted or late work schedules, and stress before big tasks",
      "Caffeine late in the day, and screens close to bedtime",
    ],
    how: "Hours asleep, worked out from the sleep and wake times you give in your daily check-in.",
  },
  rt: {
    why:
      "Reaction time is one of the quickest, most honest signs of how alert you are. When you are tired or stressed, your responses slow down and you miss more, often before you notice it yourself. On a mission that matters for docking, robotics, spacewalk support and any task where a late response is costly. A short test each day catches that drift early.",
    standard: [
      ["Alert adults, simple reaction test", "about 200 to 300 ms"],
      ["A \"lapse\" in fatigue research", "a response slower than 500 ms"],
      ["Used in space", "NASA's Reaction Self Test on the ISS"],
      ["When this app raises Watch", "2+ tests slower than your own normal"],
    ],
    affects: [
      "Short or broken sleep, and a body clock that is out of step",
      "A long, heavy workday or high stress",
      "Feeling unwell, a headache, or stuffy cabin air",
      "Distractions during the test, or a different device or posture",
    ],
    how: "The median of your taps in the optional reaction game at the end of your daily check-in. Take it in a quiet moment, the same way each day, for a fair comparison.",
  },
  timing: {
    why:
      "Your body clock runs on a roughly 24-hour rhythm. When your sleep starts drifting earlier or later, that clock falls out of step with your work schedule, even if you still get enough hours. That is how jet lag feels: poorer sleep, low alertness at the wrong times, and a worse mood. Steady timing keeps the clock anchored when there is no real sunrise or sunset.",
    standard: [
      ["What is measured", "sleep midpoint: halfway between falling asleep and waking"],
      ["Healthy pattern", "a midpoint that stays within about an hour, day to day"],
      ["Mars sol vs Earth day", "a sol is about 40 minutes longer"],
      ["When this app raises Watch", "2+ nights shifted from your own normal"],
    ],
    affects: [
      "Late or shifted work, and early starts for big tasks",
      "Bright screens and cabin light late at night",
      "Missing the morning light cue, or no fixed wake time",
      "The longer Mars sol slowly pushing the body clock later",
    ],
    how: "The clock time halfway between the sleep and wake times you give in your check-in. Early and late drifts both count.",
  },
  mood: {
    why:
      "Mood is the most direct signal of how you are coping. Long missions bring isolation, confinement, distance from family and a fixed small group, and low mood can creep in slowly. A day or two of low mood is normal; a run of them is worth noticing early, because it affects sleep, focus and how you get on with the crew.",
    standard: [
      ["Scale", "1 (very low) to 5 (very good)"],
      ["What counts", "a change against your own usual rating, not the number alone"],
      ["Known risk on long missions", "mood often dips in the middle and later stages"],
      ["When this app raises Watch", "2+ days below your own normal"],
    ],
    affects: [
      "Short or poor sleep, and a disrupted body clock",
      "Isolation, missing home, and little privacy",
      "Friction with crewmates, or a heavy run of work",
      "Monotony: the same people, food and routine day after day",
    ],
    how: "Your own 1 to 5 rating in the daily check-in. There is no right answer; an honest number is what makes the trend useful.",
  },
  load: {
    why:
      "Workload and stress are what you are carrying each day. Some pressure keeps you sharp, but a heavy load for days in a row wears down sleep, mood and patience, and raises the chance of mistakes. Watching the trend helps you and the crew rebalance the schedule before it turns into burnout.",
    standard: [
      ["Scale", "1 (very light) to 5 (very heavy)"],
      ["What counts", "a change against your own usual rating"],
      ["Direction that matters", "higher than usual, for several days"],
      ["When this app raises Watch", "2+ days above your own normal"],
    ],
    affects: [
      "Packed schedules, long shifts, or critical tasks such as spacewalks",
      "Equipment problems and unplanned repairs",
      "Short sleep, which makes the same work feel heavier",
      "Communication delays with ground and little time off",
    ],
    how: "Your own 1 to 5 rating of how heavy the day felt, counting both workload and stress.",
  },
  team: {
    why:
      "A small crew depends on each other completely, with no one to swap out. How well you work together shapes safety, decisions and everyday wellbeing. Small tensions are normal; what matters is catching a slide early, while it is still easy to talk through.",
    standard: [
      ["Scale", "1 (poorly) to 5 (very well)"],
      ["Also counted", "whether you shared a meal with anyone"],
      ["What counts", "a change against your own usual rating"],
      ["When this app raises Watch", "2+ days below your own normal"],
    ],
    affects: [
      "Tiredness and stress, which shorten everyone's patience",
      "Unclear roles, or disagreements about the plan",
      "Eating and resting apart for days at a time",
      "Cultural or language differences that go unspoken",
    ],
    how: "Your own 1 to 5 rating of how well the crew worked together, plus whether you shared a meal. Only crew totals ever leave this view, and only if you choose to share.",
  },
  engage: {
    why:
      "When someone starts to struggle, they often pull back quietly: they talk less, skip check-ins, and still answer \"fine\". Engagement is measured rather than asked, so that slow withdrawal can still show up even when the ratings look normal.",
    standard: [
      ["What is measured", "words spoken to Pedro each sol, and check-ins missed in 7 days"],
      ["What counts", "a drop against your own usual level, not the raw count"],
      ["Why measured, not asked", "so \"fine\" cannot hide a slow withdrawal"],
      ["When this app raises Watch", "2+ days below your own normal"],
    ],
    affects: [
      "A busy stretch with little free time to talk",
      "Low mood, tiredness, or wanting more privacy",
      "Simply preferring short answers some days",
      "Talking more with crew or family instead, which is a good thing",
    ],
    how: "Counted automatically from your conversations with Pedro and your check-in history. The content of what you say is never scored, only how much.",
  },
};
