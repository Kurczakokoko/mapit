import { findProvinceIdGaps, packRgb } from "../pdx/definition.ts";
import { bboxSize, type Diagnostic, type MapSession } from "./ir.ts";

const PIXEL_BUDGET = 13_238_272;
const MIN_PROVINCE_PIXELS = 8;

export type ValidateResult = {
  errors: Diagnostic[];
  warnings: Diagnostic[];
  all: Diagnostic[];
};

export function validate(session: MapSession): ValidateResult {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const error = (d: Omit<Diagnostic, "severity">) => errors.push({ ...d, severity: "error" });
  const warn = (d: Omit<Diagnostic, "severity">) => warnings.push({ ...d, severity: "warning" });

  if (session.width % 256 !== 0 || session.height % 256 !== 0) {
    error({
      code: "DIM_NOT_256",
      message: `Map is ${session.width}×${session.height}; both sides must be multiples of 256`,
    });
  }
  if (session.width * session.height > PIXEL_BUDGET) {
    error({
      code: "PIXEL_BUDGET",
      message: `Map has ${session.width * session.height} pixels; engine budget is ~${PIXEL_BUDGET}`,
    });
  }

  const defs = [...session.provinces.values()].map((p) => ({
    id: p.id,
    r: p.r,
    g: p.g,
    b: p.b,
    type: p.type,
    coastal: p.coastalDef,
    terrain: p.terrain,
    continent: p.continent,
  }));
  const gaps = findProvinceIdGaps(defs);
  if (gaps.length) {
    error({
      code: "ID_GAP",
      message: `Province ID gaps (${gaps.length}): ${gaps.slice(0, 12).join(", ")}${gaps.length > 12 ? "…" : ""}`,
    });
  }

  const rgbSeen = new Map<number, number>();
  for (const p of session.provinces.values()) {
    const packed = packRgb(p.r, p.g, p.b);
    const prev = rgbSeen.get(packed);
    if (prev !== undefined) {
      error({
        code: "DUP_RGB",
        message: `Provinces ${prev} and ${p.id} share RGB ${p.r},${p.g},${p.b}`,
        province: p.id,
      });
    } else rgbSeen.set(packed, p.id);
  }

  if (session.unknownPixels > 0) {
    error({
      code: "UNKNOWN_PIXELS",
      message: `${session.unknownPixels} pixels in provinces.bmp have colours missing from definition.csv`,
    });
  }

  for (const pt of session.xCrossings) {
    error({
      code: "X_CROSSING",
      message: `Invalid X-crossing at ${pt.x},${pt.z}`,
      x: pt.x,
      z: pt.z,
    });
  }

  for (const id of session.disconnected) {
    warn({
      code: "DISCONNECTED",
      message: `Province ${id} is not 4-connected`,
      province: id,
    });
  }

  const maxBoxW = Math.max(64, session.width / 8);
  const maxBoxH = Math.max(64, session.height / 8);
  for (const p of session.provinces.values()) {
    if (p.id === 0) continue;
    if (p.pixels === 0) {
      error({ code: "NO_PIXELS", message: `Province ${p.id} has no pixels`, province: p.id });
    } else if (p.pixels < MIN_PROVINCE_PIXELS) {
      warn({
        code: "TOO_SMALL",
        message: `Province ${p.id} has only ${p.pixels} pixels`,
        province: p.id,
      });
    }
    const { w, h } = bboxSize(p.bbox);
    if (p.type === "land" && (w > maxBoxW || h > maxBoxH)) {
      warn({
        code: "TOO_LARGE_BOX",
        message: `Province ${p.id} bbox ${w}×${h} exceeds 1/8 of the map`,
        province: p.id,
      });
    }
    if (p.type === "land" && p.continent === 0) {
      error({
        code: "CONTINENT_ZERO",
        message: `Land province ${p.id} has continent 0`,
        province: p.id,
      });
    }
    if (p.type === "sea" && p.terrain !== "ocean") {
      error({
        code: "TERRAIN_SEA",
        message: `Sea province ${p.id} terrain is '${p.terrain}', expected ocean`,
        province: p.id,
      });
    }
    if (p.type === "lake" && p.terrain !== "lakes") {
      error({
        code: "TERRAIN_LAKE",
        message: `Lake province ${p.id} terrain is '${p.terrain}', expected lakes`,
        province: p.id,
      });
    }
    if (p.coastal !== p.coastalDef) {
      warn({
        code: "COASTAL_MISMATCH",
        message: `Province ${p.id} definition coastal=${p.coastalDef} but bitmap adjacency coastal=${p.coastal}`,
        province: p.id,
      });
    }
    if (p.type === "land" && p.stateId === undefined) {
      error({
        code: "LAND_NO_STATE",
        message: `Land province ${p.id} is not in any state`,
        province: p.id,
      });
    }
    if (p.id !== 0 && p.regionId === undefined && p.pixels > 0) {
      error({
        code: "NO_REGION",
        message: `Province ${p.id} is not in any strategic region`,
        province: p.id,
      });
    }
  }

  for (const state of session.states.values()) {
    const regionIds = new Set<number>();
    for (const pid of state.provinces) {
      const p = session.provinces.get(pid);
      if (p?.regionId !== undefined) regionIds.add(p.regionId);
    }
    if (regionIds.size > 1) {
      error({
        code: "STATE_MULTI_REGION",
        message: `State ${state.id} spans strategic regions ${[...regionIds].join(", ")}`,
        state: state.id,
      });
    }
    const owners = new Set<string>();
    if (state.owner) owners.add(state.owner);
    if (owners.size > 1) {
      error({
        code: "MIXED_OWNER",
        message: `State ${state.id} has mixed owners`,
        state: state.id,
      });
    }
  }

  const naval = session.buildings.filter(
    (b) => b.building === "naval_base" || b.building === "floating_harbor",
  );
  for (const b of naval) {
    if (!b.seaProvince) {
      error({
        code: "NAVAL_BASE_NO_SEA",
        message: `State ${b.state} ${b.building} has no adjacent sea province in buildings.txt`,
        state: b.state,
      });
    }
  }
  if (session.buildings.length === 0) {
    error({
      code: "EMPTY_BUILDINGS",
      message: "map/buildings.txt is empty — the game crashes on an empty buildings file",
    });
  }
  if (session.railways.length === 0) {
    error({
      code: "EMPTY_RAILWAYS",
      message: "map/railways.txt is empty — the game crashes on a new map without railways",
    });
  }
  if (session.supplyNodes.length === 0) {
    error({
      code: "EMPTY_SUPPLY",
      message: "map/supply_nodes.txt is empty — the game crashes on a new map without supply nodes",
    });
  }
  if (!session.adjacencyHasTerminator) {
    error({
      code: "ADJACENCY_TERMINATOR",
      message: "map/adjacencies.csv is missing the -1 terminator row",
    });
  }
  const sizes = new Set(session.weatherPositions.map((w) => w.size));
  const hasSmall = sizes.has("small");
  const hasLarge = sizes.has("large") || sizes.has("big");
  if (!hasSmall || !hasLarge) {
    error({
      code: "WEATHER_SIZE",
      message: "weatherpositions.txt must contain both a small and a big/large object",
    });
  }

  return { errors, warnings, all: [...errors, ...warnings] };
}

export function formatDiagnostics(result: ValidateResult): string {
  if (result.all.length === 0) return "OK — no map errors or warnings.";
  return result.all
    .map((d) => `${d.severity.toUpperCase()} ${d.code}: ${d.message}`)
    .join("\n");
}
