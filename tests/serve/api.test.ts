import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMap } from "../../src/core/load.ts";
import { createApp } from "../../src/serve/server.ts";
import { UI_HTML } from "../../src/serve/ui.ts";
import { writeTinyWorld } from "../helpers/tinyWorld.ts";

describe("serve API", () => {
  it("paints pending then applies a state split", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-serve-")));
    const session = await loadMap({ mapDir: root });
    const app = createApp({ session, port: 0, load: { modPath: root } });
    const meta = await app.request("/api/meta");
    expect(meta.status).toBe(200);
    const body = await meta.json();
    expect(body.provinces).toBeGreaterThan(3);
    expect(body.diagnostics.groups.some((g: { code: string; samples: unknown[] }) => g.code && Array.isArray(g.samples))).toBe(true);
    expect(body.countries.some((c: { tag: string; onMap: boolean }) => c.tag === "SPR" && c.onMap)).toBe(true);
    expect(body.countries.some((c: { tag: string; onMap: boolean }) => c.tag === "SPA" && !c.onMap)).toBe(true);
    const paint = await app.request("/api/paint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layer: "owner", brush: "SPA", provinces: [2] }),
    });
    expect((await paint.json()).pending).toBe(1);
    const pending = await app.request("/api/province/2");
    expect((await pending.json()).owner).toBe("SPA");
    const metaPending = await (await app.request("/api/meta")).json();
    expect(metaPending.diagnostics.warnings).toBeGreaterThan(0);
    expect(metaPending.diagnostics.sampleWarnings.some((w: { code: string }) => w.code === "MIXED_OWNER")).toBe(true);
    const apply = await app.request("/api/apply", { method: "POST" });
    const result = await apply.json();
    expect(result.createdStates).toBe(1);
    expect(session.states.get(session.provinces.get(2)!.stateId!)!.owner).toBe("SPA");
  });

  it("hits map coordinates, skips sea paint, and offers atlas.json as a download", async () => {
    const root = writeTinyWorld(mkdtempSync(join(tmpdir(), "mapit-serve-hit-")));
    const session = await loadMap({ mapDir: root });
    const app = createApp({ session, port: 0, load: { modPath: root } });
    const land = await (
      await app.request("/api/hit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x: 40, z: 10 }),
      })
    ).json();
    expect(land.id).toBe(1);
    expect(land.province.type).toBe("land");
    const sea = await (
      await app.request("/api/hit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x: 40, z: 200 }),
      })
    ).json();
    expect(sea.province.type).toBe("sea");
    const paintSea = await app.request("/api/paint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layer: "owner", brush: "SPA", provinces: [sea.id] }),
    });
    expect((await paintSea.json()).pending).toBe(0);
    const atlas = await app.request("/api/atlas.json");
    expect(atlas.status).toBe(200);
    expect(atlas.headers.get("content-disposition")).toMatch(/atlas\.json/);
    const json = await atlas.json();
    expect(json.provinces.some((p: { id: number; claims: string[] }) => p.id === 1 && Array.isArray(p.claims))).toBe(true);
  });

  it("ships an inspector that lists cores, claims, and controller", () => {
    expect(UI_HTML).toContain("controller");
    expect(UI_HTML).toContain("cores");
    expect(UI_HTML).toContain("claims");
    expect(UI_HTML).toContain("a.download");
    expect(UI_HTML).toContain("type !== 'land'");
    expect(UI_HTML).toContain("brushq");
    expect(UI_HTML).toContain("Wheel zoom");
    expect(UI_HTML).toContain("diag-group");
    expect(UI_HTML).toContain("brushmeta");
    expect(UI_HTML).toContain("shiftKey");
  });
});
