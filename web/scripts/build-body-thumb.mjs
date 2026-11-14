// Renders the still front and back pictures of the standing body (BodyParts3D skin) used by the Home
// "Body" card, and works out where each body part's dot sits on them, so the card shows pain and skin
// marks without loading the 3D viewer.
// Outputs public/somakine-ext/body-front.png, public/somakine-ext/body-back.png and
// src/lib/console/body/body-thumb.json ({ "<structureId>#<left|right|mid>": { view, x, y } }, x/y in %).
// Run after build-head-neck-extension.mjs (it reads the skin and extension from there):
//   node scripts/build-body-thumb.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readGlbMeshes, vertexNormals } from "./lib/glb.mjs";
import { renderRGBA } from "./lib/render.mjs";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_DIR = join(web, "node_modules", "@somakine", "bodyparts3d-musculoskeletal", "public");
const pack = JSON.parse(readFileSync(join(PACK_DIR, "pack.json"), "utf8"));
const ext = JSON.parse(readFileSync(join(web, "src", "lib", "console", "body", "head-neck-extension.json"), "utf8"));
const assetFile = (a) => (a.id.startsWith("somakine:asset:openhealth:") ? join(web, "public", "somakine-ext", a.uri) : join(PACK_DIR, a.uri));

/* every mesh node of every asset, by node name */
const nodes = new Map();
for (const a of [...pack.assets, ...ext.assets]) {
  if (a.kind !== "gltf") continue;
  for (const m of readGlbMeshes(assetFile(a)).meshes) nodes.set(`${a.id}|${m.name}`, m);
}
const skin = [...nodes.entries()].filter(([k]) => k.startsWith("somakine:asset:openhealth:skin|")).map(([, m]) => m);

/* picture size and projection (raw BodyParts3D mm: +X person's left, -Y front, +Z up) */
const W = 260, H = 600, PAD = 14;
let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (const m of skin) for (let i = 0; i < m.positions.length; i += 3) { x0 = Math.min(x0, m.positions[i]); x1 = Math.max(x1, m.positions[i]); z0 = Math.min(z0, m.positions[i + 2]); z1 = Math.max(z1, m.positions[i + 2]); }
const scale = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (z1 - z0)), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
/* front: facing the person, their left on the picture's right. back: from behind, their left on the left */
const VIEWS = {
  front: { cam: { r: [1, 0, 0], u: [0, 0, 1], f: [0, -1, 0] }, sx: 1 },
  back: { cam: { r: [-1, 0, 0], u: [0, 0, 1], f: [0, 1, 0] }, sx: -1 },
};
const toScreen = (view) => (p) => [W / 2 + VIEWS[view].sx * (p[0] - cx) * scale, H / 2 - (p[2] - cz) * scale, VIEWS[view].sx === 1 ? -p[1] : p[1]];

const SKIN_COL = [226, 214, 205];
const skinMeshes = skin.map((m) => ({ ...m, normals: vertexNormals(m.positions, m.indices), col: SKIN_COL }));
for (const view of Object.keys(VIEWS)) {
  const file = join(web, "public", "somakine-ext", `body-${view}.png`);
  writeFileSync(file, renderRGBA(skinMeshes, VIEWS[view].cam, W, H, toScreen(view)));
  console.log("wrote", file);
}

/* the skin's front/back middle at a height and side, to tell which picture a point shows on */
const skinPts = skin.flatMap((m) => Array.from({ length: m.positions.length / 3 }, (_, i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]));
const midCache = new Map();
const midY = (p) => {
  const k = `${Math.round(p[0] / 20)},${Math.round(p[2] / 20)}`;
  if (!midCache.has(k)) {
    const near = skinPts.filter((q) => Math.abs(q[2] - p[2]) < 15 && Math.abs(q[0] - p[0]) < 30);
    midCache.set(k, near.length ? (Math.min(...near.map((q) => q[1])) + Math.max(...near.map((q) => q[1]))) / 2 : p[1]);
  }
  return midCache.get(k);
};

/* a dot per structure and side: the mean of its vertices on whichever side (front/back) has more of them */
const instById = new Map([...pack.meshInstances, ...ext.meshInstances].map((i) => [i.id, i]));
const assetById = new Map([...pack.assets, ...ext.assets].map((a) => [a.id, a]));
const structs = new Map([...pack.structures, ...ext.structures].map((s) => [s.id, s]));
const points = {};
for (const rep of [...pack.representations, ...ext.representations]) {
  const s = structs.get(rep.structureId);
  if (!s || !rep.instanceIds.length) continue;
  const bySide = new Map();
  for (const iid of rep.instanceIds) {
    const inst = instById.get(iid);
    if (!inst || inst.selector.kind !== "node-name") continue;
    const m = nodes.get(`${assetById.get(inst.assetId)?.id}|${inst.selector.value}`);
    if (!m) continue;
    const side = s.laterality === "paired" ? (inst.laterality === "left" || inst.laterality === "right" ? inst.laterality : null) : "mid";
    const sides = side ? [side] : ["left", "right"]; // a bilateral mesh of a paired structure: split by x
    for (const sd of sides) {
      const list = bySide.get(sd) ?? bySide.set(sd, []).get(sd);
      const step = Math.max(1, Math.floor(m.positions.length / 3 / 1500));
      for (let i = 0; i < m.positions.length / 3; i += step) {
        const p = [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
        if (!side && (sd === "left") !== (p[0] >= 0)) continue;
        list.push(p);
      }
    }
  }
  for (const [side, pts] of bySide) {
    if (!pts.length) continue;
    const front = pts.filter((p) => p[1] <= midY(p)), back = pts.filter((p) => p[1] > midY(p));
    const view = front.length >= back.length ? "front" : "back", use = view === "front" ? front : back;
    const c = [0, 1, 2].map((k) => use.reduce((a, p) => a + p[k], 0) / use.length);
    const [sx, sy] = toScreen(view)(c);
    points[`${s.id}#${side}`] = { view, x: Math.round((sx / W) * 1000) / 10, y: Math.round((sy / H) * 1000) / 10 };
  }
}
const out = join(web, "src", "lib", "console", "body", "body-thumb.json");
writeFileSync(out, JSON.stringify({ width: W, height: H, points }) + "\n");
console.log("wrote", out, Object.keys(points).length, "points");
