// Tiny software renderer used only to eyeball the head and neck extension while building it.
// Orthographic, z-buffered, Lambert-shaded; writes PNG files with node:zlib.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32LE(0); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** RGBA PNG (colour type 6), for images with a transparent background */
export function pngRGBA(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Orthographic render to RGBA with a transparent background, supersampled `ss`x for smooth edges.
    cam: { r, u, f } unit vectors (screen right, screen up, toward the viewer); toScreen maps a point to pixels. */
export function renderRGBA(meshes, cam, width, height, toScreen, { ss = 3, light = [0.35, 0.55, 0.75] } = {}) {
  const W = width * ss, H = height * ss, zb = new Float32Array(W * H).fill(-Infinity), col = new Float32Array(W * H * 3);
  const L = (() => { const v = [cam.r[0] * light[0] + cam.u[0] * light[1] + cam.f[0] * light[2], cam.r[1] * light[0] + cam.u[1] * light[1] + cam.f[1] * light[2], cam.r[2] * light[0] + cam.u[2] * light[1] + cam.f[2] * light[2]]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
  for (const { positions: P, indices: I, normals: N, col: c } of meshes) {
    for (let t = 0; t < I.length; t += 3) {
      const ids = [I[t], I[t + 1], I[t + 2]];
      const s = ids.map((i) => { const [x, y, z] = toScreen([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); return [x * ss, y * ss, z]; });
      const area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
      if (Math.abs(area) < 1e-9) continue;
      const sh = ids.map((i) => { let d = N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2]; const facing = N[i * 3] * cam.f[0] + N[i * 3 + 1] * cam.f[1] + N[i * 3 + 2] * cam.f[2]; if (facing < 0) d = -d; return 0.42 + 0.58 * Math.max(0, d); });
      for (let y = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]))); y <= Math.min(H - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1]))); y++)
        for (let x = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]))); x <= Math.min(W - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0]))); x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((s[1][0] - px) * (s[2][1] - py) - (s[2][0] - px) * (s[1][1] - py)) / area, w1 = ((s[2][0] - px) * (s[0][1] - py) - (s[0][0] - px) * (s[2][1] - py)) / area, w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * s[0][2] + w1 * s[1][2] + w2 * s[2][2], k = y * W + x;
          if (z <= zb[k]) continue;
          zb[k] = z;
          const shade = w0 * sh[0] + w1 * sh[1] + w2 * sh[2];
          col[k * 3] = c[0] * shade; col[k * 3 + 1] = c[1] * shade; col[k * 3 + 2] = c[2] * shade;
        }
    }
  }
  /* box-filter down to the output size; coverage becomes alpha */
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) { const k = (y * ss + j) * W + (x * ss + i); if (zb[k] > -Infinity) { r += col[k * 3]; g += col[k * 3 + 1]; b += col[k * 3 + 2]; n++; } }
    const o = (y * width + x) * 4;
    if (n) { out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round((255 * n) / (ss * ss)); }
  }
  return pngRGBA(width, height, out);
}

/* camera: right/up/forward(toward viewer) basis in BodyParts3D mm space (+X left, -Y front, +Z up) */
const CAMS = {
  front: { r: [-1, 0, 0], u: [0, 0, 1], f: [0, -1, 0] },
  left: { r: [0, -1, 0], u: [0, 0, 1], f: [1, 0, 0] },
  right: { r: [0, 1, 0], u: [0, 0, 1], f: [-1, 0, 0] },
  back: { r: [1, 0, 0], u: [0, 0, 1], f: [0, 1, 0] },
  "three-quarter": { r: [-0.707, -0.707, 0], u: [0, 0, 1], f: [0.707, -0.707, 0] },
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function renderViews({ bones, muscles, extra = [] }, dir, { size = 700, prefix = "head", centerZ = 1530, windowMm = 300 } = {}) {
  const files = [];
  const lists = [
    ...bones.map((m) => ({ m, col: [205, 196, 170] })),
    ...extra.map((m) => ({ m, col: [150, 80, 70] })),
    ...muscles.map((m) => ({ m, col: m.col ?? (m.approx ? [235, 70, 60] : [190, 60, 140]) })),
  ];
  for (const [name, cam] of Object.entries(CAMS)) {
    const zb = new Float32Array(size * size).fill(-Infinity), img = Buffer.alloc(size * size * 3, 18);
    const cx = 0, cz = centerZ, scale = size / windowMm;
    const toScreen = (p) => [size / 2 + (dot(p, cam.r) - dot([cx, -90, cz], cam.r)) * scale, size / 2 - (dot(p, cam.u) - cz) * scale, dot(p, cam.f)];
    for (const { m, col } of lists) {
      const P = m.positions, I = m.indices;
      for (let t = 0; t < I.length; t += 3) {
        const v = [0, 1, 2].map((k) => [P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]]);
        const e1 = v[1].map((x, k) => x - v[0][k]), e2 = v[2].map((x, k) => x - v[0][k]);
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const nl = Math.hypot(...n) || 1, shade = 0.25 + 0.75 * Math.abs(dot(n, cam.f) / nl);
        const s = v.map(toScreen);
        const minX = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]))), maxX = Math.min(size - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0])));
        const minY = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]))), maxY = Math.min(size - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])));
        const area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
        if (Math.abs(area) < 1e-9) continue;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const w0 = ((s[1][0] - x) * (s[2][1] - y) - (s[2][0] - x) * (s[1][1] - y)) / area;
          const w1 = ((s[2][0] - x) * (s[0][1] - y) - (s[0][0] - x) * (s[2][1] - y)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * s[0][2] + w1 * s[1][2] + w2 * s[2][2], k = y * size + x;
          if (z <= zb[k]) continue;
          zb[k] = z;
          img[k * 3] = col[0] * shade; img[k * 3 + 1] = col[1] * shade; img[k * 3 + 2] = col[2] * shade;
        }
      }
    }
    const file = join(dir, `${prefix}-${name}.png`);
    writeFileSync(file, png(size, size, img));
    files.push(file);
  }
  return files;
}
