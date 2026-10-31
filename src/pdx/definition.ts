export type ProvinceType = "land" | "sea" | "lake";

export type ProvinceDef = {
  id: number;
  r: number;
  g: number;
  b: number;
  type: ProvinceType;
  coastal: boolean;
  terrain: string;
  continent: number;
};

const TYPES = new Set<ProvinceType>(["land", "sea", "lake"]);

export function parseDefinitionCsv(text: string): ProvinceDef[] {
  const defs: ProvinceDef[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(";");
    if (parts.length < 8) {
      throw new Error(`Invalid definition.csv row: ${trimmed}`);
    }
    const type = parts[4] as ProvinceType;
    if (!TYPES.has(type)) {
      throw new Error(`Invalid province type '${parts[4]}' in ${trimmed}`);
    }
    defs.push({
      id: Number(parts[0]),
      r: Number(parts[1]),
      g: Number(parts[2]),
      b: Number(parts[3]),
      type,
      coastal: parts[5] === "true",
      terrain: parts[6]!,
      continent: Number(parts[7]),
    });
  }
  return defs;
}

export function writeDefinitionCsv(defs: ProvinceDef[]): string {
  const lines = defs.map(
    (d) =>
      `${d.id};${d.r};${d.g};${d.b};${d.type};${d.coastal};${d.terrain};${d.continent}`,
  );
  return lines.join("\r\n") + "\r\n";
}

export function findProvinceIdGaps(defs: ProvinceDef[]): number[] {
  const ids = defs.map((d) => d.id).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return [];
  const min = Math.min(...ids);
  const max = Math.max(...ids);
  const have = new Set(ids);
  const gaps: number[] = [];
  for (let id = min; id <= max; id++) {
    if (!have.has(id)) gaps.push(id);
  }
  return gaps;
}

export function packRgb(r: number, g: number, b: number): number {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

export function unpackRgb(packed: number): [number, number, number] {
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
}
