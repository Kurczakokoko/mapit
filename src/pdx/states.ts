import type { ProvincialBuilding, State, VictoryPoint } from "../core/ir.ts";
import {
  asArray,
  asIdList,
  asNumber,
  asRecord,
  asString,
  asTags,
  parsePdx,
} from "./clausewitz.ts";

const STATE_BUILDINGS = new Set([
  "infrastructure",
  "arms_factory",
  "industrial_complex",
  "air_base",
  "dockyard",
  "synthetic_refinery",
  "fuel_silo",
  "radar_station",
  "anti_air_building",
  "nuclear_reactor",
  "air_facility",
  "land_facility",
  "naval_facility",
  "dam",
  "office_park",
  "steel_mill",
  "aluminum_mill",
]);

function parseVictoryPoints(value: unknown): VictoryPoint[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number" && !Array.isArray(value[0])) {
      const pts: VictoryPoint[] = [];
      for (let i = 0; i + 1 < value.length; i += 2) {
        pts.push({ province: asNumber(value[i]), value: asNumber(value[i + 1]) });
      }
      return pts;
    }
    const pts: VictoryPoint[] = [];
    for (const entry of value) {
      if (Array.isArray(entry) && entry.length >= 2) {
        pts.push({ province: asNumber(entry[0]), value: asNumber(entry[1]) });
      }
    }
    return pts;
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
      province: Number(k),
      value: asNumber(v),
    }));
  }
  return [];
}

export async function parseStateFile(fileName: string, text: string): Promise<State> {
  const root = asRecord(await parsePdx(text));
  const body = asRecord(root.state ?? root);
  const history = asRecord(body.history);
  const buildingsRaw = asRecord(history.buildings);
  const buildings: Record<string, number> = {};
  const provincialBuildings: ProvincialBuilding[] = [];
  for (const [key, val] of Object.entries(buildingsRaw)) {
    if (/^\d+$/.test(key) && val && typeof val === "object") {
      const province = Number(key);
      for (const [bType, level] of Object.entries(asRecord(val))) {
        provincialBuildings.push({
          province,
          type: bType,
          level: asNumber(level, 1),
        });
      }
    } else if (STATE_BUILDINGS.has(key) || typeof val === "number") {
      buildings[key] = asNumber(val);
    }
  }
  const victoryPoints: VictoryPoint[] = parseVictoryPoints(history.victory_points);
  const resources: Record<string, number> = {};
  for (const [k, v] of Object.entries(asRecord(body.resources))) {
    resources[k] = asNumber(v);
  }
  return {
    id: asNumber(body.id),
    name: asString(body.name, fileName),
    fileName,
    provinces: asIdList(body.provinces),
    owner: asTags(history.owner)[0],
    controller: asTags(history.controller)[0] ?? asTags(history.owner)[0],
    cores: asTags(history.add_core_of),
    claims: asTags(history.add_claim_by),
    category: asString(body.state_category) || undefined,
    manpower: asNumber(body.manpower),
    resources,
    victoryPoints,
    buildings,
    provincialBuildings,
    localSupplies: asNumber(body.local_supplies),
    raw: text,
  };
}

export function writeStateFile(state: State): string {
  const cores = state.cores.map((t) => `\t\tadd_core_of = ${t}`).join("\n");
  const claims = state.claims.map((t) => `\t\tadd_claim_by = ${t}`).join("\n");
  const vps = state.victoryPoints
    .map((vp) => `\t\tvictory_points = {\n\t\t\t${vp.province} ${vp.value}\n\t\t}`)
    .join("\n");
  const stateB = Object.entries(state.buildings)
    .map(([k, v]) => `\t\t\t${k} = ${v}`)
    .join("\n");
  const byProv = new Map<number, ProvincialBuilding[]>();
  for (const b of state.provincialBuildings) {
    const list = byProv.get(b.province) ?? [];
    list.push(b);
    byProv.set(b.province, list);
  }
  const provB = [...byProv.entries()]
    .map(([id, bs]) => {
      const inner = bs.map((b) => `\t\t\t\t${b.type} = ${b.level}`).join("\n");
      return `\t\t\t${id} = {\n${inner}\n\t\t\t}`;
    })
    .join("\n");
  const resources = Object.entries(state.resources)
    .map(([k, v]) => `\t\t${k} = ${v.toFixed(3)}`)
    .join("\n");
  const controller =
    state.controller && state.controller !== state.owner
      ? `\t\tcontroller = ${state.controller}\n`
      : "";
  return `state={
	id=${state.id}
	name="${state.name}"
${resources ? `\tresources={\n${resources}\n\t}\n` : ""}
	history={
${state.owner ? `\t\towner = ${state.owner}\n` : ""}${controller}${vps ? vps + "\n" : ""}\t\tbuildings = {
${stateB}${stateB && provB ? "\n" : ""}${provB}
		}
${cores}${cores && claims ? "\n" : ""}${claims}
	}

	provinces={
		${state.provinces.join(" ")}
	}
	manpower=${state.manpower}
	state_category=${state.category ?? "rural"}
	local_supplies=${state.localSupplies}
}
`;
}
