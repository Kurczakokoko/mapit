import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMap } from "../../src/core/load.ts";
import { createApp } from "../../src/serve/server.ts";
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
    const paint = await app.request("/api/paint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layer: "owner", brush: "SPA", provinces: [2] }),
    });
    expect((await paint.json()).pending).toBe(1);
    const apply = await app.request("/api/apply", { method: "POST" });
    const result = await apply.json();
    expect(result.createdStates).toBe(1);
    expect(session.states.get(session.provinces.get(2)!.stateId!)!.owner).toBe("SPA");
  });
});
