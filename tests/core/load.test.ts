import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMap } from "../../src/core/load.ts";
import { validate } from "../../src/core/validate.ts";
import { writeTinyWorld } from "../helpers/tinyWorld.ts";

describe("loadMap + validate on a synthetic overhaul", () => {
  it("loads provinces, states, regions, coastal flags and is clean", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-")));
    const session = await loadMap({ mapDir: root });
    expect(session.width).toBe(256);
    expect(session.height).toBe(256);
    expect(session.provinces.get(1)?.coastal).toBe(true);
    expect(session.provinces.get(3)?.coastal).toBe(false);
    expect(session.provinces.get(1)?.stateId).toBe(1);
    expect(session.provinces.get(4)?.type).toBe("sea");
    expect(session.states.get(1)?.owner).toBe("SPR");
    expect(session.countries.get("SPR")?.color).toEqual([242, 205, 94]);
    expect(session.countries.get("SPR")?.name).toBe("Spain");
    const result = validate(session);
    expect(result.errors.map((e) => e.code)).toEqual([]);
  });
});
