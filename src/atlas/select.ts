import type { MapSession, Province, ProvinceId, Tag } from "../core/ir.ts";

export type Selector =
  | { kind: "tag"; tag: Tag }
  | { kind: "state"; id: number }
  | { kind: "region"; id: number }
  | { kind: "provinces"; ids: ProvinceId[] }
  | { kind: "bbox"; x: number; z: number; w: number; h: number }
  | { kind: "front"; a: Tag; b: Tag }
  | { kind: "world" };

export function parseSelector(raw: string): Selector {
  const s = raw.trim();
  if (!s || s === "--world" || s.toLowerCase() === "world") return { kind: "world" };
  const state = s.match(/^--state[=\s](\d+)$/i) ?? s.match(/^state:(\d+)$/i);
  if (state) return { kind: "state", id: Number(state[1]) };
  const region = s.match(/^--region[=\s](\d+)$/i) ?? s.match(/^region:(\d+)$/i);
  if (region) return { kind: "region", id: Number(region[1]) };
  const bbox = s.match(/^--bbox[=\s]([\d,]+)$/i) ?? s.match(/^bbox:([\d,]+)$/i);
  if (bbox) {
    const [x, z, w, h] = bbox[1]!.split(",").map(Number);
    return { kind: "bbox", x: x ?? 0, z: z ?? 0, w: w ?? 1, h: h ?? 1 };
  }
  const front = s.match(/^--front[=\s]([A-Z0-9]{3}),([A-Z0-9]{3})$/i) ?? s.match(/^front:([A-Z0-9]{3}),([A-Z0-9]{3})$/i);
  if (front) return { kind: "front", a: front[1]!.toUpperCase(), b: front[2]!.toUpperCase() };
  if (/^[A-Z0-9]{3}$/.test(s)) return { kind: "tag", tag: s.toUpperCase() };
  if (/^\d+(,\d+)*$/.test(s)) {
    return { kind: "provinces", ids: s.split(",").map(Number) };
  }
  throw new Error(`Unknown atlas selector: ${raw}`);
}

export function selectProvinces(session: MapSession, selector: Selector): Province[] {
  const ownerOf = (p: Province): Tag | undefined => {
    if (p.stateId === undefined) return undefined;
    return session.states.get(p.stateId)?.owner;
  };
  switch (selector.kind) {
    case "world":
      return [...session.provinces.values()].filter((p) => p.pixels > 0 && p.id !== 0);
    case "tag":
      return [...session.provinces.values()].filter((p) => ownerOf(p) === selector.tag);
    case "state": {
      const st = session.states.get(selector.id);
      return (st?.provinces ?? []).map((id) => session.provinces.get(id)!).filter(Boolean);
    }
    case "region": {
      const rg = session.regions.get(selector.id);
      return (rg?.provinces ?? []).map((id) => session.provinces.get(id)!).filter(Boolean);
    }
    case "provinces":
      return selector.ids.map((id) => session.provinces.get(id)!).filter(Boolean);
    case "bbox":
      return [...session.provinces.values()].filter((p) => {
        if (p.pixels === 0) return false;
        const c = p.centroid;
        return (
          c.x >= selector.x &&
          c.x < selector.x + selector.w &&
          c.z >= selector.z &&
          c.z < selector.z + selector.h
        );
      });
    case "front": {
      const a = selectProvinces(session, { kind: "tag", tag: selector.a });
      const bIds = new Set(selectProvinces(session, { kind: "tag", tag: selector.b }).map((p) => p.id));
      const keep = new Set<ProvinceId>();
      for (const p of a) {
        if (p.neighbors.some((n) => bIds.has(n))) {
          keep.add(p.id);
          for (const n of p.neighbors) if (bIds.has(n)) keep.add(n);
        }
      }
      return [...keep].map((id) => session.provinces.get(id)!).filter(Boolean);
    }
  }
}

export function deriveFronts(session: MapSession, provinces: Province[]) {
  const ownerOf = (id: ProvinceId): Tag | undefined => {
    const p = session.provinces.get(id);
    if (!p || p.stateId === undefined) return undefined;
    return session.states.get(p.stateId)?.owner;
  };
  const pairs: { a: Tag; b: Tag; provinces: [ProvinceId, ProvinceId][] }[] = [];
  const index = new Map<string, [ProvinceId, ProvinceId][]>();
  const inSel = new Set(provinces.map((p) => p.id));
  for (const p of provinces) {
    const oa = ownerOf(p.id);
    if (!oa) continue;
    for (const n of p.neighbors) {
      if (!inSel.has(n) || n < p.id) continue;
      const ob = ownerOf(n);
      if (!ob || ob === oa) continue;
      const [x, y] = oa < ob ? [oa, ob] : [ob, oa];
      const k = `${x}|${y}`;
      const list = index.get(k) ?? [];
      list.push(oa < ob ? [p.id, n] : [n, p.id]);
      index.set(k, list);
    }
  }
  for (const [k, list] of index) {
    const [a, b] = k.split("|") as [Tag, Tag];
    pairs.push({ a, b, provinces: list });
  }
  return pairs;
}
