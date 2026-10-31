import { describe, expect, it } from "vitest";
import { buildGraph } from "../../src/core/graph.ts";
import { UNKNOWN_PROVINCE } from "../../src/core/ir.ts";
import type { ProvinceDef } from "../../src/pdx/definition.ts";

function paint(
  width: number,
  height: number,
  fill: (x: number, z: number) => [number, number, number],
): Uint8Array {
  const data = new Uint8Array(width * height * 3);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, z);
      const i = (z * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return data;
}

const defs: ProvinceDef[] = [
  { id: 1, r: 255, g: 0, b: 0, type: "land", coastal: false, terrain: "plains", continent: 1 },
  { id: 2, r: 0, g: 255, b: 0, type: "land", coastal: false, terrain: "plains", continent: 1 },
  { id: 3, r: 0, g: 0, b: 255, type: "sea", coastal: false, terrain: "ocean", continent: 0 },
];

describe("buildGraph", () => {
  it("marks land-sea adjacency as coastal and records neighbors", () => {
    // 4x4: south two rows land split east/west, north two rows sea
    const rgb = paint(4, 4, (x, z) => {
      if (z >= 2) return [0, 0, 255];
      return x < 2 ? [255, 0, 0] : [0, 255, 0];
    });
    const g = buildGraph(4, 4, rgb, defs);
    const a = g.provinces.get(1)!;
    const b = g.provinces.get(2)!;
    const sea = g.provinces.get(3)!;
    expect(a.pixels).toBe(4);
    expect(b.pixels).toBe(4);
    expect(sea.pixels).toBe(8);
    expect(a.coastal).toBe(true);
    expect(b.coastal).toBe(true);
    expect(sea.coastal).toBe(true);
    expect(a.neighbors).toEqual([2, 3]);
    expect(a.centroid.x).toBeCloseTo(0.5);
    expect(a.centroid.z).toBeCloseTo(0.5);
  });

  it("detects a four-colour X-crossing including wrap", () => {
    const four: ProvinceDef[] = [
      ...defs,
      { id: 4, r: 255, g: 255, b: 0, type: "land", coastal: false, terrain: "plains", continent: 1 },
    ];
    const rgb = paint(4, 2, (x, z) => {
      if (z === 0 && x === 0) return [255, 0, 0];
      if (z === 0 && x === 1) return [0, 255, 0];
      if (z === 1 && x === 0) return [0, 0, 255];
      if (z === 1 && x === 1) return [255, 255, 0];
      return [255, 0, 0];
    });
    const g = buildGraph(4, 2, rgb, four);
    expect(g.xCrossings.some((p) => p.x === 0 && p.z === 0)).toBe(true);
  });

  it("counts pixels whose colour is missing from definition.csv", () => {
    const rgb = paint(2, 2, () => [9, 9, 9]);
    const g = buildGraph(2, 2, rgb, defs);
    expect(g.unknownPixels).toBe(4);
    expect(g.idGrid[0]).toBe(UNKNOWN_PROVINCE);
  });
});
