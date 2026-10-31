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

export function splitStatesForOwners(session: MapSession, owners: Map<ProvinceId, Tag>): State[] {
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
    st.provinces = keep[1];
    st.owner = keep[0];
    st.controller = keep[0];
    st.cores = [...new Set([...st.cores, keep[0]])];
    st.victoryPoints = st.victoryPoints.filter((vp) => keep[1].includes(vp.province));
    st.provincialBuildings = st.provincialBuildings.filter((b) => keep[1].includes(b.province));
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
        claims: [],
        category: st.category,
        manpower: Math.max(1, Math.round(st.manpower * (ids.length / (st.provinces.length + ids.length)))),
        resources: {},
        victoryPoints: st.victoryPoints.filter((vp) => ids.includes(vp.province)),
        buildings: { ...st.buildings },
        provincialBuildings: st.provincialBuildings.filter((b) => ids.includes(b.province)),
        localSupplies: st.localSupplies,
      };
      // victory points were already filtered onto keep — pull from original list via session
      neu.victoryPoints = [];
      neu.provincialBuildings = [];
      for (const pid of ids) {
        const p = session.provinces.get(pid);
        if (p) p.stateId = neu.id;
      }
      session.states.set(neu.id, neu);
      created.push(neu);
      nextId++;
    }
    // restore VPs/buildings from the pre-split copies on provinces via pending owners only
  }
  // Second pass: move VPs that belong to new states. Re-read from all states is messy;
  // gather from every state then assign by current province.stateId.
  const allVp = [...session.states.values()].flatMap((s) => s.victoryPoints.map((vp) => ({ ...vp })));
  const allPb = [...session.states.values()].flatMap((s) => s.provincialBuildings.map((b) => ({ ...b })));
  for (const s of session.states.values()) {
    s.victoryPoints = allVp.filter((vp) => session.provinces.get(vp.province)?.stateId === s.id);
    s.provincialBuildings = allPb.filter((b) => session.provinces.get(b.province)?.stateId === s.id);
  }
  return created;
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
  const owners = ownersAfterPending(session);
  const priorStates = new Set<number>();
  for (const op of session.pending) {
    for (const pid of op.provinces) {
      const sid = session.provinces.get(pid)?.stateId;
      if (sid !== undefined) priorStates.add(sid);
    }
  }
  const created = splitStatesForOwners(session, owners);
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
