// Copies the BodyParts3D GLB files (and their licence notices) from the Somakine data pack into
// public/somakine so Next serves them; the viewer fetches them through BodyModel's assetResolver.
// Runs on postinstall. The output folder is gitignored, it is rebuilt from node_modules.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const pack = join(web, "node_modules", "@somakine", "bodyparts3d-musculoskeletal", "public");
const out = join(web, "public", "somakine");

if (!existsSync(pack)) {
  console.warn("copy-somakine-assets: @somakine/bodyparts3d-musculoskeletal not installed, skipping");
  process.exit(0);
}
mkdirSync(out, { recursive: true });
cpSync(join(pack, "assets"), join(out, "assets"), { recursive: true });
for (const f of ["LICENSE.bodyparts3d.txt", "LICENSE.bodyparts3d-supplemental.txt"]) cpSync(join(pack, f), join(out, f));
console.log("copy-somakine-assets: copied BodyParts3D assets to public/somakine");
