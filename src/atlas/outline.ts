import type { MapSession, ProvinceId } from "../core/ir.ts";

export type Ring = { x: number; z: number }[];

function key(x: number, z: number): string {
  return `${x},${z}`;
}

export function provinceRing(session: MapSession, id: ProvinceId): Ring | undefined {
  const p = session.provinces.get(id);
  if (!p || p.pixels === 0) return undefined;
  const { width, height, idGrid } = session;
  const { minX, minZ, maxX, maxZ } = p.bbox;
  const starts = new Map<string, { x: number; z: number }[]>();
  const add = (x1: number, z1: number, x2: number, z2: number) => {
    const k = key(x1, z1);
    const list = starts.get(k) ?? [];
    list.push({ x: x2, z: z2 });
    starts.set(k, list);
  };
  const isId = (x: number, z: number) => {
    if (z < 0 || z >= height) return false;
    const xx = ((x % width) + width) % width;
    return idGrid[z * width + xx] === id;
  };
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      if (idGrid[z * width + x] !== id) continue;
      if (!isId(x, z - 1)) add(x, z, x + 1, z);
      if (!isId(x + 1, z)) add(x + 1, z, x + 1, z + 1);
      if (!isId(x, z + 1)) add(x + 1, z + 1, x, z + 1);
      if (!isId(x - 1, z)) add(x, z + 1, x, z);
    }
  }
  const firstKey = starts.keys().next().value as string | undefined;
  if (!firstKey) return undefined;
  const [sx, sz] = firstKey.split(",").map(Number) as [number, number];
  const ring: Ring = [{ x: sx, z: sz }];
  let cx = sx;
  let cz = sz;
  const used = new Set<string>();
  for (let i = 0; i < p.pixels * 8; i++) {
    const opts = starts.get(key(cx, cz));
    if (!opts || opts.length === 0) break;
    const next = opts.find((n) => !used.has(`${cx},${cz}->${n.x},${n.z}`)) ?? opts[0]!;
    const uk = `${cx},${cz}->${next.x},${next.z}`;
    used.add(uk);
    cx = next.x;
    cz = next.z;
    if (cx === sx && cz === sz) break;
    ring.push({ x: cx, z: cz });
  }
  return ring;
}

/** Split a ring wherever it jumps across the date line so SVG paths do not slash the map. */
export function splitWrapRing(ring: Ring, width: number): Ring[] {
  if (ring.length < 2) return ring.length ? [ring] : [];
  const parts: Ring[] = [];
  let cur: Ring = [ring[0]!];
  for (let i = 1; i < ring.length; i++) {
    const prev = ring[i - 1]!;
    const pt = ring[i]!;
    if (Math.abs(pt.x - prev.x) > width / 2) {
      if (cur.length > 1) parts.push(cur);
      cur = [pt];
    } else {
      cur.push(pt);
    }
  }
  if (cur.length > 1) parts.push(cur);
  return parts;
}

export function provinceRings(session: MapSession, id: ProvinceId): Ring[] {
  const ring = provinceRing(session, id);
  if (!ring) return [];
  return splitWrapRing(ring, session.width);
}
