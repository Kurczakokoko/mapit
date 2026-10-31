import { Jomini } from "jomini";

let parser: Jomini | undefined;

export async function parsePdx(text: string): Promise<unknown> {
  parser ??= await Jomini.initialize();
  return parser.parseText(text);
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function asArray<T>(value: unknown): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function asTags(value: unknown): string[] {
  return asArray<unknown>(value)
    .flatMap((v) => (typeof v === "string" ? v.split(/\s+/) : []))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function asIdList(value: unknown): number[] {
  if (typeof value === "string") {
    return value
      .trim()
      .split(/[\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n));
  }
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(asIdList);
  return [];
}
