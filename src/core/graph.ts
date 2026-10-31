import { packRgb, type ProvinceDef } from "../pdx/definition.ts";
import {
  UNKNOWN_PROVINCE,
  type BBox,
  type Point,
  type Province,
  type ProvinceId,
} from "./ir.ts";

export type GraphBuild = {
  idGrid: Uint32Array;
  provinces: Map<ProvinceId, Province>;
  xCrossings: Point[];
  unknownPixels: number;
  disconnected: ProvinceId[];
};

export function rgbToIdMap(defs: ProvinceDef[]): Map<number, ProvinceId> {
  const map = new Map<number, ProvinceId>();
  for (const d of defs) {
    map.set(packRgb(d.r, d.g, d.b), d.id);
  }
  return map;
}

export function buildGraph(
  width: number,
  height: number,
  rgb: Uint8Array,
  defs: ProvinceDef[],
): GraphBuild {
  const colorMap = rgbToIdMap(defs);
  const idGrid = new Uint32Array(width * height);
  const pixels = new Map<ProvinceId, number>();
  const sumX = new Map<ProvinceId, number>();
  const sumZ = new Map<ProvinceId, number>();
  const bbox = new Map<ProvinceId, BBox>();
  let unknownPixels = 0;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      const src = i * 3;
      const packed = packRgb(rgb[src]!, rgb[src + 1]!, rgb[src + 2]!);
      const id = colorMap.get(packed);
      if (id === undefined) {
        idGrid[i] = UNKNOWN_PROVINCE;
        unknownPixels++;
        continue;
      }
      idGrid[i] = id;
      pixels.set(id, (pixels.get(id) ?? 0) + 1);
      sumX.set(id, (sumX.get(id) ?? 0) + x);
      sumZ.set(id, (sumZ.get(id) ?? 0) + z);
      const b = bbox.get(id);
      if (!b) bbox.set(id, { minX: x, minZ: z, maxX: x, maxZ: z });
      else {
        if (x < b.minX) b.minX = x;
        if (z < b.minZ) b.minZ = z;
        if (x > b.maxX) b.maxX = x;
        if (z > b.maxZ) b.maxZ = z;
      }
    }
  }

  const neighborSets = new Map<ProvinceId, Set<ProvinceId>>();
  const ensureN = (id: ProvinceId) => {
    let s = neighborSets.get(id);
    if (!s) {
      s = new Set();
      neighborSets.set(id, s);
    }
    return s;
  };
  const link = (a: ProvinceId, b: ProvinceId) => {
    if (a === b || a === UNKNOWN_PROVINCE || b === UNKNOWN_PROVINCE) return;
    ensureN(a).add(b);
    ensureN(b).add(a);
  };

  const xCrossings: Point[] = [];
  for (let z = 0; z < height; z++) {
    const z2 = z + 1 < height ? z + 1 : -1;
    for (let x = 0; x < width; x++) {
      const a = idGrid[z * width + x]!;
      const x2 = x + 1 < width ? x + 1 : 0; // wrap
      const b = idGrid[z * width + x2]!;
      link(a, b);
      if (z2 >= 0) {
        const c = idGrid[z2 * width + x]!;
        link(a, c);
        const d = idGrid[z2 * width + x2]!;
        const uniq = new Set([a, b, c, d]);
        uniq.delete(UNKNOWN_PROVINCE);
        if (uniq.size === 4) xCrossings.push({ x, z });
      }
    }
  }

  const defById = new Map(defs.map((d) => [d.id, d]));
  const provinces = new Map<ProvinceId, Province>();
  for (const d of defs) {
    const n = pixels.get(d.id) ?? 0;
    const neighbors = [...(neighborSets.get(d.id) ?? [])].sort((a, b) => a - b);
    const seaNeighbors = neighbors.filter((id) => defById.get(id)?.type === "sea");
    const landNeighbors = neighbors.filter((id) => defById.get(id)?.type === "land");
    const coastal =
      d.type === "land"
        ? seaNeighbors.length > 0
        : d.type === "sea"
          ? landNeighbors.length > 0
          : false;
    provinces.set(d.id, {
      id: d.id,
      r: d.r,
      g: d.g,
      b: d.b,
      type: d.type,
      coastalDef: d.coastal,
      coastal,
      terrain: d.terrain,
      continent: d.continent,
      pixels: n,
      centroid:
        n > 0
          ? { x: (sumX.get(d.id) ?? 0) / n, z: (sumZ.get(d.id) ?? 0) / n }
          : { x: 0, z: 0 },
      bbox: bbox.get(d.id) ?? { minX: 0, minZ: 0, maxX: 0, maxZ: 0 },
      neighbors,
    });
  }

  const disconnectedSet = new Set<ProvinceId>();
  const visited = new Uint8Array(width * height);
  const seenOnce = new Set<ProvinceId>();
  const stack: number[] = [];
  for (let start = 0; start < idGrid.length; start++) {
    if (visited[start]) continue;
    const id = idGrid[start]!;
    if (id === UNKNOWN_PROVINCE) {
      visited[start] = 1;
      continue;
    }
    if (seenOnce.has(id)) disconnectedSet.add(id);
    seenOnce.add(id);
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const z = (i / width) | 0;
      const next = [
        x + 1 < width ? i + 1 : z * width,
        x > 0 ? i - 1 : z * width + (width - 1),
        z + 1 < height ? i + width : -1,
        z > 0 ? i - width : -1,
      ];
      for (const n of next) {
        if (n < 0 || visited[n] || idGrid[n] !== id) continue;
        visited[n] = 1;
        stack.push(n);
      }
    }
  }
  const disconnected = [...disconnectedSet];

  return { idGrid, provinces, xCrossings, unknownPixels, disconnected };
}
