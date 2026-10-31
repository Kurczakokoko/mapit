import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateWorld } from "../../src/core/generate.ts";
import { loadMap } from "../../src/core/load.ts";
import { validate } from "../../src/core/validate.ts";
import { decodeBmp } from "../../src/pdx/bmp.ts";
import { writeIslandLayers } from "../helpers/islandLayers.ts";

describe("generateWorld from a layer pack", () => {
  it("writes a launchable overhaul: all map layers, organic provinces, no crash errors", async () => {
    const layers = writeIslandLayers(mkdtempSync(join(tmpdir(), "mapit-layers-")));
    const out = mkdtempSync(join(tmpdir(), "mapit-mod-"));
    const { report } = await generateWorld({ layersDir: layers, outDir: out, seed: 7 });
    expect(report.landProvinces).toBeGreaterThan(8);
    expect(report.seaProvinces).toBeGreaterThan(0);
    expect(report.states).toBeGreaterThan(1);
    expect(report.countries).toBe(2);
    expect(report.riverPixels).toBeGreaterThan(0);

    const provinces = decodeBmp(readFileSync(join(out, "map/provinces.bmp")));
    expect(provinces.kind).toBe("rgb");
    const heightmap = decodeBmp(readFileSync(join(out, "map/heightmap.bmp")));
    expect(heightmap.kind).toBe("indexed");
    const terrain = decodeBmp(readFileSync(join(out, "map/terrain.bmp")));
    expect(terrain.kind).toBe("indexed");
    const rivers = decodeBmp(readFileSync(join(out, "map/rivers.bmp")));
    expect(rivers.kind).toBe("indexed");
    const normal = decodeBmp(readFileSync(join(out, "map/world_normal.bmp")));
    expect(normal.kind).toBe("rgb");
    if (normal.kind === "rgb") {
      expect(normal.width).toBe(128);
      expect(normal.height).toBe(128);
    }

    const session = await loadMap({ mapDir: out });
    expect(session.countries.get("SUN")?.name).toBe("Sunset");
    expect(session.countries.get("DAW")?.name).toBe("Dawn");
    expect(existsSync(join(out, "map/trees.bmp"))).toBe(true);
    expect(existsSync(join(out, "map/terrain/colormap_rgb_cityemissivemask_a.dds"))).toBe(true);
    expect(existsSync(join(out, "map/buildings.txt"))).toBe(true);
    expect(existsSync(join(out, "map/railways.txt"))).toBe(true);
    expect(existsSync(join(out, "map/supply_nodes.txt"))).toBe(true);
    expect(readFileSync(join(out, "map/adjacencies.csv"), "utf8")).toMatch(/-1/);
    expect(readFileSync(join(out, "map/weatherpositions.txt"), "utf8")).toMatch(/small/);
    expect(readFileSync(join(out, "map/weatherpositions.txt"), "utf8")).toMatch(/big/);
    expect(existsSync(join(out, "common/bookmarks/the_gathering_storm.txt"))).toBe(true);
    expect(existsSync(join(out, "descriptor.mod"))).toBe(true);
    expect(readFileSync(join(out, "descriptor.mod"), "utf8")).toMatch(/replace_path="history\/states"/);
    const v = validate(session);
    expect(v.errors.map((e) => e.code)).toEqual([]);
    expect(session.xCrossings).toEqual([]);
  });
});
