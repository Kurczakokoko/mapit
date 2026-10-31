import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeBuildingsTxt } from "../pdx/mapfiles.ts";
import { writeStateFile } from "../pdx/states.ts";
import type { MapSession, PaintOp, ProvinceId, State, Tag } from "./ir.ts";

export function queuePaint(session: MapSession, op: PaintOp): void {
  session.pending.push(op);
}

export function ownersAfterPending(session: MapSession): Map<ProvinceId, Tag> {
  const owners = new Map<ProvinceId, Tag>();
  for (const st of session.states.values()) {
    if (!st.owner) continue;
    for (const pid of st.provinces) owners.set(pid, st.owner);
  }
  for (const op of session.pending) {
    if (op.layer !== "owner") continue;
    for (const pid of op.provinces) owners.set(pid, op.brush);
  }
  return owners;
}

function scaleRecord(src: Record<string, number>, num: number, den: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (den <= 0) return { ...src };
  for (const [k, v] of Object.entries(src)) {
    const n = Math.round((v * num) / den);
    if (n > 0) out[k] = n;
  }
  return out;
}

export function splitStatesForOwners(session: MapSession, owners: Map<ProvinceId, Tag>): State[] {
  const vpSnap = [...session.states.values()].flatMap((s) => s.victoryPoints.map((vp) => ({ ...vp })));
  const pbSnap = [...session.states.values()].flatMap((s) => s.provincialBuildings.map((b) => ({ ...b })));
  const created: State[] = [];
  let nextId = Math.max(0, ...session.states.keys()) + 1;
  for (const st of [...session.states.values()]) {
    const groups = new Map<Tag, ProvinceId[]>();
    for (const pid of st.provinces) {
      const tag = owners.get(pid) ?? st.owner;
      if (!tag) continue;
      const list = groups.get(tag) ?? [];
      list.push(pid);
      groups.set(tag, list);
    }
    if (groups.size <= 1) {
      const only = [...groups.keys()][0];
      if (only) {
        st.owner = only;
        st.controller = only;
      }
      continue;
    }
    const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const keep = ordered[0]!;
    const origCount = st.provinces.length;
    const origManpower = st.manpower;
    const origRes = { ...st.resources };
    const origBuildings = { ...st.buildings };
    st.provinces = keep[1];
    st.owner = keep[0];
    st.controller = keep[0];
    st.cores = [...new Set([...st.cores, keep[0]])];
    st.manpower = Math.max(1, Math.round((origManpower * keep[1].length) / origCount));
    st.resources = scaleRecord(origRes, keep[1].length, origCount);
    st.buildings = scaleRecord(origBuildings, keep[1].length, origCount);
    for (const pid of keep[1]) {
      const p = session.provinces.get(pid);
      if (p) p.stateId = st.id;
    }
    for (const [tag, ids] of ordered.slice(1)) {
      const neu: State = {
        id: nextId,
        name: `STATE_${nextId}`,
        fileName: `${nextId}-${tag}.txt`,
        provinces: ids,
        owner: tag,
        controller: tag,
        cores: [tag],
        claims: [...st.claims],
        category: st.category,
        manpower: Math.max(1, origManpower - st.manpower),
        resources: scaleRecord(origRes, ids.length, origCount),
        victoryPoints: [],
        buildings: scaleRecord(origBuildings, ids.length, origCount),
        provincialBuildings: [],
        localSupplies: st.localSupplies,
        impassable: st.impassable,
        forceLinkOwnershipTo: st.forceLinkOwnershipTo,
      };
      for (const pid of ids) {
        const p = session.provinces.get(pid);
        if (p) p.stateId = neu.id;
      }
      session.states.set(neu.id, neu);
      created.push(neu);
      nextId++;
    }
  }
  for (const s of session.states.values()) {
    s.victoryPoints = vpSnap.filter((vp) => session.provinces.get(vp.province)?.stateId === s.id);
    s.provincialBuildings = pbSnap.filter((b) => session.provinces.get(b.province)?.stateId === s.id);
  }
  return created;
}

export function rehomeBuildings(session: MapSession): void {
  for (const b of session.buildings) {
    const x = Math.max(0, Math.min(session.width - 1, Math.round(b.x)));
    const z = Math.max(0, Math.min(session.height - 1, Math.round(b.z)));
    const pid = session.idGrid[z * session.width + x]!;
    const p = session.provinces.get(pid);
    if (p?.stateId !== undefined) b.state = p.stateId;
  }
}

export function fixNavalBases(session: MapSession): number {
  let fixed = 0;
  for (const b of session.buildings) {
    if (b.building !== "naval_base" && b.building !== "floating_harbor") continue;
    if (b.seaProvince) continue;
    const land = [...session.provinces.values()].find(
      (p) => p.stateId === b.state && p.coastal && p.type === "land",
    );
    const sea = land?.neighbors.find((id) => session.provinces.get(id)?.type === "sea");
    if (sea) {
      b.seaProvince = sea;
      fixed++;
    }
  }
  for (const st of session.states.values()) {
    for (const pb of st.provincialBuildings) {
      if (pb.type !== "naval_base" && pb.type !== "floating_harbor") continue;
      const p = session.provinces.get(pb.province);
      if (!p) continue;
      const sea = p.neighbors.find((id) => session.provinces.get(id)?.type === "sea");
      const exists = session.buildings.some(
        (b) => b.state === st.id && b.building === pb.type && Math.abs(b.x - p.centroid.x) < 1,
      );
      if (!exists && sea) {
        session.buildings.push({
          state: st.id,
          building: pb.type,
          x: p.centroid.x,
          y: 9.5,
          z: p.centroid.z,
          rotation: 0,
          seaProvince: sea,
        });
        fixed++;
      }
    }
  }
  return fixed;
}

export function autoFixCoastal(session: MapSession): number {
  let n = 0;
  for (const p of session.provinces.values()) {
    if (p.coastalDef !== p.coastal) {
      p.coastalDef = p.coastal;
      n++;
    }
  }
  return n;
}

export function applyPending(session: MapSession, modPath: string): { createdStates: number; wrote: string[] } {
  const pending = [...session.pending];
  const owners = ownersAfterPending(session);
  const priorStates = new Set<number>();
  for (const op of pending) {
    for (const pid of op.provinces) {
      const sid = session.provinces.get(pid)?.stateId;
      if (sid !== undefined) priorStates.add(sid);
    }
  }
  const created = splitStatesForOwners(session, owners);
  for (const op of pending) {
    if (op.layer === "owner") continue;
    for (const pid of op.provinces) {
      const sid = session.provinces.get(pid)?.stateId;
      if (sid === undefined) continue;
      const st = session.states.get(sid);
      if (!st) continue;
      priorStates.add(sid);
      if (op.layer === "controller") st.controller = op.brush;
      if (op.layer === "core" && !st.cores.includes(op.brush)) st.cores.push(op.brush);
      if (op.layer === "claim" && !st.claims.includes(op.brush)) st.claims.push(op.brush);
    }
  }
  rehomeBuildings(session);
  fixNavalBases(session);
  const wrote: string[] = [];
  const statesDir = join(modPath, "history/states");
  mkdirSync(statesDir, { recursive: true });
  const touched = new Set<number>([...priorStates, ...created.map((s) => s.id)]);
  for (const id of touched) {
    const st = session.states.get(id);
    if (!st) continue;
    const file = join(statesDir, st.fileName);
    writeFileSync(file, writeStateFile(st));
    wrote.push(file);
  }
  mkdirSync(join(modPath, "map"), { recursive: true });
  const buildingsFile = join(modPath, "map/buildings.txt");
  writeFileSync(buildingsFile, writeBuildingsTxt(session.buildings));
  wrote.push(buildingsFile);
  session.pending = [];
  return { createdStates: created.length, wrote };
}
