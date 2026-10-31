import { describe, expect, it } from "vitest";
import { extractRivers, flowAccumulation, flowDirection } from "../../src/core/flow.ts";
import { RIVER_LAND, RIVER_SEA } from "../../src/pdx/palettes.ts";

describe("hydrology", () => {
  it("drains a west-to-east ramp into the sea and paints a 1px river", () => {
    const width = 32;
    const height = 16;
    const isLand = new Uint8Array(width * height);
    const heightmap = new Uint8Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const i = z * width + x;
        if (x < 4) {
          heightmap[i] = 89;
        } else {
          isLand[i] = 1;
          heightmap[i] = 96 + x;
        }
      }
    }
    const dir = flowDirection(width, height, heightmap, isLand, false);
    const acc = flowAccumulation(width, height, isLand, dir, false);
    let max = 0;
    for (const v of acc) if (v > max) max = v;
    expect(max).toBeGreaterThan(10);
    const { indices, riverPixels, sources } = extractRivers({
      width,
      height,
      isLand,
      heightmap,
      wrap: false,
      spacingPx: 8,
    });
    expect(riverPixels).toBeGreaterThan(0);
    expect(sources).toBeGreaterThan(0);
    for (let i = 0; i < indices.length; i++) {
      if (!isLand[i]) expect(indices[i]).toBe(RIVER_SEA);
    }
    const isPainted = (v: number) => v !== RIVER_LAND && v !== RIVER_SEA;
    for (let x = 0; x < width; x++) {
      expect(isPainted(indices[x]!)).toBe(false);
      expect(isPainted(indices[(height - 1) * width + x]!)).toBe(false);
    }
  });
});
