import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode as encodePng } from "fast-png";
import { encodeBmp24, encodeBmpIndexed } from "../pdx/bmp.ts";
import { packRgb, writeDefinitionCsv, type ProvinceDef } from "../pdx/definition.ts";
import {
  writeAdjacenciesCsv,
  writeBuildingsTxt,
  writeRailwaysTxt,
  writeSupplyNodesTxt,
} from "../pdx/mapfiles.ts";
import { encodeDdsArgb, resampleGrey, resampleRgb, tryLoadPng } from "../pdx/media.ts";
import {
  DEFINITION_TERRAIN,
  palettesFromGame,
  nearestTerrainIndex,
  TERRAIN_INDEX,
  TERRAIN_RGB,
  TREE_INDICES,
} from "../pdx/palettes.ts";
import { defaultWeather, writeRegionFile } from "../pdx/regions.ts";
import { writeStateFile } from "../pdx/states.ts";
import { extractRivers, riverMask } from "./flow.ts";
import type { BuildingPlacement, State, StrategicRegion } from "./ir.ts";
import { writeLaunchKit, type KitCountry } from "./launchkit.ts";
import { loadMap } from "./load.ts";
import { findHoi4Install } from "./paths.ts";
import { PROVINCE_CAP, validate } from "./validate.ts";

export type GenerateOptions = {
  layersDir: string;
  outDir: string;
  preview?: boolean;
  gamePath?: string;
  seed?: number;
  name?: string;
};

export type ManifestCountry = {
  tag: string;
  name?: string;
  color?: [number, number, number];
};

export type Manifest = {
  name?: string;
  width?: number;
  height?: number;
  waterline?: number;
  wrap?: boolean;
  edgeBands?: boolean;
  seed?: number;
  provinceSpacing?: number;
  stateSize?: number;
  countries?: ManifestCountry[];
};

export type GenerateReport = {
  width: number;
  height: number;
  landPixels: number;
  seaPixels: number;
  lakePixels: number;
  landProvinces: number;
  seaProvinces: number;
  lakeProvinces: number;
  states: number;
  regions: number;
  countries: number;
  riverPixels: number;
  riverSources: number;
  xCrossingsFixed: number;
  cities: number;
  spacing: number;
  wrap: boolean;
  errors: string[];
  warnings: string[];
};

const PIXEL_BUDGET = 13_238_272;
const MIN_PX = 8;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round256(n: number): number {
  return Math.max(256, Math.round(n / 256) * 256);
}

function wrapX(x: number, width: number, wrap: boolean): number {
  if (wrap) return ((x % width) + width) % width;
  return x;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const n = (ix: number, iz: number) => {
    const s = Math.sin((ix + seed) * 127.1 + (iz - seed) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const a = n(xi, zi);
  const b = n(xi + 1, zi);
  const c = n(xi, zi + 1);
  const d = n(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number, seed: number): number {
  let a = 0;
  let amp = 1;
  let f = 1;
  let s = 0;
  for (let o = 0; o < 5; o++) {
    a += amp * vnoise(x * f, z * f, seed + o * 19);
    s += amp;
    amp *= 0.5;
    f *= 2;
  }
  return a / s;
}

class MinHeap {
  data: { c: number; i: number; id: number }[] = [];
  push(c: number, i: number, id: number) {
    const d = this.data;
    d.push({ c, i, id });
    let k = d.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (d[p]!.c <= d[k]!.c) break;
      [d[p], d[k]] = [d[k]!, d[p]!];
      k = p;
    }
  }
  pop() {
    const d = this.data;
    const top = d[0]!;
    const last = d.pop()!;
    if (d.length) {
      d[0] = last;
      let i = 0;
      for (;;) {
        let s = i;
        const l = i * 2 + 1;
        const r = l + 1;
        if (l < d.length && d[l]!.c < d[s]!.c) s = l;
        if (r < d.length && d[r]!.c < d[s]!.c) s = r;
        if (s === i) break;
        [d[i], d[s]] = [d[s]!, d[i]!];
        i = s;
      }
    }
    return top;
  }
}

function poissonSeeds(
  width: number,
  height: number,
  mask: Uint8Array,
  spacing: number,
  rng: Rng,
  density?: Uint8Array,
): { x: number; z: number }[] {
  const seeds: { x: number; z: number }[] = [];
  const cell = Math.max(2, spacing);
  const gridW = Math.ceil(width / cell);
  const gridH = Math.ceil(height / cell);
  const grid: (number | undefined)[] = Array(gridW * gridH);
  const attempts = Math.max(80, Math.floor((width * height) / (spacing * spacing)));
  for (let n = 0; n < attempts; n++) {
    const x = Math.floor(rng() * width);
    const z = Math.floor(rng() * height);
    const i = z * width + x;
    if (!mask[i]) continue;
    const local = density ? Math.max(4, spacing * (1.2 - density[i]! / 255)) : spacing;
    const gx = Math.floor(x / cell);
    const gz = Math.floor(z / cell);
    let ok = true;
    for (let dz = -2; dz <= 2 && ok; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const g = grid[(gz + dz) * gridW + (gx + dx)];
        if (g === undefined) continue;
        const s = seeds[g]!;
        const dxp = s.x - x;
        const dzp = s.z - z;
        if (dxp * dxp + dzp * dzp < local * local * 0.72) ok = false;
      }
    }
    if (!ok) continue;
    grid[gz * gridW + gx] = seeds.length;
    seeds.push({ x, z });
  }
  return seeds;
}

function grow(opts: {
  width: number;
  height: number;
  mask: Uint8Array;
  seeds: { x: number; z: number }[];
  wrap: boolean;
  cost: (from: number, to: number, seedId: number) => number;
}): Int32Array {
  const { width, height, mask, seeds, wrap, cost } = opts;
  const owner = new Int32Array(width * height).fill(-1);
  const heap = new MinHeap();
  seeds.forEach((s, id) => {
    if (s.x < 0 || s.z < 0 || s.x >= width || s.z >= height) return;
    heap.push(0, s.z * width + s.x, id);
  });
  while (heap.data.length) {
    const n = heap.pop();
    if (owner[n.i] !== -1) continue;
    if (!mask[n.i]) continue;
    owner[n.i] = n.id;
    const x = n.i % width;
    const z = (n.i / width) | 0;
    const neigh = [
      [wrapX(x + 1, width, wrap), z],
      [wrapX(x - 1, width, wrap), z],
      [x, z + 1],
      [x, z - 1],
    ];
    for (const [nx, nz] of neigh) {
      if (nz < 0 || nz >= height) continue;
      if (nx < 0 || nx >= width) continue;
      const ni = nz * width + nx;
      if (owner[ni] !== -1 || !mask[ni]) continue;
      const c = cost(n.i, ni, n.id);
      if (!Number.isFinite(c)) continue;
      heap.push(n.c + c, ni, n.id);
    }
  }
  return owner;
}

function fillLeftover(
  owner: Int32Array,
  mask: Uint8Array,
  width: number,
  height: number,
  wrap: boolean,
  group?: Int32Array,
): void {
  const q: number[] = [];
  for (let i = 0; i < owner.length; i++) {
    if (mask[i] && owner[i] >= 0) q.push(i);
  }
  let head = 0;
  while (head < q.length) {
    const i = q[head++]!;
    const x = i % width;
    const z = (i / width) | 0;
    const neigh = [
      [wrapX(x + 1, width, wrap), z],
      [wrapX(x - 1, width, wrap), z],
      [x, z + 1],
      [x, z - 1],
    ];
    for (const [nx, nz] of neigh) {
      if (nz < 0 || nz >= height || nx < 0 || nx >= width) continue;
      const ni = nz * width + nx;
      if (!mask[ni] || owner[ni] >= 0) continue;
      if (group && group[ni] !== group[i]) continue;
      owner[ni] = owner[i]!;
      q.push(ni);
    }
  }
}

function fillByDonor(
  owner: Int32Array,
  mask: Uint8Array,
  width: number,
  height: number,
  wrap: boolean,
  group?: Int32Array,
): void {
  const donor = new Map<number, number>();
  for (let i = 0; i < owner.length; i++) {
    if (!mask[i] || owner[i]! < 0) continue;
    const g = group ? group[i]! : 0;
    if (!donor.has(g)) donor.set(g, owner[i]!);
  }
  for (let i = 0; i < owner.length; i++) {
    if (!mask[i] || owner[i]! >= 0) continue;
    const g = group ? group[i]! : 0;
    const d = donor.get(g);
    if (d === undefined) continue;
    const q = [i];
    owner[i] = d;
    while (q.length) {
      const p = q.pop()!;
      const x = p % width;
      const z = (p / width) | 0;
      const neigh = [
        [wrapX(x + 1, width, wrap), z],
        [wrapX(x - 1, width, wrap), z],
        [x, z + 1],
        [x, z - 1],
      ];
      for (const [nx, nz] of neigh) {
        if (nz < 0 || nz >= height || nx < 0 || nx >= width) continue;
        const ni = nz * width + nx;
        if (!mask[ni] || owner[ni]! >= 0) continue;
        if (group && group[ni] !== g) continue;
        owner[ni] = d;
        q.push(ni);
      }
    }
  }
}

function fixX(owner: Int32Array, width: number, height: number, _wrap?: boolean): number {
  let n = 0;
  for (let pass = 0; pass < 8; pass++) {
    let p = 0;
    for (let z = 0; z < height - 1; z++) {
      for (let x = 0; x < width; x++) {
        const x2 = (x + 1) % width;
        const a = owner[z * width + x]!;
        const b = owner[z * width + x2]!;
        const c = owner[(z + 1) * width + x]!;
        const d = owner[(z + 1) * width + x2]!;
        const set = new Set([a, b, c, d]);
        set.delete(-1);
        if (set.size === 4) {
          owner[(z + 1) * width + x2] = b;
          p++;
        }
      }
    }
    n += p;
    if (p === 0) break;
  }
  return n;
}

function fixCrossings(
  idAt: Int32Array,
  width: number,
  height: number,
  kindOfPixel: (i: number) => number,
  kindOfId: (id: number) => number,
): number {
  let n = 0;
  for (let pass = 0; pass < 12; pass++) {
    let p = 0;
    for (let z = 0; z < height - 1; z++) {
      for (let x = 0; x < width; x++) {
        const x2 = (x + 1) % width;
        const ia = z * width + x;
        const ib = z * width + x2;
        const ic = (z + 1) * width + x;
        const id = (z + 1) * width + x2;
        const a = idAt[ia]!;
        const b = idAt[ib]!;
        const c = idAt[ic]!;
        const d = idAt[id]!;
        const set = new Set([a, b, c, d]);
        if (set.size !== 4) continue;
        const want = kindOfPixel(id);
        const pick = [b, a, c].find((pid) => kindOfId(pid) === want);
        if (pick !== undefined) {
          idAt[id] = pick;
          p++;
          continue;
        }
        const d4 = [ia, ib, ic, id - width, id + width, id - 1, id + 1];
        let found = false;
        for (const ni of d4) {
          if (ni < 0 || ni >= idAt.length) continue;
          const pid = idAt[ni]!;
          if (kindOfId(pid) === want) {
            idAt[id] = pid;
            found = true;
            p++;
            break;
          }
        }
        if (!found) continue;
      }
    }
    n += p;
    if (p === 0) break;
  }
  return n;
}

function mergeSmall(
  owner: Int32Array,
  mask: Uint8Array,
  width: number,
  height: number,
  wrap: boolean,
  minPx: number,
  group?: Int32Array,
): void {
  const counts = new Map<number, number>();
  for (let i = 0; i < owner.length; i++) {
    if (!mask[i] || owner[i]! < 0) continue;
    counts.set(owner[i]!, (counts.get(owner[i]!) ?? 0) + 1);
  }
  const small = new Set([...counts.entries()].filter(([, n]) => n < minPx).map(([id]) => id));
  if (small.size === 0) return;
  for (let i = 0; i < owner.length; i++) {
    if (!small.has(owner[i]!)) continue;
    const x = i % width;
    const z = (i / width) | 0;
    const nxRight = wrap ? wrapX(x + 1, width, true) : x + 1;
    const nxLeft = wrap ? wrapX(x - 1, width, true) : x - 1;
    const neigh = [
      nxRight >= 0 && nxRight < width ? nxRight + z * width : -1,
      nxLeft >= 0 && nxLeft < width ? nxLeft + z * width : -1,
      z + 1 < height ? i + width : -1,
      z > 0 ? i - width : -1,
    ];
    let best = -1;
    for (const ni of neigh) {
      if (ni < 0 || ni >= owner.length) continue;
      const id = owner[ni]!;
      if (id < 0 || small.has(id) || !mask[ni]) continue;
      if (group && group[ni] !== group[i]) continue;
      best = id;
      break;
    }
    if (best >= 0) owner[i] = best;
  }
}

function adjacentChain(ids: number[], neighbors: Map<number, Set<number>>, maxLen: number): number[] {
  const allow = new Set(ids);
  for (const start of ids) {
    const path = [start];
    const used = new Set([start]);
    while (path.length < maxLen) {
      const cur = path[path.length - 1]!;
      let next: number | undefined;
      for (const n of neighbors.get(cur) ?? []) {
        if (allow.has(n) && !used.has(n)) {
          next = n;
          break;
        }
      }
      if (next === undefined) break;
      used.add(next);
      path.push(next);
    }
    if (path.length >= 2) return path;
  }
  for (const a of ids) {
    for (const n of neighbors.get(a) ?? []) {
      if (allow.has(n)) return [a, n];
    }
  }
  return [];
}

function components(
  width: number,
  height: number,
  mask: Uint8Array,
  wrap: boolean,
): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  let next = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = next++;
    let n = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % width;
      const z = (i / width) | 0;
      const neigh = [
        [wrapX(x + 1, width, wrap), z],
        [wrapX(x - 1, width, wrap), z],
        [x, z + 1],
        [x, z - 1],
      ];
      for (const [nx, nz] of neigh) {
        if (nz < 0 || nz >= height || nx < 0 || nx >= width) continue;
        const ni = nz * width + nx;
        if (!mask[ni] || label[ni] >= 0) continue;
        label[ni] = id;
        stack.push(ni);
      }
    }
    sizes[id] = n;
  }
  return { label, sizes };
}

function uniqueColor(i: number, used: Set<number>): [number, number, number] {
  for (let t = 0; t < 8000; t++) {
    const h = (i * 0.618033988749895 + t * 0.041) % 1;
    const s = 0.48 + ((i + t) % 5) * 0.08;
    const l = 0.36 + ((i * 3 + t) % 5) * 0.07;
    const rgb = hsl(h, s, l);
    const packed = packRgb(rgb[0], rgb[1], rgb[2]);
    if (packed !== 0 && !used.has(packed)) {
      used.add(packed);
      return rgb;
    }
  }
  const fallback: [number, number, number] = [(i * 37) % 255, (i * 91) % 255, (i * 17) % 255];
  used.add(packRgb(fallback[0], fallback[1], fallback[2]));
  return fallback;
}

function autoTag(i: number): string {
  const A = 65;
  const a = i % 26;
  const b = Math.floor(i / 26) % 26;
  const c = Math.floor(i / 676) % 26;
  return String.fromCharCode(A + c, A + b, A + a);
}

function loadManifest(dir: string): Manifest {
  const p = join(dir, "manifest.json");
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf8")) as Manifest;
}

function readCsvCities(path: string, width: number, height: number): { x: number; z: number; name: string; pop: number; vp?: number }[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const out: { x: number; z: number; name: string; pop: number; vp?: number }[] = [];
  if (lines.length === 0) return out;
  const header = lines[0]!.split(",").map((s) => s.trim().toLowerCase());
  const named = header.includes("x") || header.includes("z") || header.includes("name") || header.includes("population");
  const nameI = header.indexOf("name");
  const xI = header.indexOf("x");
  const zI = header.indexOf("z");
  const popI = header.findIndex((h) => h === "population" || h === "pop");
  const start = named && (xI >= 0 || zI >= 0 || nameI >= 0) ? 1 : 0;
  const parseRow = (parts: string[], fallbackName: string) => {
    let name = fallbackName;
    let x: number;
    let z: number;
    let pop = 50000;
    if (start === 1 && xI >= 0 && zI >= 0) {
      x = Number(parts[xI]);
      z = Number(parts[zI]);
      if (nameI >= 0 && parts[nameI]) name = parts[nameI]!;
      if (popI >= 0 && Number.isFinite(Number(parts[popI]))) pop = Number(parts[popI]);
    } else if (!Number.isFinite(Number(parts[0])) && Number.isFinite(Number(parts[1])) && Number.isFinite(Number(parts[2]))) {
      name = parts[0] || fallbackName;
      x = Number(parts[1]);
      z = Number(parts[2]);
      if (Number.isFinite(Number(parts[3]))) pop = Number(parts[3]);
    } else {
      x = Number(parts[0]);
      z = Number(parts[1]);
      const namedCol = parts.find((p, i) => i > 1 && Number.isNaN(Number(p)));
      if (namedCol) name = namedCol;
      const popCol = parts.map(Number).find((n, i) => i > 1 && Number.isFinite(n) && n > 20);
      if (popCol !== undefined) pop = popCol;
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (x >= 0 && x <= 1 && z >= 0 && z <= 1) {
      x *= width - 1;
      z *= height - 1;
    }
    out.push({ x: Math.round(x), z: Math.round(z), name, pop });
  };
  for (let li = start; li < lines.length; li++) {
    parseRow(
      lines[li]!.split(",").map((s) => s.trim()),
      `City ${out.length + 1}`,
    );
  }
  return out;
}

function flipGrey(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let z = 0; z < height; z++) {
    out.set(data.subarray(z * width, (z + 1) * width), (height - 1 - z) * width);
  }
  return out;
}

function flipRgb(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data.length);
  const stride = width * 3;
  for (let z = 0; z < height; z++) {
    out.set(data.subarray(z * stride, (z + 1) * stride), (height - 1 - z) * stride);
  }
  return out;
}

function greyPng(dir: string, name: string, width: number, height: number, mode: "nearest" | "bilinear"): Uint8Array | undefined {
  const img = tryLoadPng(join(dir, name));
  if (!img) return undefined;
  return flipGrey(resampleGrey(img, width, height, mode), width, height);
}

function rgbPng(dir: string, name: string, width: number, height: number): Uint8Array | undefined {
  const img = tryLoadPng(join(dir, name));
  if (!img) return undefined;
  return flipRgb(resampleRgb(img, width, height), width, height);
}

function writeGreyPng(path: string, width: number, height: number, grey: Uint8Array) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < grey.length; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = grey[i]!;
  writeFileSync(path, Buffer.from(encodePng({ width, height, data: rgb, channels: 3, depth: 8 })));
}

function writeIndexPreview(
  path: string,
  width: number,
  height: number,
  indices: Uint8Array,
  palette: Uint8Array,
) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    rgb[i * 3] = palette[idx * 3]!;
    rgb[i * 3 + 1] = palette[idx * 3 + 1]!;
    rgb[i * 3 + 2] = palette[idx * 3 + 2]!;
  }
  writeFileSync(path, Buffer.from(encodePng({ width, height, data: rgb, channels: 3, depth: 8 })));
}

export async function generateWorld(opts: GenerateOptions): Promise<{ summary: string; report: GenerateReport }> {
  const manifest = loadManifest(opts.layersDir);
  const rng = mulberry32(opts.seed ?? manifest.seed ?? 1);
  const heightImg = tryLoadPng(join(opts.layersDir, "heightmap.png"));
  const landImg = tryLoadPng(join(opts.layersDir, "landmask.png"));
  const polImg = tryLoadPng(join(opts.layersDir, "political.png"));
  if (!heightImg && !landImg && !polImg) {
    throw new Error(
      `Layer pack ${opts.layersDir} needs heightmap.png, landmask.png, or political.png (see docs/generate.md)`,
    );
  }
  const srcW = heightImg?.width ?? landImg?.width ?? polImg?.width ?? 256;
  const srcH = heightImg?.height ?? landImg?.height ?? polImg?.height ?? 256;
  const width = round256(manifest.width ?? srcW);
  const height = round256(manifest.height ?? srcH);
  if (width * height > PIXEL_BUDGET) {
    throw new Error(`Map ${width}×${height} exceeds HOI4 pixel budget ${PIXEL_BUDGET}`);
  }
  const wrap = manifest.wrap ?? true;
  const waterline = manifest.waterline ?? 94;

  let heightRaw = greyPng(opts.layersDir, "heightmap.png", width, height, "bilinear");
  const landmask = greyPng(opts.layersDir, "landmask.png", width, height, "nearest");
  const lakeMaskIn = greyPng(opts.layersDir, "lakes.png", width, height, "nearest");
  const density = greyPng(opts.layersDir, "density.png", width, height, "bilinear");
  const terrainRgb = rgbPng(opts.layersDir, "terrain.png", width, height);
  const riversIn = greyPng(opts.layersDir, "rivers.png", width, height, "nearest");
  const politicalRgb = rgbPng(opts.layersDir, "political.png", width, height);
  const citiesRgb = rgbPng(opts.layersDir, "cities.png", width, height);
  const continentsRgb = rgbPng(opts.layersDir, "continents.png", width, height);

  const isLand = new Uint8Array(width * height);
  if (landmask) {
    for (let i = 0; i < isLand.length; i++) isLand[i] = landmask[i]! > 127 ? 1 : 0;
  } else if (heightRaw) {
    for (let i = 0; i < isLand.length; i++) isLand[i] = heightRaw[i]! >= waterline ? 1 : 0;
  } else if (politicalRgb) {
    for (let i = 0; i < isLand.length; i++) {
      const r = politicalRgb[i * 3]!;
      const g = politicalRgb[i * 3 + 1]!;
      const b = politicalRgb[i * 3 + 2]!;
      isLand[i] = r + g + b >= 40 ? 1 : 0;
    }
  }

  if (manifest.edgeBands) {
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < 3; x++) isLand[z * width + x] = 0;
      for (let x = width - 3; x < width; x++) isLand[z * width + x] = 0;
    }
  }

  const water = new Uint8Array(width * height);
  for (let i = 0; i < water.length; i++) water[i] = isLand[i] ? 0 : 1;
  const seaComp = components(width, height, water, wrap);
  const isSea = new Uint8Array(width * height);
  const isLake = new Uint8Array(width * height);
  const touchesEdge = new Set<number>();
  for (let x = 0; x < width; x++) {
    if (water[x]) touchesEdge.add(seaComp.label[x]!);
    if (water[(height - 1) * width + x]) touchesEdge.add(seaComp.label[(height - 1) * width + x]!);
  }
  for (let z = 0; z < height; z++) {
    if (water[z * width]) touchesEdge.add(seaComp.label[z * width]!);
    if (water[z * width + width - 1]) touchesEdge.add(seaComp.label[z * width + width - 1]!);
  }
  for (let i = 0; i < water.length; i++) {
    if (!water[i]) continue;
    const lab = seaComp.label[i]!;
    if (lakeMaskIn && lakeMaskIn[i]! > 127) isLake[i] = 1;
    else if (touchesEdge.has(lab)) isSea[i] = 1;
    else isLake[i] = 1;
  }

  const landComp = components(width, height, isLand, wrap);
  for (let i = 0; i < isLand.length; i++) {
    if (!isLand[i]) continue;
    if ((landComp.sizes[landComp.label[i]!] ?? 0) < MIN_PX) {
      isLand[i] = 0;
      isSea[i] = 1;
    }
  }

  let landPixels = 0;
  let seaPixels = 0;
  let lakePixels = 0;
  for (let i = 0; i < isLand.length; i++) {
    if (isLand[i]) landPixels++;
    else if (isLake[i]) lakePixels++;
    else seaPixels++;
  }
  if (landPixels === 0) throw new Error("Layer pack has no land pixels");
  if (seaPixels === 0) {
    for (let z = 0; z < height; z++) {
      isLand[z * width] = 0;
      isLand[z * width + width - 1] = 0;
      isSea[z * width] = 1;
      isSea[z * width + width - 1] = 1;
    }
    landPixels = 0;
    seaPixels = 0;
    for (let i = 0; i < isLand.length; i++) {
      if (isLand[i]) landPixels++;
      else if (!isLake[i]) seaPixels++;
    }
  }

  const heightmap = new Uint8Array(width * height);
  const dist = new Uint16Array(width * height);
  dist.fill(65535);
  {
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
      const neigh = [
        [wrapX(x + 1, width, wrap), z],
        [wrapX(x - 1, width, wrap), z],
        [x, z + 1],
        [x, z - 1],
      ];
      for (const [nx, nz] of neigh) {
        if (nz < 0 || nz >= height || nx < 0 || nx >= width) continue;
        const ni = nz * width + nx;
        if (dist[ni]! <= nd) continue;
        dist[ni] = nd;
        q.push(ni);
      }
    }
  }

  if (heightRaw) {
    let minL = 255;
    let maxL = 0;
    for (let i = 0; i < heightRaw.length; i++) {
      if (!isLand[i]) continue;
      minL = Math.min(minL, heightRaw[i]!);
      maxL = Math.max(maxL, heightRaw[i]!);
    }
    const span = Math.max(1, maxL - minL);
    for (let i = 0; i < heightmap.length; i++) {
      if (!isLand[i]) {
        heightmap[i] = isLake[i] ? 89 : 89;
        continue;
      }
      const t = (heightRaw[i]! - minL) / span;
      const d = dist[i]!;
      const coast = d <= 1 ? 94 : d <= 5 ? 94 + (d - 1) : 96;
      const inland = 96 + Math.round(t * 143);
      heightmap[i] = Math.max(coast, Math.min(239, inland));
    }
  } else {
    for (let i = 0; i < heightmap.length; i++) {
      if (!isLand[i]) {
        heightmap[i] = 89;
        continue;
      }
      const x = i % width;
      const z = (i / width) | 0;
      const d = dist[i]!;
      const ridge = Math.abs(2 * fbm(x / 48, z / 48, 3) - 1);
      const n = fbm(x / 22, z / 22, 7);
      const h = 96 + Math.min(70, d * 1.1) + n * 26 + ridge * 48 * Math.min(1, d / 18);
      heightmap[i] = Math.max(96, Math.min(239, Math.round(h)));
      if (d === 1) heightmap[i] = 94;
    }
  }

  const paintedRiver = riversIn
    ? Uint8Array.from(riversIn, (v, i) => (isLand[i] && v < 128 ? 1 : 0))
    : undefined;
  const river = extractRivers({
    width,
    height,
    isLand,
    heightmap,
    wrap,
    painted: paintedRiver,
    spacingPx: manifest.provinceSpacing,
  });
  const rivers = river.indices;
  const isRiver = riverMask(rivers);

  const cities = readCsvCities(join(opts.layersDir, "cities.csv"), width, height);
  if (citiesRgb) {
    const seen = new Uint8Array(width * height);
    for (let i = 0; i < citiesRgb.length / 3; i++) {
      if (seen[i] || !isLand[i]) continue;
      const bright = Math.max(citiesRgb[i * 3]!, citiesRgb[i * 3 + 1]!, citiesRgb[i * 3 + 2]!);
      if (bright < 200) continue;
      let sx = 0;
      let sz = 0;
      let n = 0;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop()!;
        sx += p % width;
        sz += (p / width) | 0;
        n++;
        const x = p % width;
        const z = (p / width) | 0;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = wrapX(x + dx, width, wrap);
          const nz = z + dz;
          if (nz < 0 || nz >= height || nx < 0 || nx >= width) continue;
          const ni = nz * width + nx;
          if (seen[ni] || !isLand[ni]) continue;
          const b = Math.max(citiesRgb[ni * 3]!, citiesRgb[ni * 3 + 1]!, citiesRgb[ni * 3 + 2]!);
          if (b < 200) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      cities.push({ x: Math.round(sx / n), z: Math.round(sz / n), name: `City ${cities.length + 1}`, pop: n * 400 });
    }
  }

  const terrainIdx = new Uint8Array(width * height);
  if (terrainRgb) {
    for (let i = 0; i < terrainIdx.length; i++) {
      if (!isLand[i]) {
        terrainIdx[i] = isLake[i] ? TERRAIN_INDEX.ocean : TERRAIN_INDEX.ocean;
        continue;
      }
      terrainIdx[i] = nearestTerrainIndex(terrainRgb[i * 3]!, terrainRgb[i * 3 + 1]!, terrainRgb[i * 3 + 2]!);
    }
  } else {
    for (let i = 0; i < terrainIdx.length; i++) {
      if (!isLand[i]) {
        terrainIdx[i] = TERRAIN_INDEX.ocean;
        continue;
      }
      const h = heightmap[i]!;
      const x = i % width;
      const z = (i / width) | 0;
      const d = dist[i]!;
      const forest = fbm(x / 18, z / 18, 11);
      const wet = fbm(x / 30, z / 30, 22);
      if (h >= 200) terrainIdx[i] = TERRAIN_INDEX.snow;
      else if (h >= 165) terrainIdx[i] = TERRAIN_INDEX.mountain;
      else if (h >= 140) terrainIdx[i] = TERRAIN_INDEX.hills;
      else if (d <= 3 && wet > 0.62 && h < 120) terrainIdx[i] = TERRAIN_INDEX.marsh;
      else if (forest > 0.58 && h < 150) terrainIdx[i] = TERRAIN_INDEX.forest;
      else if (wet < 0.32 && h < 135 && z > height * 0.25 && z < height * 0.75) terrainIdx[i] = TERRAIN_INDEX.desert;
      else terrainIdx[i] = TERRAIN_INDEX.plains;
    }
  }
  const citiesIdx = new Uint8Array(width * height);
  for (const city of cities) {
    const r = Math.max(2, Math.min(8, Math.round(Math.log10(Math.max(city.pop, 1000)))));
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const x = wrapX(city.x + dx, width, wrap);
        const z = city.z + dz;
        if (z < 0 || z >= height || x < 0 || x >= width) continue;
        const i = z * width + x;
        if (isLand[i]) {
          terrainIdx[i] = TERRAIN_INDEX.urban;
          citiesIdx[i] = 13;
        }
      }
    }
  }

  const countryOf = new Int32Array(width * height).fill(-1);
  const countryColors: [number, number, number][] = [];
  const manifestCountries = manifest.countries ?? [];
  if (politicalRgb) {
    const map = new Map<number, number>();
    for (let i = 0; i < isLand.length; i++) {
      if (!isLand[i]) continue;
      const packed = packRgb(politicalRgb[i * 3]!, politicalRgb[i * 3 + 1]!, politicalRgb[i * 3 + 2]!);
      let id = map.get(packed);
      if (id === undefined) {
        id = countryColors.length;
        map.set(packed, id);
        countryColors.push([politicalRgb[i * 3]!, politicalRgb[i * 3 + 1]!, politicalRgb[i * 3 + 2]!]);
      }
      countryOf[i] = id;
    }
  } else if (manifestCountries.length > 1) {
    const mask = isLand;
    const seeds = poissonSeeds(width, height, mask, Math.max(24, Math.sqrt(landPixels / manifestCountries.length)), rng).slice(
      0,
      manifestCountries.length,
    );
    while (seeds.length < manifestCountries.length) {
      const x = Math.floor(rng() * width);
      const z = Math.floor(rng() * height);
      if (isLand[z * width + x]) seeds.push({ x, z });
    }
    const grown = grow({
      width,
      height,
      mask,
      seeds,
      wrap,
      cost: () => 1,
    });
    fillLeftover(grown, mask, width, height, wrap);
    for (let i = 0; i < countryOf.length; i++) countryOf[i] = isLand[i] ? grown[i]! : -1;
    for (const c of manifestCountries) {
      countryColors.push(c.color ?? uniqueColor(countryColors.length, new Set()));
    }
  } else {
    for (let i = 0; i < isLand.length; i++) if (isLand[i]) countryOf[i] = 0;
    const c = manifestCountries[0]?.color ?? [180, 60, 60];
    countryColors.push(c);
  }

  const nCountries = Math.max(1, countryColors.length);
  const kitCountries: KitCountry[] = [];
  const usedTags = new Set<string>();
  for (let i = 0; i < nCountries; i++) {
    const m = manifestCountries[i];
    let tag = (m?.tag ?? (nCountries === 1 ? "TAG" : autoTag(i))).toUpperCase();
    if (usedTags.has(tag)) tag = autoTag(i + 20);
    usedTags.add(tag);
    kitCountries.push({
      tag,
      name: m?.name ?? tag,
      color: m?.color ?? countryColors[i] ?? uniqueColor(i, new Set()),
      capital: 0,
      capitalProvince: 0,
    });
  }

  const continentOf = new Uint8Array(width * height);
  if (continentsRgb) {
    const map = new Map<number, number>();
    let next = 1;
    for (let i = 0; i < isLand.length; i++) {
      if (!isLand[i]) continue;
      const packed = packRgb(continentsRgb[i * 3]!, continentsRgb[i * 3 + 1]!, continentsRgb[i * 3 + 2]!);
      let id = map.get(packed);
      if (id === undefined) {
        id = next++;
        map.set(packed, id);
      }
      continentOf[i] = Math.min(id, 7);
    }
  } else {
    continentOf.fill(1);
  }

  const spacing = manifest.provinceSpacing ?? Math.max(8, Math.floor(Math.sqrt(Math.max(landPixels, 1) / 380)));
  const landSeeds: { x: number; z: number; country: number }[] = [];
  for (let c = 0; c < nCountries; c++) {
    const mask = new Uint8Array(width * height);
    let n = 0;
    for (let i = 0; i < mask.length; i++) {
      if (isLand[i] && countryOf[i] === c) {
        mask[i] = 1;
        n++;
      }
    }
    if (n < MIN_PX) continue;
    const local = poissonSeeds(width, height, mask, spacing, rng, density);
    if (local.length === 0) {
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          local.push({ x: i % width, z: (i / width) | 0 });
          break;
        }
      }
    }
    const covered = components(width, height, mask, wrap);
    const hasSeed = new Uint8Array(covered.sizes.length);
    for (const s of local) {
      const lab = covered.label[s.z * width + s.x]!;
      if (lab >= 0) hasSeed[lab] = 1;
    }
    for (let lab = 0; lab < covered.sizes.length; lab++) {
      if (hasSeed[lab] || (covered.sizes[lab] ?? 0) < MIN_PX) continue;
      let pick = -1;
      for (let i = 0; i < covered.label.length; i++) {
        if (covered.label[i] === lab) {
          pick = i;
          break;
        }
      }
      if (pick >= 0) local.push({ x: pick % width, z: (pick / width) | 0 });
    }
    for (const s of local) landSeeds.push({ ...s, country: c });
  }

  const landMask = isLand;
  const seedCountry = landSeeds.map((s) => s.country);
  const landOwner = grow({
    width,
    height,
    mask: landMask,
    seeds: landSeeds,
    wrap,
    cost: (from, to, id) => {
      if (countryOf[to] !== seedCountry[id]) return Infinity;
      let c = 1;
      if (isRiver[to]) c += 12;
      if (terrainIdx[to] !== terrainIdx[from]) c += 4;
      c += Math.abs(heightmap[to]! - heightmap[from]!) * 0.06;
      return c;
    },
  });
  fillLeftover(landOwner, landMask, width, height, wrap, countryOf);
  mergeSmall(landOwner, landMask, width, height, wrap, MIN_PX, countryOf);
  fillLeftover(landOwner, landMask, width, height, wrap, countryOf);
  fillByDonor(landOwner, landMask, width, height, wrap, countryOf);
  const xfix = fixX(landOwner, width, height);

  const seaMask = new Uint8Array(width * height);
  for (let i = 0; i < seaMask.length; i++) seaMask[i] = isSea[i] ? 1 : 0;
  const seaSeeds = poissonSeeds(width, height, seaMask, spacing * 2.2, rng);
  if (seaSeeds.length === 0) {
    for (let i = 0; i < seaMask.length; i++) {
      if (seaMask[i]) {
        seaSeeds.push({ x: i % width, z: (i / width) | 0 });
        break;
      }
    }
  }
  const seaOwner = grow({
    width,
    height,
    mask: seaMask,
    seeds: seaSeeds,
    wrap,
    cost: () => 1,
  });
  fillLeftover(seaOwner, seaMask, width, height, wrap);
  mergeSmall(seaOwner, seaMask, width, height, wrap, MIN_PX);
  fillLeftover(seaOwner, seaMask, width, height, wrap);
  for (let i = 0; i < seaOwner.length; i++) {
    if (seaMask[i] && seaOwner[i]! < 0) seaOwner[i] = 0;
  }
  fixX(seaOwner, width, height, wrap);

  const lakeMask = new Uint8Array(width * height);
  for (let i = 0; i < lakeMask.length; i++) lakeMask[i] = isLake[i] ? 1 : 0;
  const lakeSeeds = poissonSeeds(width, height, lakeMask, spacing * 1.5, rng);
  const lakeComp = components(width, height, lakeMask, wrap);
  for (let lab = 0; lab < lakeComp.sizes.length; lab++) {
    if ((lakeComp.sizes[lab] ?? 0) < MIN_PX) continue;
    const has = lakeSeeds.some((s) => lakeComp.label[s.z * width + s.x] === lab);
    if (has) continue;
    let pick = -1;
    for (let i = 0; i < lakeComp.label.length; i++) {
      if (lakeComp.label[i] === lab) {
        pick = i;
        break;
      }
    }
    if (pick >= 0) lakeSeeds.push({ x: pick % width, z: (pick / width) | 0 });
  }
  const lakeOwner = lakeSeeds.length
    ? grow({ width, height, mask: lakeMask, seeds: lakeSeeds, wrap, cost: () => 1 })
    : new Int32Array(width * height).fill(-1);
  if (lakeSeeds.length) {
    fillLeftover(lakeOwner, lakeMask, width, height, wrap);
    fixX(lakeOwner, width, height, wrap);
  }

  const used = new Set<number>();
  const defs: ProvinceDef[] = [];
  const landIdOf: number[] = [];
  for (let s = 0; s < landSeeds.length; s++) {
    const id = defs.length + 1;
    landIdOf[s] = id;
    const [r, g, b] = uniqueColor(id, used);
    defs.push({ id, r, g, b, type: "land", coastal: false, terrain: "plains", continent: 1 });
  }
  const seaIdOf: number[] = [];
  for (let s = 0; s < seaSeeds.length; s++) {
    const id = defs.length + 1;
    seaIdOf[s] = id;
    const [r, g, b] = uniqueColor(id, used);
    defs.push({ id, r, g, b, type: "sea", coastal: false, terrain: "ocean", continent: 0 });
  }
  const lakeIdOf: number[] = [];
  for (let s = 0; s < lakeSeeds.length; s++) {
    const id = defs.length + 1;
    lakeIdOf[s] = id;
    const [r, g, b] = uniqueColor(id, used);
    defs.push({ id, r, g, b, type: "lake", coastal: false, terrain: "lakes", continent: 0 });
  }

  const idAt = new Int32Array(width * height);
  const rgb = new Uint8Array(width * height * 3);
  const terrainVotes = new Map<number, Map<number, number>>();
  const continentVotes = new Map<number, Map<number, number>>();
  const vote = (map: Map<number, Map<number, number>>, id: number, key: number) => {
    let inner = map.get(id);
    if (!inner) {
      inner = new Map();
      map.set(id, inner);
    }
    inner.set(key, (inner.get(key) ?? 0) + 1);
  };
  const majority = (map: Map<number, Map<number, number>>, id: number, fallback: number) => {
    const inner = map.get(id);
    if (!inner) return fallback;
    let best = fallback;
    let n = -1;
    for (const [k, v] of inner) {
      if (v > n) {
        n = v;
        best = k;
      }
    }
    return best;
  };

  const firstLand = landIdOf.find((id) => id)!;
  const firstSea = seaIdOf.find((id) => id) ?? firstLand;
  for (let i = 0; i < idAt.length; i++) {
    let def: ProvinceDef | undefined;
    if (isLand[i]) {
      const s = landOwner[i]!;
      const id = s >= 0 ? landIdOf[s] : undefined;
      def = id ? defs[id - 1] : defs[firstLand - 1];
    } else if (isLake[i]) {
      const s = lakeOwner[i]!;
      const id = s >= 0 ? lakeIdOf[s] : undefined;
      if (id) def = defs[id - 1];
      else {
        const seaS = seaOwner[i]!;
        const sid = seaS >= 0 ? seaIdOf[seaS] : firstSea;
        def = defs[(sid ?? firstSea) - 1];
      }
    } else {
      const s = seaOwner[i]!;
      const id = s >= 0 ? seaIdOf[s] : firstSea;
      def = defs[(id ?? firstSea) - 1];
    }
    idAt[i] = (def ?? defs[firstLand - 1]!).id;
  }
  const kindOfPixel = (i: number) => (isLand[i] ? 1 : isLake[i] ? 2 : 3);
  const kindOfId = (id: number) => {
    const d = defs[id - 1];
    if (!d) return 0;
    return d.type === "land" ? 1 : d.type === "lake" ? 2 : 3;
  };
  const xfixAll = fixCrossings(idAt, width, height, kindOfPixel, kindOfId);
  for (let i = 0; i < idAt.length; i++) {
    const d = defs[idAt[i]! - 1] ?? defs[0]!;
    rgb[i * 3] = d.r;
    rgb[i * 3 + 1] = d.g;
    rgb[i * 3 + 2] = d.b;
    vote(terrainVotes, d.id, terrainIdx[i]!);
    if (isLand[i]) vote(continentVotes, d.id, continentOf[i] || 1);
  }

  const pixels = new Map<number, number>();
  const sumX = new Map<number, number>();
  const sumZ = new Map<number, number>();
  const neighbors = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  };
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      const a = idAt[i]!;
      pixels.set(a, (pixels.get(a) ?? 0) + 1);
      sumX.set(a, (sumX.get(a) ?? 0) + x);
      sumZ.set(a, (sumZ.get(a) ?? 0) + z);
      const x2 = wrapX(x + 1, width, wrap);
      if (x2 >= 0 && x2 < width && (wrap || x + 1 < width)) link(a, idAt[z * width + x2]!);
      if (z + 1 < height) link(a, idAt[(z + 1) * width + x]!);
    }
  }

  const byId = new Map(defs.map((d) => [d.id, d]));
  for (const d of defs) {
    const n = [...(neighbors.get(d.id) ?? [])];
    if (d.type === "land") d.coastal = n.some((id) => byId.get(id)?.type === "sea");
    if (d.type === "sea") d.coastal = n.some((id) => byId.get(id)?.type === "land");
    const tIdx = majority(terrainVotes, d.id, d.type === "sea" ? TERRAIN_INDEX.ocean : TERRAIN_INDEX.plains);
    if (d.type === "land") d.terrain = DEFINITION_TERRAIN[tIdx] ?? "plains";
    if (d.type === "sea") d.terrain = "ocean";
    if (d.type === "lake") d.terrain = "lakes";
    if (d.type === "land") d.continent = majority(continentVotes, d.id, 1) || 1;
  }

  const live = defs.filter((d) => (pixels.get(d.id) ?? 0) >= 1);
  if (live.length > PROVINCE_CAP) {
    throw new Error(`Generated ${live.length} provinces; HOI4 practical cap is ${PROVINCE_CAP}`);
  }
  live.sort((a, b) => a.id - b.id);
  const remap = new Map<number, number>();
  live.forEach((d, i) => remap.set(d.id, i + 1));
  for (const d of live) d.id = remap.get(d.id)!;
  for (let i = 0; i < idAt.length; i++) idAt[i] = remap.get(idAt[i]!) ?? 0;
  const neighbors2 = new Map<number, Set<number>>();
  for (const [a, set] of neighbors) {
    const na = remap.get(a);
    if (!na) continue;
    const ns = new Set<number>();
    for (const b of set) {
      const nb = remap.get(b);
      if (nb) ns.add(nb);
    }
    neighbors2.set(na, ns);
  }
  const pixels2 = new Map<number, number>();
  const cx = new Map<number, number>();
  const cz = new Map<number, number>();
  for (const [id, n] of pixels) {
    const nid = remap.get(id);
    if (!nid) continue;
    pixels2.set(nid, n);
    cx.set(nid, (sumX.get(id) ?? 0) / n);
    cz.set(nid, (sumZ.get(id) ?? 0) / n);
  }
  const countryOfProv = new Map<number, number>();
  const countryCount = new Map<number, Map<number, number>>();
  for (let i = 0; i < idAt.length; i++) {
    if (!isLand[i]) continue;
    const id = idAt[i]!;
    const c = countryOf[i]!;
    let inner = countryCount.get(id);
    if (!inner) {
      inner = new Map();
      countryCount.set(id, inner);
    }
    inner.set(c, (inner.get(c) ?? 0) + 1);
  }
  for (const [id, inner] of countryCount) {
    let best = 0;
    let n = -1;
    for (const [c, v] of inner) {
      if (v > n) {
        n = v;
        best = c;
      }
    }
    countryOfProv.set(id, best);
  }

  const landLive = live.filter((d) => d.type === "land");
  const perState = manifest.stateSize ?? 6;
  const states: State[] = [];
  const assigned = new Set<number>();
  const byCountry = new Map<number, number[]>();
  for (const p of landLive) {
    const c = countryOfProv.get(p.id) ?? 0;
    const list = byCountry.get(c) ?? [];
    list.push(p.id);
    byCountry.set(c, list);
  }
  for (const [cIdx, ids] of byCountry) {
    const leftover = new Set(ids);
    while (leftover.size) {
      const start = leftover.values().next().value as number;
      const cluster: number[] = [];
      const q = [start];
      leftover.delete(start);
      while (q.length && cluster.length < perState) {
        const cur = q.shift()!;
        cluster.push(cur);
        for (const n of neighbors2.get(cur) ?? []) {
          if (!leftover.has(n)) continue;
          leftover.delete(n);
          q.push(n);
        }
      }
      for (const extra of q) leftover.add(extra);
      const id = states.length + 1;
      const tag = kitCountries[cIdx]?.tag ?? "TAG";
      const coastal = cluster.map((pid) => live.find((d) => d.id === pid)!).find((p) => p.coastal);
      const urban = cluster.find((pid) => live.find((d) => d.id === pid)?.terrain === "urban");
      const vpProv = urban ?? coastal?.id ?? cluster[0]!;
      const city = cities.find((ci) => {
        const pid = idAt[Math.min(height - 1, Math.max(0, ci.z)) * width + wrapX(ci.x, width, wrap)];
        return cluster.includes(pid ?? -1);
      });
      const vp = city ? Math.max(1, Math.min(50, Math.round(Math.log10(city.pop)))) : coastal ? 3 : 1;
      states.push({
        id,
        name: city?.name ? city.name : `STATE_${id}`,
        fileName: `${id}-${tag}.txt`,
        provinces: cluster,
        owner: tag,
        controller: tag,
        cores: [tag],
        claims: [],
        category: urban ? "city" : coastal ? "town" : "rural",
        manpower: Math.max(10000, Math.round((city?.pop ?? 80000) * cluster.length)),
        resources: {},
        victoryPoints: [{ province: vpProv, value: vp }],
        buildings: { infrastructure: urban ? 3 : 1, industrial_complex: 1 },
        provincialBuildings: coastal ? [{ province: coastal.id, type: "naval_base", level: 1 }] : [],
        localSupplies: 0,
      });
      for (const pid of cluster) assigned.add(pid);
    }
  }
  void assigned;

  const buildings: BuildingPlacement[] = [];
  for (const st of states) {
    const first = st.provinces[0]!;
    buildings.push({
      state: st.id,
      building: "industrial_complex",
      x: cx.get(first) ?? 1,
      y: 9.5,
      z: cz.get(first) ?? 1,
      rotation: 0,
      seaProvince: 0,
    });
    for (const pb of st.provincialBuildings) {
      const sea = [...(neighbors2.get(pb.province) ?? [])].find((id) => live.find((d) => d.id === id)?.type === "sea");
      const p = live.find((d) => d.id === pb.province);
      buildings.push({
        state: st.id,
        building: pb.type,
        x: cx.get(pb.province) ?? 0,
        y: 9.5,
        z: cz.get(pb.province) ?? 0,
        rotation: 0,
        seaProvince: sea ?? 0,
      });
      void p;
    }
  }
  if (buildings.length === 0) {
    buildings.push({
      state: 1,
      building: "arms_factory",
      x: 1,
      y: 9.5,
      z: 1,
      rotation: 0,
      seaProvince: 0,
    });
  }

  const railways: { level: number; provinces: number[] }[] = [];
  for (const [, ids] of byCountry) {
    const chain = adjacentChain(ids, neighbors2, 8);
    if (chain.length >= 2) railways.push({ level: 1, provinces: chain });
  }
  if (railways.length === 0) {
    const allLand = landLive.map((d) => d.id);
    const chain = adjacentChain(allLand, neighbors2, 8);
    if (chain.length >= 2) {
      railways.push({ level: 1, provinces: chain });
    } else {
      outer: for (const p of landLive) {
        for (const n of neighbors2.get(p.id) ?? []) {
          if (live.find((d) => d.id === n)?.type === "land") {
            railways.push({ level: 1, provinces: [p.id, n] });
            break outer;
          }
        }
      }
    }
  }
  const supply = states.map((st) => ({
    level: 1,
    province: st.victoryPoints[0]?.province ?? st.provinces[0]!,
  }));

  const landRegions: StrategicRegion[] = [];
  const regionOfState = new Map<number, number>();
  const stateAdj = new Map<number, Set<number>>();
  const provState = new Map<number, number>();
  for (const st of states) for (const p of st.provinces) provState.set(p, st.id);
  for (const st of states) {
    const adj = stateAdj.get(st.id) ?? new Set();
    for (const p of st.provinces) {
      for (const n of neighbors2.get(p) ?? []) {
        const os = provState.get(n);
        if (os && os !== st.id) adj.add(os);
      }
    }
    stateAdj.set(st.id, adj);
  }
  const unreg = new Set(states.map((s) => s.id));
  while (unreg.size) {
    const start = unreg.values().next().value as number;
    const cluster: number[] = [];
    const q = [start];
    unreg.delete(start);
    while (q.length && cluster.length < 5) {
      const cur = q.shift()!;
      cluster.push(cur);
      for (const n of stateAdj.get(cur) ?? []) {
        if (!unreg.has(n)) continue;
        unreg.delete(n);
        q.push(n);
      }
    }
    for (const extra of q) unreg.add(extra);
    const id = landRegions.length + 1;
    const provs = cluster.flatMap((sid) => states.find((s) => s.id === sid)!.provinces);
    const zMean = provs.reduce((a, p) => a + (cz.get(p) ?? 0), 0) / Math.max(provs.length, 1);
    const latTemp = 28 - (zMean / Math.max(height, 1)) * 36;
    landRegions.push({
      id,
      name: `STRATEGICREGION_${id}`,
      fileName: `${id}-Land.txt`,
      provinces: provs,
      weather: defaultWeather(latTemp),
    });
    for (const sid of cluster) regionOfState.set(sid, id);
  }
  void regionOfState;
  const seaLive = live.filter((d) => d.type === "sea" || d.type === "lake");
  const seaChunks: number[][] = [];
  const seaLeft = new Set(seaLive.map((d) => d.id));
  while (seaLeft.size) {
    const start = seaLeft.values().next().value as number;
    const cluster: number[] = [];
    const q = [start];
    seaLeft.delete(start);
    while (q.length && cluster.length < 10) {
      const cur = q.shift()!;
      cluster.push(cur);
      for (const n of neighbors2.get(cur) ?? []) {
        if (!seaLeft.has(n)) continue;
        seaLeft.delete(n);
        q.push(n);
      }
    }
    for (const extra of q) seaLeft.add(extra);
    seaChunks.push(cluster);
  }
  const regions: StrategicRegion[] = [...landRegions];
  for (const chunk of seaChunks) {
    const id = regions.length + 1;
    regions.push({
      id,
      name: `STRATEGICREGION_${id}`,
      fileName: `${id}-Sea.txt`,
      provinces: chunk,
      navalTerrain: "water_deep_ocean",
      weather: defaultWeather(12),
    });
  }
  if (regions.length === 0) {
    regions.push({
      id: 1,
      name: "STRATEGICREGION_1",
      fileName: "1-World.txt",
      provinces: live.map((d) => d.id),
      weather: defaultWeather(10),
    });
  }

  for (const st of states) {
    const tag = st.owner ?? "TAG";
    const kc = kitCountries.find((c) => c.tag === tag);
    if (kc && kc.capital === 0 && st.id) {
      kc.capital = st.id;
      kc.capitalProvince = st.victoryPoints[0]?.province ?? st.provinces[0]!;
    }
  }
  for (const kc of kitCountries) {
    if (kc.capital === 0) {
      kc.capital = states[0]?.id ?? 1;
      kc.capitalProvince = states[0]?.provinces[0] ?? 1;
    }
  }

  const pal = palettesFromGame(opts.gamePath ?? findHoi4Install());
  const treesW = Math.max(8, Math.round((width * 1650) / 5632));
  const treesH = Math.max(8, Math.round((height * 600) / 2048));
  const trees = new Uint8Array(treesW * treesH);
  for (let z = 0; z < treesH; z++) {
    for (let x = 0; x < treesW; x++) {
      const mx = Math.min(width - 1, Math.floor((x * width) / treesW));
      const mz = Math.min(height - 1, Math.floor((z * height) / treesH));
      const t = terrainIdx[mz * width + mx]!;
      if (t === TERRAIN_INDEX.forest) trees[z * treesW + x] = TREE_INDICES.dense;
      else if (t === TERRAIN_INDEX.sparseForest) trees[z * treesW + x] = TREE_INDICES.sparse;
      else trees[z * treesW + x] = 0;
    }
  }
  const nw = width / 2;
  const nh = height / 2;
  const normal = new Uint8Array(nw * nh * 3);
  for (let z = 0; z < nh; z++) {
    for (let x = 0; x < nw; x++) {
      const mx = Math.min(width - 2, x * 2);
      const mz = Math.min(height - 2, z * 2);
      const xm = wrapX(mx - 1, width, wrap);
      const xp = wrapX(mx + 1, width, wrap);
      const zm = Math.max(0, mz - 1);
      const zp = Math.min(height - 1, mz + 1);
      const dx = heightmap[mz * width + xp]! - heightmap[mz * width + xm]!;
      const dz = heightmap[zp * width + mx]! - heightmap[zm * width + mx]!;
      const i = (z * nw + x) * 3;
      normal[i] = Math.max(0, Math.min(255, 128 + dx * 4));
      normal[i + 1] = Math.max(0, Math.min(255, 128 + dz * 4));
      normal[i + 2] = 255;
    }
  }
  const colormap = new Uint8Array(nw * nh * 4);
  for (let z = 0; z < nh; z++) {
    const srcZ = height - 1 - Math.min(height - 1, Math.floor((z * height) / nh));
    for (let x = 0; x < nw; x++) {
      const srcX = Math.min(width - 1, Math.floor((x * width) / nw));
      const idx = terrainIdx[srcZ * width + srcX]!;
      const o = (z * nw + x) * 4;
      const c = TERRAIN_RGB[idx] ?? [80, 80, 80];
      colormap[o] = c[0]!;
      colormap[o + 1] = c[1]!;
      colormap[o + 2] = c[2]!;
      colormap[o + 3] = idx === TERRAIN_INDEX.urban ? 255 : 0;
    }
  }
  const solidDds = (w: number, h: number, rgb: [number, number, number], a = 255) => {
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = rgb[0];
      data[i * 4 + 1] = rgb[1];
      data[i * 4 + 2] = rgb[2];
      data[i * 4 + 3] = a;
    }
    return encodeDdsArgb(w, h, data);
  };

  const weatherPositions = regions.flatMap((r) => {
    const px = r.provinces.reduce((a, p) => a + (cx.get(p) ?? 10), 0) / Math.max(r.provinces.length, 1);
    const pz = r.provinces.reduce((a, p) => a + (cz.get(p) ?? 10), 0) / Math.max(r.provinces.length, 1);
    return [
      { region: r.id, x: px, y: 10, z: pz, size: "small" },
      { region: r.id, x: px + 2, y: 10, z: pz + 2, size: "big" },
    ];
  });

  const continentNames = ["europe", "north_america", "south_america", "australia", "africa", "asia", "middle_east"];
  const usedContinents = new Set(live.filter((d) => d.type === "land").map((d) => d.continent));
  const continentTxt =
    "continents = {\n" +
    [...usedContinents]
      .sort((a, b) => a - b)
      .map((id) => `\t${continentNames[id - 1] ?? `continent_${id}`}`)
      .join("\n") +
    "\n}\n";

  const reportDir = opts.outDir;
  mkdirSync(reportDir, { recursive: true });
  const report: GenerateReport = {
    width,
    height,
    landPixels,
    seaPixels,
    lakePixels,
    landProvinces: landLive.length,
    seaProvinces: live.filter((d) => d.type === "sea").length,
    lakeProvinces: live.filter((d) => d.type === "lake").length,
    states: states.length,
    regions: regions.length,
    countries: kitCountries.length,
    riverPixels: river.riverPixels,
    riverSources: river.sources,
    xCrossingsFixed: xfix + xfixAll,
    cities: cities.length,
    spacing,
    wrap,
    errors: [],
    warnings: [],
  };
  writeFileSync(join(reportDir, "mapit-generate-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    join(reportDir, "preview-provinces.png"),
    Buffer.from(encodePng({ width, height, data: rgb, channels: 3, depth: 8 })),
  );
  writeGreyPng(join(reportDir, "preview-heightmap.png"), width, height, heightmap);
  writeIndexPreview(join(reportDir, "preview-terrain.png"), width, height, terrainIdx, pal.terrain);
  writeIndexPreview(join(reportDir, "preview-rivers.png"), width, height, rivers, pal.rivers);
  const polPrev = new Uint8Array(width * height * 3);
  for (let i = 0; i < isLand.length; i++) {
    if (!isLand[i]) {
      polPrev[i * 3 + 2] = 80;
      continue;
    }
    const c = kitCountries[countryOf[i]!] ?? kitCountries[0]!;
    polPrev[i * 3] = c.color[0];
    polPrev[i * 3 + 1] = c.color[1];
    polPrev[i * 3 + 2] = c.color[2];
  }
  writeFileSync(
    join(reportDir, "preview-political.png"),
    Buffer.from(encodePng({ width, height, data: polPrev, channels: 3, depth: 8 })),
  );

  const modDir = opts.preview ? mkdtempSync(join(tmpdir(), "mapit-gen-")) : reportDir;
  const mapDir = join(modDir, "map");
  mkdirSync(join(mapDir, "strategicregions"), { recursive: true });
  mkdirSync(join(mapDir, "terrain"), { recursive: true });
  mkdirSync(join(modDir, "history/states"), { recursive: true });

  writeFileSync(join(mapDir, "provinces.bmp"), encodeBmp24({ width, height, data: rgb }));
  writeFileSync(join(mapDir, "definition.csv"), writeDefinitionCsv(live));
  writeFileSync(join(mapDir, "heightmap.bmp"), encodeBmpIndexed({ width, height, indices: heightmap, palette: pal.heightmap }));
  writeFileSync(join(mapDir, "terrain.bmp"), encodeBmpIndexed({ width, height, indices: terrainIdx, palette: pal.terrain }));
  writeFileSync(join(mapDir, "rivers.bmp"), encodeBmpIndexed({ width, height, indices: rivers, palette: pal.rivers }));
  writeFileSync(join(mapDir, "cities.bmp"), encodeBmpIndexed({ width, height, indices: citiesIdx, palette: pal.terrain }));
  writeFileSync(join(mapDir, "trees.bmp"), encodeBmpIndexed({ width: treesW, height: treesH, indices: trees, palette: pal.trees }));
  writeFileSync(join(mapDir, "world_normal.bmp"), encodeBmp24({ width: nw, height: nh, data: normal }));
  writeFileSync(join(mapDir, "terrain/colormap_rgb_cityemissivemask_a.dds"), encodeDdsArgb(nw, nh, colormap));
  const w0 = Math.max(1, Math.floor(width / 2));
  const h0 = Math.max(1, Math.floor(height / 2));
  const seaBlue: [number, number, number] = [18, 52, 90];
  writeFileSync(join(mapDir, "terrain/colormap_water_0.dds"), solidDds(w0, h0, seaBlue));
  writeFileSync(
    join(mapDir, "terrain/colormap_water_1.dds"),
    solidDds(Math.max(1, Math.floor(w0 / 2)), Math.max(1, Math.floor(h0 / 2)), seaBlue),
  );
  writeFileSync(
    join(mapDir, "terrain/colormap_water_2.dds"),
    solidDds(Math.max(1, Math.floor(w0 / 4)), Math.max(1, Math.floor(h0 / 4)), seaBlue),
  );
  writeFileSync(join(mapDir, "terrain/fow_rgb_waterspec_a.dds"), solidDds(w0, h0, [40, 40, 40], 0));
  writeFileSync(join(mapDir, "buildings.txt"), writeBuildingsTxt(buildings));
  writeFileSync(join(mapDir, "railways.txt"), writeRailwaysTxt(railways));
  writeFileSync(join(mapDir, "supply_nodes.txt"), writeSupplyNodesTxt(supply.length ? supply : [{ level: 1, province: landLive[0]?.id ?? 1 }]));
  writeFileSync(join(mapDir, "adjacencies.csv"), writeAdjacenciesCsv([]));
  writeFileSync(
    join(mapDir, "weatherpositions.txt"),
    weatherPositions.map((w) => `${w.region};${w.x.toFixed(2)};${w.y.toFixed(2)};${w.z.toFixed(2)};${w.size}`).join("\n") + "\n",
  );
  writeFileSync(join(mapDir, "continent.txt"), continentTxt);
  writeFileSync(
    join(mapDir, "default.map"),
    `definitions = "definition.csv"
provinces = "provinces.bmp"
positions = "positions.txt"
terrain = "terrain.bmp"
rivers = "rivers.bmp"
heightmap = "heightmap.bmp"
tree_definition = "trees.bmp"
continent = "continent.txt"
adjacency_rules = "adjacency_rules.txt"
adjacencies = "adjacencies.csv"
#climate = "climate.txt"
ambient_object = "ambient_object.txt"
seasons = "seasons.txt"
tree = { 3 4 7 10 }
width = ${width}
height = ${height}
`,
  );
  writeFileSync(join(mapDir, "adjacency_rules.txt"), "");
  writeFileSync(join(mapDir, "ambient_object.txt"), "");
  writeFileSync(join(mapDir, "positions.txt"), "");
  const stacks = landLive.flatMap((p) => {
    const x = (cx.get(p.id) ?? 1).toFixed(2);
    const z = (cz.get(p.id) ?? 1).toFixed(2);
    return [`${p.id};0;${x};9.50;${z};0.00;0.00`, `${p.id};38;${x};9.50;${z};0.00;0.00`];
  });
  writeFileSync(join(mapDir, "unitstacks.txt"), stacks.join("\n") + (stacks.length ? "\n" : ""));
  writeFileSync(
    join(mapDir, "cities.txt"),
    `types_source = "map/cities.bmp"
pixel_step_x = 2
pixel_step_y = 2
city_group = {
	color_index = 13
	density = 0.5
	building = {
		distance = 1
		mesh = { "westerngfx_house_1_1" }
	}
}
`,
  );
  writeFileSync(
    join(mapDir, "seasons.txt"),
    `winter = {
	start_date=00.12.01
	end_date=00.02.28
	hsv_north={ 0.15 0.10 0.70 }
	colorbalance_north={ 0.90 0.90 1.05 }
	hsv_center={ 0.00 0.20 1.00 }
	colorbalance_center={ 1.00 1.00 1.00 }
	hsv_south={ 0.00 0.25 1.00 }
	colorbalance_south={ 1.05 1.00 0.95 }
}
spring = {
	start_date=00.03.01
	end_date=00.05.31
	hsv_north={ 0.20 0.15 0.80 }
	colorbalance_north={ 1.00 1.00 1.05 }
	hsv_center={ 0.10 0.30 1.00 }
	colorbalance_center={ 1.05 1.05 1.00 }
	hsv_south={ 0.08 0.35 1.00 }
	colorbalance_south={ 1.05 1.00 0.95 }
}
summer = {
	start_date=00.06.01
	end_date=00.08.31
	hsv_north={ 0.20 0.20 0.90 }
	colorbalance_north={ 1.10 1.05 0.95 }
	hsv_center={ 0.12 0.40 1.00 }
	colorbalance_center={ 1.08 1.05 0.95 }
	hsv_south={ 0.10 0.45 1.00 }
	colorbalance_south={ 1.10 1.00 0.90 }
}
autumn = {
	start_date=00.09.01
	end_date=00.11.30
	hsv_north={ 0.08 0.25 0.75 }
	colorbalance_north={ 1.05 0.95 0.85 }
	hsv_center={ 0.06 0.35 0.95 }
	colorbalance_center={ 1.05 0.95 0.85 }
	hsv_south={ 0.05 0.30 1.00 }
	colorbalance_south={ 1.05 1.00 0.90 }
}
`,
  );

  for (const st of states) {
    writeFileSync(join(modDir, "history/states", st.fileName), writeStateFile(st));
  }
  for (const rg of regions) {
    writeFileSync(join(mapDir, "strategicregions", rg.fileName), writeRegionFile(rg));
  }

  writeLaunchKit({
    outDir: modDir,
    modName: opts.name ?? manifest.name ?? "Mapit Generated",
    countries: kitCountries,
    stateNames: states.map((s) => ({ id: s.id, name: s.name })),
    regionNames: regions.map((r) => ({ id: r.id, name: r.name.replace("STRATEGICREGION_", "Region ") })),
  });

  try {
    const session = await loadMap({ mapDir: modDir });
    const v = validate(session);
    report.errors = v.errors.map((e) => `${e.code}: ${e.message}`);
    report.warnings = v.warnings.map((e) => `${e.code}: ${e.message}`);
    writeFileSync(join(reportDir, "mapit-generate-report.json"), JSON.stringify(report, null, 2));
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
    writeFileSync(join(reportDir, "mapit-generate-report.json"), JSON.stringify(report, null, 2));
  }

  if (opts.preview) {
    const folder = modDir.split(/[/\\]/).filter(Boolean).pop() ?? "mapit_mod";
    const pointer = join(modDir, "..", `${folder}.mod`);
    rmSync(modDir, { recursive: true, force: true });
    try {
      rmSync(pointer, { force: true });
    } catch {
      /* sibling pointer may already be gone */
    }
    const errBit = report.errors.length ? `  (${report.errors.length} validate errors)` : "";
    return {
      summary: `Preview ${width}×${height}: ${report.landProvinces} land provinces, ${report.seaProvinces} sea, ${report.states} states, ${report.riverPixels} river px${errBit} → ${reportDir}`,
      report,
    };
  }

  const errBit = report.errors.length ? `  (${report.errors.length} validate errors — see mapit-generate-report.json)` : "";
  return {
    summary: `Generated ${width}×${height}: ${report.landProvinces} land provinces, ${report.seaProvinces} sea, ${report.states} states, ${report.countries} countries, ${report.riverPixels} river px → ${modDir}${errBit}`,
    report,
  };
}
