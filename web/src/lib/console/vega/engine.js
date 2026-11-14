/* Vega: the companion's 3D talking avatar.
   Ported from the team's "Vega Science Companion" prototype (three.js, built entirely in code, no model files).
   - character: head, glasses, lab coat and arms built from three.js geometry; ARKit-named blendshapes drive the face
   - emotions: neutral, happy, curious, thinking, listening, surprised, concerned (cross-faded)
   - speech: browser text-to-speech with lip-sync from a text-to-viseme timeline locked to word boundaries,
     or lip-sync from real audio (speakAudio) for Kokoro output
   The app chooses emotions from the scenario (see lib/console/emotion.ts); inferEmotion() is only the fallback
   for sentences with no scenario. Browser only. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* ───────────────────────── helpers ───────────────────────── */
const { clamp, lerp } = THREE.MathUtils;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const noise = (t, s) => (Math.sin(t * 0.71 + s) + 0.5 * Math.sin(t * 1.37 + s * 2.1) + 0.25 * Math.sin(t * 2.93 + s * 0.7)) / 1.75;

/* ───────────────────── head surface maths ─────────────────────
   The head is a unit sphere reshaped by headDeform(). headZ() is its
   inverse on the front side, so mouth, brows and nose can be placed
   exactly on the skin, including when the jaw morph is active. */
const KY_LO = 1.12, KY_HI = 1.02, KZ = 0.96, JAW_DROP = 0.16;
const jawW = (y0) => sstep(-0.48, -0.95, y0);
const headSX = (y0) => 1 - 0.30 * Math.pow(clamp(-y0, 0, 1), 1.6);
const headSZ = (y0) => (1 - 0.16 * Math.pow(clamp(-y0, 0, 1), 1.5)) * KZ;
function headZ(x, y, J = 0) {
  let yo = y;
  if (J > 0) for (let k = 0; k < 3; k++) yo = y + J * jawW(yo < 0 ? yo / KY_LO : yo / KY_HI);
  const y0 = yo < 0 ? yo / KY_LO : yo / KY_HI;
  const x0 = x / headSX(y0);
  const r2 = 1 - x0 * x0 - y0 * y0;
  return r2 > 0 ? Math.sqrt(r2) * headSZ(y0) : 0;
}
/* point + outward normal on any z = f(x,y) surface, pushed out by `off` */
function surfPoint(f, x, y, off, P, Nn) {
  const e = 0.012, z = f(x, y);
  let nx = -(f(x + e, y) - f(x - e, y)) / (2 * e), ny = -(f(x, y + e) - f(x, y - e)) / (2 * e), nz = 1;
  const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  P[0] = x + nx * off; P[1] = y + ny * off; P[2] = z + nz * off;
  if (Nn) { Nn[0] = nx; Nn[1] = ny; Nn[2] = nz; }
}

/* ───────────────────── geometry builders ───────────────────── */
function gridGeo(nu, nv, fn) {           // fn(u,v) -> [x,y,z]; u runs +x, v runs downwards
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.set(fn(i / nu, j / nv), (j * (nu + 1) + i) * 3);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function sweep(points, radiusFn, segs = 36, radial = 12, wide = 1) {   // tube with varying radius
  const curve = new THREE.CatmullRomCurve3(points);
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, P = curve.getPointAt(u), N = fr.normals[i], B = fr.binormals[i], r = radiusFn(u);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r * wide;
      pos.push(P.x + N.x * c + B.x * s, P.y + N.y * c + B.y * s, P.z + N.z * c + B.z * s);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function mesh(geo, mat, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

/* A strip between two polylines that is re-shaped every frame (mouth parts). */
class Strip {
  constructor(n, mat, parent) {
    this.n = n;
    this.pos = new Float32Array(n * 2 * 3); this.nrm = new Float32Array(n * 2 * 3);
    const g = new THREE.BufferGeometry(), idx = [];
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    for (let i = 0; i < n - 1; i++) { const a = i * 2, b = a + 2, c = a + 1, d = a + 3; idx.push(a, c, b, b, c, d); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    parent.add(this.mesh);
    this._p = [0, 0, 0]; this._n = [0, 0, 0];
  }
  set(i, x, yTop, yBot, off, f) {
    surfPoint(f, x, yTop, off, this._p, this._n); this.pos.set(this._p, i * 6); this.nrm.set(this._n, i * 6);
    surfPoint(f, x, yBot, off, this._p, this._n); this.pos.set(this._p, i * 6 + 3); this.nrm.set(this._n, i * 6 + 3);
  }
  commit() { this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.normal.needsUpdate = true; }
}

/* ───────────────────────── the character ───────────────────────── */
const MOUTH_Y = -0.50, MOUTH_N = 25, EYE_X = 0.38, EYE_Y = 0.05, BROW_Y = 0.56, EYE_Z = 0.70, EYE_R = 0.26;

function buildCharacter() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
  const M = {
    skin: std('#ffffff', { vertexColors: true, roughness: 0.55, emissive: '#3a1408', emissiveIntensity: 0.22 }),
    skinFlat: std('#f2b48c', { roughness: 0.55, emissive: '#3a1408', emissiveIntensity: 0.22 }),
    skinPink: std('#ee9f80', { roughness: 0.5, emissive: '#40140a', emissiveIntensity: 0.25 }),
    lid: std('#e9a983', { roughness: 0.55, emissive: '#3a1408', emissiveIntensity: 0.2 }),
    hairA: std('#6b4a33', { roughness: 0.75 }), hairB: std('#745139', { roughness: 0.75 }), hairC: std('#5f422e', { roughness: 0.8 }),
    brow: std('#4b3323', { roughness: 0.7 }),
    eye: std('#fbfbfa', { roughness: 0.18 }),
    irisOut: std('#4b2c17', { roughness: 0.25 }), irisIn: std('#8a5628', { roughness: 0.2 }),
    pupil: std('#0b0706', { roughness: 0.1 }),
    glint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    frame: std('#101114', { roughness: 0.3, metalness: 0.2 }),
    lens: new THREE.MeshPhysicalMaterial({ color: '#d8f4ff', transparent: true, opacity: 0.09, roughness: 0.05, depthWrite: false }),
    coat: std('#e9edf2', { roughness: 0.8 }), lapel: std('#d9dfe7', { roughness: 0.8 }),
    shirt: std('#8fa2b6', { roughness: 0.7 }), collar: std('#a7b8c9', { roughness: 0.7, side: THREE.DoubleSide }),
    tie: std('#ea7a2c', { roughness: 0.55 }), knot: std('#d9691f', { roughness: 0.55 }),
    badge: std('#aeb7c0', { roughness: 0.35, metalness: 0.5 }),
    mouthIn: new THREE.MeshBasicMaterial({ color: '#4a1418' }),
    tongue: std('#e0707a', { roughness: 0.45 }), teeth: std('#fcfcf7', { roughness: 0.25 }),
    lip: std('#c87c6c', { roughness: 0.5 }),
  };

  const root = new THREE.Group();
  const torso = new THREE.Group(); torso.position.y = 0.12; root.add(torso);
  const headPivot = new THREE.Group(); headPivot.position.y = -0.95; root.add(headPivot);
  const head = new THREE.Group(); head.position.y = 0.95; headPivot.add(head);

  /* ── head skin, with real morph targets (jawOpen, smile) and painted blush ── */
  const hg = new THREE.SphereGeometry(1, 72, 56);
  {
    const p = hg.attributes.position, nr = hg.attributes.normal, n = p.count;
    const col = new Float32Array(n * 3), jaw = new Float32Array(n * 3), smile = new Float32Array(n * 3);
    const skin = new THREE.Color('#f2b48c'), blush = new THREE.Color('#ea8470'), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i);
      const sx = headSX(y0), sz = headSZ(y0), ky = y0 < 0 ? KY_LO : KY_HI;
      const X = x0 * sx, Y = y0 * ky;
      p.setXYZ(i, X, Y, z0 * sz);
      const nl = Math.hypot(x0 / sx, y0 / ky, z0 / sz); nr.setXYZ(i, x0 / sx / nl, y0 / ky / nl, z0 / sz / nl);
      jaw[i * 3 + 1] = -JAW_DROP * jawW(y0);
      const dx = Math.abs(X) - 0.52, dy = Y + 0.30, ch = z0 > 0 ? Math.exp(-(dx * dx + dy * dy) / 0.035) : 0;
      smile[i * 3] = x0 * 0.05 * ch; smile[i * 3 + 1] = 0.045 * ch; smile[i * 3 + 2] = z0 * 0.05 * ch;
      c.copy(skin).lerp(blush, 0.5 * ch); col.set([c.r, c.g, c.b], i * 3);
    }
    hg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const a = new THREE.BufferAttribute(jaw, 3); a.name = 'jawOpen';
    const b = new THREE.BufferAttribute(smile, 3); b.name = 'smile';
    hg.morphAttributes.position = [a, b]; hg.morphTargetsRelative = true;
  }
  const skinMesh = mesh(hg, M.skin, head);

  /* ── ears, nose, neck ── */
  for (const s of [1, -1]) {
    const e = mesh(new THREE.SphereGeometry(0.21, 24, 16), M.skinPink, head);
    e.scale.set(0.5, 1, 0.72); e.position.set(s * 0.97, -0.05, -0.04); e.rotation.y = s * 0.35;
    const ei = mesh(new THREE.SphereGeometry(0.12, 16, 12), std('#d98a6e'), head, false);
    ei.scale.set(0.4, 1, 0.6); ei.position.set(s * 1.03, -0.05, 0.02); ei.rotation.y = s * 0.35;
  }
  const nose = mesh(new THREE.SphereGeometry(0.13, 24, 16), M.skinPink, head);
  nose.scale.set(1, 0.88, 1); nose.position.set(0, -0.17, headZ(0, -0.17) + 0.02);
  const neck = mesh(new THREE.CylinderGeometry(0.31, 0.35, 0.8, 24), M.skinFlat, root);
  neck.position.y = -1.25;

  /* ── hair: a cap that follows the skull plus swept-back clumps ── */
  {
    const cg = new THREE.SphereGeometry(1, 64, 48), p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i);
      const f = z0 / Math.sqrt(Math.max(1e-4, 1 - y0 * y0));
      const hy = f > 0.3 ? lerp(0.22, 0.84, sstep(0.3, 0.85, f)) : f > -0.25 ? 0.22 : lerp(0.22, -0.55, sstep(-0.25, -0.7, f));
      const Y = y0 * (y0 < 0 ? KY_LO : KY_HI);
      const k = lerp(0.9, 1.06, sstep(hy - 0.10, hy + 0.03, Y)) + 0.04 * sstep(0.3, 0.9, y0);
      p.setXYZ(i, x0 * headSX(y0) * k, Y * k, z0 * headSZ(y0) * k);
    }
    mesh(cg, M.hairC, head);
    const deg = Math.PI / 180, AL = [55, 66, 80, 100, 128, 160, 195];
    const clump = (x, lift, sway, r, mat) => {
      const R = Math.sqrt(Math.max(0.05, 1 - x * x));
      const H = [-0.07, 0.10 + lift, 0.20 + lift, 0.18 + lift * 0.5, 0.12, 0.07, 0], SW = [0, 0.6, 1, 0.7, 0.3, 0, 0];
      const pts = AL.map((a, i) => V3(x * (1 + H[i] * 0.3) + sway * SW[i], (R + H[i]) * Math.sin(a * deg) * KY_HI, (R + H[i]) * Math.cos(a * deg) * KZ));
      mesh(sweep(pts, (u) => r * (0.5 + 0.5 * Math.pow(Math.sin(Math.PI * u), 0.7)), 40, 14, 1.7), mat, head);
    };
    clump(-0.70, -0.05, 0.02, 0.15, M.hairC); clump(-0.50, 0.00, 0.05, 0.17, M.hairA); clump(-0.30, 0.05, 0.08, 0.18, M.hairB);
    clump(-0.10, 0.09, 0.11, 0.19, M.hairA); clump(0.10, 0.11, 0.13, 0.19, M.hairB); clump(0.30, 0.08, 0.12, 0.18, M.hairA);
    clump(0.50, 0.02, 0.08, 0.17, M.hairB); clump(0.70, -0.05, 0.03, 0.15, M.hairC);
    clump(-0.20, 0.17, 0.12, 0.10, M.hairB); clump(0.20, 0.20, 0.17, 0.11, M.hairA);
  }

  /* ── eyes: ball, rotating iris group, upper + lower lids ── */
  const eyes = {};
  const cap = (r, ang, mat, parent) => { const g = new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, ang); g.rotateX(Math.PI / 2); return mesh(g, mat, parent, false); };
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const g = new THREE.Group(); g.position.set(s * EYE_X, EYE_Y, EYE_Z); head.add(g);
    mesh(new THREE.SphereGeometry(EYE_R, 40, 28), M.eye, g, false);
    const gaze = new THREE.Group(); g.add(gaze);
    cap(EYE_R * 1.004, 0.62, M.irisOut, gaze); cap(EYE_R * 1.008, 0.50, M.irisIn, gaze); cap(EYE_R * 1.012, 0.27, M.pupil, gaze);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8), M.glint);
    glint.position.set(-0.07, 0.085, EYE_R * 0.955); g.add(glint);
    const up = mesh(new THREE.SphereGeometry(EYE_R * 1.045, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.lid, g);
    const lo = mesh(new THREE.SphereGeometry(EYE_R * 1.045, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.lid, g);
    eyes[side] = { gaze, up, lo };
  }

  /* ── eyebrows (built once for +x, mirrored for the other side) ── */
  const brows = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const flip = new THREE.Group(); flip.scale.x = s; head.add(flip);
    const pivot = new THREE.Group(); pivot.position.set(0.39, BROW_Y, headZ(0.39, BROW_Y)); flip.add(pivot);
    const bp = [[0.13, -0.045], [0.26, 0.025], [0.42, 0.05], [0.56, 0.015], [0.66, -0.055]]
      .map(([x, y]) => V3(x - 0.39, y, headZ(x, y + BROW_Y) + 0.025 - pivot.position.z));
    mesh(sweep(bp, (u) => 0.016 + 0.036 * Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * u)), 0.8), 24, 10), M.brow, pivot);
    brows[side] = pivot;
  }

  /* ── glasses ── */
  {
    const G = new THREE.Group(); head.add(G);
    for (const s of [1, -1]) {
      const ring = mesh(new THREE.TorusGeometry(0.325, 0.032, 12, 56), M.frame, G, false);
      ring.position.set(s * EYE_X, EYE_Y, 1.02); ring.rotation.y = s * 0.10;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.32, 40), M.lens);
      lens.position.copy(ring.position); lens.rotation.y = ring.rotation.y; G.add(lens);
      mesh(sweep([V3(s * 0.69, 0.09, 0.99), V3(s * 0.90, 0.10, 0.62), V3(s * 1.0, 0.10, 0.05), V3(s * 0.98, 0.0, -0.12)], () => 0.024, 16, 8), M.frame, G, false);
    }
    mesh(sweep([V3(-0.07, 0.12, 1.03), V3(0, 0.15, 1.05), V3(0.07, 0.12, 1.03)], () => 0.028, 8, 8), M.frame, G, false);
  }

  /* ── mouth: strips re-shaped from blendshape weights each frame ── */
  const mouth = {
    inside: new Strip(MOUTH_N, M.mouthIn, head), tongue: new Strip(MOUTH_N, M.tongue, head),
    teethU: new Strip(MOUTH_N, M.teeth, head), teethL: new Strip(MOUTH_N, M.teeth, head),
    lipU: new Strip(MOUTH_N, M.lip, head), lipL: new Strip(MOUTH_N, M.lip, head),
  };

  /* ── torso: dome shoulders into a straight body; clothes are patches on it ── */
  const TA = 1.36, TB = 0.75, TYC = -2.30, TRY = 1.0, TBOT = -5.4;
  const tS = (y) => (y >= TYC ? Math.sqrt(Math.max(0, 1 - ((y - TYC) / TRY) ** 2)) : 1);
  const torsoZ = (x, y) => { const s = tS(y), q = 1 - (x / (TA * s + 1e-6)) ** 2; return q > 0 ? TB * s * Math.sqrt(q) : 0; };
  {
    const nt = 56, rows = [];
    for (let k = 0; k <= 18; k++) rows.push(TYC + TRY * Math.cos((k / 18) * Math.PI / 2));
    for (let k = 1; k <= 8; k++) rows.push(lerp(TYC, TBOT, k / 8));
    const pos = [], idx = [];
    rows.forEach((y) => { const s = tS(y); for (let i = 0; i < nt; i++) { const a = (i / nt) * Math.PI * 2; pos.push(TA * s * Math.cos(a), y, TB * s * Math.sin(a)); } });
    for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < nt; i++) {
      const a = k * nt + i, b = k * nt + (i + 1) % nt, c = a + nt, d = b + nt; idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    mesh(g, M.coat, torso);
  }
  const P = [0, 0, 0];
  const onTorso = (x, y, off) => { const lim = 0.94 * TA * tS(y); surfPoint(torsoZ, clamp(x, -lim, lim), y, off, P); return [P[0], P[1], P[2]]; };
  const VT = -1.40, VB = -2.85, VW = 0.40;
  const vHalf = (y) => VW * clamp((y - VB) / (VT - VB), 0, 1);
  // shirt in the V opening
  mesh(gridGeo(14, 18, (u, v) => { const y = lerp(VT + 0.04, VB, v); return onTorso((u * 2 - 1) * (vHalf(y) + 0.02), y, 0.010); }), M.shirt, torso, false);
  // tie blade + knot
  mesh(gridGeo(6, 18, (u, v) => { const y = lerp(-1.58, VB + 0.02, v); return onTorso((u * 2 - 1) * Math.min(lerp(0.085, 0.21, v), vHalf(y)), y, 0.024); }), M.tie, torso, false);
  mesh(gridGeo(6, 5, (u, v) => onTorso((u * 2 - 1) * lerp(0.115, 0.075, v), lerp(-1.43, -1.62, v), 0.045)), M.knot, torso);
  // lapels, shirt collar wings, pocket (mirrored where needed)
  for (const s of [1, -1]) {
    const lap = mesh(gridGeo(8, 20, (u, v) => {
      const ex = VW * (1 - v), ey = lerp(VT, VB, v), w = 0.36 * Math.pow(Math.sin(Math.PI * clamp(v * 0.96 + 0.04, 0, 1)), 0.55) * (1 - 0.3 * v);
      return onTorso(ex - 0.01 + u * w, Math.min(ey + u * w * 0.12, -1.42), 0.032);
    }), M.lapel, torso);
    lap.scale.x = s;
    const A = [0.05, -1.41], B = [0.37, -1.40], C = [0.21, -1.64];
    const wing = mesh(gridGeo(6, 6, (u, v) => onTorso(lerp(lerp(A[0], B[0], u), C[0], v), lerp(lerp(A[1], B[1], u), C[1], v), 0.034)), M.collar, torso);
    wing.scale.x = s;
  }
  mesh(gridGeo(6, 6, (u, v) => onTorso(lerp(0.52, 0.98, u), lerp(-2.36, -2.86, v), 0.014)), M.lapel, torso);
  mesh(gridGeo(4, 4, (u, v) => onTorso(lerp(0.60, 0.90, u), lerp(-2.42, -2.68, v), 0.03)), M.badge, torso);
  mesh(gridGeo(1, 10, (u, v) => onTorso(lerp(-0.008, 0.008, u), lerp(VB, -4.6, v), 0.006)), std('#c9cfd8'), torso, false);
  const band = mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.26, 28, 1, true), M.collar, torso); band.position.y = -1.36;
  {
    const tilt = new THREE.Group(); tilt.position.y = -1.40; tilt.rotation.x = 0.22; tilt.scale.set(1.12, 1, 0.92); torso.add(tilt);
    const gap = Math.PI * 0.62, t = mesh(new THREE.TorusGeometry(0.50, 0.09, 12, 40, Math.PI * 2 - gap), M.lapel, tilt);
    t.rotation.set(Math.PI / 2, 0, Math.PI / 2 + gap / 2);
  }

  /* ── arms: shoulder + elbow joints, mitten hands ── */
  const arms = {};
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const flip = new THREE.Group(); flip.scale.x = s; flip.position.y = 0.12; root.add(flip);
    const shoulder = new THREE.Group(); shoulder.position.set(1.03, -1.93, 0); flip.add(shoulder);
    const upper = mesh(new THREE.CapsuleGeometry(0.26, 0.75, 8, 18), M.coat, shoulder); upper.position.y = -0.48;
    const elbow = new THREE.Group(); elbow.position.y = -0.95; shoulder.add(elbow);
    const fore = mesh(new THREE.CapsuleGeometry(0.215, 0.62, 8, 18), M.coat, elbow); fore.position.y = -0.42;
    const hand = new THREE.Group(); hand.position.y = -0.98; elbow.add(hand);
    const palm = mesh(new THREE.SphereGeometry(0.2, 20, 14), M.skinFlat, hand); palm.scale.set(0.95, 1.15, 0.62);
    const thumb = mesh(new THREE.CapsuleGeometry(0.06, 0.12, 6, 10), M.skinFlat, hand); thumb.position.set(-0.17, 0.0, 0.05); thumb.rotation.z = -0.7;
    arms[side] = { shoulder, elbow, hand, baseY: shoulder.position.y };
  }

  /* ── mouth shape from blendshapes ── */
  function updateMouth(b) {
    const sL = b.mouthSmileLeft, sR = b.mouthSmileRight, fL = b.mouthFrownLeft, fR = b.mouthFrownRight;
    const sm = (sL + sR) / 2, fr = (fL + fR) / 2, st = (b.mouthStretchLeft + b.mouthStretchRight) / 2;
    const pr = (b.mouthPressLeft + b.mouthPressRight) / 2, pk = b.mouthPucker, fu = b.mouthFunnel, jaw = b.jawOpen;
    const up = (b.mouthUpperUpLeft + b.mouthUpperUpRight) / 2, lo = (b.mouthLowerDownLeft + b.mouthLowerDownRight) / 2;
    const roll = b.mouthRollLower, tg = b.tongueOut;
    const halfW = 0.255 * (1 + 0.20 * st + 0.22 * sm - 0.45 * pk - 0.22 * fu + 0.06 * pr);
    const pExp = lerp(1.0, 0.5, clamp(fu * 0.9 + pk * 0.6, 0, 1));
    const J = JAW_DROP * jaw, f = (x, y) => headZ(x, y, J);
    const upO = 0.045 * jaw + 0.04 * up + 0.03 * fu, loO = 0.27 * jaw * (1 - 0.5 * roll) + 0.03 * lo + 0.03 * fu;
    const gap = 0.007 * (1 - 0.6 * pr), shift = 0.05 * (b.mouthLeft - b.mouthRight), fwd = 0.035 * pk + 0.02 * fu;
    for (let i = 0; i < MOUTH_N; i++) {
      const t = -1 + (2 * i) / (MOUTH_N - 1), s = t > 0 ? sL : sR, fw = t > 0 ? fL : fR;
      const base = MOUTH_Y + (0.105 * s - 0.085 * fw + 0.015 * st) * t * t - 0.04 * sm + 0.03 * fr;
      const prof = Math.pow(Math.max(0, 1 - t * t), pExp), x = t * halfW + shift;
      const yU = base + (gap + upO) * prof, yL = base - (gap + loO) * prof, open = yU - yL;
      const vis = sstep(0.025, 0.07, open), edge = MOUTH_Y - 0.03 - 0.012 * t * t;
      const tB = yU - vis * Math.max(0, yU - Math.max(yL, edge));
      const lowTop = Math.min(tB, yL + 0.04 * (0.3 + 0.7 * st) * vis * Math.pow(prof, 0.3));
      const tongueTop = Math.min(yU - 0.003, yL + open * (0.40 + 0.45 * tg) * (1 - 0.5 * t * t));
      const lt = Math.sqrt(prof) * (1 + 0.5 * pk);
      mouth.inside.set(i, x, yU, yL, 0.010 + fwd, f);
      mouth.tongue.set(i, x, tongueTop, yL, 0.013 + 0.008 * tg + fwd, f);
      mouth.teethU.set(i, x, yU, tB, 0.016 + fwd * 0.3, f);
      mouth.teethL.set(i, x, lowTop, yL, 0.017 + fwd * 0.3, f);
      mouth.lipU.set(i, x, yU + 0.020 * lt, yU, 0.020 + fwd, f);
      mouth.lipL.set(i, x, yL, yL - 0.026 * lt, 0.020 + fwd, f);
    }
    for (const k in mouth) mouth[k].commit();
  }

  /* ── apply a full frame of blendshapes + pose ── */
  const dict = skinMesh.morphTargetDictionary, infl = skinMesh.morphTargetInfluences;
  function apply(b, pose) {
    infl[dict.jawOpen] = b.jawOpen;
    infl[dict.smile] = clamp((b.mouthSmileLeft + b.mouthSmileRight) * 0.45 + (b.cheekSquintLeft + b.cheekSquintRight) * 0.2, 0, 1);
    updateMouth(b);
    for (const side of ['L', 'R']) {
      const S = side === 'L' ? 'Left' : 'Right', e = eyes[side], g = pose.eyes[side];
      e.gaze.rotation.set(-g.pitch, g.yaw, 0);
      const blink = b['eyeBlink' + S], wide = b['eyeWide' + S], sq = b['eyeSquint' + S], ck = b['cheekSquint' + S];
      e.up.rotation.x = -lerp(0.80 + 0.32 * wide - 0.25 * sq + 0.45 * g.pitch, -0.30, blink);
      e.lo.rotation.x = lerp(1.0 + 0.1 * wide - 0.3 * sq - 0.3 * ck - 0.2 * g.pitch, 0.30, blink);
      const br = brows[side], inn = b.browInnerUp, dn = b['browDown' + S], out = b['browOuterUp' + S];
      br.position.y = BROW_Y + 0.075 * inn + 0.085 * out - 0.075 * dn;
      br.rotation.z = -0.30 * inn + 0.30 * dn + 0.16 * out;
      const a = arms[side], ap = pose.arms[side];
      a.shoulder.rotation.set(ap.sx, ap.sy, ap.sz); a.elbow.rotation.set(ap.ex, 0, ap.ez); a.hand.rotation.set(ap.hx, 0, 0);
      a.shoulder.position.y = a.baseY + pose.breath * 0.02;
    }
    headPivot.rotation.set(pose.head.pitch, pose.head.yaw, pose.head.roll);
    headPivot.position.y = -0.95 + pose.breath * 0.012;
    torso.scale.set(1 + pose.breath * 0.006, 1, 1 + pose.breath * 0.022);
    root.rotation.set(pose.lean, pose.sway, pose.sway * 0.3);
  }
  return { root, apply };
}

/* ─────────────── blendshapes (ARKit names), visemes, emotions ─────────────── */
const BS = ['eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
  'browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight',
  'jawOpen', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight', 'mouthSmileLeft', 'mouthSmileRight',
  'mouthFrownLeft', 'mouthFrownRight', 'mouthStretchLeft', 'mouthStretchRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthRollLower', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'cheekSquintLeft', 'cheekSquintRight', 'tongueOut'];
const zeros = () => Object.fromEntries(BS.map((k) => [k, 0]));
const both = (name, v) => ({ [name + 'Left']: v, [name + 'Right']: v });

/* Oculus/Meta 15-viseme set → mouth blendshapes */
const VIS = {
  sil: {},
  PP: { ...both('mouthPress', 0.75) },
  FF: { jawOpen: 0.10, mouthRollLower: 0.8, ...both('mouthUpperUp', 0.45) },
  TH: { jawOpen: 0.20, tongueOut: 0.8, ...both('mouthUpperUp', 0.2) },
  DD: { jawOpen: 0.20, ...both('mouthUpperUp', 0.3), ...both('mouthStretch', 0.15) },
  kk: { jawOpen: 0.26, ...both('mouthStretch', 0.12) },
  CH: { jawOpen: 0.16, mouthFunnel: 0.65, mouthPucker: 0.25, ...both('mouthUpperUp', 0.3) },
  SS: { jawOpen: 0.09, ...both('mouthStretch', 0.55), ...both('mouthUpperUp', 0.45), ...both('mouthLowerDown', 0.4) },
  nn: { jawOpen: 0.14, ...both('mouthUpperUp', 0.2) },
  RR: { jawOpen: 0.17, mouthPucker: 0.42, mouthFunnel: 0.25 },
  aa: { jawOpen: 0.72, ...both('mouthUpperUp', 0.2), ...both('mouthLowerDown', 0.3) },
  E: { jawOpen: 0.36, ...both('mouthStretch', 0.45), ...both('mouthUpperUp', 0.3) },
  I: { jawOpen: 0.20, ...both('mouthStretch', 0.7), ...both('mouthUpperUp', 0.4), ...both('mouthLowerDown', 0.2) },
  O: { jawOpen: 0.48, mouthFunnel: 0.7, mouthPucker: 0.25 },
  U: { jawOpen: 0.20, mouthPucker: 0.8, mouthFunnel: 0.35 },
};
const VOWELS = new Set(['aa', 'E', 'I', 'O', 'U']);

export const EMOTIONS = {
  neutral: { bs: { ...both('mouthSmile', 0.30), ...both('cheekSquint', 0.08) }, head: [0, 0, 0], lean: 0 },
  happy: { bs: { ...both('mouthSmile', 0.85), ...both('cheekSquint', 0.6), ...both('eyeSquint', 0.25), ...both('browOuterUp', 0.25), browInnerUp: 0.15 }, head: [-0.03, 0, 0.03], lean: 0 },
  curious: { bs: { ...both('mouthSmile', 0.22), browInnerUp: 0.35, browOuterUpLeft: 0.85, browDownRight: 0.15, ...both('eyeWide', 0.25) }, head: [0.02, -0.08, 0.13], lean: 0.05 },
  thinking: { bs: { browDownRight: 0.5, browOuterUpLeft: 0.5, ...both('eyeSquint', 0.25), ...both('mouthPress', 0.4), mouthPucker: 0.22, mouthLeft: 0.6 }, head: [-0.05, 0.12, -0.08], lean: -0.01 },
  listening: { bs: { ...both('mouthSmile', 0.40), browInnerUp: 0.3, ...both('eyeWide', 0.12), ...both('cheekSquint', 0.15) }, head: [0.03, 0, 0.07], lean: 0.035 },
  surprised: { bs: { ...both('eyeWide', 1), browInnerUp: 0.9, ...both('browOuterUp', 0.9), jawOpen: 0.38, mouthFunnel: 0.4 }, head: [-0.07, 0, 0], lean: -0.03 },
  concerned: { bs: { browInnerUp: 0.85, ...both('browDown', 0.15), ...both('mouthFrown', 0.5), ...both('mouthPress', 0.15) }, head: [0.04, 0, -0.07], lean: 0.02 },
};
export function inferEmotion(s) {
  const t = s.toLowerCase();
  if (/\b(wow|whoa|amazing|incredible|no way|unbelievable|astonishing)\b/.test(t)) return 'surprised';
  if (/\b(hmm+|let me think|let's see|i wonder|suppose|consider)\b/.test(t)) return 'thinking';
  if (/\?\s*["')]*\s*$/.test(s)) return 'curious';
  if (/\b(sorry|unfortunately|careful|worr\w*|afraid|sadly|difficult|mistake)\b/.test(t) && !/!\s*$/.test(s)) return 'concerned';
  if (/!|\b(great|excellent|wonderful|nice|well done|good job|love|exactly|brilliant\w*|fantastic|congrat\w*|hello|welcome)\b/.test(t)) return 'happy';
  return 'neutral';
}

/* ─────────────── text → viseme timeline (for browser TTS) ─────────────── */
const GRAPH = [['tion', 'CH nn'], ['sion', 'CH nn'], ['tch', 'CH'], ['igh', 'aa I'], ['eau', 'O'], ['th', 'TH'], ['sh', 'CH'], ['ch', 'CH'],
  ['ph', 'FF'], ['wh', 'U'], ['ck', 'kk'], ['ng', 'nn'], ['qu', 'kk U'], ['gh', ''], ['oo', 'U'], ['ou', 'aa U'], ['ow', 'O U'], ['oi', 'O I'],
  ['oy', 'O I'], ['ee', 'I'], ['ea', 'I'], ['ai', 'E I'], ['ay', 'E I'], ['oa', 'O'], ['au', 'O'], ['aw', 'O'], ['ie', 'I'], ['ei', 'E I'],
  ['ue', 'U'], ['ew', 'U'], ['er', 'RR'], ['ir', 'RR'], ['ur', 'RR'], ['ar', 'aa RR'], ['or', 'O RR']];
const SINGLE = { a: 'aa', e: 'E', i: 'I', o: 'O', u: 'aa', y: 'I', b: 'PP', p: 'PP', m: 'PP', f: 'FF', v: 'FF', d: 'DD', t: 'DD', l: 'nn', n: 'nn',
  k: 'kk', g: 'kk', c: 'kk', q: 'kk', x: 'kk SS', s: 'SS', z: 'SS', j: 'CH', r: 'RR', w: 'U', h: '' };
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + 'hundred' + (n % 100 ? numWords(n % 100) : '');
  if (n < 1e6) return numWords(Math.floor(n / 1000)) + 'thousand' + (n % 1000 ? numWords(n % 1000) : '');
  return String(n).split('').map((d) => ONES[+d]).join('');
}
function wordToVisemes(raw) {
  let w = raw.toLowerCase();
  if (/^\d+$/.test(w)) w = numWords(parseInt(w, 10));
  w = w.replace(/[^a-z]/g, '');
  const out = [], isV = (c) => 'aeiou'.includes(c);
  const push = (v) => { if (v) for (const p of v.split(' ')) if (out[out.length - 1] !== p) out.push(p); };
  for (let i = 0; i < w.length;) {
    if (w[i] === 'e' && i === w.length - 1 && w.length > 2 && !isV(w[i - 1]) && out.some((v) => VOWELS.has(v))) break;   // silent e
    const g = GRAPH.find(([k]) => w.startsWith(k, i));
    if (g) { push(g[1]); i += g[0].length; continue; }
    const c = w[i];
    if (c === 'c' && 'eiy'.includes(w[i + 1] || '')) push('SS');
    else if (!(c === w[i - 1] && !isV(c))) push(SINGLE[c]);
    i++;
  }
  return out.length ? out : ['nn'];
}
const visUnits = (v) => (VOWELS.has(v) ? 1 : v === 'PP' || v === 'FF' ? 0.62 : 0.52);
function planSentence(text) {
  const words = []; let m; const re = /[A-Za-z0-9']+/g;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length).match(/^[^A-Za-z0-9']*/)[0];
    const vis = wordToVisemes(m[0]);
    words.push({
      text: m[0], start: m.index, vis, units: vis.reduce((a, v) => a + visUnits(v), 0),
      pause: /[,;:—–]/.test(after) ? 2.4 : 0.35,
      stress: m[0].length >= 7 || /[!?]/.test(after) || (m[0].length > 1 && m[0] === m[0].toUpperCase()) || words.length === 0,
    });
  }
  return words;
}

/* Speaks text through the browser's speech synthesis and produces a viseme
   stream locked to its word-boundary events. If the voice gives no boundary
   events it free-runs on estimated timing; with no TTS at all it runs silently. */
class TextSpeech {
  constructor(hooks) { this.hooks = hooks; this.queue = []; this.active = false; this.segs = []; this.unitMs = 95; this.ttsOK = 'speechSynthesis' in window; this.token = 0; }
  get voices() { return this.ttsOK ? speechSynthesis.getVoices() : []; }
  speak(text, opts = {}) {
    this.stop();
    this.opts = opts; this.active = true;
    this.queue = (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map((s) => s.trim()).filter(Boolean);
    this.hooks.start?.();
    this._next();
  }
  stop() {
    this.token++; this.queue = []; this.segs = []; clearTimeout(this.timer);
    if (this.ttsOK) speechSynthesis.cancel();
    if (this.active) { this.active = false; this.hooks.end?.(); }
  }
  _layout(from, t0) {
    this.segs = this.segs.filter((s) => s.w < from); let t = t0;
    for (let k = from; k < this.words.length; k++) {
      const w = this.words[k]; w.t0 = t;
      for (const v of w.vis) { const d = visUnits(v) * this.unitMs; this.segs.push({ t0: t, t1: t + d, v, w: k }); t += d; }
      t += w.pause * this.unitMs;
    }
    this.tEnd = t;
  }
  _next() {
    const s = this.queue.shift(), tok = this.token;
    if (!s) { this.active = false; this.segs = []; this.hooks.end?.(); return; }
    this.words = planSentence(s); this.segs = []; this.curWord = -1; this.anchored = false; this.lastB = null;
    const rate = this.opts.rate || 1;
    this.unitMs = this.unitMs0 = 95 / rate;
    this.hooks.sentence?.(s);
    const freeRun = () => {            // no audio: animate on estimated timing
      this._layout(0, performance.now());
      this.timer = setTimeout(() => tok === this.token && this._next(), this.tEnd - performance.now() + 280);
    };
    if (!this.ttsOK || this.opts.silent) return freeRun();
    const u = this.utter = new SpeechSynthesisUtterance(s);
    if (this.opts.voice) u.voice = this.opts.voice;
    u.rate = rate; u.pitch = this.opts.pitch ?? 1.05;
    let started = false;
    u.onstart = () => { if (tok !== this.token) return; started = true; this._layout(0, performance.now()); };
    u.onboundary = (e) => {
      if (tok !== this.token || (e.name && e.name !== 'word')) return;
      const now = performance.now();
      let k = 0; while (k + 1 < this.words.length && this.words[k + 1].start <= e.charIndex) k++;
      if (this.lastB && k > this.lastB.k) {           // learn this voice's real pace
        let units = 0; for (let j = this.lastB.k; j < k; j++) units += this.words[j].units + this.words[j].pause;
        const obs = (now - this.lastB.t) / units;
        if (obs > 45 && obs < 230) this.unitMs = lerp(this.unitMs, obs, 0.35);
      }
      this.lastB = { k, t: now }; this.anchored = true; this.anchorWord = k;
      this._layout(k, now);
    };
    u.onend = () => { if (tok === this.token) this.timer = setTimeout(() => tok === this.token && this._next(), 140); };
    u.onerror = () => { if (tok === this.token && !started) { this.ttsOK = false; this.hooks.noTTS?.(); freeRun(); } };
    speechSynthesis.speak(u);
    this.timer = setTimeout(() => {      // engine never started: carry on silently
      if (tok !== this.token || started) return;
      speechSynthesis.cancel(); this.ttsOK = false; this.hooks.noTTS?.(); freeRun();
    }, 2500);
  }
  sample(now) {
    if (!this.active) return 'sil';
    const t = now + 35;                 // look ahead to offset the smoothing lag
    for (const s of this.segs) {
      if (t >= s.t0 && t < s.t1) {
        if (this.anchored && s.w > this.anchorWord) return 'sil';   // wait for that word's boundary
        if (s.w !== this.curWord) { this.curWord = s.w; this.hooks.word?.(this.words[s.w]); }
        return s.v;
      }
    }
    return 'sil';
  }
}

/* ─────────────── audio → mouth shapes (any TTS audio, file or mic) ─────────────── */
class AudioLipSync {
  constructor() { this.active = false; this.level = 0; this.peak = 0.08; this.sources = new WeakMap(); this.out = {}; }
  _ensure() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.45;
    this.bins = new Uint8Array(this.an.frequencyBinCount);
  }
  async attachElement(el) {
    this._ensure(); await this.ctx.resume(); this.detach();
    let src = this.sources.get(el);
    if (!src) { src = this.ctx.createMediaElementSource(el); this.sources.set(el, src); }
    src.connect(this.an); this.an.connect(this.ctx.destination); this.node = src; this.active = true;
  }
  async attachStream(stream) {
    this._ensure(); await this.ctx.resume(); this.detach();
    this.node = this.ctx.createMediaStreamSource(stream); this.node.connect(this.an); this.active = true;   // not routed to speakers
  }
  detach() { try { this.node?.disconnect(); this.an?.disconnect(); } catch {} this.node = null; this.active = false; this.level = 0; }
  _band(lo, hi) {
    const hz = this.ctx.sampleRate / this.an.fftSize, a = Math.max(1, Math.floor(lo / hz)), b = Math.min(this.bins.length - 1, Math.ceil(hi / hz));
    let s = 0; for (let i = a; i <= b; i++) s += this.bins[i]; return s / ((b - a + 1) * 255);
  }
  sample() {
    this.an.getByteFrequencyData(this.bins);
    const low = this._band(150, 700), mid = this._band(700, 2400), high = this._band(2400, 4500), sib = this._band(4500, 9000);
    const e = low * 0.45 + mid * 0.4 + high * 0.15;
    this.peak = Math.max(e, this.peak * 0.9995, 0.08);
    const level = this.level = clamp((e - 0.05) / (this.peak * 0.85 - 0.05), 0, 1);
    const tot = low + mid + high + sib + 1e-4, sibR = sib / tot, round = clamp((low - mid * 1.1) / (low + mid + 1e-4) * 2.2, 0, 1), wide = clamp((mid + high) / tot * 1.9 - 0.55, 0, 1);
    const hiss = sstep(0.34, 0.5, sibR) * (sib > 0.06 ? 1 : 0);
    const o = this.out, sp = level * (1 - hiss);
    o.jawOpen = lerp(Math.pow(level, 0.8) * (0.3 + 0.55 * (1 - round * 0.4)), 0.08, hiss);
    o.mouthFunnel = 0.65 * round * sp; o.mouthPucker = 0.35 * round * sp;
    const stv = Math.max(0.5 * wide * sp, 0.55 * hiss), upv = Math.max(0.3 * sp, 0.45 * hiss);
    o.mouthStretchLeft = o.mouthStretchRight = stv; o.mouthUpperUpLeft = o.mouthUpperUpRight = upv;
    o.mouthLowerDownLeft = o.mouthLowerDownRight = 0.3 * sp + 0.4 * hiss;
    return o;
  }
}

/* English voices, local ones first (they report word boundaries, which gives the tightest lip-sync). */
function pickVoice(voices, name) {
  const vs = voices.filter((v) => /^en/i.test(v.lang));
  if (name) { const v = vs.find((x) => x.name === name); if (v) return v; }
  const male = /male|david|guy|mark|george|daniel|ryan/i;
  vs.sort((a, b) => (b.localService - a.localService) || (male.test(b.name) - male.test(a.name)));
  return vs[0];
}

/* ───────────────────────── mount ───────────────────────── */
/** Mount the avatar into `stage` (a sized element). hooks: { state, caption, emotion, note, frame }. Returns the control API. */
export function createVega(stage, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const camera = new THREE.PerspectiveCamera(27, 1, 1, 60);
  const key = new THREE.DirectionalLight('#fff0e0', 2.2); key.position.set(2.6, 3.2, 6);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.025; key.shadow.radius = 5;
  Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3, bottom: -4.2, near: 1, far: 20 });
  const fill = new THREE.DirectionalLight('#bfe6ff', 0.55); fill.position.set(-5, 1, 4);
  const rimL = new THREE.DirectionalLight('#58d6e0', 1.3); rimL.position.set(-4, 2.5, -4.5);
  const rimR = new THREE.DirectionalLight('#58d6e0', 1.0); rimR.position.set(4, 2, -4.5);
  scene.add(key, fill, rimL, rimR, new THREE.HemisphereLight('#dff6ff', '#16343b', 0.55));

  const character = buildCharacter();
  scene.add(character.root);

  function fit() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const tanH = Math.tan((camera.fov * Math.PI) / 360), halfH = 2.2, halfW = 1.95;
    camera.position.set(0, -0.42, Math.max(halfH / tanH, halfW / (tanH * camera.aspect)));
    camera.lookAt(0, -0.42, 0); camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(fit); ro.observe(stage); fit();

  /* ───────────────────────── animation controller ───────────────────────── */
  const REST = { sx: 0.02, sy: 0, sz: 0.09, ex: -0.14, ez: 0, hx: 0 }, RAISED = { sx: -0.62, sy: -0.42, sz: 0.16, ex: -1.72, ez: 0, hx: -0.25 };
  const A = {
    emotion: 'neutral', emoW: zeros(), visW: zeros(), out: zeros(),
    speakAmt: 0, speaking: false, vis: 'sil',
    blink: { next: rand(1.5, 3), t: -1, again: false },
    gaze: { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, next: 2, away: false, follow: 0, followP: 0 },
    head: { pitch: 0, yaw: 0, roll: 0, lean: 0, nod: 0, nodV: 0, nextNod: 3 },
    emph: 0, micro: { smile: 0, next: 6 },
    gest: { L: 0, R: 0, tL: 0, tR: 0, until: 0, beat: 0, beatV: 0 },
    pose: { head: {}, eyes: { L: {}, R: {} }, arms: { L: {}, R: {} }, breath: 0, sway: 0, lean: 0 },
  };
  function setEmotion(name) {
    if (!EMOTIONS[name]) return;
    A.emotion = name;
    if (name === 'surprised') { A.blink.next = Math.max(A.blink.next, clock + 1.2); A.gest.tL = A.gest.tR = 0.55; A.gest.until = clock + 0.9; }
    if (name === 'thinking') { A.gaze.next = 0; }
    hooks.emotion?.(name);
  }
  function onWord(w) {            // emphasis: brow flash, nod, hand beat on stressed words
    if (!w.stress && Math.random() > 0.22) return;
    A.emph = Math.max(A.emph, w.stress ? 1 : 0.5);
    A.head.nodV += w.stress ? 1.1 : 0.55;
    A.gest.beatV -= 3.2;
    if (A.gest.tL + A.gest.tR === 0 && Math.random() < 0.3) startGesture();
  }
  function startGesture() {
    const r = Math.random(), amt = rand(0.7, 1);
    A.gest.tL = r < 0.4 || r > 0.75 ? amt : 0; A.gest.tR = r >= 0.4 ? amt : 0;
    A.gest.until = clock + rand(1.6, 3.0);
  }

  let clock = 0, lastT = performance.now();
  function animate(nowMs) {
    const dt = Math.min(0.05, (nowMs - lastT) / 1000); lastT = nowMs; clock += dt;
    const t = clock, emo = EMOTIONS[A.emotion];

    /* speech → mouth targets */
    const audioOn = audio.active;
    let mouthT = VIS.sil, speakingNow = false;
    if (audioOn) { mouthT = audio.sample(); speakingNow = audio.level > 0.12; A.vis = speakingNow ? 'audio' : 'sil'; }
    else { A.vis = speech.sample(nowMs); mouthT = VIS[A.vis]; speakingNow = speech.active; }
    if (audioOn) { A.talkHold = speakingNow ? 0.45 : Math.max(0, (A.talkHold || 0) - dt); speakingNow = A.talkHold > 0; }
    if (speakingNow && !A.speaking && audioOn) startGesture();
    if (audioOn && speakingNow && Math.random() < dt * 1.6) onWord({ stress: Math.random() < 0.35 });
    A.speaking = speakingNow;
    A.speakAmt = damp(A.speakAmt, speakingNow ? 1 : 0, 6, dt);
    for (const k of BS) {
      A.emoW[k] = damp(A.emoW[k], emo.bs[k] || 0, 5.5, dt);            // emotions cross-fade smoothly
      A.visW[k] = damp(A.visW[k], mouthT[k] || 0, k === 'mouthPressLeft' || k === 'mouthPressRight' ? 34 : 24, dt);
    }

    /* blink every 3–5 s, with the odd double blink */
    const B = A.blink; let blink = 0;
    if (B.t < 0 && t > B.next) { B.t = 0; }
    if (B.t >= 0) {
      B.t += dt / 0.17; const p = B.t;
      blink = p < 0.38 ? sstep(0, 0.38, p) : 1 - sstep(0.38, 1, p);
      if (p >= 1) { B.t = -1; blink = 0; if (!B.again && Math.random() < 0.15) { B.again = true; B.next = t + 0.12; } else { B.again = false; B.next = t + rand(3, 5); } }
    }

    /* gaze: hold eye contact when speaking, glance away when idle or thinking */
    const G = A.gaze;
    if (t > G.next) {
      const thinking = A.emotion === 'thinking';
      if (!G.away && (thinking || Math.random() < (A.speaking ? 0.12 : 0.55))) {
        G.away = true;
        G.tYaw = thinking ? rand(0.28, 0.42) : rand(0.18, 0.4) * (Math.random() < 0.5 ? -1 : 1);
        G.tPitch = thinking ? rand(0.2, 0.32) : rand(-0.08, 0.2);
        G.next = t + (thinking ? rand(1.4, 2.6) : A.speaking ? rand(0.35, 0.6) : rand(0.7, 1.6));
        if (Math.random() < 0.5 && B.t < 0) B.next = t;                 // people often blink on a gaze shift
      } else {
        G.away = false; G.tYaw = rand(-0.025, 0.025); G.tPitch = rand(-0.02, 0.02);
        G.next = t + (thinking ? rand(0.8, 1.4) : A.speaking ? rand(1.2, 3.5) : rand(2.5, 5.5));
      }
    }
    G.yaw = damp(G.yaw, G.tYaw, 26, dt); G.pitch = damp(G.pitch, G.tPitch, 26, dt);
    G.follow = damp(G.follow, G.tYaw * 0.35, 3.5, dt); G.followP = damp(G.followP, G.tPitch * 0.3, 3.5, dt);

    /* head: emotion pose + organic drift + nods */
    const H = A.head, talk = A.speakAmt;
    if (A.emotion === 'listening' && !A.speaking && t > H.nextNod) { H.nodV += 0.75; H.nextNod = t + rand(2.6, 4.5); }
    H.nodV += (-81 * H.nod - 2 * 0.42 * 9 * H.nodV) * dt; H.nod += H.nodV * dt;
    H.pitch = damp(H.pitch, emo.head[0], 4, dt); H.yaw = damp(H.yaw, emo.head[1], 4, dt); H.roll = damp(H.roll, emo.head[2], 4, dt);
    H.lean = damp(H.lean, emo.lean, 3, dt);
    const amp = 1 + 1.5 * talk, ts = t * (1 + 0.5 * talk);
    const hp = H.pitch + H.nod + 0.022 * amp * noise(ts * 1.1, 1.3) - G.followP;
    const hy = H.yaw + 0.04 * amp * noise(ts * 0.9, 4.1) + G.follow;
    const hr = H.roll + 0.02 * amp * noise(ts * 0.8, 7.7);
    const P = A.pose;
    P.head.pitch = hp; P.head.yaw = hy; P.head.roll = hr;
    P.breath = Math.sin(t * Math.PI * 2 * 0.24); P.sway = 0.022 * noise(t * 0.6, 9.2) + hy * 0.15; P.lean = H.lean + 0.006 * noise(t * 0.5, 2.2);
    /* eyes counter-rotate so the gaze stays on the viewer while the head moves */
    const ey = clamp(G.yaw - hy * 0.85 - P.sway, -0.55, 0.55), ep = clamp(G.pitch + (hp + P.lean) * 0.85, -0.4, 0.45);
    P.eyes.L.yaw = ey - 0.03; P.eyes.R.yaw = ey + 0.03; P.eyes.L.pitch = P.eyes.R.pitch = ep;

    /* hands: raise for a phrase while talking, beat on stressed words */
    const Gs = A.gest;
    if (t > Gs.until || (!A.speaking && A.emotion !== 'surprised')) { Gs.tL = Gs.tR = 0; }
    Gs.L = damp(Gs.L, Gs.tL, 5, dt); Gs.R = damp(Gs.R, Gs.tR, 5, dt);
    Gs.beatV += (-140 * Gs.beat - 2 * 0.5 * 11.8 * Gs.beatV) * dt; Gs.beat += Gs.beatV * dt;
    for (const side of ['L', 'R']) {
      const a = Gs[side], e = a * a * (3 - 2 * a), o = P.arms[side], ph = side === 'L' ? 0 : 1.9;
      for (const k in REST) o[k] = lerp(REST[k], RAISED[k], e);
      o.ex += e * (Gs.beat * 0.9 + 0.06 * Math.sin(t * 2.3 + ph)); o.sx += e * 0.04 * Math.sin(t * 1.7 + ph);
      o.sz += 0.012 * P.breath + e * 0.05 * Math.sin(t * 1.3 + ph); o.hx += e * 0.25 * Math.sin(t * 2.1 + ph);
    }

    /* idle micro-expression: a passing smile so the rest pose never looks frozen */
    const Mi = A.micro;
    if (t > Mi.next) { Mi.target = Mi.target ? 0 : rand(0.12, 0.25); Mi.next = t + (Mi.target ? rand(1.2, 2.2) : rand(6, 11)); }
    Mi.smile = damp(Mi.smile, A.speaking ? 0 : Mi.target || 0, 3, dt);
    A.emph = damp(A.emph, 0, 5, dt);

    /* blend layers into the final blendshape frame */
    const o = A.out, keepEmo = 1 - 0.55 * talk;
    for (const k of BS) o[k] = A.emoW[k];
    for (const k of ['mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthFunnel', 'mouthLeft', 'mouthRight', 'jawOpen'])
      o[k] = A.emoW[k] * (k === 'jawOpen' || k.startsWith('mouthPress') || k === 'mouthPucker' || k === 'mouthLeft' ? 1 - talk : keepEmo);
    for (const k of BS) o[k] = clamp(o[k] + A.visW[k], 0, 1);
    o.mouthSmileLeft = clamp(o.mouthSmileLeft + Mi.smile, 0, 1); o.mouthSmileRight = clamp(o.mouthSmileRight + Mi.smile, 0, 1);
    o.browInnerUp = clamp(o.browInnerUp + 0.45 * A.emph, 0, 1);
    o.browOuterUpLeft = clamp(o.browOuterUpLeft + 0.5 * A.emph, 0, 1); o.browOuterUpRight = clamp(o.browOuterUpRight + 0.5 * A.emph, 0, 1);
    o.eyeBlinkLeft = Math.max(o.eyeBlinkLeft, blink); o.eyeBlinkRight = Math.max(o.eyeBlinkRight, blink);

    character.apply(o, P);
    renderer.render(scene, camera);
    hooks.frame?.(o);

  }

  const audio = new AudioLipSync();
  let autoEmotion = true, restEmotion = 'neutral';
  const setState = (s) => hooks.state?.(s);
  const speech = new TextSpeech({
    start() { setState('speaking'); },
    sentence(s) { hooks.caption?.(s); if (autoEmotion) setEmotion(inferEmotion(s)); if (Math.random() < 0.75) startGesture(); },
    word: onWord,
    end() { hooks.caption?.(''); setState('idle'); setEmotion(held || restEmotion); },
    noTTS() { hooks.note?.('No speech voice available here, so the companion animates silently.'); },
  });

  let player = null;
  let held = null;
  const api = {
    /** Speak text with the browser voice. opts: { emotion, rate, pitch, voice, silent } */
    speak(text, opts = {}) {
      this.stopAudio();
      autoEmotion = !opts.emotion; if (opts.emotion) setEmotion(opts.emotion);
      speech.speak(String(text), { rate: 1, voice: pickVoice(speech.voices, opts.voiceName), ...opts });
    },
    /** Lip-sync to real audio (URL, Blob, ArrayBuffer or <audio>), e.g. the output of a cloud TTS. */
    async speakAudio(src, opts = {}) {
      speech.stop(); this.stopAudio();
      const el = src instanceof HTMLMediaElement ? src : new Audio();
      if (el !== src) { el.crossOrigin = 'anonymous'; el.src = typeof src === 'string' ? src : URL.createObjectURL(src instanceof Blob ? src : new Blob([src])); }
      player = el; if (opts.emotion) setEmotion(opts.emotion);
      await audio.attachElement(el);
      el.onended = () => { audio.detach(); setState('idle'); setEmotion(held || restEmotion); };
      setState('speaking'); await el.play();
    },
    /** Lip-sync to a live MediaStream (microphone, WebRTC voice). */
    async listenStream(stream) { speech.stop(); this.stopAudio(); await audio.attachStream(stream); setState('mirroring live audio'); },
    stopAudio() { if (player) { player.pause(); player = null; } if (audio.active) audio.detach(); },
    stop() { speech.stop(); this.stopAudio(); setState('idle'); },
    setEmotion(name) { autoEmotion = false; setEmotion(name); },
    setBackground(v) {
      stage.classList.toggle('transparent', v === 'transparent');
      stage.style.background = v === 'transparent' || v === 'studio' ? '' : v;
    },
    /** Current ARKit-named blendshape weights (0–1) – feed these to any ARKit-rigged model. */
    getBlendshapes() {
      const g = A.pose.eyes, o = { ...A.out };
      for (const [S, e, s] of [['Left', g.L, 1], ['Right', g.R, -1]]) {
        o['eyeLookUp' + S] = clamp(e.pitch / 0.45, 0, 1); o['eyeLookDown' + S] = clamp(-e.pitch / 0.4, 0, 1);
        o['eyeLookOut' + S] = clamp((s * e.yaw) / 0.55, 0, 1); o['eyeLookIn' + S] = clamp((-s * e.yaw) / 0.55, 0, 1);
      }
      return o;
    },
    emotions: Object.keys(EMOTIONS),
    /** The face to return to after speaking (from the person's status). */
    setRestEmotion(name) { if (!EMOTIONS[name]) return; restEmotion = name; if (!speech.active && !audio.active && !held) setEmotion(name); },
    /** Hold a face while not speaking (listening while the user types, thinking while the model works); null releases it. */
    hold(name) { held = name && EMOTIONS[name] ? name : null; if (!speech.active && !audio.active) setEmotion(held || restEmotion); },
    get speaking() { return speech.active || audio.active; },
    dispose() {
      renderer.setAnimationLoop(null); ro.disconnect();
      speech.stop(); this.stopAudio(); audio.ctx?.close();
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        const m = obj.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      });
      scene.environment?.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };

  renderer.setAnimationLoop(animate);
  return api;
}
