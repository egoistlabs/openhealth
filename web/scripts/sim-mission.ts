// Writes the simulated demo mission (story D1) as JSON.
//   npm run sim:mission                 prints it
//   npm run sim:mission -- out.json     writes it to a file
//   npm run sim:mission -- out.json 7   uses seed 7

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { simulateMission } from "../src/lib/sim/mission.ts";

const [target, seed] = process.argv.slice(2);
const mission = simulateMission(seed ? Number(seed) : undefined);
const json = `${JSON.stringify(mission, null, 2)}\n`;
if (target) {
  await writeFile(path.resolve(process.cwd(), target), json);
  console.log(`Simulated mission written to ${target}: ${mission.crew.length} crew, ${mission.crew[0].days.length} days.`);
} else {
  process.stdout.write(json);
}
