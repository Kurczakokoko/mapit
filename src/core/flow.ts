import { RIVER_JOIN, RIVER_LAND, RIVER_SEA, RIVER_SOURCE, RIVER_WIDTH0 } from "../pdx/palettes.ts";

const D4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function wrapX(x: number, width: number, wrap: boolean): number {
  if (wrap) return ((x % width) + width) % width;
  return x;
}

function inBounds(x: number, z: number, width: number, height: number, wrap: boolean): boolean {
  if (z < 0 || z >= height) return false;
  if (wrap) return true;
  return x >= 0 && x < width;
}

export function distanceToSea(
  width: number,
  height: number,
  isLand: Uint8Array,
  wrap: boolean,
): Uint16Array {
  const dist = new Uint16Array(width * height);
  dist.fill(65535);
  const q: number[] = [];
  for (let i = 0; i < isLand.length; i++) {
    if (!isLand[i]) {
      dist[i] = 0;
      q.push(i);
    }
  }
  let head = 0;
  while (head < q.length) {
    const i = q[head++]!;
    const x = i % width;
    const z = (i / width) | 0;
    const nd = dist[i]! + 1;
    for (const [dx, dz] of D4) {
      const nx = wrapX(x + dx, width, wrap);
      const nz = z + dz;
      if (!inBounds(nx, nz, width, height, wrap)) continue;
      if (nx < 0 || nx >= width) continue;
      const ni = nz * width + nx;
      if (dist[ni]! <= nd) continue;
      dist[ni] = nd;
      q.push(ni);
    }
  }
  return dist;
}

/** D4 drainage: each land pixel flows to the neighbour that is downhill, then closer to the sea. */
export function flowDirection(
  width: number,
  height: number,
  heightmap: Uint8Array,
  isLand: Uint8Array,
  wrap: boolean,
): Int8Array {
  const dist = distanceToSea(width, height, isLand, wrap);
  const dir = new Int8Array(width * height).fill(-1);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      if (!isLand[i]) continue;
      let best = -1;
      let bestH = heightmap[i]!;
      let bestD = dist[i]!;
      for (let k = 0; k < 4; k++) {
        const [dx, dz] = D4[k]!;
        const nx = wrapX(x + dx, width, wrap);
        const nz = z + dz;
        if (!inBounds(nx, nz, width, height, wrap) || nx < 0 || nx >= width) continue;
        const ni = nz * width + nx;
        const h = isLand[ni] ? heightmap[ni]! : -1;
        const d = dist[ni]!;
        if (h < bestH || (h === bestH && d < bestD)) {
          bestH = h;
          bestD = d;
          best = k;
        }
      }
      dir[i] = best;
    }
  }
  return dir;
}

export function flowAccumulation(
  width: number,
  height: number,
  isLand: Uint8Array,
  dir: Int8Array,
  wrap: boolean,
): Float64Array {
  const n = width * height;
  const acc = new Float64Array(n);
  const indeg = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    if (!isLand[i] || dir[i] < 0) continue;
    const x = i % width;
    const z = (i / width) | 0;
    const [dx, dz] = D4[dir[i]!]!;
    const nx = wrapX(x + dx, width, wrap);
    const nz = z + dz;
    if (!inBounds(nx, nz, width, height, wrap) || nx < 0 || nx >= width) continue;
    indeg[nz * width + nx]++;
  }
  const q: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isLand[i]) {
      acc[i] = 1;
      if (indeg[i] === 0) q.push(i);
    }
  }
  let head = 0;
  while (head < q.length) {
    const i = q[head++]!;
    if (dir[i] < 0) continue;
    const x = i % width;
    const z = (i / width) | 0;
    const [dx, dz] = D4[dir[i]!]!;
    const nx = wrapX(x + dx, width, wrap);
    const nz = z + dz;
    if (!inBounds(nx, nz, width, height, wrap) || nx < 0 || nx >= width) continue;
    const ni = nz * width + nx;
    acc[ni] += acc[i]!;
    indeg[ni]--;
    if (indeg[ni] === 0) q.push(ni);
  }
  return acc;
}

function riverNeighbourCount(
  rivers: Uint8Array,
  width: number,
  height: number,
  x: number,
  z: number,
  wrap: boolean,
): number {
  let n = 0;
  for (const [dx, dz] of D4) {
    const nx = wrapX(x + dx, width, wrap);
    const nz = z + dz;
    if (!inBounds(nx, nz, width, height, wrap) || nx < 0 || nx >= width) continue;
    const v = rivers[nz * width + nx]!;
    if (v !== RIVER_LAND && v !== RIVER_SEA) n++;
  }
  return n;
}

function isRiverIndex(v: number): boolean {
  return v !== RIVER_LAND && v !== RIVER_SEA;
}

/**
 * Build a HOI4 rivers.bmp index raster: 1 px, 4-connected, source green, join red,
 * widths 3–11, sea 254, land 255. Never paints the outer frame (circular-river crash).
 */
export function extractRivers(opts: {
  width: number;
  height: number;
  isLand: Uint8Array;
  heightmap: Uint8Array;
  wrap: boolean;
  painted?: Uint8Array;
  spacingPx?: number;
}): { indices: Uint8Array; riverPixels: number; sources: number } {
  const { width, height, isLand, heightmap, wrap } = opts;
  const rivers = new Uint8Array(width * height);
  for (let i = 0; i < rivers.length; i++) rivers[i] = isLand[i] ? RIVER_LAND : RIVER_SEA;

  const dir = flowDirection(width, height, heightmap, isLand, wrap);
  const acc = flowAccumulation(width, height, isLand, dir, wrap);

  let landPixels = 0;
  let maxAcc = 1;
  for (let i = 0; i < isLand.length; i++) {
    if (!isLand[i]) continue;
    landPixels++;
    if (acc[i]! > maxAcc) maxAcc = acc[i]!;
  }
  const spacing = opts.spacingPx ?? Math.max(18, Math.floor(Math.sqrt(Math.max(landPixels, 1) / 8)));
  const threshold = Math.max(6, Math.min(Math.floor((spacing * spacing) / 2), Math.floor(landPixels / 50)));

  const starts: number[] = [];
  if (opts.painted) {
    for (let i = 0; i < opts.painted.length; i++) {
      if (opts.painted[i] && isLand[i]) starts.push(i);
    }
  }
  for (let i = 0; i < acc.length; i++) {
    if (!isLand[i] || acc[i]! < threshold) continue;
    const x = i % width;
    const z = (i / width) | 0;
    let upstream = false;
    for (const [dx, dz] of D4) {
      const nx = wrapX(x + dx, width, wrap);
      const nz = z + dz;
      if (!inBounds(nx, nz, width, height, wrap) || nx < 0 || nx >= width) continue;
      const ni = nz * width + nx;
      if (!isLand[ni] || dir[ni] < 0) continue;
      const [odx, odz] = D4[dir[ni]!]!;
      if (wrapX(nx + odx, width, wrap) === x && nz + odz === z && acc[ni]! >= threshold) {
        upstream = true;
        break;
      }
    }
    if (!upstream) starts.push(i);
  }
  starts.sort((a, b) => acc[b]! - acc[a]!);

  let sources = 0;
  let riverPixels = 0;
  const usedStart = new Set<number>();
  for (const start of starts) {
    if (usedStart.has(start)) continue;
    if (isRiverIndex(rivers[start]!)) continue;
    const path: number[] = [];
    let i = start;
    const seen = new Set<number>();
    let joined = false;
    for (let step = 0; step < width + height; step++) {
      if (seen.has(i)) break;
      seen.add(i);
      const x = i % width;
      const z = (i / width) | 0;
      const onFrame = x === 0 || z === 0 || x === width - 1 || z === height - 1;
      if (!isLand[i]) {
        joined = true;
        break;
      }
      if (onFrame) {
        if (dir[i] < 0) break;
        const [dx, dz] = D4[dir[i]!]!;
        const nx = wrapX(x + dx, width, wrap);
        const nz = z + dz;
        if (!inBounds(nx, nz, width, height, wrap) || nx < 0 || nx >= width) break;
        i = nz * width + nx;
        continue;
      }
      if (isRiverIndex(rivers[i]!)) {
        joined = true;
        break;
      }
      const touches = riverNeighbourCount(rivers, width, height, x, z, wrap);
      if (touches > 0 && path.length > 0) {
        joined = true;
        path.push(i);
        break;
      }
      path.push(i);
      if (dir[i] < 0) break;
      const [dx, dz] = D4[dir[i]!]!;
      const nx = wrapX(x + dx, width, wrap);
      const nz = z + dz;
      if (!inBounds(nx, nz, width, height, wrap) || nx < 0 || nx >= width) break;
      i = nz * width + nx;
    }
    if (path.length < 6) continue;
    for (const p of path) usedStart.add(p);
    const head = path[0]!;
    const last = path[path.length - 1]!;
    for (let k = 0; k < path.length; k++) {
      const p = path[k]!;
      const a = acc[p]!;
      const widthIdx = RIVER_WIDTH0 + Math.min(8, Math.max(0, Math.floor(Math.log2(Math.max(a, 1)) - Math.log2(threshold))));
      if (k === 0) {
        rivers[p] = RIVER_SOURCE;
        sources++;
      } else if (joined && p === last) {
        rivers[p] = RIVER_JOIN;
      } else {
        rivers[p] = widthIdx;
      }
      riverPixels++;
    }
    void head;
  }

  return { indices: rivers, riverPixels, sources };
}

export function riverMask(indices: Uint8Array): Uint8Array {
  const m = new Uint8Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i]!;
    if (v !== RIVER_LAND && v !== RIVER_SEA) m[i] = 1;
  }
  return m;
}
