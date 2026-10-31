import { describe, expect, it } from "vitest";
import {
  hsvToRgb,
  parseColorsTxt,
  parseCountryColor,
} from "../../src/pdx/mapfiles.ts";

describe("country colors", () => {
  it("reads bare, rgb, and hsv country-file colors and skips color_ui", () => {
    expect(parseCountryColor("color = { 152  130  191 }\n")).toEqual([152, 130, 191]);
    expect(parseCountryColor("color = rgb { 104 152 83 }\n")).toEqual([104, 152, 83]);
    expect(parseCountryColor("color = HSV { 0.1 0.15 0.4 }\n")).toEqual(hsvToRgb(0.1, 0.15, 0.4));
    expect(
      parseCountryColor(`color_ui = rgb { 1 2 3 }
color = rgb { 71 130 175 }
`),
    ).toEqual([71, 130, 175]);
    expect(parseCountryColor("color_ui = { 9 9 9 }\n")).toBeUndefined();
  });

  it("parses colors.txt political-map blocks, last rgb not color_ui", async () => {
    const map = await parseColorsTxt(`
ALG = {
	color = rgb { 104 152 83 }
	color_ui = rgb { 1 2 3 }
}
GER = {
	color = HSV { 0.1 0.15 0.4 }
	color_ui = rgb { 138 155 116 }
}
USA = {
	color = { 71 130 175 }
}
GHA = {
	color = rgb { 203 186 101 }
}
`);
    expect(map.get("ALG")).toEqual([104, 152, 83]);
    expect(map.get("GHA")).toEqual([203, 186, 101]);
    expect(map.get("USA")).toEqual([71, 130, 175]);
    expect(map.get("GER")).toEqual(hsvToRgb(0.1, 0.15, 0.4));
    expect(hsvToRgb(0.1, 0.15, 0.4)).toEqual([102, 96, 87]);
  });
});
