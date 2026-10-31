import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MapSession, Province } from "../core/ir.ts";
import { provinceRings } from "./outline.ts";
import { deriveFronts, type Selector } from "./select.ts";

export type AtlasJson = {
  mapit: 1;
  selection: Selector;
  extent: { minX: number; minZ: number; maxX: number; maxZ: number };
  brushes: Record<string, { name: string; color: string }>;
  provinces: {
    id: number;
    type: string;
    coastal: boolean;
    terrain: string;
    state?: number;
    stateName?: string;
    region?: number;
    owner?: string;
    controller?: string;
    cores: string[];
    claims: string[];
    vp?: number;
    buildings: Record<string, number>;
    navalSea?: number;
    pixels: number;
    bbox: { minX: number; minZ: number; maxX: number; maxZ: number };
    neighbors: number[];
    centroid: { x: number; z: number };
  }[];
  states: { id: number; name: string; owner?: string; provinces: number[] }[];
  fronts: { a: string; b: string; provinces: [number, number][] }[];
};

function cssColor(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function ownerOf(session: MapSession, p: Province): string | undefined {
  if (p.stateId === undefined) return undefined;
  return session.states.get(p.stateId)?.owner;
}

export function buildAtlasJson(session: MapSession, selector: Selector, provinces: Province[]): AtlasJson {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of provinces) {
    minX = Math.min(minX, p.bbox.minX);
    minZ = Math.min(minZ, p.bbox.minZ);
    maxX = Math.max(maxX, p.bbox.maxX);
    maxZ = Math.max(maxZ, p.bbox.maxZ);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minZ = 0;
    maxX = session.width - 1;
    maxZ = session.height - 1;
  }
  const brushes: AtlasJson["brushes"] = {};
  for (const c of session.countries.values()) {
    brushes[c.tag] = { name: c.name, color: cssColor(c.color) };
  }
  const stateIds = new Set(provinces.map((p) => p.stateId).filter((id): id is number => id !== undefined));
  return {
    mapit: 1,
    selection: selector,
    extent: { minX, minZ, maxX, maxZ },
    brushes,
    provinces: provinces.map((p) => {
      const st = p.stateId !== undefined ? session.states.get(p.stateId) : undefined;
      const vp = st?.victoryPoints.find((v) => v.province === p.id)?.value;
      const buildings: Record<string, number> = {};
      for (const b of st?.provincialBuildings ?? []) {
        if (b.province === p.id) buildings[b.type] = b.level;
      }
      const naval = session.buildings.find(
        (b) =>
          (b.building === "naval_base" || b.building === "floating_harbor") &&
          Math.hypot(b.x - p.centroid.x, b.z - p.centroid.z) < 3,
      );
      return {
        id: p.id,
        type: p.type,
        coastal: p.coastal,
        terrain: p.terrain,
        state: p.stateId,
        stateName: st?.name,
        region: p.regionId,
        owner: st?.owner,
        controller: st?.controller,
        cores: st?.cores ?? [],
        claims: st?.claims ?? [],
        vp,
        buildings,
        navalSea: naval?.seaProvince || undefined,
        pixels: p.pixels,
        bbox: p.bbox,
        neighbors: p.neighbors,
        centroid: p.centroid,
      };
    }),
    states: [...stateIds].map((id) => {
      const st = session.states.get(id)!;
      return { id: st.id, name: st.name, owner: st.owner, provinces: st.provinces };
    }),
    fronts: deriveFronts(session, provinces),
  };
}

export function renderSvg(session: MapSession, atlas: AtlasJson, provinces: Province[]): string {
  const { minX, minZ, maxX, maxZ } = atlas.extent;
  const w = maxX - minX + 1;
  const h = maxZ - minZ + 1;
  const toSvg = (x: number, z: number) => ({
    x: x - minX,
    y: maxZ - z,
  });
  const labelSize = Math.max(8, Math.min(18, Math.floor(Math.sqrt((w * h) / Math.max(provinces.length, 1)) / 6)));
  const paths: string[] = [];
  for (const p of provinces) {
    const rings = provinceRings(session, p.id);
    const owner = ownerOf(session, p);
    const fill = owner && atlas.brushes[owner] ? atlas.brushes[owner]!.color : `rgb(${p.r},${p.g},${p.b})`;
    let d = "";
    if (rings.length && rings[0]!.length > 2) {
      d = rings
        .map((ring) => {
          const pts = ring.map((pt) => toSvg(pt.x, pt.z));
          const close = rings.length === 1 ? " Z" : "";
          return `M ${pts[0]!.x} ${pts[0]!.y} ` + pts.slice(1).map((pt) => `L ${pt.x} ${pt.y}`).join(" ") + close;
        })
        .join(" ");
    } else {
      const a = toSvg(p.bbox.minX, p.bbox.maxZ);
      const bw = p.bbox.maxX - p.bbox.minX + 1;
      const bh = p.bbox.maxZ - p.bbox.minZ + 1;
      d = `M ${a.x} ${a.y} h ${bw} v ${bh} h ${-bw} Z`;
    }
    const c = toSvg(p.centroid.x, p.centroid.z);
    paths.push(
      `<g data-id="${p.id}" data-owner="${owner ?? ""}">` +
        `<path d="${d}" fill="${fill}" fill-opacity="0.85" stroke="#111" stroke-width="0.6"/>` +
        `<text x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" font-size="${labelSize}" text-anchor="middle" dominant-baseline="middle" fill="#fff" stroke="#000" stroke-width="0.4" paint-order="stroke">${p.id}</text>` +
        `</g>`,
    );
  }
  const legend = Object.entries(atlas.brushes)
    .filter(([tag]) => provinces.some((p) => ownerOf(session, p) === tag))
    .map(
      ([tag, b], i) =>
        `<g transform="translate(8 ${h + 16 + i * 16})"><rect width="12" height="12" fill="${b.color}"/><text x="16" y="10" font-size="11" fill="#eee">${tag} ${b.name}</text></g>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h + 24 + Object.keys(atlas.brushes).length * 16}" width="${Math.min(1600, w)}" height="${Math.min(900, h)}">
  <rect width="100%" height="100%" fill="#101418"/>
  ${paths.join("\n  ")}
  ${legend}
</svg>
`;
}

export function renderHtml(atlas: AtlasJson, svg: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Mapit atlas</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; background: #0b0d10; color: #e8eaed; }
    header { padding: 12px 18px; border-bottom: 1px solid #222; display: flex; gap: 16px; align-items: baseline; }
    h1 { font-size: 16px; margin: 0; letter-spacing: 0.04em; }
    .meta { color: #9aa0a6; }
    .stage { overflow: auto; height: calc(100vh - 52px); padding: 16px; }
    svg { max-width: 100%; height: auto; background: #101418; }
    #info { position: fixed; right: 16px; top: 64px; width: 280px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; display: none; }
  </style>
</head>
<body>
  <header>
    <h1>MAPIT</h1>
    <span class="meta">${atlas.provinces.length} provinces · ${atlas.fronts.length} fronts</span>
  </header>
  <div class="stage">${svg.replace(/^<\\?xml[^>]+\\?>/, "")}</div>
  <aside id="info"></aside>
  <script>
    const data = ${JSON.stringify(atlas)};
    const info = document.getElementById('info');
    document.querySelectorAll('g[data-id]').forEach(g => {
      g.addEventListener('mouseenter', () => {
        const id = Number(g.getAttribute('data-id'));
        const p = data.provinces.find(x => x.id === id);
        if (!p) return;
        info.style.display = 'block';
        info.innerHTML = '<b>Province ' + p.id + '</b><br>owner ' + (p.owner||'—') +
          '<br>state ' + (p.stateName||p.state||'—') +
          '<br>' + p.type + (p.coastal ? ' coastal' : '') +
          '<br>terrain ' + p.terrain +
          (p.vp ? '<br>VP ' + p.vp : '') +
          '<br>neighbors ' + p.neighbors.join(', ');
      });
    });
  </script>
</body>
</html>
`;
}

export function renderMarkdown(atlas: AtlasJson): string {
  const rows = atlas.provinces
    .map(
      (p) =>
        `| ${p.id} | ${p.owner ?? ""} | ${p.state ?? ""} | ${p.type} | ${p.coastal} | ${p.terrain} | ${p.vp ?? ""} | ${p.neighbors.join(" ")} |`,
    )
    .join("\n");
  return `# Mapit atlas\n\n| id | owner | state | type | coastal | terrain | vp | neighbors |\n|---|---|---|---|---|---|---|---|\n${rows}\n`;
}

export function writeAtlas(dir: string, atlas: AtlasJson, svg: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "atlas.json"), JSON.stringify(atlas, null, 2));
  writeFileSync(join(dir, "atlas.svg"), svg);
  writeFileSync(join(dir, "atlas.html"), renderHtml(atlas, svg));
  if (atlas.provinces.length <= 80) {
    writeFileSync(join(dir, "atlas.md"), renderMarkdown(atlas));
  }
}
