import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { buildAtlasJson, renderSvg, writeAtlas } from "../atlas/render.ts";
import { parseSelector, selectProvinces } from "../atlas/select.ts";
import type { MapSession, PaintOp } from "../core/ir.ts";
import type { LoadOptions } from "../core/load.ts";
import { applyPending, queuePaint } from "../core/paint.ts";
import { validate } from "../core/validate.ts";
import { encodeIdMapPng, renderPoliticalPreview } from "./preview.ts";
import { UI_HTML } from "./ui.ts";

export type ServeOpts = {
  session: MapSession;
  port: number;
  load: LoadOptions;
};

export function createApp(opts: ServeOpts): Hono {
  const app = new Hono();
  const ctx = opts;

  const provincePayload = (session: MapSession, id: number) => {
    const p = session.provinces.get(id);
    if (!p) return null;
    const st = p.stateId !== undefined ? session.states.get(p.stateId) : undefined;
    return {
      id: p.id,
      type: p.type,
      coastal: p.coastal,
      terrain: p.terrain,
      state: p.stateId,
      stateName: st?.name,
      owner: st?.owner,
      controller: st?.controller,
      cores: st?.cores ?? [],
      vp: st?.victoryPoints.find((v) => v.province === p.id)?.value,
      neighbors: p.neighbors,
      centroid: p.centroid,
    };
  };

  app.get("/", (c) => c.html(UI_HTML));

  app.get("/api/meta", (c) => {
    const v = validate(ctx.session);
    return c.json({
      width: ctx.session.width,
      height: ctx.session.height,
      provinces: ctx.session.provinces.size,
      states: ctx.session.states.size,
      regions: ctx.session.regions.size,
      pending: ctx.session.pending.length,
      modPath: ctx.load.modPath ?? ctx.session.sources.modPath,
      countries: [...ctx.session.countries.values()].map((co) => ({
        tag: co.tag,
        name: co.name,
        color: co.color,
      })),
      diagnostics: {
        errors: v.errors.length,
        warnings: v.warnings.length,
        sample: v.all.slice(0, 12),
      },
    });
  });

  app.get("/api/preview.png", (c) => {
    const preview = renderPoliticalPreview(ctx.session);
    return c.body(Buffer.from(preview.png), 200, { "content-type": "image/png" });
  });

  app.get("/api/idmap.png", (c) => {
    const preview = renderPoliticalPreview(ctx.session);
    const png = encodeIdMapPng(preview.width, preview.height, preview.ids);
    return c.body(Buffer.from(png), 200, { "content-type": "image/png" });
  });

  app.get("/api/province/:id", (c) => {
    const id = Number(c.req.param("id"));
    const p = provincePayload(ctx.session, id);
    if (!p) return c.json({ error: "unknown province" }, 404);
    return c.json(p);
  });

  app.post("/api/hit", async (c) => {
    const body = await c.req.json<{ x: number; z: number }>();
    const x = Math.max(0, Math.min(ctx.session.width - 1, Math.round(body.x)));
    const z = Math.max(0, Math.min(ctx.session.height - 1, Math.round(body.z)));
    const id = ctx.session.idGrid[z * ctx.session.width + x]!;
    return c.json({ x, z, id, province: provincePayload(ctx.session, id) });
  });

  app.post("/api/paint", async (c) => {
    const body = await c.req.json<{ layer?: PaintOp["layer"]; brush: string; provinces: number[] }>();
    const layer = body.layer ?? "owner";
    queuePaint(ctx.session, {
      layer,
      brush: String(body.brush).toUpperCase(),
      provinces: body.provinces.filter((n) => Number.isFinite(n) && n > 0),
    });
    return c.json({ pending: ctx.session.pending.length });
  });

  app.post("/api/undo", (c) => {
    ctx.session.pending.pop();
    return c.json({ pending: ctx.session.pending.length });
  });

  app.post("/api/discard", (c) => {
    ctx.session.pending = [];
    return c.json({ pending: 0 });
  });

  app.post("/api/apply", (c) => {
    const mod = ctx.load.modPath ?? ctx.session.sources.modPath;
    if (!mod) return c.json({ error: "No mod path. Run mapit serve --mod PATH" }, 400);
    const result = applyPending(ctx.session, mod);
    return c.json(result);
  });

  app.get("/api/atlas.json", (c) => {
    const selector = parseSelector(c.req.query("selector") ?? "world");
    const provinces = selectProvinces(ctx.session, selector);
    return c.json(buildAtlasJson(ctx.session, selector, provinces));
  });

  app.post("/api/atlas", async (c) => {
    const body = await c.req.json<{ selector?: string; out?: string }>();
    const selector = parseSelector(body.selector ?? "world");
    const provinces = selectProvinces(ctx.session, selector);
    const json = buildAtlasJson(ctx.session, selector, provinces);
    const svg = renderSvg(ctx.session, json, provinces);
    const out = body.out ?? "./atlas";
    writeAtlas(out, json, svg);
    return c.json({ out, provinces: provinces.length });
  });

  return app;
}

export async function startServer(opts: ServeOpts): Promise<void> {
  const app = createApp(opts);
  await new Promise<void>((resolve) => {
    serve({ fetch: app.fetch, port: opts.port, hostname: "127.0.0.1" }, () => resolve());
  });
}
