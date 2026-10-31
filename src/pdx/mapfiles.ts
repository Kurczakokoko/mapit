import type {
  Adjacency,
  BuildingPlacement,
  Railway,
  SupplyNode,
} from "../core/ir.ts";
import { asRecord, parsePdx } from "./clausewitz.ts";

export function parseBuildingsTxt(text: string): BuildingPlacement[] {
  const rows: BuildingPlacement[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(";");
    if (parts.length < 7) continue;
    rows.push({
      state: Number(parts[0]),
      building: parts[1]!,
      x: Number(parts[2]),
      y: Number(parts[3]),
      z: Number(parts[4]),
      rotation: Number(parts[5]),
      seaProvince: Number(parts[6]),
    });
  }
  return rows;
}

export function writeBuildingsTxt(rows: BuildingPlacement[]): string {
  return (
    rows
      .map(
        (r) =>
          `${r.state};${r.building};${r.x.toFixed(2)};${r.y.toFixed(2)};${r.z.toFixed(2)};${r.rotation.toFixed(2)};${r.seaProvince}`,
      )
      .join("\n") + "\n"
  );
}

export function parseRailwaysTxt(text: string): Railway[] {
  const rows: Railway[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const nums = parts.map(Number);
    const level = nums[0]!;
    const maybeCount = nums[1]!;
    const rest = nums.slice(2);
    const provinces = maybeCount === rest.length ? rest : nums.slice(1);
    rows.push({ level, provinces });
  }
  return rows;
}

export function writeRailwaysTxt(rows: Railway[]): string {
  return rows.map((r) => `${r.level} ${r.provinces.length} ${r.provinces.join(" ")}`).join("\n") + "\n";
}

export function parseSupplyNodesTxt(text: string): SupplyNode[] {
  const rows: SupplyNode[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    rows.push({ level: Number(parts[0]), province: Number(parts[1]) });
  }
  return rows;
}

export function writeSupplyNodesTxt(rows: SupplyNode[]): string {
  return rows.map((r) => `${r.level} ${r.province}`).join("\n") + "\n";
}

export function parseAdjacenciesCsv(text: string): {
  rows: Adjacency[];
  hasTerminator: boolean;
} {
  const rows: Adjacency[] = [];
  let hasTerminator = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.toLowerCase().startsWith("from;")) continue;
    const parts = trimmed.split(";");
    if (parts[0] === "-1") {
      hasTerminator = true;
      continue;
    }
    if (parts.length < 2) continue;
    rows.push({
      from: Number(parts[0]),
      to: Number(parts[1]),
      type: parts[2] ?? "",
      through: Number(parts[3] ?? -1),
      startX: Number(parts[4] ?? -1),
      startY: Number(parts[5] ?? -1),
      stopX: Number(parts[6] ?? -1),
      stopY: Number(parts[7] ?? -1),
      rule: parts[8] ?? "",
      comment: parts[9] ?? "",
    });
  }
  return { rows, hasTerminator };
}

export function writeAdjacenciesCsv(rows: Adjacency[]): string {
  const header =
    "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
  const body = rows.map(
    (r) =>
      `${r.from};${r.to};${r.type};${r.through};${r.startX};${r.startY};${r.stopX};${r.stopY};${r.rule};${r.comment}`,
  );
  return [header, ...body, "-1;-1;;-1;-1;-1;-1;-1;-1", ""].join("\r\n");
}

export function parseWeatherPositions(text: string): {
  region: number;
  x: number;
  y: number;
  z: number;
  size: string;
}[] {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(";");
    if (parts.length < 5) continue;
    rows.push({
      region: Number(parts[0]),
      x: Number(parts[1]),
      y: Number(parts[2]),
      z: Number(parts[3]),
      size: parts[4]!,
    });
  }
  return rows;
}

export function parseContinents(text: string): string[] {
  const match = text.match(/continents\s*=\s*\{([^}]*)\}/s);
  if (!match) return [];
  return match[1]!.trim().split(/\s+/).filter(Boolean);
}

export function parseCountryTags(text: string): { tag: string; file: string; dynamic: boolean }[] {
  const dynamicFile = /^\s*dynamic_tags\s*=\s*yes\b/m.test(text);
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9]{3})\s*=\s*"([^"]+)"/);
    if (m) {
      const file = m[2]!;
      const dynamic = dynamicFile || /generic\.txt$/i.test(file.replace(/\\/g, "/"));
      rows.push({ tag: m[1]!, file, dynamic });
    }
  }
  return rows;
}

/** Political-map color from a country file. `color_ui` is ignored. */
export function parseCountryColor(text: string): [number, number, number] | undefined {
  const re =
    /(?<![A-Za-z0-9_])color\s*=\s*(?:(rgb|hsv|HSV|hsv360)\s*)?\{\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\}/g;
  const m = re.exec(text);
  if (!m) return undefined;
  return decodeColorComponents(m[1], Number(m[2]), Number(m[3]), Number(m[4]));
}

/** `common/countries/colors.txt` — this is what the in-game political map uses. */
export async function parseColorsTxt(text: string): Promise<Map<string, [number, number, number]>> {
  const root = asRecord(await parsePdx(text));
  const out = new Map<string, [number, number, number]>();
  for (const [tag, body] of Object.entries(root)) {
    if (!/^[A-Za-z0-9]{3}$/.test(tag)) continue;
    const color = colorFromUnknown(asRecord(body).color);
    if (color) out.set(tag.toUpperCase(), color);
  }
  return out;
}

export function colorFromUnknown(value: unknown): [number, number, number] | undefined {
  if (Array.isArray(value) && value.length >= 3) {
    return decodeColorComponents(undefined, Number(value[0]), Number(value[1]), Number(value[2]));
  }
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  if (rec.rgb !== undefined) return colorFromUnknown(rec.rgb);
  if (rec.hsv !== undefined) return colorFromUnknownKind("hsv", rec.hsv);
  if (rec.HSV !== undefined) return colorFromUnknownKind("hsv", rec.HSV);
  if (rec.hsv360 !== undefined) return colorFromUnknownKind("hsv360", rec.hsv360);
  if (rec.HSV360 !== undefined) return colorFromUnknownKind("hsv360", rec.HSV360);
  return undefined;
}

function colorFromUnknownKind(kind: string, value: unknown): [number, number, number] | undefined {
  const arr = Array.isArray(value) ? value : [];
  if (arr.length < 3) return undefined;
  return decodeColorComponents(kind, Number(arr[0]), Number(arr[1]), Number(arr[2]));
}

export function decodeColorComponents(
  kind: string | undefined,
  a: number,
  b: number,
  c: number,
): [number, number, number] | undefined {
  if (![a, b, c].every((n) => Number.isFinite(n))) return undefined;
  const k = (kind ?? "rgb").toLowerCase();
  if (k === "hsv360") return hsvToRgb(a / 360, b / 100, c / 100);
  if (k === "hsv") return hsvToRgb(a, b, c);
  return [
    Math.round(Math.min(255, Math.max(0, a))),
    Math.round(Math.min(255, Math.max(0, b))),
    Math.round(Math.min(255, Math.max(0, c))),
  ];
}

/** Clausewitz `HSV { h s v }` with h,s,v in 0–1. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 1) + 1) % 1;
  const ss = Math.min(1, Math.max(0, s));
  const vv = Math.min(1, Math.max(0, v));
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = vv * (1 - ss);
  const q = vv * (1 - f * ss);
  const t = vv * (1 - (1 - f) * ss);
  const triplet = (
    [
      [vv, t, p],
      [q, vv, p],
      [p, vv, t],
      [p, q, vv],
      [t, p, vv],
      [vv, p, q],
    ] as const
  )[i % 6]!;
  return [Math.round(triplet[0] * 255), Math.round(triplet[1] * 255), Math.round(triplet[2] * 255)];
}

export function parseReplacePaths(descriptorText: string): string[] {
  const paths: string[] = [];
  for (const m of descriptorText.matchAll(/replace_path\s*=\s*"([^"]+)"/g)) {
    paths.push(m[1]!.replace(/\\/g, "/"));
  }
  return paths;
}
