import type { ProvinceType } from "../pdx/definition.ts";

export type Tag = string;
export type ProvinceId = number;
export type StateId = number;
export type RegionId = number;

export type Point = { x: number; z: number };

export type BBox = { minX: number; minZ: number; maxX: number; maxZ: number };

export type Province = {
  id: ProvinceId;
  r: number;
  g: number;
  b: number;
  type: ProvinceType;
  coastalDef: boolean;
  coastal: boolean;
  terrain: string;
  continent: number;
  pixels: number;
  centroid: Point;
  bbox: BBox;
  neighbors: ProvinceId[];
  stateId?: StateId;
  regionId?: RegionId;
};

export type VictoryPoint = { province: ProvinceId; value: number };

export type ProvincialBuilding = {
  province: ProvinceId;
  type: string;
  level: number;
};

export type State = {
  id: StateId;
  name: string;
  fileName: string;
  provinces: ProvinceId[];
  owner?: Tag;
  controller?: Tag;
  cores: Tag[];
  claims: Tag[];
  category?: string;
  manpower: number;
  resources: Record<string, number>;
  victoryPoints: VictoryPoint[];
  buildings: Record<string, number>;
  provincialBuildings: ProvincialBuilding[];
  localSupplies: number;
  impassable?: boolean;
  forceLinkOwnershipTo?: number;
  raw?: string;
};

export type WeatherPeriod = {
  between: [number, number];
  temperature: [number, number];
  chances: Record<string, number>;
};

export type StrategicRegion = {
  id: RegionId;
  name: string;
  fileName: string;
  provinces: ProvinceId[];
  navalTerrain?: string;
  weather: WeatherPeriod[];
};

export type BuildingPlacement = {
  state: StateId;
  building: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  seaProvince: ProvinceId;
};

export type Adjacency = {
  from: ProvinceId;
  to: ProvinceId;
  type: string;
  through: ProvinceId;
  startX: number;
  startY: number;
  stopX: number;
  stopY: number;
  rule: string;
  comment: string;
};

export type Country = {
  tag: Tag;
  name: string;
  color: [number, number, number];
  file?: string;
  /** Civil-war slot from `dynamic_tags = yes` / `generic.txt` — hide from the painter unless used. */
  dynamic?: boolean;
};

export type Railway = { level: number; provinces: ProvinceId[] };

export type SupplyNode = { level: number; province: ProvinceId };

export type PaintOp = {
  layer: "owner" | "controller" | "core" | "claim";
  brush: Tag;
  provinces: ProvinceId[];
};

export type Diagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  x?: number;
  z?: number;
  province?: ProvinceId;
  state?: StateId;
};

export const UNKNOWN_PROVINCE = 0xffffffff;

export type MapSession = {
  width: number;
  height: number;
  provincesBmp: Uint8Array;
  idGrid: Uint32Array;
  provinces: Map<ProvinceId, Province>;
  states: Map<StateId, State>;
  regions: Map<RegionId, StrategicRegion>;
  countries: Map<Tag, Country>;
  buildings: BuildingPlacement[];
  railways: Railway[];
  supplyNodes: SupplyNode[];
  adjacencies: Adjacency[];
  adjacencyHasTerminator: boolean;
  weatherPositions: { region: RegionId; x: number; y: number; z: number; size: string }[];
  continents: string[];
  pending: PaintOp[];
  xCrossings: Point[];
  unknownPixels: number;
  disconnected: ProvinceId[];
  sources: {
    gamePath?: string;
    modPath?: string;
    mapDir: string;
    replacePaths: string[];
  };
};

export function bboxSize(b: BBox): { w: number; h: number } {
  return { w: b.maxX - b.minX + 1, h: b.maxZ - b.minZ + 1 };
}
