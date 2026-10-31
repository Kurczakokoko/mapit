import { encode as encodePng } from "fast-png";
import { ownersAfterPending } from "../core/paint.ts";
import type { MapSession } from "../core/ir.ts";

export type Preview = {
  width: number;
  height: number;
  scale: number;
  png: Uint8Array;
  ids: Uint32Array;
};

/** PNG row 0 is north (high z). The IR/idGrid still uses z=0 south. */
export function renderPoliticalPreview(session: MapSession, maxWidth = session.width): Preview {
  const cap = Math.max(1, maxWidth);
  const scale = Math.min(1, cap / session.width);
  const width = Math.max(1, Math.round(session.width * scale));
  const height = Math.max(1, Math.round(session.height * scale));
  const rgb = new Uint8Array(width * height * 3);
  const ids = new Uint32Array(width * height);
  const owners = ownersAfterPending(session);
  for (let z = 0; z < height; z++) {
    const srcZ = Math.min(session.height - 1, Math.floor((z * session.height) / height));
    const mz = session.height - 1 - srcZ;
    for (let x = 0; x < width; x++) {
      const mx = Math.min(session.width - 1, Math.floor((x * session.width) / width));
      const id = session.idGrid[mz * session.width + mx]!;
      const i = z * width + x;
      ids[i] = id;
      const p = session.provinces.get(id);
      const o = (i * 3);
      if (!p || p.id === 0) {
        rgb[o] = 255;
        rgb[o + 1] = 0;
        rgb[o + 2] = 180;
        continue;
      }
      if (p.type === "sea") {
        rgb[o] = 18;
        rgb[o + 1] = 42;
        rgb[o + 2] = 64;
        continue;
      }
      if (p.type === "lake") {
        rgb[o] = 40;
        rgb[o + 1] = 70;
        rgb[o + 2] = 110;
        continue;
      }
      const tag = owners.get(id);
      const country = tag ? session.countries.get(tag) : undefined;
      if (country) {
        rgb[o] = country.color[0];
        rgb[o + 1] = country.color[1];
        rgb[o + 2] = country.color[2];
      } else {
        rgb[o] = p.r;
        rgb[o + 1] = p.g;
        rgb[o + 2] = p.b;
      }
    }
  }
  paintBorders(rgb, ids, width, height, session, owners);
  const png = encodePng({ width, height, data: rgb, channels: 3, depth: 8 });
  return { width, height, scale, png, ids };
}

/** 1 = province, 2 = state, 3 = country, 4 = land/sea coast. */
function paintBorders(
  rgb: Uint8Array,
  ids: Uint32Array,
  width: number,
  height: number,
  session: MapSession,
  owners: Map<number, string>,
): void {
  const mark = new Uint8Array(width * height);
  const rankAt = (a: number, b: number): number => {
    if (a === b || !a || !b) return 0;
    const pa = session.provinces.get(a);
    const pb = session.provinces.get(b);
    if (!pa || !pb) return 0;
    const aLand = pa.type === "land";
    const bLand = pb.type === "land";
    if (aLand !== bLand) return 4;
    if (aLand && bLand && owners.get(a) !== owners.get(b)) return 3;
    if (aLand && bLand && (pa.stateId ?? 0) !== (pb.stateId ?? 0)) return 2;
    return 1;
  };
  const bump = (i: number, rank: number) => {
    if ((rank === 3 || rank === 4) && mark[i] === 2) return;
    if (rank > mark[i]!) mark[i] = rank;
  };
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      const a = ids[i]!;
      const check = (nx0: number, nz: number) => {
        if (nz < 0 || nz >= height) return;
        const nx = ((nx0 % width) + width) % width;
        const j = nz * width + nx;
        const rank = rankAt(a, ids[j]!);
        if (!rank) return;
        if (rank === 4) {
          if (session.provinces.get(a)?.type === "land") bump(i, 4);
          if (session.provinces.get(ids[j]!)?.type === "land") bump(j, 4);
          return;
        }
        bump(i, rank);
        if (rank >= 2) bump(j, rank);
      };
      check(x + 1, z);
      check(x, z + 1);
    }
  }
  for (let i = 0; i < mark.length; i++) {
    const rank = mark[i]!;
    if (!rank) continue;
    const o = i * 3;
    const p = session.provinces.get(ids[i]!);
    const water = p?.type === "sea" || p?.type === "lake";
    if (rank === 3 || rank === 4) {
      rgb[o] = 12;
      rgb[o + 1] = 10;
      rgb[o + 2] = 14;
    } else if (rank === 2) {
      rgb[o] = 236;
      rgb[o + 1] = 214;
      rgb[o + 2] = 148;
    } else if (water) {
      rgb[o] = 52;
      rgb[o + 1] = 84;
      rgb[o + 2] = 112;
    } else {
      rgb[o] = 22;
      rgb[o + 1] = 16;
      rgb[o + 2] = 12;
    }
  }
}

export function encodeIdMapPng(width: number, height: number, ids: Uint32Array): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    rgb[i * 3] = (id >> 16) & 255;
    rgb[i * 3 + 1] = (id >> 8) & 255;
    rgb[i * 3 + 2] = id & 255;
  }
  return encodePng({ width, height, data: rgb, channels: 3, depth: 8 });
}
