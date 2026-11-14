// npm run brain:check
// Checks the brain files and the eval question set without calling the model. Takes a second.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBrain } from "../src/lib/brain/check.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const brainDirectory = process.env.BRAIN_DIR
  ? path.resolve(process.cwd(), process.env.BRAIN_DIR)
  : path.resolve(scriptDirectory, "../../brain");

checkBrain(brainDirectory).then(({ errors, warnings }) => {
  for (const warning of warnings) console.log(`warning  ${warning}`);
  for (const error of errors) console.error(`ERROR    ${error}`);
  console.log(`\n${errors.length} errors, ${warnings.length} warnings`);
  if (errors.length > 0) process.exitCode = 1;
});
