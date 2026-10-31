import { basename, join } from "node:path";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
    expect(report.cities).toBeGreaterThanOrEqual(2);

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
    expect(
      [...session.countries.values()].filter((c) => !c.dynamic).map((c) => c.tag).sort(),
    ).toEqual(["DAW", "SUN"]);
    expect(session.countries.get("D01")?.dynamic).toBe(true);
    expect([...session.states.values()].some((s) => s.name === "Westport")).toBe(true);
    for (const rw of session.railways) {
      for (let i = 0; i < rw.provinces.length - 1; i++) {
        const a = session.provinces.get(rw.provinces[i]!)!;
        expect(a.neighbors).toContain(rw.provinces[i + 1]);
      }
    }
    const dds = readFileSync(join(out, "map/terrain/colormap_rgb_cityemissivemask_a.dds"));
    expect(dds.readUInt32LE(12)).toBe(128);
    expect(dds.readUInt32LE(16)).toBe(128);
    expect(existsSync(join(out, "map/terrain/colormap_water_0.dds"))).toBe(true);
    const flag = readFileSync(join(out, "gfx/flags/SUN.tga"));
    expect(flag[16]).toBe(32);
    expect(flag[17]).toBe(8);
    expect(existsSync(join(out, "..", `${basename(out)}.mod`))).toBe(true);
    expect(readFileSync(join(out, "common/country_tags/zz_dynamic_countries.txt"), "utf8")).toMatch(/dynamic_tags/);
    expect(readFileSync(join(out, "descriptor.mod"), "utf8")).not.toMatch(/replace_path="events"/);
    expect(readFileSync(join(out, "history/countries/SUN - Sunset.txt"), "utf8")).toMatch(/capital = 1/);
    expect(readFileSync(join(out, "map/unitstacks.txt"), "utf8").length).toBeGreaterThan(0);
    expect(existsSync(join(out, "map/trees.bmp"))).toBe(true);
    expect(existsSync(join(out, "map/terrain/colormap_rgb_cityemissivemask_a.dds"))).toBe(true);
    expect(existsSync(join(out, "map/buildings.txt"))).toBe(true);
    expect(existsSync(join(out, "map/railways.txt"))).toBe(true);
    expect(existsSync(join(out, "map/supply_nodes.txt"))).toBe(true);
    expect(readFileSync(join(out, "map/adjacencies.csv"), "utf8")).toMatch(/-1/);
    expect(readFileSync(join(out, "map/weatherpositions.txt"), "utf8")).toMatch(/small/);
    expect(readFileSync(join(out, "map/weatherpositions.txt"), "utf8")).toMatch(/big/);
    expect(existsSync(join(out, "common/bookmarks/the_gathering_storm.txt"))).toBe(true);
    expect(existsSync(join(out, "common/bookmarks/blitzkrieg.txt"))).toBe(true);
    expect(readFileSync(join(out, "history/countries/SUN - Sunset.txt"), "utf8")).toMatch(/1939\.1\.1/);
    expect(existsSync(join(out, "history/units/SUN_1939.txt"))).toBe(true);
    expect(existsSync(join(out, "descriptor.mod"))).toBe(true);
    expect(readFileSync(join(out, "descriptor.mod"), "utf8")).toMatch(/replace_path="history\/states"/);
    const v = validate(session);
    expect(v.errors.map((e) => e.code)).toEqual([]);
    expect(session.xCrossings).toEqual([]);
  });

  it("preview writes report PNGs, validates, and skips a kept mod", async () => {
    const layers = writeIslandLayers(mkdtempSync(join(tmpdir(), "mapit-layers-prev-")));
    const out = mkdtempSync(join(tmpdir(), "mapit-prev-"));
    const { report } = await generateWorld({ layersDir: layers, outDir: out, seed: 7, preview: true });
    expect(existsSync(join(out, "preview-provinces.png"))).toBe(true);
    expect(existsSync(join(out, "mapit-generate-report.json"))).toBe(true);
    expect(existsSync(join(out, "map/provinces.bmp"))).toBe(false);
    expect(report.cities).toBeGreaterThanOrEqual(2);
    expect(report.errors).toEqual([]);
  });
});
