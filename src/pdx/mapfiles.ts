import type {
  Adjacency,
  BuildingPlacement,
  Railway,
  SupplyNode,
} from "../core/ir.ts";

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

export function parseCountryTags(text: string): { tag: string; file: string }[] {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9]{3})\s*=\s*"([^"]+)"/);
    if (m) rows.push({ tag: m[1]!, file: m[2]! });
  }
  return rows;
}

export function parseCountryColor(text: string): [number, number, number] | undefined {
  const m = text.match(/color\s*=\s*\{\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\}/);
  if (!m) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function parseReplacePaths(descriptorText: string): string[] {
  const paths: string[] = [];
  for (const m of descriptorText.matchAll(/replace_path\s*=\s*"([^"]+)"/g)) {
    paths.push(m[1]!.replace(/\\/g, "/"));
  }
  return paths;
}
