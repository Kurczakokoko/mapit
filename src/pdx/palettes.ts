/**
 * HOI4 bitmap colour tables. The engine keys off palette *indices*, not RGB,
 * so these must stay in vanilla order. Values are the base-game RGBs
 * (public map-modding wiki); we never ship Paradox image assets.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeBmp } from "./bmp.ts";

export const TERRAIN_INDEX = {
  plains: 0,
  forest: 1,
  hills: 2,
  desert: 3,
  sparseForest: 4,
  farmland: 5,
  mountain: 6,
  marsh: 9,
  urban: 13,
  lakes: 14,
  ocean: 15,
  snow: 16,
} as const;

/** definition.csv terrain for a terrain.bmp index */
export const DEFINITION_TERRAIN: Record<number, string> = {
  0: "plains",
  1: "forest",
  2: "hills",
  3: "desert",
  4: "forest",
  5: "plains",
  6: "mountain",
  7: "desert",
  8: "desert",
  9: "marsh",
  10: "mountain",
  11: "mountain",
  12: "desert",
  13: "urban",
  14: "lakes",
  15: "ocean",
  16: "mountain",
  17: "hills",
  18: "mountain",
};

export const TERRAIN_RGB: [number, number, number][] = [
  [86, 124, 27],
  [0, 86, 6],
  [112, 74, 31],
  [206, 169, 99],
  [6, 200, 11],
  [255, 0, 24],
  [134, 84, 30],
  [252, 255, 0],
  [73, 59, 15],
  [75, 147, 174],
  [174, 0, 255],
  [92, 83, 76],
  [255, 0, 240],
  [240, 255, 0],
  [55, 90, 220],
  [8, 31, 130],
  [255, 255, 255],
  [132, 255, 0],
  [255, 126, 0],
  [114, 137, 105],
];

export const RIVER_SOURCE = 0;
export const RIVER_JOIN = 1;
export const RIVER_SPLIT = 2;
export const RIVER_WIDTH0 = 3;
export const RIVER_SEA = 254;
export const RIVER_LAND = 255;

const RIVER_RGB: [number, number, number][] = [
  [0, 255, 0],
  [255, 0, 0],
  [255, 252, 0],
  [0, 225, 255],
  [0, 200, 255],
  [0, 150, 255],
  [0, 100, 255],
  [0, 0, 255],
  [0, 0, 225],
  [0, 0, 200],
  [0, 0, 150],
  [0, 0, 100],
];

const TREE_RGB: [number, number, number][] = [
  [0, 0, 0],
  [255, 0, 0],
  [30, 139, 109],
  [18, 100, 78],
  [8, 58, 44],
  [76, 156, 51],
  [47, 120, 24],
  [20, 85, 0],
  [154, 156, 51],
  [118, 120, 24],
  [83, 85, 0],
  [255, 255, 0],
  [213, 160, 0],
  [0, 183, 0],
  [0, 128, 0],
  [0, 60, 0],
];

export const TREE_INDICES = { dense: 3, mid: 4, sparse: 7, jungle: 10 } as const;

function fillPalette(entries: [number, number, number][], rest: "grey" | "black" = "grey"): Uint8Array {
  const pal = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const e = entries[i];
    if (e) {
      pal[i * 3] = e[0];
      pal[i * 3 + 1] = e[1];
      pal[i * 3 + 2] = e[2];
    } else if (rest === "grey") {
      pal[i * 3] = pal[i * 3 + 1] = pal[i * 3 + 2] = i;
    }
  }
  return pal;
}

export function greyPalette(): Uint8Array {
  return fillPalette([], "grey");
}

export function terrainPalette(): Uint8Array {
  const pal = fillPalette(TERRAIN_RGB, "grey");
  return pal;
}

export function riverPalette(): Uint8Array {
  const pal = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    pal[i * 3] = 2;
    pal[i * 3 + 1] = 0;
    pal[i * 3 + 2] = 1;
  }
  for (let i = 0; i < RIVER_RGB.length; i++) {
    const e = RIVER_RGB[i]!;
    pal[i * 3] = e[0];
    pal[i * 3 + 1] = e[1];
    pal[i * 3 + 2] = e[2];
  }
  pal[RIVER_SEA * 3] = pal[RIVER_SEA * 3 + 1] = pal[RIVER_SEA * 3 + 2] = 122;
  pal[RIVER_LAND * 3] = pal[RIVER_LAND * 3 + 1] = pal[RIVER_LAND * 3 + 2] = 255;
  return pal;
}

export function treePalette(): Uint8Array {
  return fillPalette(TREE_RGB, "grey");
}

export function paletteFromBmp(path: string): Uint8Array | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const decoded = decodeBmp(readFileSync(path));
    if (decoded.kind !== "indexed") return undefined;
    return decoded.palette;
  } catch {
    return undefined;
  }
}

export function palettesFromGame(gamePath?: string): {
  terrain: Uint8Array;
  rivers: Uint8Array;
  trees: Uint8Array;
  heightmap: Uint8Array;
} {
  const map = gamePath ? join(gamePath, "map") : "";
  return {
    terrain: (map && paletteFromBmp(join(map, "terrain.bmp"))) || terrainPalette(),
    rivers: (map && paletteFromBmp(join(map, "rivers.bmp"))) || riverPalette(),
    trees: (map && paletteFromBmp(join(map, "trees.bmp"))) || treePalette(),
    heightmap: greyPalette(),
  };
}

export function nearestTerrainIndex(r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < TERRAIN_RGB.length; i++) {
    const c = TERRAIN_RGB[i]!;
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
