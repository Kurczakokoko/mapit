import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMap } from "../../src/core/load.ts";
import { queuePaint } from "../../src/core/paint.ts";
import { validate } from "../../src/core/validate.ts";
import { writeTinyWorld } from "../helpers/tinyWorld.ts";

describe("validate crash encyclopedia", () => {
  it("errors when a railway hop is not adjacent", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-rail-")));
    const session = await loadMap({ mapDir: root });
    const two = session.provinces.get(2)!;
    session.provinces.set(99, { ...two, id: 99, neighbors: [] });
    session.railways = [{ level: 1, provinces: [2, 99] }];
    const v = validate(session);
    expect(v.errors.some((e) => e.code === "RAIL_NOT_ADJACENT")).toBe(true);
    expect(v.errors.some((e) => e.code === "RAIL_NOT_LAND")).toBe(false);
  });

  it("warns MIXED_OWNER while owner paint is pending", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-mix-")));
    const session = await loadMap({ mapDir: root });
    queuePaint(session, { layer: "owner", brush: "SPA", provinces: [2] });
    const v = validate(session);
    expect(v.warnings.some((w) => w.code === "MIXED_OWNER" && w.state === 1)).toBe(true);
  });
});
