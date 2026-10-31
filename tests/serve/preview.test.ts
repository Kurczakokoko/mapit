import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decode as decodePng } from "fast-png";
import { describe, expect, it } from "vitest";
import { loadMap } from "../../src/core/load.ts";
import { renderPoliticalPreview } from "../../src/serve/preview.ts";
import { writeTinyWorld } from "../helpers/tinyWorld.ts";

function rgbAt(data: ArrayLike<number>, channels: number, width: number, x: number, z: number): [number, number, number] {
  const o = (z * width + x) * channels;
  return [data[o]!, data[o + 1]!, data[o + 2]!];
}

describe("political preview borders", () => {
  it("draws dark province lines and gold state / country lines", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-preview-")));
    const session = await loadMap({ mapDir: root });
    const preview = renderPoliticalPreview(session);
    const img = decodePng(preview.png);
    const ch = img.channels;
    const w = img.width;
    const data = img.data;

    const interior = rgbAt(data, ch, w, 40, 10);
    expect(interior).toEqual([242, 205, 94]);

    const provinceEdge = rgbAt(data, ch, w, 84, 10);
    expect(provinceEdge[0]).toBeLessThan(40);
    expect(provinceEdge[1]).toBeLessThan(40);

    const countryEdge = rgbAt(data, ch, w, 169, 10);
    const isGold = countryEdge[0] > 180 && countryEdge[1] > 160 && countryEdge[2] < 180;
    const isBlack = countryEdge[0] < 40 && countryEdge[1] < 40 && countryEdge[2] < 40;
    expect(isGold || isBlack).toBe(true);
  });
});
