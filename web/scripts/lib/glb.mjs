// Minimal GLB read/write for the head and neck extension build (uncompressed float meshes only).
import { readFileSync } from "node:fs";

/** Read every mesh node of a GLB: { name, positions: Float32Array, indices: Uint32Array }. Coordinates are
    the raw node-local values (BodyParts3D millimetres, Z-up); the pack applies its transform on a root node. */
export function readGlbMeshes(path) {
  const b = readFileSync(path);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const bin = b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLen));
  const read = (accIndex) => {
    const acc = json.accessors[accIndex], view = json.bufferViews[acc.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
    const off = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0), n = acc.count * comps;
    const Arr = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[acc.componentType];
    const stride = view.byteStride;
    if (stride && stride !== comps * Arr.BYTES_PER_ELEMENT) throw new Error("interleaved accessors are not supported");
    const copy = new Uint8Array(n * Arr.BYTES_PER_ELEMENT);
    copy.set(bin.subarray(off, off + copy.byteLength));
    return new Arr(copy.buffer);
  };
  const out = [];
  json.nodes.forEach((node) => {
    if (node.mesh === undefined) return;
    if (node.translation || node.rotation || node.scale || node.matrix) throw new Error(`mesh node ${node.name} has its own transform`);
    for (const prim of json.meshes[node.mesh].primitives) {
      out.push({ name: node.name, positions: read(prim.attributes.POSITION), indices: Uint32Array.from(read(prim.indices)) });
    }
  });
  return { json, meshes: out };
}

/** Parse a BodyParts3D OBJ (v / f lines; any vt/vn references are ignored). */
export function readObj(text) {
  const pos = [], idx = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("v ")) { const [, x, y, z] = line.trim().split(/\s+/); pos.push(+x, +y, +z); }
    else if (line.startsWith("f ")) {
      const vs = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t.split("/")[0], 10) - 1);
      for (let i = 1; i + 1 < vs.length; i++) idx.push(vs[0], vs[i], vs[i + 1]);
    }
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

/** Area-weighted vertex normals. */
export function vertexNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Write a self-contained GLB. groups: [{ name, extras, meshes: [{ name, positions, normals, indices, material }] }].
    rootNode carries the pack transform (rotation/scale). materials: glTF material objects. */
export function writeGlb({ sceneName, rootNode, groups, materials }) {
  const chunks = [], bufferViews = [], accessors = [], meshes = [], nodes = [];
  let offset = 0;
  const push = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    chunks.push(bytes, new Uint8Array(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    offset += bytes.byteLength + pad;
    return bufferViews.length - 1;
  };
  const root = { ...rootNode, children: [] };
  nodes.push(root);
  for (const g of groups) {
    const gi = nodes.length;
    nodes.push({ name: g.name, extras: g.extras, children: [] });
    root.children.push(gi);
    for (const m of g.meshes) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.positions[i + k]); max[k] = Math.max(max[k], m.positions[i + k]); }
      const pv = push(m.positions, 34962), nv = push(m.normals, 34962), iv = push(m.indices, 34963);
      accessors.push({ bufferView: pv, componentType: 5126, count: m.positions.length / 3, type: "VEC3", min, max });
      accessors.push({ bufferView: nv, componentType: 5126, count: m.normals.length / 3, type: "VEC3" });
      accessors.push({ bufferView: iv, componentType: 5125, count: m.indices.length, type: "SCALAR" });
      const a = accessors.length - 3;
      meshes.push({ name: m.name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: m.material, mode: 4 }] });
      nodes.push({ name: m.name, mesh: meshes.length - 1 });
      nodes[gi].children.push(nodes.length - 1);
    }
  }
  const json = {
    asset: { version: "2.0", generator: "openhealth build-head-neck-extension" },
    scene: 0, scenes: [{ name: sceneName, nodes: [0] }], nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength: offset }],
  };
  let jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBytes.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonBytes, bh, bin]);
}
