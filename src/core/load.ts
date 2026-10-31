import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { decodeBmp } from "../pdx/bmp.ts";
import { parseDefinitionCsv } from "../pdx/definition.ts";
import {
  parseAdjacenciesCsv,
  parseBuildingsTxt,
  parseColorsTxt,
  parseContinents,
  parseCountryColor,
  parseCountryTags,
  parseRailwaysTxt,
  parseSupplyNodesTxt,
  parseWeatherPositions,
} from "../pdx/mapfiles.ts";
import { parseRegionFile } from "../pdx/regions.ts";
import { parseStateFile } from "../pdx/states.ts";
import { buildGraph } from "./graph.ts";
import type { Country, MapSession, Tag } from "./ir.ts";
import { makeResolver, type FileResolver } from "./paths.ts";

export type LoadOptions = {
  gamePath?: string;
  modPath?: string;
  mapDir?: string;
};

function mustRead(resolver: FileResolver, rel: string): string {
  const p = resolver.resolve(rel);
  if (!p) throw new Error(`Missing required file: ${rel}`);
  return p;
}

function readOptional(resolver: FileResolver, rel: string): string | undefined {
  const p = resolver.resolve(rel);
  if (!p) return undefined;
  return readFileSync(p, "utf8");
}

export async function loadMap(opts: LoadOptions): Promise<MapSession> {
  const gamePath = opts.gamePath;
  const modPath = opts.modPath ?? opts.mapDir;
  const resolver = opts.mapDir && !opts.gamePath && !opts.modPath
    ? makeResolver(undefined, opts.mapDir)
    : makeResolver(gamePath, modPath);

  const defPath = mustRead(resolver, "map/definition.csv");
  const bmpPath = mustRead(resolver, "map/provinces.bmp");
  const defs = parseDefinitionCsv(readFileSync(defPath, "utf8"));
  const decoded = decodeBmp(readFileSync(bmpPath));
  if (decoded.kind !== "rgb") {
    throw new Error("provinces.bmp must be a 24-bit RGB bitmap");
  }
  const graph = buildGraph(decoded.width, decoded.height, decoded.data, defs);

  const states = new Map<number, Awaited<ReturnType<typeof parseStateFile>>>();
  for (const file of resolver.resolveDir("history/states")) {
    if (!file.endsWith(".txt")) continue;
    const state = await parseStateFile(basename(file), readFileSync(file, "utf8"));
    states.set(state.id, state);
    for (const pid of state.provinces) {
      const p = graph.provinces.get(pid);
      if (p) p.stateId = state.id;
    }
  }

  const regions = new Map<number, Awaited<ReturnType<typeof parseRegionFile>>>();
  for (const file of resolver.resolveDir("map/strategicregions")) {
    if (!file.endsWith(".txt")) continue;
    const region = await parseRegionFile(basename(file), readFileSync(file, "utf8"));
    regions.set(region.id, region);
    for (const pid of region.provinces) {
      const p = graph.provinces.get(pid);
      if (p) p.regionId = region.id;
    }
  }

  const countries = new Map<Tag, Country>();
  for (const tagFile of resolver.resolveDir("common/country_tags")) {
    if (!tagFile.endsWith(".txt")) continue;
    for (const { tag, file, dynamic } of parseCountryTags(readFileSync(tagFile, "utf8"))) {
      const countryPath = resolver.resolve(join("common", file)) ??
        resolver.resolve(`common/countries/${basename(file)}`);
      const color = countryPath
        ? parseCountryColor(readFileSync(countryPath, "utf8"))
        : undefined;
      countries.set(tag, {
        tag,
        name: tag,
        color: color ?? hashColor(tag),
        file,
        dynamic,
      });
    }
  }
  const palette = await loadPoliticalColors(resolver);
  for (const [tag, color] of palette) {
    const country = countries.get(tag);
    if (country) country.color = color;
  }
  for (const hist of resolver.resolveDir("history/countries")) {
    if (!hist.endsWith(".txt")) continue;
    const base = basename(hist, ".txt");
    const m = base.match(/^([A-Z0-9]{2,4})\s+-\s+(.+)$/i);
    if (!m) continue;
    const country = countries.get(m[1]!.toUpperCase());
    const name = m[2]!.trim();
    if (country && name) country.name = name;
  }

  const buildingsText = readOptional(resolver, "map/buildings.txt") ?? "";
  const railwaysText = readOptional(resolver, "map/railways.txt") ?? "";
  const supplyText = readOptional(resolver, "map/supply_nodes.txt") ?? "";
  const adjText = readOptional(resolver, "map/adjacencies.csv") ?? "";
  const weatherText = readOptional(resolver, "map/weatherpositions.txt") ?? "";
  const continentText = readOptional(resolver, "map/continent.txt") ?? "";
  const adj = parseAdjacenciesCsv(adjText);

  const mapDir = dirname(defPath);
  return {
    width: decoded.width,
    height: decoded.height,
    provincesBmp: decoded.data,
    idGrid: graph.idGrid,
    provinces: graph.provinces,
    states,
    regions,
    countries,
    buildings: parseBuildingsTxt(buildingsText),
    railways: parseRailwaysTxt(railwaysText),
    supplyNodes: parseSupplyNodesTxt(supplyText),
    adjacencies: adj.rows,
    adjacencyHasTerminator: adj.hasTerminator,
    weatherPositions: parseWeatherPositions(weatherText),
    continents: parseContinents(continentText),
    pending: [],
    xCrossings: graph.xCrossings,
    unknownPixels: graph.unknownPixels,
    disconnected: graph.disconnected,
    sources: {
      gamePath: resolver.gamePath,
      modPath: resolver.modPath,
      mapDir,
      replacePaths: resolver.replacePaths,
    },
  };
}

async function loadPoliticalColors(resolver: FileResolver): Promise<Map<Tag, [number, number, number]>> {
  const out = new Map<Tag, [number, number, number]>();
  const absorb = async (root: string | undefined) => {
    if (!root) return;
    const path = join(root, "common/countries/colors.txt");
    if (!existsSync(path)) return;
    for (const [tag, color] of await parseColorsTxt(readFileSync(path, "utf8"))) {
      out.set(tag, color);
    }
  };
  const replaced = resolver.replacePaths.some(
    (rp) => rp === "common/countries" || rp === "common/countries/colors.txt",
  );
  if (!replaced) await absorb(resolver.gamePath);
  await absorb(resolver.modPath);
  return out;
}

function hashColor(tag: string): [number, number, number] {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}

export { buildGraph };
