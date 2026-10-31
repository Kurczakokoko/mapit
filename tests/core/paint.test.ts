import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMap } from "../../src/core/load.ts";
import { applyPending, queuePaint } from "../../src/core/paint.ts";
import { writeTinyWorld } from "../helpers/tinyWorld.ts";

describe("civil-war paint splits a state", () => {
  it("gives SPA province 2 and writes a new state file", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-paint-")));
    const session = await loadMap({ mapDir: root });
    queuePaint(session, { layer: "owner", brush: "SPA", provinces: [2] });
    const result = applyPending(session, root);
    expect(result.createdStates).toBe(1);
    expect(session.provinces.get(1)?.stateId).toBe(1);
    expect(session.provinces.get(2)?.stateId).not.toBe(1);
    const neu = session.states.get(session.provinces.get(2)!.stateId!)!;
    expect(neu.owner).toBe("SPA");
    const written = readFileSync(join(root, "history/states", neu.fileName), "utf8");
    expect(written).toContain("owner = SPA");
    expect(written).toContain("2");
  });

  it("keeps a VP and naval_base on the split-off province", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-paint-vp-")));
    const session = await loadMap({ mapDir: root });
    const west = session.states.get(1)!;
    west.victoryPoints.push({ province: 2, value: 5 });
    west.provincialBuildings.push({ province: 2, type: "naval_base", level: 1 });
    queuePaint(session, { layer: "owner", brush: "SPA", provinces: [2] });
    applyPending(session, root);
    const neu = session.states.get(session.provinces.get(2)!.stateId!)!;
    expect(neu.victoryPoints.some((vp) => vp.province === 2 && vp.value === 5)).toBe(true);
    expect(neu.provincialBuildings.some((b) => b.province === 2 && b.type === "naval_base")).toBe(true);
    expect(session.states.get(1)!.victoryPoints.some((vp) => vp.province === 2)).toBe(false);
    const buildings = readFileSync(join(root, "map/buildings.txt"), "utf8");
    expect(buildings).toMatch(new RegExp(`^${neu.id};naval_base;`, "m"));
  });

  it("applies core, claim, and controller onto the owning state", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-paint-layers-")));
    const session = await loadMap({ mapDir: root });
    queuePaint(session, { layer: "core", brush: "SPA", provinces: [1] });
    queuePaint(session, { layer: "claim", brush: "SPA", provinces: [3] });
    queuePaint(session, { layer: "controller", brush: "SPA", provinces: [3] });
    applyPending(session, root);
    expect(session.states.get(1)!.cores).toContain("SPA");
    expect(session.states.get(2)!.claims).toContain("SPA");
    expect(session.states.get(2)!.controller).toBe("SPA");
    const west = readFileSync(join(root, "history/states/1-West.txt"), "utf8");
    expect(west).toContain("add_core_of = SPA");
    const east = readFileSync(join(root, "history/states/2-East.txt"), "utf8");
    expect(east).toContain("add_claim_by = SPA");
    expect(east).toContain("controller = SPA");
  });
});
