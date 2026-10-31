import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMap } from "../../src/core/load.ts";
import { encodePreviewBin, PREVIEW_MAGIC, renderPoliticalPreview } from "../../src/serve/preview.ts";
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
    const w = preview.width;
    const data = preview.rgb;
    const ch = 3;

    const pngZ = (iz: number) => preview.height - 1 - iz;
    // z=0 is south in the IR; preview row 0 is north. tinyWorld sea is at high z.
    expect(rgbAt(data, ch, w, 40, 0)).toEqual([18, 42, 64]);
    expect(rgbAt(data, ch, w, 40, preview.height - 1)).toEqual([242, 205, 94]);
    const interior = rgbAt(data, ch, w, 40, pngZ(10));
    expect(interior).toEqual([242, 205, 94]);

    const provinceEdge = rgbAt(data, ch, w, 84, pngZ(10));
    expect(provinceEdge[0]).toBeLessThan(40);
    expect(provinceEdge[1]).toBeLessThan(40);

    const countryEdge = rgbAt(data, ch, w, 169, pngZ(10));
    const isGold = countryEdge[0] > 180 && countryEdge[1] > 160 && countryEdge[2] < 180;
    const isBlack = countryEdge[0] < 40 && countryEdge[1] < 40 && countryEdge[2] < 40;
    expect(isGold || isBlack).toBe(true);
  });

  it("packs RGB and province ids into an MPIT buffer", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-preview-bin-")));
    const session = await loadMap({ mapDir: root });
    const preview = renderPoliticalPreview(session);
    const bin = encodePreviewBin(preview);
    const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    expect(view.getUint32(0, false)).toBe(PREVIEW_MAGIC);
    expect(view.getUint32(4, true)).toBe(1);
    expect(view.getUint32(8, true)).toBe(preview.width);
    expect(view.getUint32(12, true)).toBe(preview.height);
    const rgbLen = preview.width * preview.height * 3;
    expect(bin.subarray(16, 16 + 3)).toEqual(preview.rgb.subarray(0, 3));
    const ids = new Uint32Array(bin.buffer, bin.byteOffset + 16 + rgbLen, preview.width * preview.height);
    expect(ids[0]).toBe(preview.ids[0]);
    expect(ids[preview.ids.length - 1]).toBe(preview.ids[preview.ids.length - 1]);
  });
});
