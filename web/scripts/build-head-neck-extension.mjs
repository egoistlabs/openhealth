// Builds the OpenHealth head and neck extension for the Somakine BodyParts3D pack:
//   1. real BodyParts3D 4.0 jaw and neck muscles (digastric, splenius capitis, scalenes, suboccipitals…)
//   2. approximate face muscles (masseter, temporalis, frontalis, occipitalis, orbicularis oculi/oris,
//      zygomaticus major, mentalis), shaped as thin tapered layers over the BodyParts3D skull, because
//      BodyParts3D has no facial or jaw muscles.
// Also packs the BodyParts3D whole-body skin (FJ2810) as its own asset.
// Outputs public/somakine-ext/head-neck.glb, public/somakine-ext/skin.glb and src/lib/console/body/head-neck-extension.json.
//
// Usage: node scripts/build-head-neck-extension.mjs --src <folder of BodyParts3D isa OBJ files> [--debug <folder>]
// The OBJ files come from isa_BP3D_4.0_obj_99.zip (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html).
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readGlbMeshes, readObj, vertexNormals, writeGlb } from "./lib/glb.mjs";
import { renderViews } from "./lib/render.mjs";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const SRC = arg("--src"), DEBUG = arg("--debug");
if (!SRC) { console.error("--src <folder of BodyParts3D OBJ files> is required"); process.exit(1); }

const PACK_DIR = join(web, "node_modules", "@somakine", "bodyparts3d-musculoskeletal", "public");
const pack = JSON.parse(readFileSync(join(PACK_DIR, "pack.json"), "utf8"));
const NS = "openhealth";
const REGION = "somakine:region:head-neck";
const OUT_GLB = join(web, "public", "somakine-ext", "head-neck.glb");
const OUT_SKIN = join(web, "public", "somakine-ext", "skin.glb");
const OUT_JSON = join(web, "src", "lib", "console", "body", "head-neck-extension.json");

/* ---------- skull from the base pack (raw BodyParts3D mm: +X = person's left, -Y = front, +Z = up) ---------- */
const head = readGlbMeshes(join(PACK_DIR, "assets", "bodyparts3d", "head-neck.glb"));
const bone = (re) => head.meshes.filter((m) => re.test(m.name));
const SKULL = bone(/frontal-bone|parietal|temporal-bone|zygomatic|maxilla|mandible|occiput|nasal-bone|sphenoid|lacrimal|ethmoid/);
const verts = (meshes, keep = () => true) => {
  const out = [];
  for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) {
    const v = [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
    if (keep(v)) out.push(v);
  }
  return out;
};
const minBy = (vs, f) => vs.reduce((a, b) => (f(b) < f(a) ? b : a));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/* landmarks, measured on the left side (+X) and mirrored */
const zyg = verts(bone(/zygomatic-bone/), (v) => v[0] > 0);
const mand = verts(bone(/mandible/), (v) => v[0] > 0);
const front = verts(bone(/frontal-bone/));
const maxZyg = verts(bone(/maxilla|zygomatic-bone/), (v) => v[0] > 0);
const occ = verts(bone(/occiput/));
const L = {};
L.zArch = median(zyg.filter((v) => v[1] > -140).map((v) => v[2]));
L.yZygFront = Math.min(...zyg.map((v) => v[1]));
const condyle = minBy(mand.filter((v) => v[0] > 35), (v) => -v[2]);
L.yCondyle = condyle[1];
const angle = minBy(mand.filter((v) => v[0] > 30), (v) => -(v[1] - v[2]));
L.yAngle = angle[1]; L.zAngle = angle[2];
L.zLowFront = Math.min(...mand.filter((v) => Math.abs(v[1] - (L.yAngle - 38)) < 4).map((v) => v[2]));
L.zOrbTop = Math.min(...front.filter((v) => v[1] < -155 && v[0] > 18 && v[0] < 45).map((v) => v[2]));
L.zOrbBot = Math.max(...maxZyg.filter((v) => v[0] > 22 && v[0] < 40 && v[1] < -150 && v[2] < L.zOrbTop - 15).map((v) => v[2]));
L.xOrbLat = Math.max(...zyg.filter((v) => v[2] > L.zOrbBot + 5 && v[1] < -140).map((v) => v[0]));
L.xOrbMed = 14;
L.zFrontTop = Math.max(...front.map((v) => v[2]));
L.zMouth = Math.min(...verts(bone(/maxilla/), (v) => v[1] < -165).map((v) => v[2]));
L.zMandMin = Math.min(...verts(bone(/mandible/), (v) => Math.abs(v[0]) < 10).map((v) => v[2]));
L.zInion = minBy(occ.filter((v) => Math.abs(v[0]) < 8), (v) => -v[1])[2];
/* superior nuchal line, about a third of the way up the occipital bone; occipitalis sits just above it */
L.zNuchal = Math.min(...occ.map((v) => v[2])) + 0.35 * (Math.max(...occ.map((v) => v[2])) - Math.min(...occ.map((v) => v[2])));
const zygBody = zyg.filter((v) => v[1] < -150);
L.xZygBody = zygBody.reduce((a, v) => a + v[0], 0) / zygBody.length;
L.zZygBody = zygBody.reduce((a, v) => a + v[2], 0) / zygBody.length;
const orb = { xc: (L.xOrbLat + L.xOrbMed) / 2, zc: (L.zOrbTop + L.zOrbBot) / 2, rx: (L.xOrbLat - L.xOrbMed) / 2, rz: (L.zOrbTop - L.zOrbBot) / 2 };
console.log("landmarks (mm):", Object.fromEntries(Object.entries({ ...L, ...orb }).map(([k, v]) => [k, Math.round(v * 10) / 10])));

/* views: project a point to 2D (a, b) plus a depth (bigger = nearer the viewer), and back again */
const VIEWS = {
  "lateral-left": { proj: (v) => [v[1], v[2], v[0]], unproj: (a, b, d) => [d, a, b] },
  "lateral-right": { proj: (v) => [v[1], v[2], -v[0]], unproj: (a, b, d) => [-d, a, b] },
  front: { proj: (v) => [v[0], v[2], -v[1]], unproj: (a, b, d) => [a, -d, b] },
  back: { proj: (v) => [v[0], v[2], v[1]], unproj: (a, b, d) => [a, d, b] },
};

/* the skull's outer surface as seen from each view: a 1 mm z-buffer of every skull triangle */
const RES = 1;
const depthMaps = {};
for (const [name, view] of Object.entries(VIEWS)) {
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const v of verts(SKULL)) { const [a, b] = view.proj(v); a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  const W = Math.ceil((a1 - a0) / RES) + 3, H = Math.ceil((b1 - b0) / RES) + 3, z = new Float32Array(W * H).fill(-Infinity);
  for (const m of SKULL) {
    const P = m.positions, I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const s = [0, 1, 2].map((k) => { const [a, b, d] = view.proj([P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]]); return [(a - a0) / RES, (b - b0) / RES, d]; });
      const area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
      if (Math.abs(area) < 1e-9) continue;
      for (let y = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]))); y <= Math.min(H - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1]))); y++)
        for (let x = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]))); x <= Math.min(W - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0]))); x++) {
          const w0 = ((s[1][0] - x) * (s[2][1] - y) - (s[2][0] - x) * (s[1][1] - y)) / area, w1 = ((s[2][0] - x) * (s[0][1] - y) - (s[0][0] - x) * (s[2][1] - y)) / area, w2 = 1 - w0 - w1;
          if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
          const d = w0 * s[0][2] + w1 * s[1][2] + w2 * s[2][2];
          if (d > z[y * W + x]) z[y * W + x] = d;
        }
    }
  }
  depthMaps[name] = { a0, b0, W, H, z };
}

/* ---------- 2D outlines (inside-ness in mm from the edge, positive inside) ---------- */
const polyDist = (pts) => (a, b) => {
  let inside = false, d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > b) !== (yj > b) && a < ((xj - xi) * (b - yi)) / (yj - yi) + xi) inside = !inside;
    const ex = xj - xi, ey = yj - yi, t = Math.max(0, Math.min(1, ((a - xi) * ex + (b - yi) * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(a - (xi + t * ex), b - (yi + t * ey)));
  }
  return inside ? d : -d;
};
/* ellipse ring; tIn = 0 gives a filled ellipse */
const ellipse = (cx, cz, rx, rz, tIn, tOut) => (a, b) => {
  const t = Math.hypot((a - cx) / rx, (b - cz) / rz), r = Math.min(rx, rz);
  return (tIn > 0 ? Math.min(t - tIn, tOut - t) : tOut - t) * r;
};
const band = (ax, az, bx, bz, w) => (a, b) => {
  const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez), t = ((a - ax) * ex + (b - az) * ez) / (len * len);
  const across = w / 2 * Math.sin(Math.PI * Math.max(0, Math.min(1, t))) ** 0.5 - Math.hypot(a - (ax + t * ex), b - (az + t * ez));
  return Math.min(Math.min(t, 1 - t) * len, across);
};
const both = (f, g) => (a, b) => Math.min(f(a, b), g(a, b));

/* ---------- approximate face muscles ---------- */
const sides = { left: 1, right: -1 };
const FACE = [
  {
    slug: "masseter", en: "Masseter", paired: true, thick: 8, feather: 9, view: (s) => `lateral-${s}`,
    region: () => {
      const pts = [[L.yZygFront + 10, L.zArch - 2], [L.yCondyle - 12, L.zArch - 2], [L.yAngle + 2, L.zAngle + 6], [L.yAngle - 8, L.zAngle - 1], [L.yAngle - 40, L.zLowFront + 2]];
      const as = pts.map((p) => p[0]), bs = pts.map((p) => p[1]);
      /* trim the corners with an ellipse so the outline reads as a rounded muscle belly */
      return both(polyDist(pts), ellipse((Math.min(...as) + Math.max(...as)) / 2, (Math.min(...bs) + Math.max(...bs)) / 2, 0.62 * (Math.max(...as) - Math.min(...as)), 0.6 * (Math.max(...bs) - Math.min(...bs)), 0, 1));
    },
  },
  {
    slug: "temporalis", en: "Temporalis", paired: true, thick: 6, feather: 14, view: (s) => `lateral-${s}`,
    region: () => both(ellipse(-100, L.zArch - 6, 56, 86, 0, 1), (a, b) => Math.min(b - (L.zArch + 3), a - (L.yZygFront + 13))),
  },
  {
    slug: "frontalis", en: "Frontalis", paired: true, thick: 3.5, feather: 12, view: () => "front",
    region: (sx) => both(ellipse(sx * 26, L.zOrbTop + 6, 30, 0.85 * (L.zFrontTop - L.zOrbTop), 0, 1), (a, b) => Math.min(sx * a - 2, b - (L.zOrbTop + 6))),
  },
  {
    slug: "orbicularis-oculi", en: "Orbicularis oculi", paired: true, thick: 3.5, feather: 4, view: () => "front",
    region: (sx) => ellipse(sx * orb.xc, orb.zc, orb.rx, orb.rz, 0.62, 1.55),
  },
  {
    slug: "zygomaticus-major", en: "Zygomaticus major", paired: true, thick: 4.5, feather: 4, view: () => "front",
    region: (sx) => band(sx * (L.xZygBody + 6), L.zZygBody - 2, sx * 25, L.zMouth - 2, 11),
  },
  {
    slug: "orbicularis-oris", en: "Orbicularis oris", paired: false, thick: 9, feather: 5, view: () => "front",
    region: () => ellipse(0, L.zMouth - 5, 27, 16, 0.38, 1),
  },
  {
    slug: "mentalis", en: "Mentalis", paired: false, thick: 5, feather: 5, view: () => "front",
    region: () => ellipse(0, L.zMandMin + 15, 13, 10, 0, 1),
  },
  {
    slug: "occipitalis", en: "Occipitalis", paired: true, thick: 3.5, feather: 8, view: () => "back",
    region: (sx) => both(ellipse(sx * 31, L.zNuchal + 14, 26, 14, 0, 1), (a) => sx * a - 6),
  },
];

/* lay a 1 mm grid over the outline, lift it onto the skull's outer surface (gaps such as the open mouth and
   the eye sockets filled from the surrounding bone, then smoothed), and raise it into a tapered muscle */
function sculpt(def, side) {
  const sx = side === "none" ? 1 : sides[side];
  const view = VIEWS[def.view(side)], dm = depthMaps[def.view(side)], inside = def.region(sx);
  const cells = [];
  for (let y = 0; y < dm.H; y++) for (let x = 0; x < dm.W; x++) {
    const a = dm.a0 + x * RES, b = dm.b0 + y * RES;
    if (inside(a, b) > -3 * RES) cells.push(y * dm.W + x);
  }
  if (!cells.length) throw new Error(`empty outline for ${def.slug}`);
  const xs = cells.map((c) => c % dm.W), ys = cells.map((c) => Math.floor(c / dm.W));
  const gx0 = Math.min(...xs) - 4, gy0 = Math.min(...ys) - 4, GW = Math.max(...xs) - gx0 + 5, GH = Math.max(...ys) - gy0 + 5;
  const raw = new Float32Array(GW * GH).fill(NaN);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const X = gx0 + x, Y = gy0 + y;
    if (X >= 0 && Y >= 0 && X < dm.W && Y < dm.H && dm.z[Y * dm.W + X] > -Infinity) raw[y * GW + x] = dm.z[Y * dm.W + X];
  }
  /* reject far-behind samples (looking through a hole to the back of the skull): keep within 12 mm of the local front */
  const filled = Float32Array.from(raw);
  for (let i = 0; i < filled.length; i++) {
    if (Number.isNaN(filled[i])) continue;
    const x = i % GW, y = Math.floor(i / GW);
    let mx = -Infinity;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const v = raw[(y + dy) * GW + (x + dx)]; if (v > mx) mx = v; }
    if (filled[i] < mx - 12) filled[i] = NaN;
  }
  /* fill holes by diffusion from the surrounding surface */
  for (let it = 0; it < 400; it++) {
    let left = 0;
    const next = Float32Array.from(filled);
    for (let i = 0; i < filled.length; i++) {
      if (!Number.isNaN(filled[i])) continue;
      const x = i % GW, y = Math.floor(i / GW);
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue; const v = filled[Y * GW + X]; if (!Number.isNaN(v)) { s += v; n++; } }
      if (n) next[i] = s / n; else left++;
    }
    filled.set(next);
    if (!left) break;
  }
  /* smooth (box blur x3), never sinking below the bone */
  let sm = Float32Array.from(filled);
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float32Array(sm.length);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      let s = 0, n = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue; const v = sm[Y * GW + X]; if (!Number.isNaN(v)) { s += v; n++; } }
      out[y * GW + x] = n ? s / n : NaN;
    }
    sm = out;
  }
  const pos = [], idx = [], vid = new Int32Array(GW * GH).fill(-1);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x, a = dm.a0 + (gx0 + x) * RES, b = dm.b0 + (gy0 + y) * RES, ins = inside(a, b);
    if (ins < -RES || Number.isNaN(sm[i])) continue;
    const base = Math.max(sm[i], Number.isNaN(raw[i]) ? -Infinity : raw[i]);
    const w = Math.max(0, Math.min(1, ins / def.feather)), s = w * w * (3 - 2 * w);
    vid[i] = pos.length / 3;
    /* snap vertices near the edge onto the outline itself, so edges are smooth instead of 1 mm stair steps */
    let pa = a, pb = b;
    if (ins < RES) {
      const e = 0.25, ga = (inside(a + e, b) - inside(a - e, b)) / (2 * e), gb = (inside(a, b + e) - inside(a, b - e)) / (2 * e), g2 = ga * ga + gb * gb;
      if (g2 > 1e-6) { pa = a - (ins * ga) / g2; pb = b - (ins * gb) / g2; }
    }
    pos.push(...view.unproj(pa, pb, base + 0.6 + (def.thick - 0.6) * Math.sqrt(s)));
  }
  for (let y = 0; y + 1 < GH; y++) for (let x = 0; x + 1 < GW; x++) {
    const q = [vid[y * GW + x], vid[y * GW + x + 1], vid[(y + 1) * GW + x + 1], vid[(y + 1) * GW + x]];
    if (q[0] >= 0 && q[1] >= 0 && q[2] >= 0) idx.push(q[0], q[1], q[2]);
    if (q[0] >= 0 && q[2] >= 0 && q[3] >= 0) idx.push(q[0], q[2], q[3]);
  }
  const positions = Float32Array.from(pos), indices = Uint32Array.from(idx);
  return { positions, indices, normals: vertexNormals(positions, indices) };
}

/* ---------- real BodyParts3D muscles ---------- */
const BP3D = [
  ["digastric", "Digastric", { right: ["FJ1556", "FJ1579"], left: ["FJ1555", "FJ1560", "FJ1578"] }, { right: "FMA46292", left: "FMA46293" }],
  ["mylohyoid", "Mylohyoid", { right: ["FJ1583"], left: ["FJ1562"] }, { right: "FMA46321", left: "FMA46322" }],
  ["splenius-capitis", "Splenius capitis", { right: ["FJ1545"], left: ["FJ1545M"] }, { right: "FMA22728", left: "FMA22729" }],
  ["splenius-cervicis", "Splenius cervicis", { right: ["FJ1546"], left: ["FJ1546M"] }, { right: "FMA22726", left: "FMA22727" }],
  ["semispinalis-capitis", "Semispinalis capitis", { right: ["FJ1538"], left: ["FJ1538M"] }, { right: "FMA22876", left: "FMA22877" }],
  ["scalenus-anterior", "Scalenus anterior", { right: ["FJ1592"], left: ["FJ1570"] }, { right: "FMA13392", left: "FMA13393" }],
  ["scalenus-medius", "Scalenus medius", { right: ["FJ1593"], left: ["FJ1571"] }, { right: "FMA13390", left: "FMA13391" }],
  ["scalenus-posterior", "Scalenus posterior", { right: ["FJ1594"], left: ["FJ1572"] }, { right: "FMA13388", left: "FMA13389" }],
  ["longus-capitis", "Longus capitis", { right: ["FJ1582"], left: ["FJ1561"] }, { right: "FMA46309", left: "FMA46310" }],
  ["rectus-capitis-posterior-major", "Rectus capitis posterior major", { right: ["FJ1589"], left: ["FJ1567"] }, { right: "FMA32530", left: "FMA32531" }],
  ["rectus-capitis-posterior-minor", "Rectus capitis posterior minor", { right: ["FJ1590"], left: ["FJ1568"] }, { right: "FMA32532", left: "FMA32533" }],
  ["obliquus-capitis-superior", "Obliquus capitis superior", { right: ["FJ1585"], left: ["FJ1564"] }, { right: "FMA32534", left: "FMA32535" }],
  ["obliquus-capitis-inferior", "Obliquus capitis inferior", { right: ["FJ1584"], left: ["FJ1563"] }, { right: "FMA32536", left: "FMA32537" }],
  ["sternohyoid", "Sternohyoid", { right: ["FJ1596"], left: ["FJ1574"] }, { right: "FMA13346", left: "FMA13347" }],
  ["omohyoid", "Omohyoid", { right: ["FJ1586"], left: ["FJ1565"] }, { right: "FMA13348", left: "FMA13349" }],
];

/* ---------- assemble the GLB and the extension ---------- */
const MUSCLE_MAT = { pbrMetallicRoughness: { baseColorFactor: [0.8631572134510892, 0.14702726648767014, 0.12213877222015301, 1], metallicFactor: 0, roughnessFactor: 0.7 }, doubleSided: true };
const groups = [], structures = [], instances = [], representations = [], en = {};
const SRC_REAL = `${NS}-bodyparts3d-4`, SRC_APPROX = `${NS}-face-approximation`, LIC = `${NS}-CC-BY-4.0`;
const ASSET = `somakine:asset:${NS}:head-neck`;
let vertexCount = 0;
const addStructure = (slug, enName, paired, real, externalIds, meshesBySide) => {
  const sid = `somakine:structure:${NS}-${slug}`, group = { name: `${NS}:${slug}`, extras: { entityId: `${NS}:${slug}`, regionId: "head-neck", type: "muscle", source: real ? "BodyParts3D 4.0" : "OpenHealth approximation over BodyParts3D 4.0 skull", selectable: true, context: false }, meshes: [] };
  const ids = [];
  for (const [side, meshes] of Object.entries(meshesBySide)) meshes.forEach((m, k) => {
    const name = `${NS}:${slug}:${side}:${m.tag}`;
    group.meshes.push({ name, material: 0, ...m.mesh });
    vertexCount += m.mesh.positions.length / 3;
    const iid = `somakine:instance:${NS}-${slug}-${side}${k ? `-${k}` : ""}`;
    instances.push({ id: iid, assetId: ASSET, laterality: side, selector: { kind: "node-name", value: name } });
    ids.push(iid);
  });
  groups.push(group);
  structures.push({ id: sid, type: "muscle", laterality: paired ? "paired" : "midline", regionIds: [REGION], externalIds, sourceIds: [real ? SRC_REAL : SRC_APPROX], reviewState: real ? "source-reviewed" : "unreviewed", groups: real ? ["head-neck"] : ["face", "approximate-shape"] });
  representations.push({ id: `somakine:representation:${NS}-${slug}`, structureId: sid, mode: "direct", instanceIds: ids, contextStructureIds: [], sourceIds: [real ? SRC_REAL : SRC_APPROX], reviewState: real ? "source-reviewed" : "unreviewed" });
  en[sid] = enName;
};

for (const def of FACE) {
  const bySide = def.paired
    ? { left: [{ tag: "approx", mesh: sculpt(def, "left") }], right: [{ tag: "approx", mesh: sculpt(def, "right") }] }
    : { none: [{ tag: "approx", mesh: sculpt(def, "none") }] };
  addStructure(def.slug, def.en, def.paired, false, {}, bySide);
}
for (const [slug, enName, files, fma] of BP3D) {
  const bySide = {};
  for (const side of ["left", "right"]) bySide[side] = files[side].map((fj) => {
    const o = readObj(readFileSync(join(SRC, `${fj}.obj`), "utf8"));
    return { tag: `isa:${fj}`, mesh: { positions: o.positions, indices: o.indices, normals: vertexNormals(o.positions, o.indices) } };
  });
  addStructure(slug, enName, true, true, { fmaLeft: fma.left, fmaRight: fma.right }, bySide);
}

const root = head.json.nodes[head.json.scenes[0].nodes[0]];
const glb = writeGlb({ sceneName: `${NS}-head-neck`, rootNode: { name: "BodyParts3D", rotation: root.rotation, scale: root.scale }, groups, materials: [MUSCLE_MAT] });
mkdirSync(dirname(OUT_GLB), { recursive: true });
writeFileSync(OUT_GLB, glb);

/* ---------- skin (BodyParts3D FJ2810), cut into body areas so a tap can log "left forearm skin" ----------
   BodyParts3D's skin is one whole-body mesh. Each skin triangle is given the area of the nearest bone,
   split front/back or by height where one bone spans several areas, and left/right by side. Every area is
   its own structure in its own region (so the area zooms skip the skin). */
const SKIN_FJ = "FJ2810", SKIN_ASSET = `somakine:asset:${NS}:skin`, SKIN_REGION = `somakine:region:${NS}-skin`;
const SKIN_MAT = { pbrMetallicRoughness: { baseColorFactor: [0.87, 0.69, 0.58, 1], metallicFactor: 0, roughnessFactor: 0.85 }, doubleSided: true };
const skinObj = readObj(readFileSync(join(SRC, `${SKIN_FJ}.obj`), "utf8"));

/* bone vertices of the whole base pack, keyed by bone slug, in a 20 mm spatial hash */
const boneType = new Map(pack.structures.map((s) => [s.id.replace("somakine:structure:", ""), s.type]));
const boneSlugs = [], bonePts = [];
for (const f of readdirSync(join(PACK_DIR, "assets", "bodyparts3d")).filter((f) => !f.startsWith("supplement"))) {
  for (const m of readGlbMeshes(join(PACK_DIR, "assets", "bodyparts3d", f)).meshes) {
    const slug = m.name.split(":")[1];
    if (boneType.get(slug) !== "bone") continue;
    const si = boneSlugs.push(slug) - 1;
    for (let i = 0; i < m.positions.length; i += 9) bonePts.push(m.positions[i], m.positions[i + 1], m.positions[i + 2], si);
  }
}
const HASH = 20, hash = new Map();
for (let i = 0; i < bonePts.length; i += 4) {
  const k = `${Math.floor(bonePts[i] / HASH)},${Math.floor(bonePts[i + 1] / HASH)},${Math.floor(bonePts[i + 2] / HASH)}`;
  (hash.get(k) ?? hash.set(k, []).get(k)).push(i);
}
function nearestBone(p) {
  const cx = Math.floor(p[0] / HASH), cy = Math.floor(p[1] / HASH), cz = Math.floor(p[2] / HASH);
  let best = Infinity, bi = -1;
  for (let r = 0; r < 14; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
      for (const i of hash.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        const d = (bonePts[i] - p[0]) ** 2 + (bonePts[i + 1] - p[1]) ** 2 + (bonePts[i + 2] - p[2]) ** 2;
        if (d < best) { best = d; bi = i; }
      }
    }
    if (bi >= 0 && Math.sqrt(best) < (r - 0.5) * HASH) break; // nothing closer can be in a further ring
  }
  return bi < 0 ? null : { slug: boneSlugs[bonePts[bi + 3]], at: [bonePts[bi], bonePts[bi + 1], bonePts[bi + 2]] };
}

/* area of a skin point: nearest bone, then front/back (out = direction from the bone to the skin; -Y is front) */
const SKIN_AREAS = {
  forehead: ["Forehead skin"], scalp: ["Scalp"], temple: ["Temple and ear skin"], face: ["Face skin"],
  jaw: ["Jaw and chin skin"], "neck-front": ["Front of neck skin"], "neck-back": ["Back of neck skin"],
  chest: ["Chest skin"], abdomen: ["Abdomen skin"], "upper-back": ["Upper back skin"], "lower-back": ["Lower back skin"],
  buttock: ["Buttock skin"], hip: ["Hip skin"], groin: ["Groin skin"], shoulder: ["Shoulder skin"],
  "upper-arm": ["Upper arm skin"], elbow: ["Elbow skin"], forearm: ["Forearm skin"], hand: ["Hand skin"],
  thigh: ["Thigh skin"], knee: ["Knee skin"], shin: ["Shin skin"], calf: ["Calf skin"], foot: ["Ankle and foot skin"],
};
const Z_CHEST = 1130; // roughly the bottom of the sternum: chest/upper back above, abdomen/lower back below
function skinArea(p) {
  const nb = nearestBone(p);
  if (!nb) return null;
  const s = nb.slug, z = p[2];
  const out = [p[0] - nb.at[0], p[1] - nb.at[1], p[2] - nb.at[2]], ol = Math.hypot(...out) || 1;
  const front = out[1] / ol < -0.15, back = out[1] / ol > 0.15, lateral = Math.abs(out[0] / ol) > 0.75;
  if (s === "frontal-bone") return front && z < 1615 ? "forehead" : "scalp";
  if (/parietal|occiput/.test(s)) return "scalp";
  if (/temporal-bone|sphenoid/.test(s)) return "temple";
  if (/zygomatic|maxilla|nasal|lacrimal|ethmoid|vomer|palatine|concha/.test(s)) return "face";
  if (s === "mandible") return "jaw";
  if (/cervical|atlas|axis|hyoid/.test(s)) return back ? "neck-back" : "neck-front";
  if (s === "clavicle") return back ? "upper-back" : z > 1330 && lateral ? "shoulder" : "chest";
  if (s === "scapula") return lateral && z > 1290 ? "shoulder" : "upper-back";
  if (/rib|thoracic/.test(s)) return back ? (z > Z_CHEST ? "upper-back" : "lower-back") : z > Z_CHEST ? "chest" : "abdomen";
  if (/lumbar/.test(s)) return back ? "lower-back" : "abdomen";
  if (s === "sacrum") return z > 880 ? "lower-back" : "buttock";
  if (s === "hip-bone") return back ? (z > 900 ? "lower-back" : "buttock") : lateral ? "hip" : z > 870 ? "abdomen" : "groin";
  if (s === "femur") return back && z > 760 ? "buttock" : lateral && z > 790 ? "hip" : front && z > 790 ? "groin" : "thigh";
  if (s === "patella") return "knee";
  if (/tibia|fibula/.test(s)) return z > 330 ? "knee" : z < 20 ? "foot" : back ? "calf" : "shin";
  if (s === "humerus") return z > 1270 ? "shoulder" : z < 1060 ? "elbow" : "upper-arm";
  if (/ulna|radius/.test(s)) return z > 1005 ? "elbow" : "forearm";
  if (/carp|metacarp|phalanx-of-(thumb|index|middle-finger|ring|little-finger)|scaphoid|lunate|triquetr|pisiform|trapez|capitate|hamate/.test(s)) return "hand";
  return "foot";
}

/* split the skin triangles into area + side meshes */
const SP = skinObj.positions, SI = skinObj.indices, buckets = new Map();
const nTri = SI.length / 3, triArea = new Array(nTri), triCentre = new Array(nTri);
for (let t = 0; t < nTri; t++) {
  triCentre[t] = [0, 1, 2].map((k) => (SP[SI[t * 3] * 3 + k] + SP[SI[t * 3 + 1] * 3 + k] + SP[SI[t * 3 + 2] * 3 + k]) / 3);
  triArea[t] = skinArea(triCentre[t]);
}
/* majority filter over neighbouring triangles, so borders are clean and stray specks join their surroundings */
const vertTris = Array.from({ length: SP.length / 3 }, () => []);
for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) vertTris[SI[t * 3 + k]].push(t);
for (let it = 0; it < 8; it++) {
  const next = triArea.slice();
  for (let t = 0; t < nTri; t++) {
    const votes = new Map();
    for (let k = 0; k < 3; k++) for (const u of vertTris[SI[t * 3 + k]]) if (triArea[u]) votes.set(triArea[u], (votes.get(triArea[u]) ?? 0) + 1);
    let best = triArea[t], bv = -1;
    for (const [a, v] of votes) if (v > bv) { best = a; bv = v; }
    next[t] = best;
  }
  for (let t = 0; t < nTri; t++) triArea[t] = next[t];
}
for (let t = 0; t < nTri; t++) {
  if (!triArea[t]) continue;
  const key = `${triArea[t]}|${triCentre[t][0] >= 0 ? "left" : "right"}`;
  (buckets.get(key) ?? buckets.set(key, []).get(key)).push(t * 3);
}
const zRange = (key) => { const zs = (buckets.get(key) ?? []).map((t) => triCentre[t / 3][2]); return zs.length ? `${Math.round(Math.min(...zs))}..${Math.round(Math.max(...zs))}` : "-"; };
console.log("skin z ranges (left):", Object.keys(SKIN_AREAS).map((a) => `${a} ${zRange(`${a}|left`)}`).join(", "));
const skinGroups = [];
let skinVerts = 0;
for (const area of Object.keys(SKIN_AREAS)) {
  const slug = `skin-${area}`, sid = `somakine:structure:${NS}-${slug}`, group = { name: `${NS}:${slug}`, extras: { entityId: `${NS}:${slug}`, type: "skin", source: "BodyParts3D 4.0", selectable: true, context: false }, meshes: [] };
  const ids = [];
  for (const side of ["left", "right"]) {
    const tris = buckets.get(`${area}|${side}`);
    if (!tris?.length) continue;
    const remap = new Map(), pos = [], idx = [];
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const vi = SI[t + k];
      if (!remap.has(vi)) { remap.set(vi, pos.length / 3); pos.push(SP[vi * 3], SP[vi * 3 + 1], SP[vi * 3 + 2]); }
      idx.push(remap.get(vi));
    }
    const positions = Float32Array.from(pos), indices = Uint32Array.from(idx), name = `${NS}:${slug}:${side}:isa:${SKIN_FJ}`;
    group.meshes.push({ name, material: 0, positions, indices, normals: vertexNormals(positions, indices), col: undefined });
    skinVerts += positions.length / 3;
    const iid = `somakine:instance:${NS}-${slug}-${side}`;
    instances.push({ id: iid, assetId: SKIN_ASSET, laterality: side, selector: { kind: "node-name", value: name } });
    ids.push(iid);
  }
  if (!ids.length) continue;
  skinGroups.push(group);
  structures.push({ id: sid, type: "skin", laterality: "paired", regionIds: [SKIN_REGION], externalIds: { fma: "FMA7163", bodyParts3D: "BP9115" }, sourceIds: [SRC_REAL], reviewState: "unreviewed", groups: ["skin-area"] });
  representations.push({ id: `somakine:representation:${NS}-${slug}`, structureId: sid, mode: "direct", instanceIds: ids, contextStructureIds: [], sourceIds: [SRC_REAL], reviewState: "unreviewed" });
  en[sid] = SKIN_AREAS[area][0];
}
en[SKIN_REGION] = "Skin";
const skinGlb = writeGlb({ sceneName: `${NS}-skin`, rootNode: { name: "BodyParts3D", rotation: root.rotation, scale: root.scale }, materials: [SKIN_MAT], groups: skinGroups });
writeFileSync(OUT_SKIN, skinGlb);


const extension = {
  schemaVersion: pack.schemaVersion,
  id: `${NS}-head-neck`,
  version: "1.0.0",
  title: "OpenHealth head and neck muscles and skin",
  description: "Jaw and neck muscles and the whole-body skin from BodyParts3D 4.0, plus approximate face muscles shaped over the BodyParts3D skull (BodyParts3D has no facial or jaw muscles).",
  createdAt: new Date().toISOString(),
  namespace: NS,
  targetPack: { id: pack.id, version: pack.version },
  sources: [
    { id: SRC_REAL, title: "BodyParts3D (IS-A tree OBJ)", version: "4.0", url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html", retrievedAt: "2026-11-15T00:00:00Z" },
    { id: SRC_APPROX, title: "OpenHealth approximate face muscles over the BodyParts3D 4.0 skull", version: "1.0.0", url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html", retrievedAt: "2026-11-15T00:00:00Z" },
  ],
  licenses: [{ id: LIC, name: "Creative Commons Attribution 4.0 International", url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html", attribution: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. Face muscle shapes are OpenHealth approximations derived from the BodyParts3D skull.", redistribution: "attribution" }],
  regions: [{ id: SKIN_REGION, order: 1, sourceIds: [SRC_REAL] }],
  structures,
  relations: [],
  assets: [{ id: ASSET, kind: "gltf", uri: "head-neck.glb", mediaType: "model/gltf-binary", sha256: createHash("sha256").update(glb).digest("hex"), bytes: glb.length, geometry: { vertices: vertexCount, gpuBytes: vertexCount * 24 }, sourceIds: [SRC_REAL, SRC_APPROX], licenseId: LIC },
    { id: SKIN_ASSET, kind: "gltf", uri: "skin.glb", mediaType: "model/gltf-binary", sha256: createHash("sha256").update(skinGlb).digest("hex"), bytes: skinGlb.length, geometry: { vertices: skinVerts, gpuBytes: skinVerts * 24 }, sourceIds: [SRC_REAL], licenseId: LIC }],
  meshInstances: instances,
  representations,
  locales: [{ locale: "en", labels: en, aliases: {} }],
  mappings: [],
};
mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(extension, null, 1) + "\n");
console.log(`wrote ${OUT_GLB} (${(glb.length / 1e6).toFixed(2)} MB, ${vertexCount} vertices, ${structures.filter((s) => s.type === "muscle").length} muscles)`);
console.log(`wrote ${OUT_SKIN} (${(skinGlb.length / 1e6).toFixed(2)} MB, ${skinVerts} vertices)`);
console.log(`wrote ${OUT_JSON}`);

if (DEBUG) {
  mkdirSync(DEBUG, { recursive: true });
  const muscles = groups.flatMap((g) => g.meshes.map((m) => ({ ...m, approx: g.extras.source.startsWith("OpenHealth") })));
  for (const f of renderViews({ bones: head.meshes.filter((m) => !/sternocleidomastoid/.test(m.name)), muscles, extra: bone(/sternocleidomastoid/) }, DEBUG)) console.log("debug view:", f);
}

if (DEBUG) {
  /* every skin area in its own colour, whole body */
  /* a distinct hue per area (golden-angle steps), a lighter shade for the right side */
  const hsl = (h, l) => { const f = (n) => { const k = (n + h / 30) % 12, a = 0.6 * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
  const skinMeshes = skinGroups.flatMap((g, gi) => g.meshes.map((m, mi) => ({ ...m, col: hsl((gi * 137.5) % 360, mi ? 0.68 : 0.5) })));
  for (const f of renderViews({ bones: [], muscles: skinMeshes }, DEBUG, { size: 900, prefix: "skin", centerZ: 790, windowMm: 1800 })) console.log("debug view:", f);
}
