import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splitWrapRing } from "../../src/atlas/outline.ts";
import { buildAtlasJson, renderSvg, writeAtlas } from "../../src/atlas/render.ts";
import { parseSelector, selectProvinces } from "../../src/atlas/select.ts";
import { loadMap } from "../../src/core/load.ts";
import { writeTinyWorld } from "../helpers/tinyWorld.ts";

describe("atlas", () => {
  it("dumps SPR with province IDs in JSON and SVG", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-atlas-")));
    const session = await loadMap({ mapDir: root });
    const selector = parseSelector("SPR");
    const provinces = selectProvinces(session, selector);
    expect(provinces.map((p) => p.id).sort()).toEqual([1, 2]);
    const atlas = buildAtlasJson(session, selector, provinces);
    expect(atlas.provinces.some((p) => p.id === 1 && p.owner === "SPR")).toBe(true);
    const one = atlas.provinces.find((p) => p.id === 1)!;
    expect(one.region).toBe(1);
    expect(one.pixels).toBeGreaterThan(0);
    expect(one.bbox.minX).toBe(0);
    expect(one.claims).toEqual([]);
    expect(one.cores).toContain("SPR");
    const svg = renderSvg(session, atlas, provinces);
    expect(svg).toContain(">1</text>");
    expect(svg).toContain(">2</text>");
    const out = join(root, "out");
    writeAtlas(out, atlas, svg);
    const json = JSON.parse(readFileSync(join(out, "atlas.json"), "utf8"));
    expect(json.mapit).toBe(1);
    expect(readFileSync(join(out, "atlas.html"), "utf8")).toContain("Province");
  });

  it("splits date-line rings so SVG paths do not slash the map", () => {
    const parts = splitWrapRing(
      [
        { x: 0, z: 4 },
        { x: 3, z: 4 },
        { x: 3, z: 5 },
        { x: 253, z: 5 },
        { x: 253, z: 4 },
        { x: 255, z: 4 },
      ],
      256,
    );
    expect(parts.length).toBe(2);
    expect(Math.max(...parts[0]!.map((p) => p.x))).toBeLessThan(10);
    expect(Math.min(...parts[1]!.map((p) => p.x))).toBeGreaterThan(240);
  });
});
