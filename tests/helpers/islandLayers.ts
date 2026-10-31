import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encode as encodePng } from "fast-png";

export function writeIslandLayers(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const width = 256;
  const height = 256;
  const heightmap = new Uint8Array(width * height);
  const political = new Uint8Array(width * height * 3);
  const landmask = new Uint8Array(width * height);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - 128) / 78;
      const dz = (z - 132) / 58;
      const island = dx * dx + dz * dz < 1;
      const peak = Math.max(0, 1 - Math.hypot(x - 110, z - 140) / 40);
      const ridge = Math.max(0, 1 - Math.abs((z - 120) - 0.4 * (x - 128)) / 18);
      const i = z * width + x;
      if (island) {
        landmask[i] = 255;
        heightmap[i] = Math.min(220, Math.round(110 + peak * 90 + ridge * 25));
        if (x < 128) {
          political[i * 3] = 196;
          political[i * 3 + 1] = 72;
          political[i * 3 + 2] = 48;
        } else {
          political[i * 3] = 48;
          political[i * 3 + 1] = 96;
          political[i * 3 + 2] = 168;
        }
      } else {
        heightmap[i] = 40;
      }
    }
  }
  writeFileSync(
    join(dir, "heightmap.png"),
    Buffer.from(encodePng({ width, height, data: heightmap, channels: 1, depth: 8 })),
  );
  writeFileSync(
    join(dir, "landmask.png"),
    Buffer.from(encodePng({ width, height, data: landmask, channels: 1, depth: 8 })),
  );
  writeFileSync(
    join(dir, "political.png"),
    Buffer.from(encodePng({ width, height, data: political, channels: 3, depth: 8 })),
  );
  writeFileSync(
    join(dir, "cities.csv"),
    "name,x,z,population\nWestport,96,140,120000\nEastgate,160,136,80000\n",
  );
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify(
      {
        name: "Sunset Isles",
        width: 256,
        height: 256,
        waterline: 94,
        wrap: false,
        edgeBands: false,
        seed: 7,
        provinceSpacing: 14,
        stateSize: 5,
        countries: [
          { tag: "SUN", name: "Sunset", color: [196, 72, 48] },
          { tag: "DAW", name: "Dawn", color: [48, 96, 168] },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  return dir;
}
