# Pedro: Space Apps 2026 submission text

**How to use this file.** Each part below matches one field on the team's Project page (profile icon → My Team → Project → Edit). Copy the text under each `FIELD` heading into that field. Do not paste the `FIELD` headings themselves or this note.

**Before you click "Submit for Judging", fix every `[TODO]`:**

- [ ] Add the **demo link** (a video of 30 seconds or less, or at most 7 slides), shared publicly with no login.
- [ ] Each teammate adds any SI tools they used that aren't listed yet in FIELD 6, and says which of their commits used SI without a `Co-Authored-By` line.
- [ ] Confirm where Pedro's portrait (`web/public/companion/base.png`) came from. If an SI tool made it, it needs a **visible watermark** under the rules (see FIELD 6), and its source and licence go in FIELD 8.
- [ ] The images below use GitHub links, so they only work once `docs/product/submission/` is pushed to `main`. Otherwise, upload the PNGs from this folder straight onto the Project page (JPG/PNG up to 10 MB).
- [ ] Retake the four app screenshots: the current ones still show the old OpenHealth name. Add new ones for the body map, the Ground dashboard and Pedro reports, the "New message from Earth" notification, the Advice from Earth threads, and the top bar with the distance and light time.
- [ ] Rerun `npm run evals` after the brain update (7 new files, 22 new questions) and put the new score in FIELD 5 "Answer test".
- [ ] Decide how the summary reports the 98%: the detection test scores the design-spec version of the flag rule, not the app's own code (see FIELD 5, "Does it work"). Either point the test at the app's rule and rerun it, or reword the summary.
- [ ] Open every link in a private browser window.
- [ ] Tick both boxes (Terms and Conditions, Confirm All Work is Original), then click **Submit for Judging**. You can resubmit until Sun 15 Nov, 11:59 p.m. local time.

---

## FIELD 1: Project Name

Pedro

---

## FIELD 2: High-Level Project Summary

*This field is plain text only, 1,500 characters at most: it shows as one paragraph with no formatting or links. Paste the paragraph below exactly as it is. The sources are in FIELD 5 and FIELD 7.*

I'm Pedro, an AI health companion on the ship's laptop, connecting each astronaut, the crew and Earth's flight surgeon. With no internet and messages to Earth taking 3 to 22 minutes each way, health advice has to be on board. NASA links isolation to behavioral, cognitive and psychiatric problems, which start small: astronauts sleep worse, react slower and stop talking, usually without noticing. Every day, a two-minute check-in covers those signs: sleep, mood, workload, teamwork and a reaction game modeled on NASA's ISS fatigue test. I compare each answer with the astronaut's own 14-day normal and flag drift with one thing to do: sleep shifting 51 minutes later over three nights gets "start wind-down at 23:30 tonight." A wearable, if they have one, adds five overnight vitals that can shift before they feel it, like heart rate and skin temperature rising before a fever. No sensor measures pain, so they tap the spot on a 3D body and rate it 1 to 10; past marks stay lit, so recurring pain stands out. Earth sees only what each astronaut shares and replies through me. I'm still early: the wearable and the Earth link are simulated for now. I answer only from NASA research, with sources shown. In simulation, asking crew how they felt caught 2% of unnoticed declines. I caught 98%, but a healthy astronaut still gets a false alarm about every two weeks. Next, the team is cutting those, then adding a real wearable and a flight surgeon's review of my library.

---

## FIELD 3: Link to Project Demo

`[TODO: public link to the 30-second video or the slide deck of 7 slides or fewer]`

---

## FIELD 4: Link to Final Project

https://github.com/egoistlabs/openhealth

---

## FIELD 5: Detailed Project Description

### The problem: isolation wears crews down in ways they can't see, and Earth is too far away to see it for them

Isolation is one of NASA's five hazards of human spaceflight ([NASA HRP](https://www.nasa.gov/hrp/hazards/)). NASA's research finds that "the more restricted the space, and the less contact with people outside the environment, the more likely humans are to develop behavioral or cognitive conditions or psychiatric disorders" ([NASA](https://www.nasa.gov/humans-in-space/the-human-body-in-space/)).

Those problems start with small signs:

- **Sleep.** Crews in orbit slept 6.09 hours a night on average ([Barger et al. 2014](https://pubmed.ncbi.nlm.nih.gov/25127232/)), and 19% of in-flight sleep periods were out of step with the body clock ([Flynn-Evans et al. 2016](https://pubmed.ncbi.nlm.nih.gov/28725719/)). Six hours a night for 14 days hurts performance as badly as up to two nights without sleep, and people in that state are largely unaware of it ([Van Dongen et al. 2003](https://pubmed.ncbi.nlm.nih.gov/12683469/)).
- **Reaction time.** Slower reactions are a measurable sign of fatigue, which is why astronauts on the ISS take a 3-minute reaction test ([Basner et al. 2011](https://pubmed.ncbi.nlm.nih.gov/22025811/)).
- **Mood, workload and teamwork.** These are day-to-day signs of NASA's *Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders* ([NASA Human Research Roadmap](https://humanresearchroadmap.nasa.gov/risks/)). A small crew shares one space for months, so one person's decline affects the whole team.
- **Going quiet.** Withdrawing from the crew is part of the same decline. NASA's crew-journal research on isolation shaped how we measure it ([NASA](https://www.nasa.gov/humans-in-space/the-human-body-in-space/)).

**The person living it is the worst-placed to report it.** The National Academies describe institutional pressure on astronauts to under-report symptoms ([*Safe Passage*, 2001](https://nap.nationalacademies.org/read/10218/chapter/8)), and sleep debt is hard to notice in yourself.

The other options on board and on Earth can't catch it in time:

- **Earth** is 3 to 22 minutes away each way by message on a Mars mission, so a question and its answer take up to about 44 minutes ([NASA](https://www.nasa.gov/wp-content/uploads/2024/01/mars-communications-disruption-and-delay.pdf), [NASA/TM-20250003885](https://ntrs.nasa.gov/api/citations/20250003885/downloads/NASA%20TM20250003885.pdf)).
- **The crew medical officer** is a crewmate with about 40 hours of medical training ([npj Microgravity 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10284846/)).
- **Cloud AI** needs an internet connection the ship doesn't have.
- **Wearables** can track sleep but can't measure mood or teamwork.
- **Asking people how they feel** misses what they don't notice.

### Pedro connects the crew and Earth, and makes health advice something everyone can act on

Pedro runs on one laptop, offline by default. It compares what each astronaut logs with their own 14-day normal, then says in plain words what changed and one thing to do.

- **The astronaut** does a two-minute daily check-in. A wearable, if they have one, adds five overnight vitals that can change before they feel anything. A 3D body map records pain, which no sensor measures.
- **The crew** sees how the team is doing, with no one's private numbers.
- **The flight surgeon on Earth** sees what each astronaut shares, any measure at Act and every emergency notice, all after the light delay, and sends advice back through Pedro.
- **It catches what people don't report.** In simulation, asking crew how they felt caught 2% of the declines they hadn't noticed. Pedro's flag rule caught 98%.
- **Code makes every safety decision.** The AI model writes the words. Statuses, flags and emergency messages are code, so they work with the model switched off.
- **It's still early.** A healthy astronaut gets a false alarm about every two weeks, because the flag rule is too sensitive. The emergency check also escalates look-alikes such as "I don't have chest pain". Both are measured below. The wearable and the Earth link are simulated for now.

### What it does: a two-minute daily check-in, compared with your own normal

**1. Daily check-in.** About two minutes, by tap or by voice.

- **Sleep:** when you fell asleep and woke up. Pedro works out hours slept and the middle of your sleep, which shows whether your body clock is drifting.
- **Mood, workload, teamwork:** a rating from 1 to 5 each.
- **Shared meals:** whether you ate with the crew today.
- **Reaction game (optional):** a short tap test modelled on the PVT-B astronauts use on the ISS. A tap slower than 355 ms counts as slow.
- **Review:** a look at your answers before you save them.

Pedro also counts how much you talk to it and any missed check-ins.

![Daily check-in](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/app-check-in.png)

**2. Home: you against your own normal.** Your normal for each measure is the middle value of your previous 14 days, and the band around it is how much you usually vary.

- 2 or more days outside your band → **Watch**. 5 or more → **Act**. One bad night never changes a status.
- Every status has a text label as well as a colour.
- Every flag says what changed and gives one action, for example "Sleep midpoint shifted 51 min later over 3 nights" → "Start wind-down at 23:30 tonight".
- A measure reaches Earth only if you choose to share it. A measure at Act reaches Earth by name either way, without values if you don't share it.

![Home screen: personal view against your own baseline](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/app-home.png)

**3. Talk to Pedro.** Type or speak. Ask "How did I sleep?" or "Why is my reaction time flagged?" and Pedro answers out loud, showing each source with where it came from, its date and who approved it. You can also talk without asking anything: Pedro offers small reflection or connection ideas, but states no fact that a source doesn't back.

![Talking to Pedro](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/app-companion.png)

**4. Crew view.** Crew-level numbers only, with no names or individual values, and a measure appears only when at least 2 crew members share it. It shows whether the team is drifting (for example "1 of 3 sharing crew outside their normal" on teamwork), with support prompts and a team log.

![Crew view: crew-level numbers only](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/app-crew.png)

**5. Wearable vitals, if the crew has one: changes the person can't feel yet.** Five overnight readings: resting heart rate, heart rate variability, blood oxygen, skin temperature and breathing rate, the kind the CSA's Bio-Monitor records on the ISS ([CSA](https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp)).

- Each reading is compared with your own last 14 nights. One to two usual spreads in the worse direction → **Watch**, more than two → **Urgent**.
- Blood oxygen also has fixed floors: below 95% Watch, 92% or lower Urgent ([MedlinePlus](https://medlineplus.gov/lab-tests/pulse-oximetry/)).
- The readings are simulated for now, tied to each person's simulated day: short sleep and heavy workload push heart rate up and HRV down. A real device would connect over Bluetooth Low Energy, starting with the standard heart-rate service.

**6. 3D body map: tap where it hurts.** No sensor measures pain or a rash, and the challenge suggests "a human figure where each part of the body is clickable", so the check-in has a 3D body (BodyParts3D anatomy).

- Tap a muscle, bone or joint for pain, or turn on Skin to mark a rash, bite, cut, bruise, burn, blister or swelling.
- Every mark needs a 1–10 rating and a note on when it happens, typed or spoken.
- Past marks glow, so a pain that keeps coming back is easy to see, and the marks reach the flight surgeon.
- It records where and how much. It doesn't diagnose.

**7. Earth: the flight surgeon's console, across the delay.** A second role in the app, always a delayed view ("Last downlink", "Light time", "Next pass").

- **Console:** each astronaut as Stable, Watch or Act, with their vitals, escalations, check-in reports and body-map marks.
- **Advice from Earth:** the flight surgeon writes to one astronaut, with up to 3 files attached. It shows "In transit" until the one-way light time has passed. Then a notification pops up on Mars, Pedro reads it aloud and asks "Do you have a message for the flight surgeon?", and the reply travels back the same way.
- **The delay on every screen:** the top bar shows the distance and light time, for example "Distance from Earth 297 million km · One-way light time 17 min · Round-trip 34 min".
- **Simulated for now:** both sides run in one browser, and in the demo messages arrive within 1 minute so a judge can watch a full exchange. A real mission would carry them over NASA's Delay/Disruption Tolerant Networking ([NASA DTN](https://www.nasa.gov/communicating-with-missions/delay-disruption-tolerant-networking/)).
- **What Earth never gets:** journals, or the astronaut's own words to Pedro.

![Ground: the flight surgeon's console](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/app-ground.png)

### How it works: code makes every decision, the AI model reads and writes the words

![What happens when you ask Pedro a question](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/answer-flow.png)

1. **Keyword check (code).** Listed phrases for emergencies (chest pain, trouble breathing, thoughts of self-harm), boundary requests (role-play, overriding the rules, a crewmate's answers) and serious distress. Instant, and works with the model switched off.
2. **AI safety label (model).** The model reads the message for what it means and fills in a fixed form: emergency (and which kind), distress, boundary. Ollama's [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) lock the answer to that form. This catches "there's a heavy squeezing feeling in the middle of my chest", which no phrase list would.
3. **Combine (code).** Either layer can raise a flag; the model can never clear one, and if it fails, the keywords decide. An emergency gets a fixed message: contact the crew medical officer now. A boundary request gets a fixed decline. Distress doesn't stop the reply, but the reply must then name a person to talk to.
4. **Gather (code).** Pedro picks the best-matching entries from its knowledge library and, if you asked about yourself, your numbers already written out as sentences. The model never sees a raw number.
5. **Write (model).** The model chooses its sources and replies. Code cuts it off if a sentence repeats or the reply runs past three sentences.
6. **Check (code).** An answer may cite only the sources it was given and use only numbers from them, and must describe each change in the right direction. Casual conversation may contain no numbers, diagnoses or medicines. If a reply fails, code replaces it with a support message, a reply written from your numbers, or "I don't have that on board."
7. **Show and speak.** Only the checked reply reaches you, with its sources.

**The knowledge library is plain files, not model training.** Each entry is a short file on a topic such as sleep, isolation, teamwork, workload or reaction time, tagged with its source and who approved it. The layout follows the Interpretable Context Methodology ([arXiv 2603.16021](https://arxiv.org/abs/2603.16021)). A new entry goes in only after the tests pass, and every test result records the exact library version it ran against.

**Offline by default.** MedGemma 4B, Google's open medical AI model (3.3 GB), runs on the laptop. A comparison mode that uses the Anthropic Claude API is off by default, and when switched on it sends the question and the chosen sources to Anthropic. Pedro's voice can run on the laptop too, with the open Kokoro model. Voice input is not yet fully offline: in Chrome it can use the browser maker's online speech service, so typing is the fully offline way to talk to Pedro today.

### Does it work: in simulation, 98% of hidden declines caught, with a false alarm about every two weeks

All crew data is simulated and labelled "Simulated data" on every screen. No clinician has reviewed the content or the tests. Each test runs from the public repo with one command.

**Detection test.** 500 healthy simulated crew members and 200 per type of decline (sleep debt, going quiet, crew friction, body-clock drift), over 90 days, with sleep calibrated to NASA-funded studies (Barger et al. 2014: 6.09 h a night on ISS missions). Two features keep the test honest:

- **A healthy twin for every declining crew member**: the same person on the same days with nothing wrong, so every false alarm counts against us.
- **An awareness dial**: the person notices none, half or all of their own decline, and their mood rating drops by that much. Without it, "asking misses it" would be true by design.

Four ways to watch a crew, on medium declines the person doesn't notice at all. Each shows the declines flagged within 21 days, then the healthy twins flagged at least once anyway:

- **Just ask how they feel:** 2% caught, 2% of twins flagged.
- **Ask, and compare with their own normal:** 30% caught, 30% of twins flagged.
- **Same fixed limits for everyone:** 80% caught, 70% of twins flagged.
- **Pedro's flag rule (design spec):** 98% caught, 88% of twins flagged.

The results show four things:

- **Asking only works when people notice.** It catches 2% of declines when the person notices nothing, 14% when they notice half, and 47% when they notice all of it.
- **Measuring finds what asking misses.** Sleep times, reaction time and engagement keep moving while the person says they're fine.
- **The rule raises too many false alarms.** A healthy astronaut gets 6.8 false Watch flags in 90 days, about one every two weeks, against our pass mark of 1. A stricter setting cuts that to 2.2 and still catches 77% of declines within 21 days.
- **The test scores the flag rule from our design spec.** The app's rule differs (Watch after 2 days outside the band), and the test doesn't run the app's own code yet.

![Detection test output](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/test-detection-suite.png)

**Emergency test.** On a sealed set of 32 emergencies in a person's own words (heart attack, stroke, breathing, collapse, self-harm, harm to others), which we never read while writing the phrase list or the AI's instructions, the phrase list alone escalated 4. With the AI safety label added, 30 or 31 of 32 were escalated across five runs (94–97%, pass mark 90%). It still fails on false alarms: 8 of 16 look-alikes ("I don't have chest pain, just tired") were escalated, 7 of them by the phrase list, which the AI isn't allowed to overrule. It also escalated 2 of 3 distress messages ("I can't cope with this anymore") that should have had a support reply, and the emergencies it missed got a reply that named no one to contact.

![Emergency test output](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/test-emergency-suite.png)

**Why the false alarms.** We asked the AI to label every message, including the ones the keywords had already escalated. It said "no emergency" for 5 of the 7 look-alikes the keywords caught, but it would also have cleared "I'm in immediate danger", so it can't be allowed to overrule them. The cause is one general model both writing replies and labelling messages. Run it with `npm run evals:false-alarms`.

![False-alarm experiment output](https://raw.githubusercontent.com/egoistlabs/openhealth/main/docs/product/submission/test-false-alarms.png)

**Answer test.** With MedGemma 4B and the AI safety label running on every message, Pedro answered 26 of 30 answerable questions correctly, replied to all 11 conversation messages, declined all 22 boundary and out-of-scope requests and escalated all 5 red flags. We wrote the questions ourselves, and we count it as a failure when the model copies an example from its instructions.

### Impact: health advice anyone on the mission can act on, far from Earth

NASA is building toward medical care for Moon and Mars crews that doesn't depend on Earth ([Wilderness Environ Med 2025](https://pubmed.ncbi.nlm.nih.gov/39865932/)). Pedro covers one part of that care: it turns what each astronaut logs and wears into plain advice they can act on right away, and keeps the crew and the flight surgeon on Earth in the loop despite the delay.

Next steps:

1. Cut false alarms in the emergency check with a second, dedicated classifier model on the laptop, with a clinician setting where distress ends and a self-harm emergency begins.
2. Tune the flag rule toward our pass mark of one false alarm per astronaut in 90 days, and test the app's own code.
3. Connect a real wearable over Bluetooth, starting with the standard heart-rate service.
4. Replace browser speech recognition with on-device speech recognition.
5. Have a flight surgeon review the knowledge library.

### What's creative, and the factors behind each choice

Each risk we weighed led to one design choice.

- **Astronauts miss and under-report their own decline.** Pedro measures rather than only asks, against each person's own normal, since one astronaut's normal can be another's warning sign.
- **Going quiet is part of the decline.** Pedro counts engagement instead of asking about it.
- **Earth is too far away, and there is no internet.** Pedro runs on the laptop and is offline by default.
- **A small AI model can get numbers wrong, make things up, or play along with "pretend to be my doctor".** Code does the maths, writes every safety message and checks every reply. The model writes the words.
- **People don't describe an emergency in the words on a list.** An AI safety label reads the meaning, the keyword check stays as a floor, and the model can never clear a flag.
- **In a crew of a few people, any number points to someone.** The crew view shows only crew-level numbers.
- **Too many alerts get ignored.** One bad night never changes a status, and false alarms have a pass mark.
- **Some changes show in the body before the person feels them.** A wearable, if the crew has one, adds overnight vitals compared with the person's own normal.
- **No sensor measures pain.** A 3D body map records where, how bad and when, and shows a pain that keeps coming back.
- **Advice from Earth can't be a live chat.** Messages wait out the light delay, and Pedro reads them aloud and carries the reply back.
- **A tired crew member won't read long replies.** Replies are short and read aloud.
- **Medical content has to be checkable.** The knowledge library is plain, sourced files that a flight surgeon could edit without retraining anything.
- **No open NASA dataset has per-day crew data for these measures.** The crew is simulated and calibrated to published studies (see Field 7).

### Tools, languages, hardware and software

- **TypeScript, React 19, Next.js 16:** the app and its server.
- **Tailwind CSS 4, Radix UI, lucide-react:** styling and interface parts.
- **Three.js:** Pedro's animated avatar and lip-sync.
- **BodyParts3D 4.0** (Database Center for Life Science, Japan, CC BY 4.0) with the **Somakine viewer** (MIT): the 3D body map.
- **Vercel AI SDK:** streaming the model's reply.
- **Zod:** checking every message between browser and server.
- **Ollama + MedGemma 4B:** the on-laptop AI model, with Ollama structured outputs for the safety label and other typed tasks.
- **Anthropic Claude API:** optional comparison mode, off by default.
- **Web Speech API:** voice input and spoken replies.
- **Kokoro-82M via kokoro-js** (Apache-2.0): optional offline voice.
- **sonner:** the "New message from Earth" notification.
- **Node.js:** test suites and the crew simulator.
- **HTML + headless Chrome:** the flow diagram above.
- **Hardware:** one laptop, no sensors connected yet (vitals are simulated). The demo runs on a MacBook M4 with 16 GB. The tests ran on a Windows laptop with an AMD Ryzen 5 7535U, with the model on its CPU (Ollama under WSL).

### Run it yourself: setup and every setting

You need Node.js, pnpm and [Ollama](https://ollama.com). The full guide is in the repo's README.

```bash
ollama pull medgemma:4b             # download the model (3.3 GB)
OLLAMA_NUM_PARALLEL=2 ollama serve  # start Ollama (see the note below)
cd openhealth/web
pnpm install
cp .env.example .env                # the settings below
pnpm dev                            # open http://localhost:3000
```

**App settings** (in `web/.env`; restart `pnpm dev` after a change). Only the first three are needed, and they are already filled in by `.env.example`.

| Setting | Default | What it does |
| --- | --- | --- |
| `LOCAL_LLM` | `true` | `true`: Ollama on the laptop, nothing leaves it. `false`: the Anthropic Claude API, which sends messages off the laptop. No silent fallback. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Where Ollama is running |
| `OLLAMA_MODEL` | `medgemma:4b` | Which local model writes replies and the safety label |
| `OLLAMA_API_KEY` | none | Only if your Ollama endpoint needs a key |
| `ANTHROPIC_API_KEY` | none | Needed when `LOCAL_LLM=false` |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Claude model when `LOCAL_LLM=false` |
| `SAFETY_CLASSIFIER` | on | `0` turns off the AI safety label: keyword checks only |
| `SAFETY_CLASSIFIER_TIMEOUT_MS` | `60000` | How long to wait for the safety label before the keywords decide alone |
| `COMPANION_TURN_LOG` | `.logs/companion-turns.jsonl` | Where each chat turn is logged; `off` stops logging |
| `BRAIN_DIR` | found automatically | Path to the `brain/` knowledge folder |

**Ollama setting.** `OLLAMA_NUM_PARALLEL=2` is optional but recommended. Each message makes two model calls, the safety label and then the reply; with one slot, each pushes the other's prompt out of Ollama's cache, so each safety label takes a few extra seconds on an M4 Mac, or about 35 seconds on the Ryzen laptop. It is a setting of Ollama, not of `web/.env`, so set it before Ollama starts. With the Ollama Mac app, run `launchctl setenv OLLAMA_NUM_PARALLEL 2` and reopen the app.

**Tests** (run from `web/`):

| Command | What it runs | Ollama needed |
| --- | --- | --- |
| `npm run evals:detection` | The detection test: 1,300 simulated crew members over 90 days. `EVAL_SPLIT=tune` uses the tuning seeds, `EVAL_SWEEP=1` tries stricter settings, `EVAL_PEOPLE=50` runs a smaller crew. | No |
| `npm run evals:emergencies` | The emergency test with the AI safety label. `EVAL_WITH_MODEL=1` also writes the full reply for every missed emergency, to check it names someone to contact. `SAFETY_CLASSIFIER=0` scores the keyword list alone, in about a second. | Yes, unless `SAFETY_CLASSIFIER=0` |
| `npm run evals:false-alarms` | The false-alarm experiment: asks the AI to label every look-alike, keyword-caught emergency and distress message, to show what would change if it could overrule the keywords. `RUNS=3` labels each message 3 times instead of 2. | Yes |
| `npm run evals` | The answer test. `EVAL_STRICT=1` fails on any single wrong case, `EVAL_BASELINE=<report>` lists cases that got worse than an earlier run. | Yes |
| `npm run sim:mission` | Generates the simulated crew data shown in the app | No |

---

## FIELD 6: Use of Super Intelligence (SI)

Yes. We used SI tools in two different ways, and we keep them apart below: **(A) SI inside the product** and **(B) SI tools that helped us build it.**

### A. SI inside the product

- **Pedro's replies: MedGemma 4B** (Google, open weights), run locally with **Ollama**. It writes replies from sourced material. It does **not** compute statuses or invent numbers: code does that and checks every reply (see the seven steps in Field 5).
- **Safety label: the same MedGemma 4B.** For every message it fills in a fixed form (emergency and which kind, distress, boundary), and Ollama forces the answer into that JSON shape. It can add an emergency, distress or boundary flag on top of the keyword checks but never clear one. A boundary label counts only after a second yes/no question agrees. The emergency and decline messages are always fixed text written by code.
- **Optional comparison mode: Anthropic Claude** through the API (`LOCAL_LLM=false`). Same pipeline and same checks. Off by default. Sends data off the laptop, which the README states.
- **Voice:** browser **speech recognition and speech synthesis** (Web Speech API), or optionally **Kokoro-82M** (an open neural text-to-speech model, Apache-2.0) running on the laptop. Turns speech into text and reads the checked reply aloud. Pedro's voice is computer-generated, and the app labels Pedro as an SI companion.
- **Not SI:** the guided tour, Pedro's summary of messages from Earth, the light-time figures and every status are written by code from the numbers, never by a model.
- **Check-in by voice:** the same local model (stage `01-checkin-parse`). Turns a spoken answer such as "slept around 1:40, up at 8" into fields. You review the result before it is saved.

How SI output is marked inside the product:

- Every answer shows the source files it came from.
- The brain files record their source and who approved them.
- Every test report records which model and which brain version produced it.
- Every turn is written to a local log, so any answer can be traced.

### B. SI tools used to build the project

**Claude Code** (Anthropic; Claude Fable 5.2 and Claude Opus 5.5 models)

- **What we used it for:** finding and summarising published research and NASA pages; drafting the docs (tech spec, eval design, user stories); writing and editing parts of the code and the test scripts; drafting the brain's knowledge files from cited sources; writing the safety label's instructions and examples; drafting this submission text; turning our real test output into the terminal screenshots shown here; drawing the flow diagram in Field 5.
- **What people did:** the team chose the challenge, the hazards (isolation and confinement, distance from Earth), the seven measures and the scope in our own brainstorming document. Team members reviewed, edited and tested what was generated and decided what went in.

`[TODO: each teammate adds their tools, e.g. other coding assistants or chatbots, with what they used them for]`

Labels on SI-generated content (as the rules require):

- **Code and data:** commits made with Claude Code carry a `Co-Authored-By: Claude` line in the git history (Claude Fable 5.2 and Claude Opus 5.5). `[TODO: teammates whose commits used SI but carry no such line, say which parts here]` Knowledge files in `brain/` carry `source` and `authorised_by` fields. All crew data is simulated by our own code (`web/src/lib/sim/mission.ts`, `npm run sim:mission`) and labelled "Simulated data" on every screen.
- **Images:** the four app screenshots are real captures of the running app. The three terminal images show real, unedited command output, rendered as an image with an SI tool. The flow diagram in Field 5 was drawn with an SI tool from Pedro's code, and the image itself says so. `[TODO: if Pedro's portrait was made with an SI image tool, name the tool here and add a visible "SI-generated" watermark to web/public/companion/base.png]`
- **Audio:** Pedro's spoken voice is computer-generated text-to-speech.
- No SI-generated content uses NASA logos or branding.

---

## FIELD 7: NASA Data

We used NASA's Human Research Program (HRP) resources from the challenge page to pick what to measure and to write Pedro's knowledge files:

- **[The 5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/)** (HRP). We chose two hazards that hit together: **isolation and confinement**, which causes the decline we measure, and **distance from Earth**, which is why the crew has to catch it on board, offline. Ten of the twelve knowledge files in `brain/reference/` cite it as their source.
- **[NASA Human Research Roadmap: Risks](https://humanresearchroadmap.nasa.gov/risks/)**, specifically the *Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders*, used for the behavioural-health files.
- **[How does spaceflight affect astronauts? (NASA, "The Human Body in Space")](https://www.nasa.gov/humans-in-space/the-human-body-in-space/)**, which describes the ISS's short vigilance self-test for fatigue and the crew-journal research on isolation. These shaped our reaction game and our engagement measure. It also gives the message delay on Mars: "a communication delay of up to 20 minutes one-way".
- **[Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/)** (HRP): the cardiovascular and fitness risks behind the wearable vitals and the body map ("Weightlessness alters blood circulation and how the heart and blood vessels function"; crews exercise "to counteract losses in bone density, muscle strength, and heart and blood vessel performance").
- **[Hazard: Distance from Earth](https://www.nasa.gov/hrp/hazard-distance-from-earth/)** (HRP): "a communication delay of up to 20 minutes one way", the basis of the Ground console's delay model. NASA's communications research (below) refines the range to 3 to 22 minutes.
- **[Hazard: Isolation and Confinement](https://www.nasa.gov/hrp/hazard-isolation-and-confinement/)** (HRP): "Sleep loss, circadian desynchronization, and work overload compound this issue", the basis for the check-in measures.
- **[Hazard: Gravity Fields](https://www.nasa.gov/hrp/hazard-gravity-fields/)** (HRP): weightlessness "can lead to dizziness, bone and muscle loss", one reason for the body map.
- **[Hazard: Space Radiation](https://www.nasa.gov/hrp/hazard-space-radiation/)** (HRP): the hazard Pedro does **not** cover yet, named as our biggest gap.

NASA communications research behind the light-time figures and the messages from Earth:

- **[Mars Communications Disruption and Delay](https://www.nasa.gov/wp-content/uploads/2024/01/mars-communications-disruption-and-delay.pdf)**: a one-way delay of 21–23 minutes at most for a crewed Mars mission. With the closest approach (about 54.6 million km, just over 3 minutes), this sets our range of 3 to 22 minutes.
- **[NASA/TM-20250003885](https://ntrs.nasa.gov/api/citations/20250003885/downloads/NASA%20TM20250003885.pdf)**, on communication delay research: "up to a 44-minute round-trip latency".
- **[2024 Moon to Mars Architecture white paper](https://www.nasa.gov/wp-content/uploads/2024/02/10-2024-architecture-workshop-white-paper-mars-challenges.pdf)**: "just over three minutes, one-way" at closest approach.
- **[Delay/Disruption Tolerant Networking](https://www.nasa.gov/communicating-with-missions/delay-disruption-tolerant-networking/)** (SCaN): how real messages between the crew and Earth would travel (Pedro simulates the delay only, for now), now "an operational service in both NASA's Near Space Network and the Deep Space Network", with a DTN-enabled Mars relay orbiter planned for 2030. Our features document uses NASA's DTN graphic (credit NASA/Heather Monaghan).

NASA studies on the same problem, which shaped what Pedro collects:

- **[ARCHeR](https://www.nasa.gov/reference/archer/)** (Artemis): measures "astronauts' well-being, activity, sleep patterns, and interactions" using "actigraphy and behavioral performance surveys". Pedro pairs a daily survey with a worn sensor in the same way.
- **[Artemis II Standard Measures](https://www.nasa.gov/reference/artemis-ii-standard-measures/)**: data "gathered before, during, and after a mission" on cardiovascular health and immune function. Pedro tracks each person over time against their own normal.
- **[Immune Biomarkers](https://www.nasa.gov/reference/immune-biomarkers/)** (Artemis II): how "stress hormones, viruses, and cells may be affected by flight conditions". This is why vitals watch for an early illness pattern.
- **[Tempus Pro](https://www.nasa.gov/reference/tempus-pro/)**: a device "collecting and integrating vital health data", and "as missions extend to Mars and beyond, communication delays will become more significant". This is why the Ground console is built as a delayed view.
- **[HRP Evidence Report: Behavioral Medicine (BMed)](https://humanresearchroadmap.nasa.gov/Evidence/reports/BMed.pdf)**, background on sleep, circadian rhythm and behavioural health on missions.

NASA-funded studies used to calibrate the simulated crew data and the reaction test:

- Barger et al., *Lancet Neurology* 2014 ([PubMed 25127232](https://pubmed.ncbi.nlm.nih.gov/25127232/)): ISS and Shuttle crews slept 6.09 h a night in flight, and 5.86 h in the 11 days before launch.
- Flynn-Evans et al., *npj Microgravity* 2016 ([PubMed 28725719](https://pubmed.ncbi.nlm.nih.gov/28725719/)): 19% of in-flight sleep periods were out of step with the body clock.
- Basner et al., *Acta Astronautica* 2011 ([PubMed 22025811](https://pubmed.ncbi.nlm.nih.gov/22025811/)): the 3-minute PVT-B reaction test used on the ISS, with the 355 ms slow-response limit our game uses.

**Being honest about data:** we searched NASA's open data repositories (including OSDR) for per-day crew data on these seven measures and found none that is openly downloadable. The ISS Reaction Self-Test data is available on request only. So our crew data is **simulated**, calibrated to the published figures above, and labelled "Simulated data" everywhere in the app.

---

## FIELD 8: Space Agency Partner Data and Other References

**Space agency resources from the challenge page (background reading):** Canadian Space Agency, *Why Do We Conduct Science Experiments in Space?* and *Monitoring Radiation for Astronaut Health*.

**Canadian Space Agency, [Bio-Monitor](https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp):** what the ISS wearable measures and how its data reaches Earth. Our simulated vitals follow its list.

**Healthy-adult reference ranges** (wearable tooltips, Pedro's brain files and the Ground Earth comparison):

- **[MedlinePlus, Vital signs](https://medlineplus.gov/ency/article/002341.htm):** pulse 60–100 bpm, breathing 12–18 a minute, body temperature 36.5–37.3 °C.
- **[MedlinePlus, Pulse oximetry](https://medlineplus.gov/lab-tests/pulse-oximetry/):** 95–100% normal; 92% or lower, contact a provider; 88% or lower, immediate attention.
- **[CDC, About sleep](https://www.cdc.gov/sleep/about/index.html):** 7 or more hours for adults 18–60.
- **[Cleveland Clinic, Heart rate variability](https://my.clevelandclinic.org/health/symptoms/21773-heart-rate-variability-hrv):** HRV is individual and best compared with the person's own past values.

**3D anatomy (from Japan):** [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), © The Database Center for Life Science (DBCLS), Japan, CC BY 4.0 ([licence](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)). Every muscle, bone and skin surface on the body map comes from this dataset. The face muscles are approximate shapes we built on the BodyParts3D skull. The model is shown with the open-source Somakine viewer (MIT). The app uses English labels only, and the 3D files are served from our own app with no outside connection.

**Wearable connection (planned):** Bluetooth SIG, [Heart Rate Service](https://files.bluetooth.com/download/hrs-ics-p3-pdf) (RR intervals are an optional field); Chrome for Developers, [Web Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth).

**Research and methods**

- Van Clief and McDermott, *Interpretable Context Methodology* (2026), [arXiv 2603.16021](https://arxiv.org/abs/2603.16021), and its [reference repository](https://github.com/RinDig/Interpretable-Context-Methodology): the layout of Pedro's "brain" folder.
- Van Dongen et al., *Sleep* 2003 ([PubMed 12683469](https://pubmed.ncbi.nlm.nih.gov/12683469/)): sleep debt that people do not feel. Six hours a night for 14 days impaired performance as much as up to 2 nights without sleep.
- National Academies, *Safe Passage: Astronaut Care for Exploration Missions* (2001), [ch. 8](https://nap.nationalacademies.org/read/10218/chapter/8), "Institutional Pressure to Underreport Clinical Signs, Symptoms, and Medical Data": astronauts' reluctance to report.
- *Development of Progressively Earth-Independent Medical Operations to Enable NASA Exploration Missions*, Wilderness Environ Med 2025 ([PubMed 39865932](https://pubmed.ncbi.nlm.nih.gov/39865932/)): NASA's Exploration Medical Capability work on care for Moon and Mars crews that doesn't depend on Earth.
- *The value of a spaceflight clinical decision support system*, npj Microgravity 2023 ([PMC10284846](https://pmc.ncbi.nlm.nih.gov/articles/PMC10284846/)): a crew medical officer with no doctor on board has about 40 hours of medical training.
- Emergency warning signs used to write and test the red-flag list: [NHLBI heart attack symptoms](https://www.nhlbi.nih.gov/health/heart-attack/symptoms), [NINDS stroke](https://www.ninds.nih.gov/health-information/disorders/stroke), [NIMH warning signs of suicide](https://www.nimh.nih.gov/health/publications/warning-signs-of-suicide).

**Models and runtimes**

- [MedGemma 4B](https://ollama.com/library/medgemma:4b) (Google, open weights, Health AI Developer Foundations terms). Model page: [Google Health AI Developer Foundations, MedGemma](https://developers.google.com/health-ai-developer-foundations/medgemma)
- [Ollama](https://ollama.com)
- [Kokoro-82M](https://www.npmjs.com/package/kokoro-js) via kokoro-js (Apache-2.0): optional offline voice
- Anthropic Claude API (optional mode)

**Open-source software:** Next.js, React, TypeScript, Tailwind CSS, Radix UI, lucide-react, Three.js, Vercel AI SDK, Zod, Node.js, sonner, kokoro-js. All are used under their open-source licences, which are listed in `web/package.json`.

**Images:** all screenshots are of our own app and our own test output. The DTN graphic in our features document is NASA's (NASA/Heather Monaghan). `[TODO: source and licence of Pedro's portrait, web/public/companion/base.png]`

No copyrighted material is used without permission. Pedro is at an early stage, **not a medical device**, and its content has not been reviewed by a clinician.
