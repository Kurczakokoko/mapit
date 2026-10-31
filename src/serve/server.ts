import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { buildAtlasJson, renderSvg, writeAtlas } from "../atlas/render.ts";
import { parseSelector, selectProvinces } from "../atlas/select.ts";
import type { MapSession, PaintOp } from "../core/ir.ts";
import type { LoadOptions } from "../core/load.ts";
import { applyPending, ownersAfterPending, queuePaint } from "../core/paint.ts";
import { validate } from "../core/validate.ts";
import { encodeIdMapPng, renderPoliticalPreview, type Preview } from "./preview.ts";
import { UI_HTML } from "./ui.ts";

export type ServeOpts = {
  session: MapSession;
  port: number;
  load: LoadOptions;
};

export function createApp(opts: ServeOpts): Hono {
  const app = new Hono();
  const ctx = opts;
  let cached: Preview | null = null;
  let cachedDiag: ReturnType<typeof validate> | null = null;
  let gate: Promise<void> = Promise.resolve();
  const dirty = () => {
    cached = null;
    cachedDiag = null;
  };
  const getPreview = () => {
    cached ??= renderPoliticalPreview(ctx.session);
    return cached;
  };
  const getDiag = () => {
    cachedDiag ??= validate(ctx.session);
    return cachedDiag;
  };
  const usedTags = () => {
    const tags = new Set<string>();
    for (const s of ctx.session.states.values()) {
      if (s.owner) tags.add(s.owner);
      if (s.controller) tags.add(s.controller);
      for (const t of s.cores) tags.add(t);
      for (const t of s.claims) tags.add(t);
    }
    return tags;
  };
  const withGate = <T>(fn: () => T | Promise<T>): Promise<T> => {
    const run = gate.then(fn, fn);
    gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const provincePayload = (session: MapSession, id: number) => {
    const p = session.provinces.get(id);
    if (!p) return null;
    const st = p.stateId !== undefined ? session.states.get(p.stateId) : undefined;
    const owners = ownersAfterPending(session);
    const pendingOwner = owners.get(id);
    const pendingCores = session.pending.filter((op) => op.layer === "core" && op.provinces.includes(id)).map((op) => op.brush);
    const pendingClaims = session.pending.filter((op) => op.layer === "claim" && op.provinces.includes(id)).map((op) => op.brush);
    const pendingCtrl = [...session.pending].reverse().find((op) => op.layer === "controller" && op.provinces.includes(id));
    return {
      id: p.id,
      type: p.type,
      coastal: p.coastal,
      terrain: p.terrain,
      state: p.stateId,
      stateName: st?.name,
      owner: pendingOwner ?? st?.owner,
      controller: pendingCtrl?.brush ?? st?.controller,
      cores: [...new Set([...(st?.cores ?? []), ...pendingCores])],
      claims: [...new Set([...(st?.claims ?? []), ...pendingClaims])],
      vp: st?.victoryPoints.find((v) => v.province === p.id)?.value,
      neighbors: p.neighbors,
      centroid: p.centroid,
      pending: session.pending.some((op) => op.provinces.includes(id)),
    };
  };

  app.get("/", (c) => c.html(UI_HTML));

  app.get("/api/meta", (c) => {
    const v = getDiag();
    const used = usedTags();
    const groups = new Map<
      string,
      { code: string; severity: string; count: number; message: string; samples: typeof v.all }
    >();
    for (const d of v.all) {
      const g = groups.get(d.code);
      if (g) {
        g.count++;
        if (g.samples.length < 12) g.samples.push(d);
      } else {
        groups.set(d.code, { code: d.code, severity: d.severity, count: 1, message: d.message, samples: [d] });
      }
    }
    return c.json({
      width: ctx.session.width,
      height: ctx.session.height,
      provinces: ctx.session.provinces.size,
      states: ctx.session.states.size,
      regions: ctx.session.regions.size,
      pending: ctx.session.pending.length,
      modPath: ctx.load.modPath ?? ctx.session.sources.modPath,
      countries: [...ctx.session.countries.values()]
        .filter((co) => {
          if (!co.dynamic) return true;
          return used.has(co.tag);
        })
        .map((co) => ({
          tag: co.tag,
          name: co.name,
          color: co.color,
          onMap: used.has(co.tag),
        })),
      diagnostics: {
        errors: v.errors.length,
        warnings: v.warnings.length,
        sample: [...v.errors.slice(0, 8), ...v.warnings.slice(0, 8)],
        sampleErrors: v.errors.slice(0, 8),
        sampleWarnings: v.warnings.slice(0, 8),
        groups: [...groups.values()],
      },
    });
  });

  app.get("/api/preview.png", (c) => {
    const preview = getPreview();
    return c.body(Buffer.from(preview.png), 200, { "content-type": "image/png" });
  });

  app.get("/api/idmap.png", (c) => {
    const preview = getPreview();
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
    return withGate(() => {
      const layer = body.layer ?? "owner";
      const provinces = body.provinces.filter((n) => {
        if (!Number.isFinite(n) || n <= 0) return false;
        const p = ctx.session.provinces.get(n);
        return p?.type === "land";
      });
      if (provinces.length) {
        queuePaint(ctx.session, { layer, brush: String(body.brush).toUpperCase(), provinces });
        dirty();
      }
      return c.json({ pending: ctx.session.pending.length });
    });
  });

  app.post("/api/undo", (c) =>
    withGate(() => {
      ctx.session.pending.pop();
      dirty();
      return c.json({ pending: ctx.session.pending.length });
    }),
  );

  app.post("/api/discard", (c) =>
    withGate(() => {
      ctx.session.pending = [];
      dirty();
      return c.json({ pending: 0 });
    }),
  );

  app.post("/api/apply", (c) =>
    withGate(() => {
      const mod = ctx.load.modPath ?? ctx.session.sources.modPath;
      if (!mod) return c.json({ error: "No mod path. Run mapit serve --mod PATH" }, 400);
      const result = applyPending(ctx.session, mod);
      dirty();
      return c.json(result);
    }),
  );

  app.get("/api/atlas.json", (c) => {
    const selector = parseSelector(c.req.query("selector") ?? "world");
    const provinces = selectProvinces(ctx.session, selector);
    return c.json(buildAtlasJson(ctx.session, selector, provinces), 200, {
      "content-disposition": 'attachment; filename="atlas.json"',
    });
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
