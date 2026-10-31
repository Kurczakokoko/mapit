import { existsSync, readFileSync } from "node:fs";
import { decode as decodePng } from "fast-png";

export type GreyImage = { width: number; height: number; data: Uint8Array };
export type RgbImage = { width: number; height: number; data: Uint8Array };

export function tryLoadPng(path: string): { width: number; height: number; data: Uint8Array; channels: number } | undefined {
  if (!existsSync(path)) return undefined;
  const png = decodePng(readFileSync(path));
  const channels = png.channels ?? Math.max(1, Math.round(png.data.length / (png.width * png.height)));
  return { width: png.width, height: png.height, data: png.data as Uint8Array, channels };
}

function sampleGrey(
  src: Uint8Array,
  sw: number,
  sh: number,
  channels: number,
  sx: number,
  sz: number,
): number {
  const x = Math.min(sw - 1, Math.max(0, sx));
  const z = Math.min(sh - 1, Math.max(0, sz));
  const i = (z * sw + x) * channels;
  if (channels === 1) return src[i]!;
  if (channels === 2) return src[i]!;
  return Math.round((src[i]! + src[i + 1]! + src[i + 2]!) / 3);
}

export function resampleGrey(
  src: { width: number; height: number; data: Uint8Array; channels: number },
  width: number,
  height: number,
  mode: "nearest" | "bilinear" = "bilinear",
): Uint8Array {
  const out = new Uint8Array(width * height);
  const { width: sw, height: sh, data, channels } = src;
  for (let z = 0; z < height; z++) {
    const fz = ((z + 0.5) * sh) / height - 0.5;
    for (let x = 0; x < width; x++) {
      const fx = ((x + 0.5) * sw) / width - 0.5;
      if (mode === "nearest") {
        out[z * width + x] = sampleGrey(data, sw, sh, channels, Math.round(fx), Math.round(fz));
        continue;
      }
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const tx = fx - x0;
      const tz = fz - z0;
      const a = sampleGrey(data, sw, sh, channels, x0, z0);
      const b = sampleGrey(data, sw, sh, channels, x0 + 1, z0);
      const c = sampleGrey(data, sw, sh, channels, x0, z0 + 1);
      const d = sampleGrey(data, sw, sh, channels, x0 + 1, z0 + 1);
      out[z * width + x] = Math.round(a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz);
    }
  }
  return out;
}

export function resampleRgb(
  src: { width: number; height: number; data: Uint8Array; channels: number },
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  const { width: sw, height: sh, data, channels } = src;
  for (let z = 0; z < height; z++) {
    const sz = Math.min(sh - 1, Math.max(0, Math.floor((z * sh) / height)));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sw - 1, Math.max(0, Math.floor((x * sw) / width)));
      const i = (sz * sw + sx) * channels;
      const o = (z * width + x) * 3;
      if (channels === 1) {
        out[o] = out[o + 1] = out[o + 2] = data[i]!;
      } else {
        out[o] = data[i]!;
        out[o + 1] = data[i + 1] ?? data[i]!;
        out[o + 2] = data[i + 2] ?? data[i]!;
      }
    }
  }
  return out;
}

/** Uncompressed 32-bit TGA, BGRA, bottom-left origin, opaque alpha (vanilla 1.19 flags). */
export function encodeTga32(width: number, height: number, rgb: Uint8Array): Buffer {
  const buf = Buffer.alloc(18 + width * height * 4);
  buf[2] = 2;
  buf.writeUInt16LE(width, 12);
  buf.writeUInt16LE(height, 14);
  buf[16] = 32;
  buf[17] = 8;
  for (let z = 0; z < height; z++) {
    const destRow = 18 + z * width * 4;
    for (let x = 0; x < width; x++) {
      const src = (z * width + x) * 3;
      const d = destRow + x * 4;
      buf[d] = rgb[src + 2]!;
      buf[d + 1] = rgb[src + 1]!;
      buf[d + 2] = rgb[src]!;
      buf[d + 3] = 255;
    }
  }
  return buf;
}

export function encodeTga24(width: number, height: number, rgb: Uint8Array): Buffer {
  return encodeTga32(width, height, rgb);
}

export function solidTga(width: number, height: number, rgb: [number, number, number]): Buffer {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = rgb[0];
    data[i * 3 + 1] = rgb[1];
    data[i * 3 + 2] = rgb[2];
  }
  return encodeTga32(width, height, data);
}

/** Uncompressed A8R8G8B8 DDS, no mipmaps (HOI4 colormap). First row is north (high z). */
export function encodeDdsArgb(width: number, height: number, rgbaTopDown: Uint8Array): Buffer {
  const header = Buffer.alloc(128);
  header.write("DDS ", 0);
  header.writeUInt32LE(124, 4);
  const DDSD_CAPS = 0x1;
  const DDSD_HEIGHT = 0x2;
  const DDSD_WIDTH = 0x4;
  const DDSD_PITCH = 0x8;
  const DDSD_PIXELFORMAT = 0x1000;
  header.writeUInt32LE(DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PITCH | DDSD_PIXELFORMAT, 8);
  header.writeUInt32LE(height, 12);
  header.writeUInt32LE(width, 16);
  header.writeUInt32LE(width * 4, 20);
  header.writeUInt32LE(32, 76);
  header.writeUInt32LE(0x41, 80);
  header.writeUInt32LE(32, 88);
  header.writeUInt32LE(0x00ff0000, 92);
  header.writeUInt32LE(0x0000ff00, 96);
  header.writeUInt32LE(0x000000ff, 100);
  header.writeUInt32LE(0xff000000, 104);
  header.writeUInt32LE(0x1000, 108);
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const r = rgbaTopDown[i * 4]!;
    const g = rgbaTopDown[i * 4 + 1]!;
    const b = rgbaTopDown[i * 4 + 2]!;
    const a = rgbaTopDown[i * 4 + 3]!;
    pixels[i * 4] = b;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = r;
    pixels[i * 4 + 3] = a;
  }
  return Buffer.concat([header, pixels]);
}
