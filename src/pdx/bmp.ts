export type RgbRaster = {
  width: number;
  height: number;
  data: Uint8Array; // RGB, index = (z * width + x) * 3, z=0 south
};

export type IndexedRaster = {
  width: number;
  height: number;
  indices: Uint8Array; // index = z * width + x, z=0 south
  palette: Uint8Array; // RGB * 256
};

export type DecodedBmp =
  | ({ kind: "rgb" } & RgbRaster)
  | ({ kind: "indexed" } & IndexedRaster);

function rowSize(width: number, bpp: number): number {
  const bytes = Math.ceil((width * bpp) / 8);
  return (bytes + 3) & ~3;
}

export function encodeBmp24(raster: RgbRaster): Buffer {
  const { width, height, data } = raster;
  const stride = rowSize(width, 24);
  const pixelBytes = stride * height;
  const fileSize = 14 + 40 + pixelBytes;
  const buf = Buffer.alloc(fileSize);
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelBytes, 34);
  for (let z = 0; z < height; z++) {
    const dest = 54 + z * stride;
    for (let x = 0; x < width; x++) {
      const src = (z * width + x) * 3;
      buf[dest + x * 3] = data[src + 2]!;
      buf[dest + x * 3 + 1] = data[src + 1]!;
      buf[dest + x * 3 + 2] = data[src]!;
    }
  }
  return buf;
}

export function encodeBmpIndexed(raster: IndexedRaster): Buffer {
  const { width, height, indices } = raster;
  const palette = Buffer.alloc(256 * 4);
  const srcPal = raster.palette;
  for (let i = 0; i < 256; i++) {
    const r = srcPal[i * 3] ?? 0;
    const g = srcPal[i * 3 + 1] ?? 0;
    const b = srcPal[i * 3 + 2] ?? 0;
    palette[i * 4] = b;
    palette[i * 4 + 1] = g;
    palette[i * 4 + 2] = r;
  }
  const stride = rowSize(width, 8);
  const pixelBytes = stride * height;
  const off = 14 + 40 + palette.length;
  const fileSize = off + pixelBytes;
  const buf = Buffer.alloc(fileSize);
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(off, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28);
  buf.writeUInt32LE(256, 46);
  palette.copy(buf, 54);
  for (let z = 0; z < height; z++) {
    const dest = off + z * stride;
    for (let x = 0; x < width; x++) {
      buf[dest + x] = indices[z * width + x]!;
    }
  }
  return buf;
}

export function decodeBmp(input: Buffer | Uint8Array): DecodedBmp {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.toString("ascii", 0, 2) !== "BM") {
    throw new Error("Not a BMP file");
  }
  const off = buf.readUInt32LE(10);
  const headerSize = buf.readUInt32LE(14);
  const width = buf.readInt32LE(18);
  const heightSigned = buf.readInt32LE(22);
  const bottomUp = heightSigned > 0;
  const height = Math.abs(heightSigned);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (compression !== 0) {
    throw new Error(`Compressed BMP is not supported (compression=${compression})`);
  }
  if (bpp === 24) {
    const stride = rowSize(width, 24);
    const data = new Uint8Array(width * height * 3);
    for (let row = 0; row < height; row++) {
      const z = bottomUp ? row : height - 1 - row;
      const src = off + row * stride;
      for (let x = 0; x < width; x++) {
        const dest = (z * width + x) * 3;
        data[dest] = buf[src + x * 3 + 2]!;
        data[dest + 1] = buf[src + x * 3 + 1]!;
        data[dest + 2] = buf[src + x * 3]!;
      }
    }
    return { kind: "rgb", width, height, data };
  }
  if (bpp === 8) {
    const used = buf.readUInt32LE(46);
    const paletteCount = used > 0 ? used : 256;
    const paletteOff = 14 + headerSize;
    const palette = new Uint8Array(256 * 3);
    for (let i = 0; i < paletteCount; i++) {
      const p = paletteOff + i * 4;
      palette[i * 3] = buf[p + 2]!;
      palette[i * 3 + 1] = buf[p + 1]!;
      palette[i * 3 + 2] = buf[p]!;
    }
    const stride = rowSize(width, 8);
    const indices = new Uint8Array(width * height);
    for (let row = 0; row < height; row++) {
      const z = bottomUp ? row : height - 1 - row;
      const src = off + row * stride;
      for (let x = 0; x < width; x++) {
        indices[z * width + x] = buf[src + x]!;
      }
    }
    return { kind: "indexed", width, height, indices, palette };
  }
  throw new Error(`Unsupported BMP bitdepth ${bpp}`);
}
