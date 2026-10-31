import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMap } from "../../src/core/load.ts";
import { validate } from "../../src/core/validate.ts";
import { writeTinyWorld } from "../helpers/tinyWorld.ts";

describe("loadMap + validate on a synthetic overhaul", () => {
  it("loads provinces, states, regions, coastal flags and is clean", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-")));
    const session = await loadMap({ mapDir: root });
    expect(session.width).toBe(256);
    expect(session.height).toBe(256);
    expect(session.provinces.get(1)?.coastal).toBe(true);
    expect(session.provinces.get(3)?.coastal).toBe(false);
    expect(session.provinces.get(1)?.stateId).toBe(1);
    expect(session.provinces.get(4)?.type).toBe("sea");
    expect(session.states.get(1)?.owner).toBe("SPR");
    expect(session.countries.get("SPR")?.color).toEqual([242, 205, 94]);
    expect(session.countries.get("SPR")?.name).toBe("Spain");
    const result = validate(session);
    expect(result.errors.map((e) => e.code)).toEqual([]);
  });

  it("uses colors.txt for the political map over the country-file color", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-colors-")));
    writeFileSync(
      join(root, "common/countries/colors.txt"),
      `SPR = {
	color = rgb { 10 20 30 }
	color_ui = rgb { 255 0 0 }
}
POR = {
	color = HSV { 0.1 0.15 0.4 }
}
`,
    );
    const session = await loadMap({ mapDir: root });
    expect(session.countries.get("SPR")?.color).toEqual([10, 20, 30]);
    expect(session.countries.get("POR")?.color).toEqual([102, 96, 87]);
    expect(session.countries.get("SPA")?.color).toEqual([180, 40, 40]);
  });
});
