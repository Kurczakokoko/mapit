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
});
