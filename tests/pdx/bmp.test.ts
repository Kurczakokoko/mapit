import { describe, expect, it } from "vitest";
import {
  decodeBmp,
  encodeBmp24,
  encodeBmpIndexed,
  type RgbRaster,
} from "../../src/pdx/bmp.ts";

function rgb(width: number, height: number, pixels: number[]): RgbRaster {
  return { width, height, data: Uint8Array.from(pixels) };
}

describe("24-bit BMP (provinces / world_normal)", () => {
  it("encodes BITMAPINFOHEADER, BGR, bottom-up, 4-byte row padding", () => {
    // z=0 south: red, green; z=1 north: blue, white. Internal: z * width + x.
    const raster = rgb(2, 2, [
      255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255,
    ]);
    const buf = encodeBmp24(raster);
    expect(buf.toString("ascii", 0, 2)).toBe("BM");
    expect(buf.readUInt32LE(2)).toBe(70); // 14 + 40 + 16
    expect(buf.readUInt32LE(10)).toBe(54);
    expect(buf.readUInt32LE(14)).toBe(40); // BITMAPINFOHEADER
    expect(buf.readInt32LE(18)).toBe(2);
    expect(buf.readInt32LE(22)).toBe(2);
    expect(buf.readUInt16LE(28)).toBe(24);
    expect(buf.readUInt32LE(30)).toBe(0); // no compression
    // first file row = z=0: red then green, BGR, pad 2
    expect([...buf.subarray(54, 62)]).toEqual([0, 0, 255, 0, 255, 0, 0, 0]);
    // second file row = z=1: blue then white
    expect([...buf.subarray(62, 70)]).toEqual([255, 0, 0, 255, 255, 255, 0, 0]);
  });

  it("round-trips RGB data", () => {
    const raster = rgb(2, 2, [
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
    const decoded = decodeBmp(encodeBmp24(raster));
    expect(decoded.kind).toBe("rgb");
    if (decoded.kind !== "rgb") throw new Error("expected rgb");
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect([...decoded.data]).toEqual([...raster.data]);
  });
});

describe("8-bit indexed BMP (heightmap / terrain / rivers)", () => {
  it("writes a 256-entry palette and preserves indices", () => {
    const palette = new Uint8Array(256 * 3);
    palette[0] = 10;
    palette[1] = 20;
    palette[2] = 30;
    palette[3] = 40;
    palette[4] = 50;
    palette[5] = 60;
    const indices = new Uint8Array([0, 1, 1, 0]);
    const buf = encodeBmpIndexed({
      width: 2,
      height: 2,
      indices,
      palette,
    });
    expect(buf.readUInt32LE(14)).toBe(40);
    expect(buf.readUInt16LE(28)).toBe(8);
    expect(buf.readUInt32LE(10)).toBe(14 + 40 + 1024);
    const decoded = decodeBmp(buf);
    expect(decoded.kind).toBe("indexed");
    if (decoded.kind !== "indexed") throw new Error("expected indexed");
    expect([...decoded.indices]).toEqual([0, 1, 1, 0]);
    expect(decoded.palette[0]).toBe(10);
    expect(decoded.palette[1]).toBe(20);
    expect(decoded.palette[2]).toBe(30);
  });

  it("reads 8-bit files whose DIB header is BITMAPV5HEADER (biSize 124)", () => {
    // Minimal V5 header: 14 + 124 + 4-byte palette * 2 used colours + pixels
    const width = 2;
    const height = 2;
    const used = 2;
    const headerSize = 124;
    const paletteBytes = used * 4;
    const off = 14 + headerSize + paletteBytes;
    const rowSize = 4; // 2 indices + 2 pad
    const fileSize = off + rowSize * height;
    const buf = Buffer.alloc(fileSize);
    buf.write("BM", 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(off, 10);
    buf.writeUInt32LE(headerSize, 14);
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(8, 28);
    buf.writeUInt32LE(0, 30);
    buf.writeUInt32LE(used, 46);
    // palette BGRA
    buf[14 + headerSize + 0] = 1;
    buf[14 + headerSize + 1] = 2;
    buf[14 + headerSize + 2] = 3;
    buf[14 + headerSize + 4] = 4;
    buf[14 + headerSize + 5] = 5;
    buf[14 + headerSize + 6] = 6;
    // rows bottom-up: z=0 indices 0,1 then z=1 indices 1,0
    buf[off + 0] = 0;
    buf[off + 1] = 1;
    buf[off + rowSize] = 1;
    buf[off + rowSize + 1] = 0;
    const decoded = decodeBmp(buf);
    expect(decoded.kind).toBe("indexed");
    if (decoded.kind !== "indexed") throw new Error("expected indexed");
    expect([...decoded.indices]).toEqual([0, 1, 1, 0]);
    expect([...decoded.palette.subarray(0, 6)]).toEqual([3, 2, 1, 6, 5, 4]);
  });
});
